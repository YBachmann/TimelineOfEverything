// Verifies the timeline layout invariants against the real dataset by
// importing the REAL layout module (src/timelineLayout.js) — no mirrored
// logic to drift. Simulates sequential zoom/pan gestures (the packer and
// clusterer are stateful) and asserts, per frame:
//
//   1. No two placed labels overlap.
//   2. No two cluster chips overlap (and chips never collide with visible
//      bare dots — guaranteed by the same merge pass, asserted via boxes).
//   3. Chip members are exactly unlabeled events; every chip has ≥2 members.
//
// Run: npm run verify:layout
import {
    LANE_HEIGHT, LABEL_GAP, ENTER_SLACK, MAX_LANES, CHIP_H, CLUSTER_SPLIT_PX, SPAN_MAX_LANES,
    computePriorities, buildLaneOrder, createLanePacker, createClusterer,
    markGeometry, assignSpanLanes, spanLaneOffset,
} from '../src/timelineLayout.js';
import { createEraScale } from '../src/eraScale.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(root, 'data', 'events.json'), 'utf8'));
const events = data.events;

// d3.scaleSymlog with default constant (1): t(x) = sign(x)*log1p(|x|),
// then a linear map from the transformed domain onto the range.
function scaleSymlog(domain, range) {
    const t = x => Math.sign(x) * Math.log1p(Math.abs(x));
    const [d0, d1] = domain.map(t);
    const [r0, r1] = range;
    return x => r0 + (t(x) - d0) / (d1 - d0) * (r1 - r0);
}

const width = 1200, height = 520, centerY = height / 2;
const LABEL_H = 16;
const NOW = 2026;

// Static geometry invariant: chips sit on the spine (± CHIP_H/2) and lane-0
// label hit-rects start at LANE_HEIGHT - 10 from the spine. If CHIP_H ever
// grows past that clearance, chips could collide with labels vertically —
// something the per-frame interval checks below cannot see.
if (CHIP_H / 2 >= LANE_HEIGHT - 10) {
    console.log(`FAIL: CHIP_H/2 (${CHIP_H / 2}) must stay below lane-0 label edge (${LANE_HEIGHT - 10})`);
    process.exit(1);
}

// Data sanity: spans must run forward in time (markGeometry treats a reversed
// span as a degenerate dot, silently hiding a data-entry error).
for (const e of events) {
    if (e.endYear != null && !(e.endYear > e.year)) {
        console.log(`FAIL: span #${e.id} "${e.title}" has endYear ${e.endYear} <= year ${e.year}`);
        process.exit(1);
    }
}

// Link sanity: every link must point at an existing, different event, and the
// same (from, to, type) edge must not be stored twice — on one event or split
// across both endpoints. A relation is stored on ONE endpoint and mirrored at
// load (D9): reverse-stored pairs would render duplicate modal rows for
// symmetric types and outright contradictions ("led to" + "caused by") for
// directional ones. buildLinkIndex skips bad links defensively at runtime;
// this is where they actually fail.
{
    const ids = new Set(events.map(e => e.id));
    const allEdges = new Set();
    for (const e of events) {
        for (const l of e.links ?? []) allEdges.add(`${e.id}>${l.to}:${l.type}`);
    }
    let linkCount = 0, linkErrors = 0;
    for (const e of events) {
        const seen = new Set();
        for (const l of e.links ?? []) {
            linkCount++;
            const edge = `${l.to}:${l.type}`;
            const problem =
                !ids.has(l.to) ? `unknown target #${l.to}` :
                l.to === e.id ? 'links to itself' :
                seen.has(edge) ? `duplicate edge to #${l.to} (${l.type})` :
                // Report a reverse-stored pair once, from its lower-id endpoint.
                allEdges.has(`${l.to}>${e.id}:${l.type}`) && e.id < l.to
                    ? `also stored in reverse on #${l.to} (${l.type}) — store each relation once`
                    : null;
            seen.add(edge);
            if (problem) {
                linkErrors++;
                console.log(`FAIL: link on #${e.id} "${e.title}": ${problem}`);
            }
        }
    }
    if (linkErrors > 0) process.exit(1);
    console.log(`links: ${linkCount} stored edges, targets valid, no self-links, duplicates, or reverse-stored pairs`);
}

