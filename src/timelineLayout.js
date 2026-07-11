/**
 * Pure layout logic for the timeline: label priority, the greedy lane packer
 * (sticky lanes + enter hysteresis), and +N clustering of unlabeled events.
 *
 * No DOM, no d3 — everything geometric comes in as parameters (scales are
 * plain functions, text widths are precomputed maps). This keeps the logic
 * unit-testable: scripts/verify-layout.mjs imports THIS module and asserts the
 * no-overlap invariants against simulated zoom/pan gestures, so the verified
 * code is the shipped code.
 *
 * Design: docs/design/label-decluttering.md
 */

export const LANE_HEIGHT = 22;      // > label height, so lanes can't collide vertically
export const LABEL_GAP = 8;         // horizontal padding added to each label box
export const ENTER_SLACK = 14;      // extra admission-only clearance for new labels
export const MAX_LANES = 4;         // cap: farther leaders are too long to associate
export const CLUSTER_MERGE_PX = 14; // adjacent unlabeled events closer than this link up
export const CLUSTER_SPLIT_PX = 20; // linked pairs persist until their gap exceeds this
export const CHIP_H = 18;           // chip pill height; must stay below lane-0 labels
export const SPAN_MIN_PX = 8;       // spans narrower than this degenerate to point dots
export const SPAN_LANE_STEP = 7;    // vertical offset between span mini-lanes (bar height 6 + 1px gap)
export const SPAN_MAX_LANES = 3;    // spine + below + above; more would reach the label lanes

/**
 * Screen geometry for an event's mark. Point events anchor at their year.
 * Span events (endYear present) render as a bar when wide enough, else
 * degenerate to a point dot; a bar's label anchors at the midpoint of its
 * VISIBLE portion, so a span you are zoomed inside still gets an on-screen
 * label, and it stays visible to the packer as long as any part of the bar is.
 */
export function markGeometry(e, scale, width) {
    const x0 = scale(e.year);
    if (e.endYear == null) {
        return { x: x0, x0, x1: x0, isBar: false, visible: x0 >= 0 && x0 <= width };
    }
    const x1 = scale(e.endYear);
    const isBar = x1 - x0 >= SPAN_MIN_PX;
    const visible = x1 >= 0 && x0 <= width;
    const x = isBar
        ? (Math.max(0, x0) + Math.min(width, x1)) / 2
        : (x0 + x1) / 2;
    return { x, x0, x1, isBar, visible };
}

/**
 * Mini-lanes for span bars: greedy interval-graph coloring over the spans so
 * bars that overlap in TIME never share a lane. Time overlap is zoom-invariant
 * (screen x is monotonic in year), so lanes are assigned once per filter
 * change and can never churn during pan/zoom — no per-frame state needed.
 *
 * Order: start year ascending, longer span first on ties, so an enclosing era
 * (Cold War) takes the spine and its sub-events (Berlin Wall) stack off it.
 * Touching spans (a.endYear === b.year) count as overlapping — bars meeting
 * at 0px would read as one continuous bar.
 *
 * Greedy is unbounded; SPAN_MAX_LANES is enforced by verify-layout as a data
 * budget — a dataset needing a 4th lane must fail loudly, not silently push
 * bars into the label lanes.
 */
export function assignSpanLanes(evts) {
    const spans = evts
        .filter(e => e.endYear != null)
        .sort((a, b) => (a.year - b.year) || (b.endYear - a.endYear) || (a.id - b.id));
    const laneEnds = []; // laneEnds[i] = endYear of the latest span placed in lane i
    const laneById = new Map();
    for (const s of spans) {
        let lane = laneEnds.findIndex(end => s.year > end);
        if (lane === -1) { lane = laneEnds.length; laneEnds.push(s.endYear); }
        else laneEnds[lane] = s.endYear;
        laneById.set(s.id, lane);
    }
    return laneById;
}

// Lane index → vertical offset of the bar's centerline from the spine:
// 0 (spine), +7 (below), -7 (above), +14, -14, … Alternating outward keeps
// the stack centered on the spine.
export function spanLaneOffset(lane) {
    return lane === 0 ? 0 : (lane % 2 === 1 ? 1 : -1) * Math.ceil(lane / 2) * SPAN_LANE_STEP;
}

