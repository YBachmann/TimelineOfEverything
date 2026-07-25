// Enrich reconciled events from Wikidata — the second half of the data-sourcing
// pipeline (DESIGN §D20). For every event carrying a `wikidata` QID it:
//   1. backfills a `sources` entry pointing at the event's English Wikipedia
//      article (the human-readable, CC-BY-SA reference; the CC0 machine link is
//      the `wikidata` field itself),
//   2. backfills `precision` from Wikidata's date-precision (DS-Q2) under a
//      coarsen-only rule — a proposal may only ever make a date *less* certain
//      than the dataset already claims, never more, so it can't overwrite an
//      editorial judgement with a machine one, and
//   3. audits the stored `year` against Wikidata's date, flagging disagreements
//      for a human — it never rewrites a year.
//
//   node scripts/enrich-wikidata.mjs             backfill sources + precision, print the audit
//   node scripts/enrich-wikidata.mjs --audit-only   dry run: print everything, write nothing
//
// Idempotent: auto-added sources are tagged `via:"wikidata"`, so a re-run strips
// and regenerates only those, leaving hand-curated sources (e.g. NASA WMAP) intact;
// the precision rule is monotone, so a second run proposes the same tier and moves
// nothing.

import {
    loadEvents, writeEvents, getEntities, isQid,
    precisionFromDate, coarserPrecision, precisionRank,
} from './wikidata-lib.mjs';

const AUDIT_ONLY = process.argv.includes('--audit-only');

// How far Wikidata's date may sit from ours before it's worth a human look.
// Wider for deep time and ancient dating slop; tight for the modern record.
function auditTolerance(year) {
    const mag = Math.abs(year);
    if (mag >= 1_000_000) return mag * 0.02; // deep time: 2%
    if (year < 1000) return 20;               // antiquity / early medieval
    if (year < 1800) return 5;
    return 2;                                 // modern: expect near-exact
}

const data = loadEvents();
const reconciled = data.events.filter((e) => isQid(e.wikidata));
console.log(`${reconciled.length}/${data.events.length} events carry a QID; fetching…`);

const ents = await getEntities(reconciled.map((e) => e.wikidata));

let sourcesAdded = 0, sourcesCleared = 0, noArticle = 0;
const audit = [];       // { id, title, year, wdYear, diff, tol, prec }
const coarsened = [];   // precision raised: { id, title, from, to, why }
const held = [];        // Wikidata is sharper than us — reported, never applied
let noPrecSignal = 0;

// Why a proposal came out the way it did, for the report: the Wikidata property
// and its integer precision, plus any fuzzing qualifier.
const explain = (d) => d
    ? `${d.prop}/p${d.precision ?? '?'}${d.circa ? '+circa' : ''}${d.ranged ? '+ranged' : ''}`
    : 'no date';

for (const e of reconciled) {
    const ent = ents.get(e.wikidata);
    if (!ent) { console.warn(`  ! ${e.wikidata} (#${e.id} "${e.title}") not found`); continue; }

    // --- sources: drop prior auto entries, keep manual, re-add the article ---
    const manual = (e.sources || []).filter((s) => s.via !== 'wikidata');
    sourcesCleared += (e.sources?.length ?? 0) - manual.length;
    if (ent.enwiki) {
        manual.push({ label: `Wikipedia: ${ent.enwikiTitle}`, url: ent.enwiki, via: 'wikidata' });
        sourcesAdded++;
    } else {
        noArticle++;
    }
    if (manual.length) e.sources = manual; else delete e.sources;

    // --- precision backfill, coarsen-only (DS-Q2) ---
    // A span's single `precision` field has to cover both ends of the range, so
    // a fuzzy end date coarsens the whole event; a point event ignores P582.
    const parts = [ent.date, ...(e.endYear != null ? [ent.endDate] : [])];
    const tiers = parts.map(precisionFromDate).filter(Boolean);
    if (!tiers.length) {
        noPrecSignal++;
    } else {
        const current = e.precision || 'exact';
        const proposed = tiers.reduce(coarserPrecision);
        const why = parts.filter(Boolean).map(explain).join(' + ');
        if (precisionRank(proposed) > precisionRank(current)) {
            coarsened.push({ id: e.id, title: e.title, from: current, to: proposed, why });
            e.precision = proposed;
        } else if (precisionRank(proposed) < precisionRank(current)) {
            held.push({ id: e.id, title: e.title, from: current, to: proposed, why });
        }
    }

    // --- date audit (report only) ---
    if (ent.date) {
        const diff = Math.abs(e.year - ent.date.year);
        const tol = auditTolerance(e.year);
        if (diff > tol) audit.push({
            id: e.id, title: e.title, year: e.year, wdYear: ent.date.year,
            diff, tol, prec: e.precision || 'exact',
        });
    }
}

if (!AUDIT_ONLY) {
    writeEvents(data);
    const withSources = data.events.filter((e) => e.sources?.length).length;
    console.log(
        `sources: +${sourcesAdded} Wikipedia refs (${sourcesCleared} stale auto refs replaced, ` +
        `${noArticle} QIDs had no enwiki article) → ${withSources}/${data.events.length} events now sourced`,
    );
}

// --- precision report ---
const row = (r) => `  #${String(r.id).padStart(3)} ${r.title.padEnd(32).slice(0, 32)} ` +
    `${r.from.padStart(11)} → ${r.to.padEnd(11)} [${r.why}]`;

console.log(
    `\n=== precision: ${coarsened.length} coarsened${AUDIT_ONLY ? ' (dry run — nothing written)' : ''}, ` +
    `${held.length} held, ${noPrecSignal} without a dated claim ===`,
);
for (const r of coarsened) console.log(row(r));
if (!coarsened.length) console.log('  (nothing to coarsen — already at or above Wikidata\'s precision)');

if (held.length) {
    console.log(
        `\n--- held: Wikidata dates these more sharply than we do (${held.length}) ---\n` +
        '  Never auto-applied: our tier may encode a scholarly dispute Wikidata flattened,\n' +
        '  and a P569 birth date is day-precise for an event that is not the birth (DS-Q1).\n' +
        '  Sharpen by hand if a row is genuinely over-hedged.',
    );
    for (const r of held) console.log(row(r));
}

const finalCounts = new Map();
for (const e of data.events) {
    const p = e.precision || 'exact';
    finalCounts.set(p, (finalCounts.get(p) ?? 0) + 1);
}
console.log(`precision now: ${[...finalCounts].map(([p, n]) => `${p}=${n}`).join(', ')}`);

// --- date audit report ---
console.log(`\n=== date audit: ${audit.length} events disagree with Wikidata beyond tolerance ===`);
audit.sort((a, b) => (b.diff / (Math.abs(b.year) + 1)) - (a.diff / (Math.abs(a.year) + 1)));
for (const a of audit) {
    const fmt = (y) => y < 0 ? `${-y} BCE` : `${y} CE`;
    console.log(
        `  #${String(a.id).padStart(3)} ${a.title.padEnd(30).slice(0, 30)} ` +
        `ours ${fmt(a.year).padStart(12)} | wikidata ${fmt(a.wdYear).padStart(12)} ` +
        `| Δ${a.diff.toLocaleString()} (tol ${Math.round(a.tol).toLocaleString()}) [${a.prec}]`,
    );
}
if (!audit.length) console.log('  (none)');
console.log('\nThe audit never edits years — review flags by hand; a wrong Wikidata date is also possible.');
