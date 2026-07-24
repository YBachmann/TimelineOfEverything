// Reconcile timeline events to Wikidata QIDs — the human-gated first half of the
// data-sourcing pipeline (DESIGN §D20). Selection stays editorial; this only
// attaches a machine identity (a QID) to events we already chose by hand.
//
//   node scripts/reconcile-wikidata.mjs            fetch candidates, (re)write the review file
//   node scripts/reconcile-wikidata.mjs --refresh  also re-fetch rows already in the review file
//   node scripts/reconcile-wikidata.mjs --apply     merge confirmed `chosen` QIDs into events.json
//
// The review file (data/wikidata-review.json) is the human checkpoint: each row
// carries the machine's best guess plus its alternatives. You accept a guess,
// swap in a different candidate, or write "none" to record that no Wikidata item
// fits (deep-time / speculative events). Only rows whose `chosen` is a valid QID
// are applied. Events that already carry a `wikidata` field are considered done
// and drop out of the review file, so re-running after adding events is additive.

import {
    loadEvents, writeEvents, loadReview, writeReview, isQid,
    bestSimilarity, queryVariants, searchEntities, searchFulltext, getEntities, sleep, JUNK_TYPES,
} from './wikidata-lib.mjs';

const argv = process.argv.slice(2);
const args = new Set(argv);
const REFRESH = args.has('--refresh');
const APPLY = args.has('--apply');
// --limit=N reconciles only the first N outstanding events (quick trial run).
const LIMIT = (() => {
    const a = argv.find((x) => x.startsWith('--limit'));
    if (!a) return Infinity;
    const n = parseInt(a.includes('=') ? a.split('=')[1] : argv[argv.indexOf(a) + 1], 10);
    return Number.isFinite(n) ? n : Infinity;
})();

// ── year tolerance ────────────────────────────────────────────────────────────
// How far a Wikidata date may sit from our stored year and still corroborate.
// Deep time and imprecise antiquity get wide bands; a dated modern event a tight
// one. Purely for *scoring* candidates — the real date audit lives in enrich.
function yearTolerance(ev) {
    const mag = Math.abs(ev.year);
    let tol;
    if (mag >= 100000) tol = mag * 0.05;      // deep time / prehistory
    else if (ev.year < 1000) tol = 50;         // antiquity & early medieval dating slop
    else tol = 3;                              // modern, expect a near-exact match
    if (['approximate', 'estimated', 'speculative'].includes(ev.precision))
        tol = Math.max(tol, mag * 0.02, 25);
    return tol;
}

// ── score one candidate against one event ────────────────────────────────────
// `variants` are the event title's stripped forms (queryVariants); scoring on
// the best-matching one lets "Discovery of Steel" match the label "steel".
function scoreCandidate(ev, ent, variants) {
    const labelSim = bestSimilarity(variants, ent.label || '');
    const tol = yearTolerance(ev);
    let yearDiff = null, yearOk = null, yearScore = 0.5; // 0.5 = neutral (no date)
    if (ent.date) {
        yearDiff = Math.abs(ev.year - ent.date.year);
        yearOk = yearDiff <= tol;
        yearScore = yearOk ? 1 : Math.max(0, 1 - (yearDiff - tol) / (tol * 10 + 1));
    }
    let combined = ent.date
        ? 0.65 * labelSim + 0.35 * yearScore
        : labelSim * 0.9; // concepts legitimately lack a date; small penalty, not a veto
    // An English Wikipedia article is a strong "this is the canonical item" signal
    // — it lifts the real Q11768 "Ancient Egypt" over an obscure exact-label twin,
    // and pushes date-less noise (works, duplicates) down the ranking.
    if (ent.enwiki) combined = Math.min(1, combined + 0.08);
    return { labelSim, yearDiff, yearOk, tol, combined };
}