// Taxonomy sanity (Q5): subcategory is a controlled vocabulary per category,
// required on every event; tags are cross-cutting THREADS — each must connect
// >=2 events (a singleton tag surfaces in the search dropdown as a dead-end
// filter) and must not merely restate the event's own subcategory (redundant,
// and the search box already suggests subcategories separately). filterEvents
// and getSuggestions expose this vocabulary in the UI (D12), so drift here is
// user-visible. Keep SUBCATS in sync with scripts/retag reasoning / DESIGN §4.
{
    const SUBCATS = {
        natural: ['cosmology', 'planetary', 'geology', 'biology'],
        history: ['prehistory', 'society', 'politics', 'culture', 'religion', 'philosophy', 'economics', 'law', 'exploration'],
        science: ['physics', 'astronomy', 'chemistry', 'biology', 'mathematics', 'medicine', 'geology', 'philosophy', 'institution'],
        technology: ['industry', 'electronics', 'computing', 'communication', 'transport', 'materials', 'navigation', 'spaceflight', 'imaging', 'internet', 'appliances', 'ai'],
        future: ['cosmology', 'planetary', 'environment'],
    };
    let taxErrors = 0;
    const fail = msg => { taxErrors++; console.log(`FAIL: ${msg}`); };
    const tagCount = new Map();
    for (const e of events) for (const t of e.tags ?? []) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);

    for (const e of events) {
        const allowed = SUBCATS[e.category];
        if (!allowed) { fail(`#${e.id} "${e.title}": unknown category ${e.category}`); continue; }
        if (!e.subcategory) fail(`#${e.id} "${e.title}": missing subcategory`);
        else if (!allowed.includes(e.subcategory))
            fail(`#${e.id} "${e.title}": subcategory "${e.subcategory}" not in the ${e.category} set`);
        if (!e.tags?.length) fail(`#${e.id} "${e.title}": no tags`);
        if (new Set(e.tags ?? []).size !== (e.tags ?? []).length)
            fail(`#${e.id} "${e.title}": duplicate tag`);
        for (const t of e.tags ?? []) {
            if (t === e.subcategory) fail(`#${e.id} "${e.title}": tag "${t}" restates its subcategory`);
            if (tagCount.get(t) < 2) fail(`#${e.id} "${e.title}": tag "${t}" is a singleton (needs >=2 events)`);
        }
    }
    if (taxErrors > 0) process.exit(1);
    const subcats = new Set(events.map(e => e.subcategory));
    console.log(`taxonomy: ${events.length} events, all in-vocab; ` +
        `${subcats.size} subcategories, ${tagCount.size} tags (all >=2, none restate a subcategory)`);
}

// Precision sanity (Q6/D15): a controlled vocabulary like subcategory (D14)
// — absent/null means the implicit default 'exact', so most events need no
// value at all, but a value that IS present must be one of the four tiers.
// Otherwise a typo silently renders as unmarked 'exact' instead of failing.
{
    const PRECISIONS = ['exact', 'approximate', 'estimated', 'speculative'];
    let precErrors = 0;
    const precCounts = new Map();
    for (const e of events) {
        const p = e.precision ?? 'exact';
        if (e.precision != null && !PRECISIONS.includes(e.precision)) {
            precErrors++;
            console.log(`FAIL: #${e.id} "${e.title}": precision "${e.precision}" not in ${PRECISIONS.join('/')}`);
        }
        precCounts.set(p, (precCounts.get(p) ?? 0) + 1);
    }
    if (precErrors > 0) process.exit(1);
    console.log(`precision: ${[...precCounts].map(([p, n]) => `${p}=${n}`).join(', ')}, all in vocab`);
}