// Priority in [0, 1]: hand-tagged `importance` (0.9–1.0 for anchors) always wins;
// otherwise a deterministic content-aware heuristic scaled by 0.85 so anchors
// always outrank it. Heuristic terms: temporal isolation (projected nearest-
// neighbor gap — isolated events are landmarks), deep time (log distance from
// now), and data richness (description/links/sources as an interest proxy).
// The real Wikipedia-derived ranking will replace the heuristic later; the
// `importance` field is its integration point.
export function computePriorities(evts, project, nowYear) {
    const positions = evts
        .map(e => ({ id: e.id, p: project(e.year) }))
        .sort((a, b) => a.p - b.p);
    const gapById = new Map();
    for (let i = 0; i < positions.length; i++) {
        const left = i > 0 ? positions[i].p - positions[i - 1].p : Infinity;
        const right = i < positions.length - 1 ? positions[i + 1].p - positions[i].p : Infinity;
        gapById.set(positions[i].id, Math.min(left, right));
    }
    const finiteGaps = [...gapById.values()].filter(Number.isFinite);
    const maxGap = finiteGaps.length ? Math.max(...finiteGaps) : 1;

    const priorities = new Map();
    for (const e of evts) {
        if (typeof e.importance === 'number') {
            priorities.set(e.id, e.importance);
            continue;
        }
        const rawGap = gapById.get(e.id);
        const isolation = maxGap > 0
            ? Math.min(1, (Number.isFinite(rawGap) ? rawGap : maxGap) / maxGap)
            : 0;
        // 10.14 ≈ log10(13.8e9): normalizes deep time to [0, 1].
        const deepTime = Math.min(1, Math.log10(Math.abs(nowYear - e.year) + 1) / 10.14);
        const richness = Math.min(1, (
            (e.description?.length ?? 0) +
            40 * (e.links?.length ?? 0) +
            20 * (e.sources?.length ?? 0)
        ) / 400);
        priorities.set(e.id, 0.85 * (0.5 * isolation + 0.3 * deepTime + 0.2 * richness));
    }
    return priorities;
}

// Placement order: nearest lanes first, alternating above (-1) / below (+1).
export function buildLaneOrder(maxLanes) {
    const laneOrder = [];
    for (let i = 0; i < maxLanes; i++) {
        laneOrder.push({ side: -1, idx: i });
        laneOrder.push({ side: 1, idx: i });
    }
    return laneOrder;
}

/**
 * Stateful greedy lane packer. Call the returned function once per frame with
 * the current scale; state (sticky lanes, enter hysteresis) persists across
 * calls and resets when a new packer is created (i.e. on filter change).
 *
 * - Sticky: an event prefers its remembered lane; it only moves for a
 *   same-side improvement of ≥2 lanes inward, or when the remembered lane is
 *   taken. Side flips only happen as a last resort.
 * - Hysteresis: events that were NOT labeled last frame must clear an
 *   ENTER_SLACK-widened box to be admitted, but only the standard box is
 *   recorded — the slack is an admission criterion, not reserved space, so no
 *   packing capacity is lost and the no-overlap invariant holds.
 */
export function createLanePacker({ events, priorityById, labelWidthById, laneOrder, centerY, width }) {
    const lastLaneById = new Map();
    let prevPlacedIds = new Set();

    return function placeLabels(scale) {
        const visible = events
            .map(e => { const geo = markGeometry(e, scale, width); return { e, x: geo.x, geo }; })
            .filter(p => p.geo.visible);
        visible.sort((a, b) =>
            (priorityById.get(b.e.id) - priorityById.get(a.e.id)) ||
            (a.e.year - b.e.year) ||
            (a.e.id - b.e.id));

        const occupancy = new Map(); // laneKey -> [ [start,end], ... ]
        const laneFree = (key, s, en) => {
            const occ = occupancy.get(key);
            return !occ || !occ.some(iv => s < iv[1] && en > iv[0]);
        };

        const placed = [];
        for (const { e, x } of visible) {
            const halfW = labelWidthById.get(e.id) / 2 + LABEL_GAP;
            const slack = prevPlacedIds.has(e.id) ? 0 : ENTER_SLACK;
            const aStart = x - halfW - slack;
            const aEnd = x + halfW + slack;

            const remembered = lastLaneById.get(e.id);
            let lane = null;
            if (remembered && laneFree(remembered.side + ':' + remembered.idx, aStart, aEnd)) {
                lane = remembered;
                for (const l of laneOrder) {
                    if (l.side !== remembered.side || l.idx >= remembered.idx - 1) continue;
                    if (l.idx <= remembered.idx - 2 && laneFree(l.side + ':' + l.idx, aStart, aEnd)) {
                        lane = l;
                        break;
                    }
                }
            } else {
                for (const l of laneOrder) {
                    if (laneFree(l.side + ':' + l.idx, aStart, aEnd)) { lane = l; break; }
                }
            }
            if (!lane) {
                lastLaneById.delete(e.id);
                continue;
            }

            const key = lane.side + ':' + lane.idx;
            const start = x - halfW;
            const end = x + halfW;
            let occ = occupancy.get(key);
            if (!occ) { occ = []; occupancy.set(key, occ); }
            occ.push([start, end]);
            lastLaneById.set(e.id, { side: lane.side, idx: lane.idx });
            placed.push({
                event: e,
                x,
                y: centerY + lane.side * (lane.idx + 1) * LANE_HEIGHT,
                side: lane.side,
                laneIdx: lane.idx,
                laneKey: key,
                start,
                end,
            });
        }
        prevPlacedIds = new Set(placed.map(p => p.event.id));
        return { placed, occupancy };
    };
}