// ── bucket the ranked candidates into a confidence status ────────────────────
// `scored` is the ranked row-candidate list; each carries score/labelSim/yearOk/
// enwiki. Two independent auto paths (date-corroborated, or canonical exact
// label); everything unclear stays for a human; unrelated best guesses are none.
function classify(scored) {
    if (!scored.length) return 'none';
    const [top, second] = scored;

    // Best guess is essentially unrelated and no date backs it up → no item.
    // (Narrative titles like "Discovery of Steel" that only match noise.)
    if (top.labelSim < 0.55 && top.yearOk !== true) return 'none';
    if (top.score < 0.40) return 'none';

    // (a) A corroborating date on a solid label, backed by a Wikipedia article —
    // the enwiki gate rejects publications *named after* the concept (a 1926 item
    // "Quantum Mechanics", no article) that would otherwise outscore the real
    // field Q944. Blocked only if a rival matches the date about as well (a true
    // twin, e.g. two dated "Moon Landing" items).
    if (top.yearOk === true && top.labelSim >= 0.90 && top.enwiki) {
        const rivalDated = second && second.yearOk === true &&
            second.labelSim >= 0.90 && (top.score - second.score) < 0.10;
        if (!rivalDated) return 'auto';
    }
    // (b) A canonical near-exact label backed by an enwiki article, with no
    // contradicting date — unless a second enwiki item ties it (real ambiguity).
    if (top.enwiki && top.labelSim >= 0.97 && top.yearOk !== false) {
        const twin = second && second.enwiki &&
            second.labelSim >= 0.97 && (top.score - second.score) < 0.08;
        if (!twin) return 'auto';
    }
    return 'ambiguous';
}

