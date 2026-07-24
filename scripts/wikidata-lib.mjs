// Shared helpers for the Wikidata data-sourcing tooling (reconcile + enrich).
//
// Two jobs live on top of this module (see DESIGN §D20):
//   scripts/reconcile-wikidata.mjs — match events to Wikidata QIDs (human-gated)
//   scripts/enrich-wikidata.mjs    — backfill `sources` + audit dates from QIDs
//
// Everything here is offline-safe except the fetch helpers, which are the only
// part that touches the network. events.json is read/written through this module
// so the canonical key order and CRLF/utf-8 formatting can't drift (D14 normalized
// the file; a naive JSON.stringify would reorder keys and flip line endings).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const EVENTS_PATH = join(HERE, '..', 'data', 'events.json');
export const REVIEW_PATH = join(HERE, '..', 'data', 'wikidata-review.json');

// Canonical Event key order (DESIGN §4). `wikidata` is a new provenance field,
// grouped with `sources` at the tail — it's the join key those sources derive from.
export const KEY_ORDER = [
    'id', 'year', 'endYear', 'title', 'category', 'subcategory', 'tags',
    'precision', 'description', 'importance', 'links', 'wikidata', 'sources',
];

// ── events.json IO ──────────────────────────────────────────────────────────

export function loadEvents() {
    return JSON.parse(readFileSync(EVENTS_PATH, 'utf8'));
}

// Reorder one event's keys into KEY_ORDER; unknown keys are preserved at the end
// (loudly, so a typo'd field can't vanish through a write cycle).
export function normalizeEvent(e) {
    const out = {};
    for (const k of KEY_ORDER) if (e[k] !== undefined) out[k] = e[k];
    for (const k of Object.keys(e)) {
        if (!KEY_ORDER.includes(k)) {
            console.warn(`  ! unknown field "${k}" on event #${e.id} preserved at tail`);
            out[k] = e[k];
        }
    }
    return out;
}

// Write events.json back matching the working-tree format exactly: 4-space
// indent, CRLF line endings, trailing newline, utf-8 (no BOM). git's autocrlf
// then stores LF, so the committed diff is content-only.
export function writeEvents(data) {
    const normalized = {
        schemaVersion: data.schemaVersion,
        events: data.events.map(normalizeEvent),
    };
    const json = JSON.stringify(normalized, null, 4).replace(/\n/g, '\r\n') + '\r\n';
    writeFileSync(EVENTS_PATH, json, 'utf8');
}

export function loadReview() {
    return existsSync(REVIEW_PATH) ? JSON.parse(readFileSync(REVIEW_PATH, 'utf8')) : null;
}

export function writeReview(review) {
    const json = JSON.stringify(review, null, 4).replace(/\n/g, '\r\n') + '\r\n';
    writeFileSync(REVIEW_PATH, json, 'utf8');
}

// ── QIDs ─────────────────────────────────────────────────────────────────────

export const isQid = (s) => typeof s === 'string' && /^Q[1-9]\d*$/.test(s);

// ── string similarity (Sørensen–Dice over bigrams) ──────────────────────────

const normText = (s) =>
    s.toLowerCase()
        .normalize('NFKD')              // accents -> base char + combining mark
        .replace(/[̀-ͯ]/g, '') // drop the combining marks
        .replace(/[^a-z0-9 ]/g, ' ')    // and every other non-alphanumeric
        .replace(/\s+/g, ' ')
        .trim();

const bigrams = (s) => {
    const g = new Map();
    for (let i = 0; i < s.length - 1; i++) {
        const b = s.slice(i, i + 2);
        g.set(b, (g.get(b) || 0) + 1);
    }
    return g;
};

// Event titles are narrative ("Discovery of Steel", "First Plane", "Watt's Steam
// Engine") while Wikidata labels are the bare entity ("steel", "aircraft",
// "Watt steam engine"). Generate query/label variants by peeling the framing
// verbs and possessives down to the core noun, so both search recall and
// similarity scoring can match on the entity rather than the sentence.
const LEAD = /^(first commercial |first |the |a |an |discovery of (the )?|invention of (the )?|creation of (the )?|founding of (the )?|construction of (the )?|life of (the )?|birth of (the )?|end of the |rise of (the )?)/i;
const TRAIL = /(\s+(invented|discovered|confirmed|founded|emerges|emerged|detected|detonated|operational|forms|form|ignite|ignites|crowned emperor))$/i;

export function queryVariants(title) {
    const out = new Set();
    const add = (s) => { const t = (s || '').trim(); if (t) out.add(t); };
    const raw = title.trim();
    add(raw);
    const noParen = raw.replace(/\s*\([^)]*\)\s*/g, ' ').trim(); // drop "(Speculative)", "(Sputnik 1)"
    add(noParen);
    // Possessive framing: "Watt's Steam Engine" -> "Steam Engine".
    const poss = noParen.match(/^[\w.'’-]+['’]s\s+(.+)$/);
    if (poss) add(poss[1]);
    // Peel leading, then trailing framing down to the core noun.
    let core = noParen.replace(LEAD, '').trim();
    add(core);
    core = core.replace(TRAIL, '').trim();
    add(core);
    return [...out];
}

// Best similarity of any query variant against a label — lets "Discovery of
// Steel" match the label "steel" through its stripped "steel" variant.
export function bestSimilarity(variants, label) {
    let best = 0;
    for (const v of variants) { const s = similarity(v, label); if (s > best) best = s; }
    return best;
}