// Span mini-lanes: time-overlapping (or touching) spans must land in distinct
// lanes — time overlap is zoom-invariant, so this one check covers every zoom
// level. The lane count must fit the SPAN_MAX_LANES budget (a dataset needing
// a 4th lane would push bars into the label lanes — fail loudly, then either
// redesign or split the offending era), and the whole mini-lane band must
// stay clear of lane-0 label hit-rects (which start 12px off the spine).
{
    const spanLaneById = assignSpanLanes(events);
    const spans = events.filter(e => e.endYear != null);
    let laneViolations = 0;
    for (let i = 0; i < spans.length; i++) {
        for (let j = i + 1; j < spans.length; j++) {
            const a = spans[i], b = spans[j];
            const overlap = b.year <= a.endYear && a.year <= b.endYear;
            if (overlap && spanLaneById.get(a.id) === spanLaneById.get(b.id)) {
                laneViolations++;
                console.log(`FAIL: overlapping spans share lane ${spanLaneById.get(a.id)}: ` +
                    `#${a.id} "${a.title}" & #${b.id} "${b.title}"`);
            }
        }
    }
    const maxLaneUsed = Math.max(...spanLaneById.values(), 0);
    if (maxLaneUsed >= SPAN_MAX_LANES) {
        console.log(`FAIL: span overlap depth needs ${maxLaneUsed + 1} lanes ` +
            `(budget SPAN_MAX_LANES=${SPAN_MAX_LANES})`);
        process.exit(1);
    }
    for (let lane = 0; lane < SPAN_MAX_LANES; lane++) {
        const barEdge = Math.abs(spanLaneOffset(lane)) + 3; // bar half-height 3
        if (barEdge >= LANE_HEIGHT - 10) {
            console.log(`FAIL: span lane ${lane} bar edge (${barEdge}px) reaches ` +
                `lane-0 label hit-rects (${LANE_HEIGHT - 10}px off the spine)`);
            process.exit(1);
        }
    }
    if (laneViolations > 0) process.exit(1);
    console.log(`span lanes: ${spans.length} spans, ${maxLaneUsed + 1} lanes used, ` +
        'all time-overlaps separated');
}


const years = events.map(e => e.year);
const minYear = Math.min(...years);
const maxYear = Math.max(...years, NOW);
const range = maxYear - minYear, pad = range * 0.02;
const domainMin = minYear - pad, domainMax = maxYear + pad;

// Era scale (navigation scrubber): frac/invert must round-trip and invert must
// be monotonic, or scrubbing would jump around. Property-tested over the strip
// and over years spanning every magnitude in the domain.
{
    const es = createEraScale(domainMin, domainMax);
    if (es.eras.length !== 5) {
        console.log(`FAIL: expected 5 eras for the full dataset, got ${es.eras.length}`);
        process.exit(1);
    }
    let prevYear = -Infinity;
    for (let f = 0; f <= 1.0000001; f += 0.0005) {
        const y = es.invert(f);
        if (y < prevYear - Math.max(1e-6, Math.abs(prevYear) * 1e-9)) {
            console.log(`FAIL: era-scale invert not monotonic at f=${f}`);
            process.exit(1);
        }
        prevYear = y;
        const f2 = es.frac(y);
        if (Math.abs(f2 - Math.min(1, f)) > 1e-6) {
            console.log(`FAIL: era-scale round-trip f=${f} → y=${y} → ${f2}`);
            process.exit(1);
        }
    }
    for (const y of [-13.8e9, -1e9, -1e6, -300000, -10000, -500, 0, 1000, 1500, 1900, 2026, 2100, 1e9, 5e9]) {
        const clamped = Math.max(domainMin, Math.min(domainMax, y));
        const back = es.invert(es.frac(y));
        if (Math.abs(back - clamped) > Math.max(1e-6, Math.abs(clamped) * 1e-9)) {
            console.log(`FAIL: era-scale year round-trip ${y} → ${back}`);
            process.exit(1);
        }
    }
    console.log('era scale: 5 eras, monotonic, round-trips clean');
}
const fracScale = scaleSymlog([domainMin, domainMax], [0, 1]);

const priorityById = computePriorities(events, fracScale, NOW);
const byPriority = [...events].sort((a, b) => priorityById.get(b.id) - priorityById.get(a.id));
const tier1Count = Math.max(8, Math.ceil(events.length * 0.25));
const tierById = new Map(byPriority.map((e, i) => [e.id, i < tier1Count ? 1 : 2]));
// Char-width approximations standing in for canvas measurement (browser-only).
const labelWidthById = new Map(events.map(e =>
    [e.id, e.title.length * (tierById.get(e.id) === 1 ? 7.8 : 6.3)]));