// ── reconcile (default) ───────────────────────────────────────────────────────
async function reconcile() {
    const data = loadEvents();
    let targets = data.events.filter((e) => !e.wikidata);
    const done = data.events.length - targets.length;
    if (LIMIT !== Infinity) {
        targets = targets.slice(0, LIMIT);
        console.log(`(--limit ${LIMIT}: trial run over the first ${targets.length} outstanding events)`);
    }

    const prior = loadReview();
    const priorById = new Map((prior?.rows || []).map((r) => [r.id, r]));

    // Which targets need a network fetch: new ones, or all if --refresh.
    const toFetch = targets.filter((e) => REFRESH || !priorById.has(e.id));
    console.log(
        `${data.events.length} events | ${done} already have a QID | ` +
        `${targets.length} to reconcile | fetching ${toFetch.length}` +
        `${toFetch.length < targets.length ? ` (${targets.length - toFetch.length} reused from review file)` : ''}`,
    );

    // Pass 1: for each event, search its title plus stripped variants ("First
    // Plane" → "Plane"), each through label-prefix (precise) and full-text
    // (recall) search. Dedupe into a candidate QID list per event. Cap variants
    // to bound request volume.
    const candIdsByEvent = new Map();
    const variantsByEvent = new Map();
    const allCandIds = new Set();
    for (let i = 0; i < toFetch.length; i++) {
        const ev = toFetch[i];
        const variants = queryVariants(ev.title).slice(0, 3);
        variantsByEvent.set(ev.id, queryVariants(ev.title)); // full set for scoring
        const ids = new Set();
        try {
            for (const q of variants) {
                (await searchEntities(q, 7)).forEach((c) => ids.add(c.id));
                (await searchFulltext(q, 6)).forEach((id) => ids.add(id));
            }
        } catch (err) {
            console.warn(`\n  ! search failed for #${ev.id} "${ev.title}": ${err.message}`);
        }
        candIdsByEvent.set(ev.id, [...ids]);
        ids.forEach((id) => allCandIds.add(id));
        process.stdout.write(`\r  searching ${i + 1}/${toFetch.length}`);
        await sleep(80);
    }
    process.stdout.write('\n');

    // Pass 2: one batched entity fetch for every candidate, then score.
    console.log(`  fetching ${allCandIds.size} candidate entities…`);
    const entities = await getEntities([...allCandIds]);

    const freshRows = toFetch.map((ev) => {
        const variants = variantsByEvent.get(ev.id);
        const scored = (candIdsByEvent.get(ev.id) || [])
            .map((qid) => {
                const ent = entities.get(qid);
                if (!ent) return null;
                if (ent.instanceOf.some((t) => JUNK_TYPES.has(t))) return null; // articles, categories…
                const s = scoreCandidate(ev, ent, variants);
                return {
                    qid,
                    label: ent.label,
                    description: ent.description,
                    wdYear: ent.date?.year ?? null,
                    dateProp: ent.date?.prop ?? null,
                    yearDiff: s.yearDiff,
                    yearOk: s.yearOk,
                    labelSim: +s.labelSim.toFixed(3),
                    score: +s.combined.toFixed(3),
                    instanceOf: ent.instanceOf.slice(0, 4),
                    enwiki: ent.enwiki,
                };
            })
            .filter(Boolean)
            .sort((a, b) => b.score - a.score);
        const status = classify(scored);
        return {
            id: ev.id,
            title: ev.title,
            year: ev.year,
            ...(ev.endYear != null ? { endYear: ev.endYear } : {}),
            category: ev.category,
            precision: ev.precision || 'exact',
            status,
            chosen: status === 'auto' ? scored[0].qid : null, // pre-fill only high-confidence
            note: '',
            candidates: scored.slice(0, 5),
        };
    });

    // Merge: reused rows keep their human edits; only `toFetch` rows are replaced.
    const freshById = new Map(freshRows.map((r) => [r.id, r]));
    const rows = targets.map((ev) => freshById.get(ev.id) || priorById.get(ev.id));

    // Attention first (ambiguous, then none), auto last (a glance to confirm).
    const rank = { ambiguous: 0, none: 1, auto: 2 };
    rows.sort((a, b) => (rank[a.status] - rank[b.status]) || (a.id - b.id));

    const summary = { total: rows.length, auto: 0, ambiguous: 0, none: 0 };
    rows.forEach((r) => { summary[r.status]++; });

    writeReview({
        _instructions:
            'Set `chosen` to a candidate QID to accept it, or to "none" to record that no ' +
            'Wikidata item fits. `auto` rows are pre-filled with the machine pick — spot-check ' +
            'and change if wrong. Then run: node scripts/reconcile-wikidata.mjs --apply',
        generatedAt: new Date().toISOString(),
        summary,
        rows,
    });

    console.log(
        `\nreview written → data/wikidata-review.json\n` +
        `  auto (pre-filled): ${summary.auto}\n` +
        `  ambiguous (pick):  ${summary.ambiguous}\n` +
        `  none (no item):    ${summary.none}\n` +
        `Next: adjudicate the ambiguous/none rows, then --apply.`,
    );
}

// ── apply ──────────────────────────────────────────────────────────────────────
function apply() {
    const review = loadReview();
    if (!review) { console.error('No data/wikidata-review.json — run reconcile first.'); process.exit(1); }
    const data = loadEvents();
    const byId = new Map(data.events.map((e) => [e.id, e]));

    let applied = 0, skipped = 0, bad = 0;
    for (const row of review.rows) {
        const ev = byId.get(row.id);
        if (!ev) { console.warn(`  ! review row #${row.id} has no matching event`); continue; }
        if (isQid(row.chosen)) {
            if (ev.wikidata !== row.chosen) { ev.wikidata = row.chosen; applied++; }
        } else if (row.chosen && row.chosen !== 'none') {
            console.warn(`  ! #${row.id} "${row.title}": chosen "${row.chosen}" is not a QID — skipped`);
            bad++;
        } else {
            skipped++; // null or "none": deliberately no QID
        }
    }
    writeEvents(data);
    console.log(
        `applied ${applied} QIDs → events.json | ${skipped} left undecided/none` +
        `${bad ? ` | ${bad} malformed` : ''}`,
    );
    const withQid = data.events.filter((e) => e.wikidata).length;
    console.log(`events with a QID: ${withQid}/${data.events.length}`);
}

if (APPLY) apply();
else reconcile();