/**
 * Stateful +N clusterer for unlabeled (dot-only) events. Call the returned
 * function once per frame with the unlabeled items ([{e, x}], x ascending);
 * link hysteresis persists across calls.
 *
 * Pipeline:
 * 1. Link adjacent items: gap < CLUSTER_MERGE_PX links a pair; an already-
 *    linked pair stays linked until its gap exceeds CLUSTER_SPLIT_PX. The 6px
 *    hysteresis band prevents chip flicker at zoom reversals. (Pan is pure
 *    translation — gaps don't change — so panning can never churn clusters.)
 * 2. Connected runs of links become clusters.
 * 3. Merge pass to a fixpoint: any two adjacent groups whose boxes would
 *    visually collide are merged (a chip pill, or a lone dot's ±DOT_SLOP box).
 *    This is what guarantees chips never overlap each other or stray dots,
 *    regardless of chip text width.
 *
 * Returns { chips, clusteredIds }: chips are groups of ≥2 (members sorted by
 * x, box = [start, end]); singletons stay ordinary dots.
 */
export function createClusterer({ chipWidthForCount }) {
    const DOT_SLOP = 3; // half-extent of a bare dot for collision purposes
    let linkedPairs = new Set();

    const groupBox = (group) => {
        const cx = (group[0].x + group[group.length - 1].x) / 2;
        const halfW = group.length >= 2 ? chipWidthForCount(group.length) / 2 : DOT_SLOP;
        return { start: cx - halfW, end: cx + halfW, cx };
    };

    return function clusterize(items) {
        // 1 + 2: hysteresis links between adjacent items → contiguous runs.
        const newLinks = new Set();
        const groups = [];
        let current = null;
        for (const item of items) {
            if (!current) { current = [item]; continue; }
            const prev = current[current.length - 1];
            const key = prev.e.id + ':' + item.e.id;
            const gap = item.x - prev.x;
            const linked = gap < CLUSTER_MERGE_PX ||
                (linkedPairs.has(key) && gap <= CLUSTER_SPLIT_PX);
            if (linked) {
                newLinks.add(key);
                current.push(item);
            } else {
                groups.push(current);
                current = [item];
            }
        }
        if (current) groups.push(current);
        linkedPairs = newLinks;

        // 3: merge visually colliding neighbors to a fixpoint. Bounded: each
        // merge reduces the group count by one.
        let merged = true;
        while (merged && groups.length > 1) {
            merged = false;
            for (let i = 0; i < groups.length - 1; i++) {
                const a = groupBox(groups[i]);
                const b = groupBox(groups[i + 1]);
                if (a.end + 2 > b.start) {
                    groups.splice(i, 2, groups[i].concat(groups[i + 1]));
                    merged = true;
                    break;
                }
            }
        }

        const chips = groups
            .filter(g => g.length >= 2)
            .map(g => {
                const box = groupBox(g);
                return {
                    id: g.map(m => m.e.id).join('-'),
                    members: g.map(m => m.e),
                    x: box.cx,
                    start: box.start,
                    end: box.end,
                    count: g.length,
                };
            });
        const clusteredIds = new Set(chips.flatMap(c => c.members.map(m => m.id)));
        return { chips, clusteredIds };
    };
}