const chipWidthForCount = n => Math.max(22, `+${n}`.length * 6.5 + 12);
// Edge overscan — same formula as Timeline.jsx: events are admitted to
// packing/clustering while still off-screen so marks slide in during a pan
// instead of popping at the border.
const overscan = Math.ceil(
    Math.max(...labelWidthById.values()) + 2 * (LABEL_GAP + ENTER_SLACK));

const lanesAbove = Math.max(1, Math.floor((centerY - 12) / LANE_HEIGHT));
const lanesBelow = Math.max(1, Math.floor((height - centerY - 12) / LANE_HEIGHT));
const laneOrder = buildLaneOrder(Math.min(lanesAbove, lanesBelow, MAX_LANES));

function labelsOverlap(a, b) {
    return a.start < b.end && b.start < a.end && Math.abs(a.y - b.y) < LABEL_H;
}

const MAX_SCALE = 5000; // must match Timeline.jsx
let frames = 0, labelViolations = 0, chipViolations = 0, memberViolations = 0;
let stuckChipViolations = 0;
let laneHops = 0, minPlaced = Infinity, maxPlaced = 0, placedAt1 = -1, chipsAt1 = -1;
// Edge-flicker invariant: during a pure PAN, a label newly placed with any
// on-screen pixels is exactly the border pop the overscan exists to prevent.
// (Zoom steps are excluded — admission changing mid-screen is normal LOD.)
// Repacking cascades deeper than the overscan margin could pop in principle;
// if a future dataset trips this, widen the overscan formula.
let panPhase = false, edgePops = 0;
const clampT = (t, s) => Math.max(-width * (s - 1), Math.min(0, t));

