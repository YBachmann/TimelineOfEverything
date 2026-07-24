// Enrich reconciled events from Wikidata — the second half of the data-sourcing
// pipeline (DESIGN §D20). For every event carrying a `wikidata` QID it:
//   1. backfills a `sources` entry pointing at the event's English Wikipedia
//      article (the human-readable, CC-BY-SA reference; the CC0 machine link is
//      the `wikidata` field itself), and
//   2. audits the stored `year` against Wikidata's date, flagging disagreements
//      for a human — it never rewrites a year.
//
//   node scripts/enrich-wikidata.mjs             backfill sources + print the date audit
//   node scripts/enrich-wikidata.mjs --audit-only   print the audit, write nothing
//
// Idempotent: auto-added sources are tagged `via:"wikidata"`, so a re-run strips
// and regenerates only those, leaving hand-curated sources (e.g. NASA WMAP) intact.

import { loadEvents, writeEvents, getEntities, isQid } from './wikidata-lib.mjs';

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
const audit = []; // { id, title, year, wdYear, diff, tol, prec }

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
