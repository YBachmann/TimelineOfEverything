import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

/**
 * D3-based interactive timeline.
 *
 * Layout: a horizontal, symmetric-log time axis with a central spine. Event dots
 * sit on the spine; labels are stacked in lanes above and below it.
 *
 * Label de-cluttering (see docs/design/label-decluttering.md): labels must never
 * overlap. On every zoom/pan a greedy lane packer places the visible events in
 * priority order — each label claims the nearest free lane whose horizontal box
 * doesn't collide with an already-placed label; events with no free lane render
 * as a receded dot only. Priority comes from a hand-tagged `importance` field
 * when present, otherwise a content-aware heuristic (temporal isolation, deep
 * time, data richness). Sticky lanes + enter hysteresis keep the layout calm
 * while zooming; a two-tier typography scale makes the hierarchy visible; a
 * singleton tooltip makes every mark (labeled or not) discoverable on hover.
 *
 * Interaction: scroll = pan, CTRL + scroll = zoom, hover for a preview,
 * click a dot or label for details.
 */
export default function Timeline({ events, selectedCategory }) {
    const svgRef = useRef(null);
    const wrapperRef = useRef(null);
    const tooltipRef = useRef(null);
    const [selectedEvent, setSelectedEvent] = useState(null);

    useEffect(() => {
        if (!events.length || !svgRef.current) return;

        const filteredEvents = selectedCategory
            ? events.filter(e => e.category === selectedCategory)
            : events;
        if (!filteredEvents.length) return;

        const svgEl = svgRef.current;
        const wrapperEl = wrapperRef.current;
        const tooltipEl = tooltipRef.current;
        const margin = { top: 40, right: 20, bottom: 40, left: 20 };
        const width = svgEl.clientWidth - margin.left - margin.right;
        const height = svgEl.clientHeight - margin.top - margin.bottom;
        const centerY = height / 2;

        d3.select(svgEl).selectAll('*').remove();
        const svg = d3.select(svgEl)
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom);
        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        // Symmetric-log scale: handles the 13.8-billion-year span including
        // negative (BCE) years and the year-zero boundary natively.
        const nowYear = new Date().getFullYear();
        const yearValues = filteredEvents.map(d => d.year);
        const minYear = Math.min(...yearValues);
        const maxYear = Math.max(...yearValues, nowYear);
        const range = maxYear - minYear;
        const padding = range * 0.02;
        const domainMin = minYear - padding;
        const domainMax = maxYear + padding;
        const baseScale = () => d3.scaleSymlog().domain([domainMin, domainMax]);

        // Priority: hand-tagged importance wins; otherwise a content-aware
        // heuristic. Deterministic per filter change, so lanes stay stable.
        const priorityById = computePriorities(
            filteredEvents, baseScale().range([0, 1]), nowYear);

        // Two-tier typography. Tier assignment is global over the filtered set
        // (not per-frame) so tiers never pulse during pan/zoom.
        const byPriority = [...filteredEvents]
            .sort((a, b) => priorityById.get(b.id) - priorityById.get(a.id));
        const tier1Count = Math.max(8, Math.ceil(filteredEvents.length * 0.25));
        const tierById = new Map(byPriority.map((e, i) => [e.id, i < tier1Count ? 1 : 2]));
        const TIER_FONT = { 1: { size: '12.5px', weight: 600 }, 2: { size: '11px', weight: 400 } };
        const tierFill = e => tierById.get(e.id) === 1
            ? d3.interpolateLab(getCategoryColor(e.category), '#f5f7ff')(0.55)
            : d3.interpolateLab(getCategoryColor(e.category), '#e0e0e0')(0.35);

        // Per-tier measurement keeps the packer's boxes exact — bold 12.5px runs
        // are wider than 11px ones.
        const fontFamily = getComputedStyle(svgEl).fontFamily || 'sans-serif';
        const measureTier1 = makeTextMeasurer(`600 12.5px ${fontFamily}`);
        const measureTier2 = makeTextMeasurer(`400 11px ${fontFamily}`);
        const labelWidthById = new Map(filteredEvents.map(e =>
            [e.id, (tierById.get(e.id) === 1 ? measureTier1 : measureTier2)(e.title)]));

        // Layers, back to front. All leader lines render below all label text so
        // crossings never strike through glyphs (the text halo hides the rest).
        const gridGroup = g.append('g').attr('class', 'gridlines');
        g.append('line').attr('class', 'timeline-spine')
            .attr('x1', 0).attr('y1', centerY).attr('x2', width).attr('y2', centerY);
        const spineTickGroup = g.append('g').attr('class', 'spine-ticks');
        const leadersGroup = g.append('g').attr('class', 'leaders');
        const dotsGroup = g.append('g').attr('class', 'dots');
        const labelLayer = g.append('g').attr('class', 'label-texts');
        const hitGroup = g.append('g').attr('class', 'dot-hits');
        const axisG = g.append('g')
            .attr('class', 'x-axis')
            .attr('transform', `translate(0,${height})`);

        // Lane geometry. LANE_HEIGHT > label height guarantees vertical clearance
        // between lanes, so avoiding horizontal overlap within a lane is enough.
        // Lanes are capped: a label 5+ lanes out has a leader too long to
        // associate — a dot is better than an unassociable label.
        const LANE_HEIGHT = 22;
        const LABEL_GAP = 8;      // horizontal padding added to each label box
        const ENTER_SLACK = 14;   // extra admission-only clearance for new labels
        const LEADER_INNER = 9;   // stop the leader line just short of the text
        const MAX_LANES = 4;
        const lanesAbove = Math.max(1, Math.floor((centerY - 12) / LANE_HEIGHT));
        const lanesBelow = Math.max(1, Math.floor((height - centerY - 12) / LANE_HEIGHT));
        const maxLanes = Math.min(lanesAbove, lanesBelow, MAX_LANES);
        // Placement order: nearest lanes first, alternating above/below.
        const laneOrder = [];
        for (let i = 0; i < maxLanes; i++) {
            laneOrder.push({ side: -1, idx: i });
            laneOrder.push({ side: 1, idx: i });
        }

        // --- Singleton hover tooltip (HTML overlay; never enters the packer) ---
        let ttTimer = null;
        const positionTooltip = (event) => {
            const rect = wrapperEl.getBoundingClientRect();
            const ttW = tooltipEl.offsetWidth || 200;
            const ttH = tooltipEl.offsetHeight || 60;
            let x = event.clientX - rect.left + 14;
            if (x + ttW > rect.width - 8) x = event.clientX - rect.left - 14 - ttW;
            let y = event.clientY - rect.top - 10;
            y = Math.max(4, Math.min(rect.height - ttH - 4, y));
            tooltipEl.style.left = `${x}px`;
            tooltipEl.style.top = `${y}px`;
        };
        const showTooltip = (event, d) => {
            clearTimeout(ttTimer);
            // Small delay prevents flicker while sweeping across dense dot piles.
            ttTimer = setTimeout(() => {
                const span = d.endYear != null ? ` – ${formatYear(d.endYear)}` : '';
                tooltipEl.innerHTML =
                    `<div class="tt-title">${escapeHtml(d.title)}</div>` +
                    `<div class="tt-year">${formatYear(d.year)}${span}</div>` +
                    `<div class="tt-cat" style="color:${getCategoryColor(d.category)}">${escapeHtml(d.category)}</div>`;
                tooltipEl.style.borderColor = getCategoryColor(d.category);
                positionTooltip(event);
                tooltipEl.style.opacity = 1;
            }, 80);
        };
        const hideTooltip = () => {
            clearTimeout(ttTimer);
            tooltipEl.style.opacity = 0;
        };

        // --- Hover triad: dot ↔ leader ↔ label highlight as one unit ---
        // Resting values are re-derived from current state so un-highlighting
        // restores the graded leader opacity / tier fill / membership dot style.
        let placedNow = new Set();
        const leaderOpacity = d => Math.max(0.3, 0.55 - 0.075 * d.laneIdx);
        const dotBaseR = id => (placedNow.has(id) ? 4.5 : 3);
        const dotBaseFillOpacity = id => (placedNow.has(id) ? 1 : 0.55);

        const setHighlight = (id, on) => {
            leadersGroup.selectAll('line.leader-line')
                .filter(d => d.event.id === id)
                .interrupt('hl').transition('hl').duration(100)
                .attr('stroke-opacity', d => (on ? 0.9 : leaderOpacity(d)))
                .attr('stroke-width', on ? 1.5 : 1);
            // Fill only — bolding on hover would exceed the measured packer box.
            labelLayer.selectAll('g.label-node')
                .filter(d => d.event.id === id)
                .select('text.event-label')
                .interrupt('hl').transition('hl').duration(100)
                .attr('fill', d => (on ? '#ffffff' : tierFill(d.event)));
            dotSel.filter(d => d.id === id)
                .interrupt('hover').transition('hover').duration(100)
                .attr('r', dotBaseR(id) + (on ? 2 : 0))
                .attr('fill-opacity', on ? 1 : dotBaseFillOpacity(id));
        };

        // Shared handlers for dot hit-circles (datum = event) and label
        // hit-rects (datum = placed object wrapping the event).
        const eventOf = d => d.event ?? d;
        const onClickMark = (event, d) => {
            event.stopPropagation();
            setSelectedEvent(eventOf(d));
        };
        const onEnterMark = (event, d) => {
            showTooltip(event, eventOf(d));
            setHighlight(eventOf(d).id, true);
        };
        const onMoveMark = (event) => {
            if (tooltipEl.style.opacity === '1') positionTooltip(event);
        };
        const onLeaveMark = (event, d) => {
            hideTooltip();
            setHighlight(eventOf(d).id, false);
        };

        // Dots: visible mark + a 24px invisible hit target. Visual weight follows
        // the label hierarchy — labeled dots forward, bare dots recede — so the
        // brightest pixels no longer mark the least important events.
        const dotSel = dotsGroup.selectAll('circle.event-dot')
            .data(filteredEvents, d => d.id)
            .enter().append('circle')
            .attr('class', 'event-dot')
            .attr('cy', centerY)
            .attr('fill', d => getCategoryColor(d.category))
            .attr('stroke', '#fff')
            .attr('stroke-width', 1);
        const hitSel = hitGroup.selectAll('circle.event-hit')
            .data(filteredEvents, d => d.id)
            .enter().append('circle')
            .attr('class', 'event-hit')
            .attr('cy', centerY)
            .attr('r', 12)
            .attr('fill', 'transparent')
            .style('cursor', 'pointer')
            .on('click', onClickMark)
            .on('mouseenter', onEnterMark)
            .on('mousemove', onMoveMark)
            .on('mouseleave', onLeaveMark);
        hitSel.append('title').text(d => `${d.title} — ${formatYear(d.year)}`);

        // --- Packer state persisting across renders (resets on filter change) ---
        const lastLaneById = new Map(); // sticky lanes: id -> {side, idx}
        let prevPlacedIds = new Set();  // enter hysteresis: who had a label last frame
        let prevLabeledIds = new Set(); // dot membership transitions

        let currentScale = 1;
        let currentTranslateX = 0;
        const currentScaleFn = () =>
            baseScale().range([currentTranslateX, currentTranslateX + width * currentScale]);

        // Greedy lane packer with sticky lanes and enter hysteresis.
        // - Sticky: an event prefers its remembered lane; it only moves for a
        //   same-side improvement of ≥2 lanes inward, or when the remembered
        //   lane is taken. Side flips only happen as a last resort.
        // - Hysteresis: events that were NOT labeled last frame must clear an
        //   ENTER_SLACK-widened box to be admitted, but only the standard box is
        //   recorded — the slack is an admission criterion, not reserved space,
        //   so no packing capacity is lost and the no-overlap invariant holds.
        const placeLabels = (scale) => {
            const visible = filteredEvents
                .map(e => ({ e, x: scale(e.year) }))
                .filter(p => p.x >= 0 && p.x <= width);
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
                    // Improvement move: only same-side and ≥2 lanes inward, to
                    // avoid both stranding and 1-lane oscillation.
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

        const render = () => {
            // Ghosts still fading from the previous frame must go before the new
            // join — a re-entering event would otherwise collide with itself.
            labelLayer.selectAll('.exiting').remove();

            const scale = currentScaleFn();
            const ticks = scale.ticks();

            // Reference layers: faint gridlines below the spine bridge the
            // axis↔spine gap for date reading; small ticks mark the spine itself.
            gridGroup.selectAll('line').data(ticks, t => t).join('line')
                .attr('stroke', 'rgba(102, 126, 234, 0.06)')
                .attr('y1', centerY).attr('y2', height)
                .attr('x1', t => scale(t)).attr('x2', t => scale(t));
            spineTickGroup.selectAll('line').data(ticks, t => t).join('line')
                .attr('stroke', '#667eea').attr('stroke-opacity', 0.35)
                .attr('y1', centerY - 3).attr('y2', centerY + 3)
                .attr('x1', t => scale(t)).attr('x2', t => scale(t));

            axisG.call(d3.axisBottom(scale)
                .tickFormat(formatYearCompact)
                .tickSizeInner(4)
                .tickSizeOuter(0));
            axisG.select('.domain').remove();

            dotSel.attr('cx', d => scale(d.year));
            hitSel.attr('cx', d => scale(d.year));

            const { placed, occupancy } = placeLabels(scale);
            placedNow = new Set(placed.map(p => p.event.id));

            // Dot membership styling — transition only dots whose labeled state
            // actually changed; transitioning every wheel tick looks flickery.
            dotSel.each(function (d) {
                const labeled = placedNow.has(d.id);
                const sel = d3.select(this);
                const target = labeled
                    ? { r: 4.5, fillOp: 1, strokeOp: 0.35 }
                    : { r: 3, fillOp: 0.55, strokeOp: 0 };
                const s = labeled !== prevLabeledIds.has(d.id)
                    ? sel.transition('mem').duration(150)
                    : sel;
                s.attr('r', target.r)
                    .attr('fill-opacity', target.fillOp)
                    .attr('stroke-opacity', target.strokeOp);
            });
            prevLabeledIds = placedNow;

            // Leaders: all in one layer below all text; opacity graded by lane
            // distance so far leaders recede instead of accumulating into noise.
            const leaders = leadersGroup.selectAll('line.leader-line')
                .data(placed, d => d.event.id);
            leaders.exit().remove();
            leaders.enter().append('line')
                .attr('class', 'leader-line')
                .merge(leaders)
                .interrupt('hl')
                .attr('x1', d => d.x).attr('y1', centerY)
                .attr('x2', d => d.x).attr('y2', d => d.y - d.side * LEADER_INNER)
                .attr('stroke', d => getCategoryColor(d.event.category))
                .attr('stroke-width', 1)
                .attr('stroke-opacity', d => leaderOpacity(d));

            // Labels: hit-rect (the pointer target) behind a halo'd text.
            const nodes = labelLayer.selectAll('g.label-node')
                .data(placed, d => d.event.id);

            // Exits fade symmetrically with enters — EXCEPT when a new label was
            // placed into the exiting label's box, where a fading ghost would
            // overlap it: contested exits are removed immediately (the fade is
            // cosmetic; the no-overlap constraint is not).
            nodes.exit().each(function (d) {
                const node = d3.select(this).classed('exiting', true);
                const occ = occupancy.get(d.laneKey);
                const contested = occ && occ.some(iv => d.start < iv[1] && d.end > iv[0]);
                if (contested) node.remove();
                else node.transition('exit').duration(120).style('opacity', 0).remove();
            });

            const enter = nodes.enter().append('g')
                .attr('class', 'label-node')
                .style('opacity', 0);
            enter.append('rect')
                .attr('class', 'label-hit')
                .attr('fill', 'transparent')
                .attr('height', 20)
                .style('cursor', 'pointer')
                .on('click', onClickMark)
                .on('mouseenter', onEnterMark)
                .on('mousemove', onMoveMark)
                .on('mouseleave', onLeaveMark);
            enter.append('text')
                .attr('class', 'event-label')
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'middle');
            enter.transition('enter').duration(120).style('opacity', 1);

            const merged = enter.merge(nodes);
            merged.select('rect.label-hit')
                .attr('x', d => d.x - labelWidthById.get(d.event.id) / 2 - 8)
                .attr('y', d => d.y - 10)
                .attr('width', d => labelWidthById.get(d.event.id) + 16);
            merged.select('text.event-label')
                .interrupt('hl')
                .attr('x', d => d.x)
                .attr('y', d => d.y)
                .style('font-size', d => TIER_FONT[tierById.get(d.event.id)].size)
                .style('font-weight', d => TIER_FONT[tierById.get(d.event.id)].weight)
                .attr('fill', d => tierFill(d.event))
                .attr('fill-opacity', d => (tierById.get(d.event.id) === 1 ? 1 : 0.8))
                .text(d => d.event.title);
        };

        render();

        // scroll = pan, CTRL + scroll = zoom toward the cursor.
        const minScale = 1;
        const maxScale = 50;
        svg.on('wheel', function (event) {
            event.preventDefault();
            hideTooltip(); // never let the tooltip trail during pan/zoom
            if (event.ctrlKey) {
                const zoomDelta = event.deltaY > 0 ? 0.9 : 1.1;
                const newScale = Math.max(minScale, Math.min(maxScale, currentScale * zoomDelta));
                if (newScale !== currentScale) {
                    const mouseX = event.offsetX - margin.left;
                    const scaleFactor = newScale / currentScale;
                    currentTranslateX = mouseX - (mouseX - currentTranslateX) * scaleFactor;
                    currentTranslateX = Math.max(-width * (newScale - 1), Math.min(0, currentTranslateX));
                    currentScale = newScale;
                }
            } else {
                const panDelta = event.deltaY > 0 ? 50 : -50;
                const maxPan = -width * (currentScale - 1);
                currentTranslateX = Math.max(maxPan, Math.min(0, currentTranslateX + panDelta));
            }
            render();
        });

        return () => {
            // The SVG is rebuilt on re-run, but the tooltip div persists — hide
            // it so it can't survive a filter change orphaned at full opacity.
            clearTimeout(ttTimer);
            tooltipEl.style.opacity = 0;
        };
    }, [events, selectedCategory]);

    return (
        <div className="timeline-wrapper" ref={wrapperRef}>
            <svg
                ref={svgRef}
                className="d3-timeline"
                style={{ width: '100%', height: '600px' }}
                aria-label="Interactive timeline"
            />
            <div className="timeline-tooltip" ref={tooltipRef} />
            {selectedEvent && (
                <div className="event-modal-overlay" onClick={() => setSelectedEvent(null)}>
                    <div className="event-modal" onClick={e => e.stopPropagation()}>
                        <button
                            className="modal-close"
                            onClick={() => setSelectedEvent(null)}
                            aria-label="Close modal"
                        >
                            ×
                        </button>
                        <h2>{selectedEvent.title}</h2>
                        <p className="event-year">
                            {formatYear(selectedEvent.year)}
                            {selectedEvent.endYear != null && ` – ${formatYear(selectedEvent.endYear)}`}
                        </p>
                        <p className="event-description">{selectedEvent.description}</p>
                        <span className={`event-category category-${selectedEvent.category}`}>
                            {selectedEvent.category}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}

// Priority in [0, 1]: hand-tagged `importance` (0.9–1.0 for anchors) always wins;
// otherwise a deterministic content-aware heuristic scaled by 0.85 so anchors
// always outrank it. Heuristic terms: temporal isolation (symlog-projected
// nearest-neighbor gap — isolated events are landmarks), deep time (log distance
// from now), and data richness (description/links/sources as an interest proxy).
// The real Wikipedia-derived ranking will replace the heuristic later; the
// `importance` field is its integration point (docs/design/label-decluttering.md §5).
function computePriorities(evts, project, nowYear) {
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

// Off-DOM text width measurement so the packer knows each label's footprint
// without laying it out in the document.
function makeTextMeasurer(font) {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = font;
    return text => ctx.measureText(text).width;
}

// Format a signed year as a human-readable label (negative years are BCE).
function formatYear(year) {
    const y = Math.round(year);
    return y < 0
        ? `${Math.abs(y).toLocaleString()} BCE`
        : y.toLocaleString();
}

// Compact axis-tick formatting: deep past as "ago" units (13.8 Bya, 65 Mya,
// 300 kya), the historical window as plain years, the deep future as "+N yrs".
// ≤3 significant digits so ticks stay narrow.
function formatYearCompact(year) {
    const y = Math.round(year);
    const compact = v => {
        const s = v >= 100 ? Math.round(v).toString()
            : v >= 10 ? (Math.round(v * 10) / 10).toString()
                : (Math.round(v * 100) / 100).toString();
        return s;
    };
    if (y <= -10000) {
        const ago = -y;
        if (ago >= 1e9) return `${compact(ago / 1e9)} Bya`;
        if (ago >= 1e6) return `${compact(ago / 1e6)} Mya`;
        return `${compact(ago / 1e3)} kya`;
    }
    if (y > 3000) {
        if (y >= 1e9) return `+${compact(y / 1e9)}B yrs`;
        if (y >= 1e6) return `+${compact(y / 1e6)}M yrs`;
        if (y >= 1e4) return `+${compact(y / 1e3)}k yrs`;
        return `+${y.toLocaleString()} yrs`;
    }
    return formatYear(y);
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

function getCategoryColor(category) {
    const colors = {
        natural: '#ff6b6b',
        history: '#4ecdc4',
        science: '#45b7d1',
        technology: '#f9ca24',
        future: '#a29bfe'
    };
    return colors[category] || '#666';
}
