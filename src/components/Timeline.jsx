import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
    LANE_HEIGHT, MAX_LANES, CLUSTER_SPLIT_PX, CHIP_H,
    computePriorities, buildLaneOrder, createLanePacker, createClusterer,
} from '../timelineLayout';

/**
 * D3-based interactive timeline.
 *
 * Layout: a horizontal, symmetric-log time axis with a central spine. Event dots
 * sit on the spine; labels are stacked in lanes above and below it.
 *
 * Label de-cluttering (see docs/design/label-decluttering.md): labels must never
 * overlap. On every zoom/pan a greedy lane packer (src/timelineLayout.js) places
 * the visible events in priority order; events with no free lane render as a
 * receded dot. Unlabeled dots that pile up are aggregated into +N cluster chips
 * on the spine — clicking a chip zooms in when zooming can split it, or opens a
 * member list when it can't (e.g. same-year events). Sticky lanes and link
 * hysteresis keep the layout calm while zooming; a two-tier typography scale
 * makes the hierarchy visible; a singleton tooltip makes every mark
 * discoverable on hover.
 *
 * Interaction: scroll = pan, CTRL + scroll = zoom, hover for a preview,
 * click a dot / label / chip for details.
 */
export default function Timeline({ events, selectedCategory }) {
    const svgRef = useRef(null);
    const wrapperRef = useRef(null);
    const tooltipRef = useRef(null);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [selectedCluster, setSelectedCluster] = useState(null);

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
        // Fraction-of-domain projection, reused for priorities and zoom targets.
        const fracScale = baseScale().range([0, 1]);

        // Priority: hand-tagged importance wins; otherwise a content-aware
        // heuristic. Deterministic per filter change, so lanes stay stable.
        const priorityById = computePriorities(filteredEvents, fracScale, nowYear);

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
        const measureChip = makeTextMeasurer(`600 10px ${fontFamily}`);
        const labelWidthById = new Map(filteredEvents.map(e =>
            [e.id, (tierById.get(e.id) === 1 ? measureTier1 : measureTier2)(e.title)]));

        // Layers, back to front. All leader lines render below all label text so
        // crossings never strike through glyphs (the text halo hides the rest).
        // Chips sit under the dots layer so a labeled event's dot stays visible
        // even if it lands on a chip.
        const gridGroup = g.append('g').attr('class', 'gridlines');
        g.append('line').attr('class', 'timeline-spine')
            .attr('x1', 0).attr('y1', centerY).attr('x2', width).attr('y2', centerY);
        const spineTickGroup = g.append('g').attr('class', 'spine-ticks');
        const leadersGroup = g.append('g').attr('class', 'leaders');
        const chipsGroup = g.append('g').attr('class', 'cluster-chips');
        const dotsGroup = g.append('g').attr('class', 'dots');
        const labelLayer = g.append('g').attr('class', 'label-texts');
        const hitGroup = g.append('g').attr('class', 'dot-hits');
        const axisG = g.append('g')
            .attr('class', 'x-axis')
            .attr('transform', `translate(0,${height})`);

        const lanesAbove = Math.max(1, Math.floor((centerY - 12) / LANE_HEIGHT));
        const lanesBelow = Math.max(1, Math.floor((height - centerY - 12) / LANE_HEIGHT));
        const maxLanes = Math.min(lanesAbove, lanesBelow, MAX_LANES);
        const laneOrder = buildLaneOrder(maxLanes);
        const LEADER_INNER = 9; // stop the leader line just short of the text

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
        const showTooltipHtml = (event, html, borderColor) => {
            clearTimeout(ttTimer);
            // Small delay prevents flicker while sweeping across dense areas.
            ttTimer = setTimeout(() => {
                tooltipEl.innerHTML = html;
                tooltipEl.style.borderColor = borderColor;
                positionTooltip(event);
                tooltipEl.style.opacity = 1;
            }, 80);
        };
        const showTooltip = (event, d) => {
            const span = d.endYear != null ? ` – ${formatYear(d.endYear)}` : '';
            showTooltipHtml(event,
                `<div class="tt-title">${escapeHtml(d.title)}</div>` +
                `<div class="tt-year">${formatYear(d.year)}${span}</div>` +
                `<div class="tt-cat" style="color:${getCategoryColor(d.category)}">${escapeHtml(d.category)}</div>`,
                getCategoryColor(d.category));
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

        // --- Layout engines (stateful; reset on filter change with the effect) ---
        const placeLabels = createLanePacker({
            events: filteredEvents, priorityById, labelWidthById, laneOrder, centerY, width,
        });
        const clusterize = createClusterer({
            chipWidthForCount: n => Math.max(22, measureChip(`+${n}`) + 12),
        });
        let prevLabeledIds = new Set(); // dot membership transitions

        let currentScale = 1;
        let currentTranslateX = 0;
        const minScale = 1;
        // Symlog compresses recent history into a sliver of the axis (years
        // 1700–2026 span ~0.4% of it), so the max zoom must be ~1000×+ for
        // year-apart modern events to separate. Same-year events can never
        // separate spatially — those clusters open a list modal instead.
        const maxScale = 5000;
        const currentScaleFn = () =>
            baseScale().range([currentTranslateX, currentTranslateX + width * currentScale]);

        // --- Cluster chips: click zooms in when zooming can split the cluster;
        // otherwise (same-year pile-ups can never split) it opens a member list.
        const chipSplittable = (chip) => {
            const fs = chip.members.map(m => fracScale(m.year)).sort((a, b) => a - b);
            let maxGapF = 0;
            for (let i = 1; i < fs.length; i++) maxGapF = Math.max(maxGapF, fs[i] - fs[i - 1]);
            return width * maxScale * maxGapF > CLUSTER_SPLIT_PX;
        };
        const chipColor = (chip) => {
            const cats = new Set(chip.members.map(m => m.category));
            return cats.size === 1 ? getCategoryColor(chip.members[0].category) : '#8a92d8';
        };
        const chipTooltipHtml = (chip) => {
            const shown = chip.members.slice(0, 4).map(m =>
                `<div class="tt-item">${escapeHtml(m.title)}` +
                `<span class="tt-item-year"> · ${formatYear(m.year)}</span></div>`).join('');
            const more = chip.members.length > 4
                ? `<div class="tt-more">+${chip.members.length - 4} more…</div>` : '';
            const hint = chipSplittable(chip) ? 'Click to zoom in' : 'Click to list all';
            return `<div class="tt-title">${chip.members.length} events</div>${shown}${more}` +
                `<div class="tt-hint">${hint}</div>`;
        };

        // Animated zoom for chip clicks (wheel zoom stays instant). Any wheel
        // input cancels the animation and takes over. Zoom is interpolated in
        // log space (uniform perceived velocity — chip zooms can jump 100×+)
        // and the view center in domain-fraction space, so the flight stays
        // aimed at the target instead of drifting mid-way.
        let animId = null;
        const animateTo = (targetS, targetCenterFrac) => {
            cancelAnimationFrame(animId);
            const logS0 = Math.log(currentScale);
            const logS1 = Math.log(targetS);
            const c0 = (width / 2 - currentTranslateX) / (width * currentScale);
            const startTime = performance.now();
            const duration = 500;
            const tick = (now) => {
                const p = Math.min(1, (now - startTime) / duration);
                const ease = d3.easeCubicInOut(p);
                currentScale = Math.exp(logS0 + (logS1 - logS0) * ease);
                const c = c0 + (targetCenterFrac - c0) * ease;
                currentTranslateX = Math.max(
                    -width * (currentScale - 1),
                    Math.min(0, width / 2 - width * currentScale * c));
                render();
                if (p < 1) animId = requestAnimationFrame(tick);
            };
            animId = requestAnimationFrame(tick);
        };
        const zoomToCluster = (chip) => {
            hideTooltip();
            if (!chipSplittable(chip)) {
                setSelectedCluster([...chip.members].sort((a, b) => a.year - b.year));
                return;
            }
            const fs = chip.members.map(m => fracScale(m.year));
            const f0 = Math.min(...fs);
            const f1 = Math.max(...fs);
            // Spread the cluster across the middle ~60% of the viewport.
            const span = Math.max(f1 - f0, 1e-12);
            const targetS = Math.min(maxScale, Math.max(currentScale * 1.5, 0.6 / span));
            animateTo(targetS, (f0 + f1) / 2);
        };

        const render = () => {
            // Ghosts still fading from the previous frame must go before the new
            // join — a re-entering event would otherwise collide with itself.
            labelLayer.selectAll('.exiting').remove();

            const scale = currentScaleFn();
            const ticks = symlogTicks(scale, 0, width);

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
                .tickValues(ticks)
                .tickFormat(formatYearCompact)
                .tickSizeInner(4)
                .tickSizeOuter(0));
            axisG.select('.domain').remove();

            dotSel.attr('cx', d => scale(d.year));
            hitSel.attr('cx', d => scale(d.year));

            const { placed, occupancy } = placeLabels(scale);
            placedNow = new Set(placed.map(p => p.event.id));

            // Cluster the unlabeled residue. Members' dots and hit circles are
            // hidden — the chip represents them (with its own hit target).
            const unlabeled = filteredEvents
                .filter(e => !placedNow.has(e.id))
                .map(e => ({ e, x: scale(e.year) }))
                .filter(p => p.x >= -20 && p.x <= width + 20)
                .sort((a, b) => (a.x - b.x) || (a.e.id - b.e.id));
            const { chips, clusteredIds } = clusterize(unlabeled);

            // Dot membership styling — transition only dots whose labeled state
            // actually changed; transitioning every wheel tick looks flickery.
            dotSel.each(function (d) {
                const sel = d3.select(this);
                sel.style('display', clusteredIds.has(d.id) ? 'none' : null);
                const labeled = placedNow.has(d.id);
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
            hitSel.style('display', d => (clusteredIds.has(d.id) ? 'none' : null));

            // Chips: membership change = new key, so old chips exit instantly
            // (a fading ghost under a replacement chip would double-draw) and
            // new ones fade in.
            const chipSel = chipsGroup.selectAll('g.cluster-chip').data(chips, c => c.id);
            chipSel.exit().remove();
            const chipEnter = chipSel.enter().append('g')
                .attr('class', 'cluster-chip')
                .style('cursor', 'pointer')
                .style('opacity', 0)
                .on('click', (event, c) => { event.stopPropagation(); zoomToCluster(c); })
                .on('mouseenter', function (event, c) {
                    showTooltipHtml(event, chipTooltipHtml(c), chipColor(c));
                    d3.select(this).select('rect.chip-bg').attr('stroke-opacity', 1);
                })
                .on('mousemove', onMoveMark)
                .on('mouseleave', function () {
                    hideTooltip();
                    d3.select(this).select('rect.chip-bg').attr('stroke-opacity', 0.7);
                });
            chipEnter.append('rect')
                .attr('class', 'chip-bg')
                .attr('rx', CHIP_H / 2)
                .attr('height', CHIP_H)
                .attr('y', centerY - CHIP_H / 2)
                .attr('fill', '#1a1f3a')
                .attr('stroke-opacity', 0.7);
            chipEnter.append('text')
                .attr('class', 'chip-count')
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'middle')
                .attr('y', centerY + 0.5);
            chipEnter.append('title').text(c => `${c.count} events`);
            chipEnter.transition('enter').duration(120).style('opacity', 1);
            const chipMerged = chipEnter.merge(chipSel);
            chipMerged.select('rect.chip-bg')
                .attr('x', c => c.start)
                .attr('width', c => c.end - c.start)
                .attr('stroke', c => chipColor(c));
            chipMerged.select('text.chip-count')
                .attr('x', c => c.x)
                .attr('fill', c => chipColor(c))
                .text(c => `+${c.count}`);

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
        svg.on('wheel', function (event) {
            event.preventDefault();
            hideTooltip(); // never let the tooltip trail during pan/zoom
            cancelAnimationFrame(animId); // wheel input overrides chip zoom animation
            if (event.ctrlKey) {
                const zoomDelta = event.deltaY > 0 ? 1 / 1.15 : 1.15;
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
            cancelAnimationFrame(animId);
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
            {selectedCluster && (
                <div className="event-modal-overlay" onClick={() => setSelectedCluster(null)}>
                    <div className="event-modal" onClick={e => e.stopPropagation()}>
                        <button
                            className="modal-close"
                            onClick={() => setSelectedCluster(null)}
                            aria-label="Close modal"
                        >
                            ×
                        </button>
                        <h2>{selectedCluster.length} events</h2>
                        <p className="event-year">
                            {formatYear(selectedCluster[0].year)}
                            {selectedCluster.length > 1 &&
                                ` – ${formatYear(selectedCluster[selectedCluster.length - 1].year)}`}
                        </p>
                        <ul className="cluster-list">
                            {selectedCluster.map(ev => (
                                <li key={ev.id}>
                                    <button
                                        className="cluster-item"
                                        onClick={() => {
                                            setSelectedCluster(null);
                                            setSelectedEvent(ev);
                                        }}
                                    >
                                        <span
                                            className="cluster-item-dot"
                                            style={{ backgroundColor: getCategoryColor(ev.category) }}
                                        />
                                        <span className="cluster-item-title">{ev.title}</span>
                                        <span className="cluster-item-year">{formatYear(ev.year)}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
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

// Ticks for the visible window of a zoomed symlog scale. d3's own symlog
// ticks are linear over the FULL domain, which bunches them at the axis edges
// at wide views and leaves the visible window entirely empty once zoomed in.
// Instead: log-spaced magnitude ticks (±1/2/5 × 10^k) when the window spans
// orders of magnitude — evenly spread on a symlog axis by construction — and
// plain linear ticks once the window is narrow enough to be locally linear.
function symlogTicks(scale, x0, x1) {
    const v0 = scale.invert(x0);
    const v1 = scale.invert(x1);
    const span = v1 - v0;
    const absMax = Math.max(Math.abs(v0), Math.abs(v1));
    if (span < absMax * 0.5) return d3.ticks(v0, v1, 8);

    let ticks = [];
    const pushIfVisible = v => { if (v >= v0 && v <= v1) ticks.push(v); };
    const maxExp = Math.ceil(Math.log10(Math.max(10, absMax)));
    for (let k = 1; k <= maxExp; k++) {
        for (const m of [1, 2, 5]) {
            pushIfVisible(-m * 10 ** k);
            pushIfVisible(m * 10 ** k);
        }
    }
    if (v0 <= 0 && v1 >= 0) ticks.push(0);
    if (ticks.length < 5) return d3.ticks(v0, v1, 8);
    // Thin: full decades only, then every other decade.
    if (ticks.length > 14) {
        ticks = ticks.filter(t => t === 0 ||
            Math.abs(t) === 10 ** Math.round(Math.log10(Math.abs(t))));
    }
    if (ticks.length > 14) {
        ticks = ticks.filter(t => t === 0 ||
            Math.round(Math.log10(Math.abs(t))) % 2 === 0);
    }
    return ticks.sort((a, b) => a - b);
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
