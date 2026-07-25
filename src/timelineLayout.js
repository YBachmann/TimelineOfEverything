/**
 * Pure layout logic for the timeline: label priority, the greedy lane packer
 * (sticky lanes + enter hysteresis), and +N clustering of unlabeled events.
 *
 * No DOM, no d3 — everything geometric comes in as parameters (scales are
 * plain functions, text extents are precomputed maps). This keeps the logic
 * unit-testable: scripts/verify-layout.mjs imports THIS module and asserts the
 * no-overlap invariants against simulated zoom/pan gestures, so the verified
 * code is the shipped code.
 *
 * ORIENTATION (D27). Nothing in this file knows whether time runs left→right
 * or top→bottom. Everything is expressed in two axes:
 *
 *   t     — position ALONG the time axis (screen x when horizontal, y when vertical)
 *   cross — position ACROSS it, where the lanes stack (y when horizontal, x when vertical)
 *
 * The caller supplies the metrics that differ between the two, because the
 * thing that changes is not the math but *which dimension of a label lies
 * along time*: its width when horizontal (~151px median), its line height when
 * vertical (~18px). That single swap is why the vertical layout packs several
 * times more labels into a phone — see docs/design/portrait-mode.md §2.
 *
 * Design: docs/design/label-decluttering.md, docs/design/portrait-mode.md
 */

export const LANE_HEIGHT = 22;      // > label height, so lanes can't collide across the spine
export const LABEL_GAP = 8;         // along-time padding added to each label box
export const ENTER_SLACK = 14;      // extra admission-only clearance for new labels
export const MAX_LANES = 4;         // cap: farther leaders are too long to associate
export const CLUSTER_MERGE_PX = 14; // adjacent unlabeled events closer than this link up
export const CLUSTER_SPLIT_PX = 20; // linked pairs persist until their gap exceeds this
export const CHIP_H = 18;           // chip pill height; must stay below lane-0 labels
export const SPAN_MIN_PX = 8;       // spans shorter than this degenerate to point dots
export const SPAN_LANE_STEP = 7;    // cross-axis offset between span mini-lanes (bar height 6 + 1px gap)
export const SPAN_MAX_LANES = 3;    // spine + below + above; more would reach the label lanes

// Label line height when time runs vertically: the label's extent ALONG time
// is now its glyph height, not its width. 16px glyph box + 2px so adjacent
// rows never touch.
export const LABEL_LINE_H = 18;

/**
 * Per-orientation packing metrics. The horizontal set is exactly the constants
 * the packer used before it was parameterized, so the landscape layout is
 * unchanged by construction.
 *
 * `labelGap` and `enterSlack` are along-time quantities, so both shrink when
 * vertical: 8px of padding either side of a 151px label is 10% of its box, but
 * either side of an 18px row it is 89% — carrying the landscape values over
 * would silently halve the capacity the rotation exists to buy. Measured: the
 * landscape values cost 4 of 27 placeable labels at the fitted phone view.
 *
 * The vertical numbers are set by the same *proportion* the landscape ones
 * imply, not tuned by eye: enterSlack is ~9% of a horizontal label box (14/166)
 * and 14% of a vertical one (3/22), so hysteresis is if anything stronger
 * against flicker (LD6), not weaker.
 */
export const METRICS_H = { lanePitch: LANE_HEIGHT, labelGap: LABEL_GAP, enterSlack: ENTER_SLACK };
export const METRICS_V = { lanePitch: 0 /* see verticalLaneMetrics */, labelGap: 2, enterSlack: 3 };

export const MAX_LANES_V = 2;    // a 3rd column's leader would cross two others
export const MIN_COLUMN_W = 110; // narrower than this shows too little of a title to be worth a lane
// Clearance between the spine and the first label column. Must clear a `+N`
// chip's half-width (a chip pill is ≥22px wide and centred on the spine), or a
// label butts against a chip that happens to sit at a neighbouring instant —
// caught by looking at it, not by any invariant: they are adjacent along time,
// never overlapping, so the packer is right to allow it.
export const CROSS_GUTTER = 18;

/**
 * Column geometry for the vertical layout, derived from the cross-axis extent
 * the same way the horizontal lane budget is derived from chart height. Lives
 * here, not in the component, because verify-layout must compute it identically
 * — the LD9 rule that the verified geometry is the shipped geometry.
 *
 * Note what does NOT come out of this: a label's packing extent. Vertically a
 * label occupies LABEL_LINE_H along time whatever it says, so a title truncated
 * to fit its column packs exactly like one that fits whole. Truncation is
 * therefore purely a rendering concern here — the D22 hazard (measuring one
 * string while drawing another) cannot arise in this orientation.
 */
export function verticalLaneMetrics(crossExtent) {
    const half = crossExtent / 2 - CROSS_GUTTER;
    const lanesPerSide = Math.max(1, Math.min(MAX_LANES_V, Math.floor(half / MIN_COLUMN_W)));
    return { lanesPerSide, lanePitch: half / lanesPerSide };
}

/**
 * Lane (side, index) → cross-axis coordinate. The two orientations disagree
 * about what that coordinate MEANS, which is the one place the rotation is not
 * a rename:
 *
 * - Horizontal: a label is centred on its lane, so the coordinate is its
 *   baseline — lanes step outward by a full pitch each.
 * - Vertical: a label is anchored at its lane's INNER edge and grows outward
 *   (text-anchor end on the left, start on the right), so lane 0 sits one
 *   gutter off the spine and each further lane steps out by a column width.
 *
 * Getting this wrong is not subtle but it is invisible to the packer, which
 * only ever compares cross values for equality: the first spike placed every
 * vertical label at `crossCenter ± lanePitch` — the column's far edge — and
 * every title rendered off the side of the screen while all the invariants
 * still passed.
 */
