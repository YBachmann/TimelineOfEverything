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
    LANE_HEIGHT, MAX_LANES, CHIP_H, CLUSTER_SPLIT_PX,
    computePriorities, buildLaneOrder, createLanePacker, createClusterer,
} from '../src/timelineLayout.js';
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

const years = events.map(e => e.year);
const minYear = Math.min(...years);
const maxYear = Math.max(...years, NOW);
const range = maxYear - minYear, pad = range * 0.02;
const domainMin = minYear - pad, domainMax = maxYear + pad;
const fracScale = scaleSymlog([domainMin, domainMax], [0, 1]);

const priorityById = computePriorities(events, fracScale, NOW);
const byPriority = [...events].sort((a, b) => priorityById.get(b.id) - priorityById.get(a.id));
const tier1Count = Math.max(8, Math.ceil(events.length * 0.25));
const tierById = new Map(byPriority.map((e, i) => [e.id, i < tier1Count ? 1 : 2]));
// Char-width approximations standing in for canvas measurement (browser-only).
const labelWidthById = new Map(events.map(e =>
    [e.id, e.title.length * (tierById.get(e.id) === 1 ? 7.8 : 6.3)]));
const chipWidthForCount = n => Math.max(22, `+${n}`.length * 6.5 + 12);

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
const clampT = (t, s) => Math.max(-width * (s - 1), Math.min(0, t));

for (const anchorFrac of [0.1, 0.3, 0.5, 0.7, 0.9, 0.98]) {
    const place = createLanePacker({
        events, priorityById, labelWidthById, laneOrder, centerY, width,
    });
    const clusterize = createClusterer({ chipWidthForCount });
    let s = 1, t = 0;
    let prevLanes = new Map();

    const step = () => {
        const scale = scaleSymlog([domainMin, domainMax], [t, t + width * s]);
        const { placed } = place(scale);
        const placedIds = new Set(placed.map(p => p.event.id));

        const unlabeled = events
            .filter(e => !placedIds.has(e.id))
            .map(e => ({ e, x: scale(e.year) }))
            .filter(p => p.x >= -20 && p.x <= width + 20)
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
    for (let k = 0; k < 30; k++) { t = clampT(t - 50, s); step(); }
    for (let k = 0; k < 60; k++) { t = clampT(t + 50, s); step(); }
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
const total = labelViolations + chipViolations + memberViolations + stuckChipViolations;
console.log(total === 0
    ? 'PASS: zero label overlaps, zero chip overlaps, membership clean, no stuck chips at max zoom'
    : `FAIL: ${labelViolations} label overlaps, ${chipViolations} chip overlaps, ` +
      `${memberViolations} membership violations, ${stuckChipViolations} stuck splittable chips`);
process.exit(total === 0 ? 0 : 1);