for (const anchorFrac of [0.1, 0.3, 0.5, 0.7, 0.9, 0.98]) {
    const place = createLanePacker({
        events, priorityById, labelWidthById, laneOrder, centerY, width, overscan,
    });
    const clusterize = createClusterer({ chipWidthForCount });
    let s = 1, t = 0;
    let prevLanes = new Map();
    let prevPlaced = new Set();

    const step = () => {
        const scale = scaleSymlog([domainMin, domainMax], [t, t + width * s]);
        const { placed } = place(scale);
        const placedIds = new Set(placed.map(p => p.event.id));

        if (panPhase) {
            for (const p of placed) {
                if (!prevPlaced.has(p.event.id) && p.end > 0 && p.start < width) {
                    edgePops++;
                    if (edgePops <= 5) console.log(
                        `EDGE POP during pan s=${s.toFixed(2)}: #${p.event.id} box [${p.start.toFixed(0)}, ${p.end.toFixed(0)}]`);
                }
            }
        }
        prevPlaced = placedIds;

        // Mirrors the component: visible bar-mode spans never enter clusters.
        const geoById = new Map(events.map(e => [e.id, markGeometry(e, scale, width, overscan)]));

        // Property: the label anchor of a bar with truly visible pixels
        // always lies inside the viewport (the visible-portion midpoint
        // clamping in markGeometry — overscan admission must not move it).
        for (const [id, geo] of geoById) {
            if (geo.isBar && geo.x1 >= 0 && geo.x0 <= width && (geo.x < 0 || geo.x > width)) {
                memberViolations++;
                if (memberViolations <= 5) console.log(
                    `BAR ANCHOR OFF-SCREEN s=${s.toFixed(2)}: #${id} at x=${geo.x.toFixed(1)}`);
            }
        }
        const unlabeled = events
            .filter(e => {
                const geo = geoById.get(e.id);
                return !placedIds.has(e.id) && !(geo.isBar && geo.visible);
            })
            .map(e => ({ e, x: geoById.get(e.id).x }))
            .filter(p => p.x >= -overscan && p.x <= width + overscan)
            .sort((a, b) => (a.x - b.x) || (a.e.id - b.e.id));
        const { chips, clusteredIds } = clusterize(unlabeled);

        if (placedAt1 < 0) { placedAt1 = placed.length; chipsAt1 = chips.length; }
        minPlaced = Math.min(minPlaced, placed.length);
        maxPlaced = Math.max(maxPlaced, placed.length);

        // 1. Label no-overlap.
        for (let i = 0; i < placed.length; i++)
            for (let j = i + 1; j < placed.length; j++)
                if (labelsOverlap(placed[i], placed[j])) {
                    labelViolations++;
                    if (labelViolations <= 5) console.log(
                        `LABEL OVERLAP anchor=${anchorFrac} s=${s.toFixed(2)}: #${placed[i].event.id} & #${placed[j].event.id}`);
                }

        // 2. Chip no-overlap (chips are x-sorted by construction).
        for (let i = 1; i < chips.length; i++)
            if (chips[i - 1].end > chips[i].start) {
                chipViolations++;
                if (chipViolations <= 5) console.log(
                    `CHIP OVERLAP anchor=${anchorFrac} s=${s.toFixed(2)}: ${chips[i - 1].id} & ${chips[i].id}`);
            }

        // 3. Membership: unlabeled only, N ≥ 2.
        for (const chip of chips) {
            if (chip.members.length < 2) memberViolations++;
            for (const m of chip.members)
                if (placedIds.has(m.id)) {
                    memberViolations++;
                    if (memberViolations <= 5) console.log(
                        `LABELED MEMBER anchor=${anchorFrac} s=${s.toFixed(2)}: #${m.id} in chip ${chip.id}`);
                }
        }
        if (clusteredIds.size !== chips.reduce((n, c) => n + c.members.length, 0))
            memberViolations++;

        // 4. Regression guard: at max zoom, every surviving chip must be
        // genuinely unsplittable (members too close in time to ever separate,
        // e.g. same-year events). A splittable chip surviving max zoom means
        // the zoom range is too small for the symlog compression — the
        // "clusters never expand" bug.
        if (s >= MAX_SCALE) {
            for (const chip of chips) {
                const fs = chip.members.map(m => fracScale(m.year)).sort((a, b) => a - b);
                let maxGapF = 0;
                for (let i = 1; i < fs.length; i++) maxGapF = Math.max(maxGapF, fs[i] - fs[i - 1]);
                if (width * MAX_SCALE * maxGapF > CLUSTER_SPLIT_PX) {
                    stuckChipViolations++;
                    if (stuckChipViolations <= 5) console.log(
                        `STUCK SPLITTABLE CHIP at max zoom anchor=${anchorFrac}: ${chip.id} (${chip.members.map(m => m.year).join(', ')})`);
                }
            }
        }

        const lanes = new Map(placed.map(p => [p.event.id, p.y]));
        for (const [id, y] of lanes)
            if (prevLanes.has(id) && prevLanes.get(id) !== y) laneHops++;
        prevLanes = lanes;
        frames++;
    };

    step();
    // Zoom in toward the anchor (mimics the wheel handler math), pan around,
    // zoom back out — hysteresis and stickiness get exercised in both directions.
    const mouseX = width * anchorFrac;
    for (let k = 0; k < 65; k++) {
        const ns = Math.min(MAX_SCALE, s * 1.15);
        t = clampT(mouseX - (mouseX - t) * (ns / s), ns);
        s = ns;
        step();
    }
    panPhase = true;
    for (let k = 0; k < 30; k++) { t = clampT(t - 50, s); step(); }
    for (let k = 0; k < 60; k++) { t = clampT(t + 50, s); step(); }
    panPhase = false;
    for (let k = 0; k < 65; k++) {
        const ns = Math.max(1, s / 1.15);
        t = clampT(mouseX - (mouseX - t) * (ns / s), ns);
        s = ns;
        step();
    }
}

console.log(`events: ${events.length} | frames: ${frames} (6 zoom-pan-zoom gestures)`);
console.log(`default view: ${placedAt1} labels, ${chipsAt1} chips`);
console.log(`labels placed range: ${minPlaced}..${maxPlaced} | lane hops: ${laneHops}`);
console.log(`overscan: ${overscan}px | on-screen label pops during pan: ${edgePops}`);
const total = labelViolations + chipViolations + memberViolations + stuckChipViolations + edgePops;
console.log(total === 0
    ? 'PASS: zero label overlaps, zero chip overlaps, membership clean, no stuck chips at max zoom, no border pops during pan'
    : `FAIL: ${labelViolations} label overlaps, ${chipViolations} chip overlaps, ` +
      `${memberViolations} membership violations, ${stuckChipViolations} stuck splittable chips, ` +
      `${edgePops} border pops during pan`);
process.exit(total === 0 ? 0 : 1);