export const crossForH = (crossCenter, lanePitch) =>
    (side, idx) => crossCenter + side * (idx + 1) * lanePitch;

export const crossForV = (crossCenter, lanePitch) =>
    (side, idx) => crossCenter + side * (CROSS_GUTTER + idx * lanePitch);

/**
 * Screen geometry for an event's mark, ALONG the time axis. Point events
 * anchor at their year. Span events (endYear present) render as a bar when
 * long enough, else degenerate to a point dot; a bar's label anchors at the
 * midpoint of its VISIBLE portion, so a span you are zoomed inside still gets
 * an on-screen label, and it stays visible to the packer as long as any part
 * of the bar is.
 *
 * `overscan` widens the visibility window by that many px per side WITHOUT
 * moving the anchor clamp: events are admitted to packing/clustering while
 * still off-screen, so their labels/chips materialize invisibly and slide
 * into view during a pan instead of popping into existence at the border.
 * Bar anchors keep clamping to the true viewport — an off-screen label for a
 * partially visible bar would defeat the visible-portion anchoring.
 *
 * `axisLen` is the time axis's length in px: the chart width when horizontal,
 * its height when vertical.
 */
export function markGeometry(e, scale, axisLen, overscan = 0) {
    const t0 = scale(e.year);
    if (e.endYear == null) {
        return { t: t0, t0, t1: t0, isBar: false, visible: t0 >= -overscan && t0 <= axisLen + overscan };
    }
    const t1 = scale(e.endYear);
    const isBar = t1 - t0 >= SPAN_MIN_PX;
    const visible = t1 >= -overscan && t0 <= axisLen + overscan;
    const t = isBar
        ? (Math.max(0, t0) + Math.min(axisLen, t1)) / 2
        : (t0 + t1) / 2;
    return { t, t0, t1, isBar, visible };
}

/**
 * Mini-lanes for span bars: greedy interval-graph coloring over the spans so
 * bars that overlap in TIME never share a lane. Time overlap is zoom-invariant
 * (screen position along the axis is monotonic in year), so lanes are assigned
 * once per filter change and can never churn during pan/zoom — no per-frame
 * state needed. Orientation-invariant for the same reason.
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

// Lane index → cross-axis offset of the bar's centerline from the spine:
// 0 (spine), +7, -7, +14, -14, … Alternating outward keeps the stack centered
// on the spine. (Below/above when horizontal; right/left when vertical.)
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

// Placement order: nearest lanes first, alternating -1 / +1 across the spine
// (above/below when horizontal, left/right when vertical).
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
export function createLanePacker({
    events, priorityById, labelExtentById, laneOrder, crossCenter, axisLen,
    metrics = METRICS_H, overscan = 0, crossFor,
}) {
    const lastLaneById = new Map();
    let prevPlacedIds = new Set();
    const { lanePitch, labelGap, enterSlack } = metrics;
    const laneCross = crossFor ?? crossForH(crossCenter, lanePitch);

    return function placeLabels(scale) {
        const visible = events
            .map(e => { const geo = markGeometry(e, scale, axisLen, overscan); return { e, t: geo.t, geo }; })
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
        for (const { e, t } of visible) {
            const half = labelExtentById.get(e.id) / 2 + labelGap;
            const slack = prevPlacedIds.has(e.id) ? 0 : enterSlack;
            const aStart = t - half - slack;
            const aEnd = t + half + slack;

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
            const start = t - half;
            const end = t + half;
            let occ = occupancy.get(key);
            if (!occ) { occ = []; occupancy.set(key, occ); }
            occ.push([start, end]);
            lastLaneById.set(e.id, { side: lane.side, idx: lane.idx });
            placed.push({
                event: e,
                t,
                cross: laneCross(lane.side, lane.idx),
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
 * function once per frame with the unlabeled items ([{e, t}], t ascending);
 * link hysteresis persists across calls.
 *
 * `chipExtentForCount` returns a chip's extent ALONG the time axis — the pill's
 * width when horizontal, its height when vertical. Vertical chips are therefore
 * a fixed ~18px regardless of member count, which is most of why the rotation
 * produces so many fewer chips: a chip only has to clear its own line height.
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
 *    regardless of chip text extent.
 *
 * Returns { chips, clusteredIds }: chips are groups of ≥2 (members sorted by
 * t, box = [start, end]); singletons stay ordinary dots.
 */
export function createClusterer({ chipExtentForCount }) {
    const DOT_SLOP = 3; // half-extent of a bare dot for collision purposes
    let linkedPairs = new Set();

    const groupBox = (group) => {
        const ct = (group[0].t + group[group.length - 1].t) / 2;
        const half = group.length >= 2 ? chipExtentForCount(group.length) / 2 : DOT_SLOP;
        return { start: ct - half, end: ct + half, ct };
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
            const gap = item.t - prev.t;
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
                    t: box.ct,
                    start: box.start,
                    end: box.end,
                    count: g.length,
                };
            });
        const clusteredIds = new Set(chips.flatMap(c => c.members.map(m => m.id)));
        return { chips, clusteredIds };
    };
}