// 1.0 == identical after normalization; degrades with edit distance.
export function similarity(a, b) {
    const x = normText(a), y = normText(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    const gx = bigrams(x), gy = bigrams(y);
    let inter = 0, total = 0;
    for (const [k, n] of gx) { inter += Math.min(n, gy.get(k) || 0); total += n; }
    for (const n of gy.values()) total += n;
    return total ? (2 * inter) / total : 0;
}

// ── Wikidata dates ───────────────────────────────────────────────────────────

// Date properties an event might carry, best-first. P585 point-in-time fits
// discrete events; P580/P571/P577 cover spans, inceptions and publications.
export const DATE_PROPS = ['P585', 'P580', 'P571', 'P577', 'P569', 'P574'];

// Parse the signed year out of a Wikidata time literal ("+1969-07-20T..",
// "-0044-00-00T.."). Wikidata stores BCE astronomically (1 BCE == year 0), but
// our comparison is tolerance-based so the off-by-one doesn't matter.
export function parseWikidataYear(timeStr) {
    const m = /^([+-])(\d+)-/.exec(timeStr);
    if (!m) return null;
    const y = parseInt(m[2], 10);
    return m[1] === '-' ? -y : y;
}

// ── network (the only side of this module that needs connectivity) ───────────

// Wikimedia asks scripts to send a descriptive UA with a contact/URL.
const UA = 'TimelineOfEverything-datatools/1.0 ' +
    '(https://github.com/YBachmann/TimelineOfEverything; hand-curated timeline enrichment)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Polite JSON fetch: descriptive UA, exponential backoff on 429/5xx.
async function getJson(url, tries = 4) {
    for (let i = 0; i < tries; i++) {
        let res;
        try {
            res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
        } catch (err) {
            if (i === tries - 1) throw err;
            await sleep(600 * (i + 1) * (i + 1));
            continue;
        }
        if (res.status === 429 || res.status >= 500) {
            await sleep(600 * (i + 1) * (i + 1));
            continue;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
        return res.json();
    }
    throw new Error(`gave up after ${tries} tries: ${url}`);
}

const API = 'https://www.wikidata.org/w/api.php';

// instance-of types that are never timeline events — used to drop the noise the
// full-text search drags in (scholarly articles, Wikimedia housekeeping pages).
export const JUNK_TYPES = new Set([
    'Q13442814', // scholarly article
    'Q4167836',  // Wikimedia category
    'Q4167410',  // Wikimedia disambiguation page
    'Q13406463', // Wikimedia list article
    'Q11266439', // Wikimedia template
    'Q17442446', // Wikimedia internal item
    'Q4663903',  // Wikimedia template? (article namespace helper)
    'Q101352',   // family name
    'Q202444',   // given name
]);

// wbsearchentities: label/alias-prefix candidates for a name. Good precision,
// weak recall (misses items whose label doesn't start with the query).
// Returns [{ id, label, description }]. Dates come later from getEntities.
export async function searchEntities(title, limit = 7) {
    const url = `${API}?action=wbsearchentities&format=json&language=en&uselang=en` +
        `&type=item&limit=${limit}&search=${encodeURIComponent(title)}`;
    const data = await getJson(url);
    return (data.search || []).map((r) => ({
        id: r.id,
        label: r.label || r.match?.text || '',
        description: r.description || '',
    }));
}

// CirrusSearch full-text over items — recovers matches wbsearchentities misses
// ("Formation of the Solar System" → the item titled "formation and evolution
// of the Solar System"). Returns bare QIDs; noisier, so junk-type filtering and
// scoring downstream do the pruning. Namespace 0 = items.
export async function searchFulltext(title, limit = 6) {
    const url = `${API}?action=query&format=json&list=search` +
        `&srnamespace=0&srlimit=${limit}&srsearch=${encodeURIComponent(title)}`;
    const data = await getJson(url);
    return (data.query?.search || []).map((r) => r.title).filter(isQid);
}

// wbgetentities in batches of <=50. Returns a Map<QID, {label, description,
// enwiki, date:{year,prop}|null, instanceOf:[QID]}> distilled to what the
// reconcile/enrich steps need.
export async function getEntities(ids) {
    const uniq = [...new Set(ids.filter(isQid))];
    const out = new Map();
    for (let i = 0; i < uniq.length; i += 50) {
        const batch = uniq.slice(i, i + 50);
        const url = `${API}?action=wbgetentities&format=json&languages=en` +
            `&props=labels|descriptions|claims|sitelinks/urls&sitefilter=enwiki` +
            `&ids=${batch.join('|')}`;
        const data = await getJson(url);
        for (const [qid, ent] of Object.entries(data.entities || {})) {
            if (ent.missing !== undefined) continue;
            out.set(qid, distillEntity(ent));
        }
        if (i + 50 < uniq.length) await sleep(120);
    }
    return out;
}

function distillEntity(ent) {
    const claims = ent.claims || {};
    let date = null;
    for (const prop of DATE_PROPS) {
        const snak = claims[prop]?.[0]?.mainsnak;
        const time = snak?.datavalue?.value?.time;
        if (time) {
            const year = parseWikidataYear(time);
            if (year != null) { date = { year, prop }; break; }
        }
    }
    const instanceOf = (claims.P31 || [])
        .map((c) => c.mainsnak?.datavalue?.value?.id)
        .filter(Boolean);
    return {
        label: ent.labels?.en?.value || '',
        description: ent.descriptions?.en?.value || '',
        enwiki: ent.sitelinks?.enwiki?.url || null,
        enwikiTitle: ent.sitelinks?.enwiki?.title || null,
        date,
        instanceOf,
    };
}

export { sleep };
