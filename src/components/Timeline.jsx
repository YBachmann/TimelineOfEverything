import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { buildLinkIndex } from '../data';
import {
    LANE_HEIGHT, MAX_LANES, CLUSTER_SPLIT_PX, CHIP_H,
    computePriorities, buildLaneOrder, createLanePacker, createClusterer,
    markGeometry, assignSpanLanes, spanLaneOffset,
} from '../timelineLayout';
import { ERA_DEFS, createEraScale } from '../eraScale';

/**
 * D3-based interactive timeline.
 *
 * Layout: a horizontal, symmetric-log time axis with a central spine. Event dots
 * sit on the spine; labels are stacked in lanes above and below it. The chart
 * is CSS-sized (flex-fills its container); a ResizeObserver rebuilds the scene
 * on size change, restoring the current zoom/center from a ref.
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
 * Interaction: scroll or drag = pan, CTRL + scroll or two-finger pinch = zoom,
 * hover for a preview, click/tap a dot / label / chip for details.
 */
export default function Timeline({ events, selectedCategory }) {
    const svgRef = useRef(null);
    const wrapperRef = useRef(null);
    const tooltipRef = useRef(null);
    const miniRef = useRef(null);   // navigation scrubber svg
    const navRef = useRef(null);    // { zoomToEra } exposed by the current effect run
    const viewRef = useRef(null);   // { domainMin, domainMax, scale, centerFrac } — view survives effect re-runs
    const sizeRef = useRef(null);   // { w, h } the current scene was built at
    const [viewSize, setViewSize] = useState(null); // bumped by the ResizeObserver
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [selectedCluster, setSelectedCluster] = useState(null);
    // Mirrored link relations for the detail modal's "Connected events" list.
    // Built over ALL events (not the filtered set) so links reach across
    // category filters; clicking a connected event swaps the modal to it.
    const linkIndex = useMemo(() => buildLinkIndex(events), [events]);

    // Rebuild the scene when the chart's box changes (window resize, phone
    // rotation, chrome rows re-wrapping). Debounced: ResizeObserver fires every
    // frame during a drag-resize and each bump rebuilds the whole scene. The
    // current zoom/center survive the rebuild via viewRef; sizeRef stops the
    // observer's initial fire (and any no-op notification) from triggering a
    // redundant rebuild of an identical scene.
    useEffect(() => {
        const svgEl = svgRef.current;
        if (!svgEl) return;
        let timer = null;
        const ro = new ResizeObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                const w = svgEl.clientWidth;
                const h = svgEl.clientHeight;
                const built = sizeRef.current;
                if (built && built.w === w && built.h === h) return;
                setViewSize({ w, h });
            }, 150);
        });
        ro.observe(svgEl);
        return () => {
            clearTimeout(timer);
            ro.disconnect();
        };
    }, []);

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
        // The chart is CSS-sized (flex-fill); the ResizeObserver keeps viewSize
        // current, with a fresh measurement as the first-run fallback.
        const svgW = viewSize?.w ?? svgEl.clientWidth;
        const svgH = viewSize?.h ?? svgEl.clientHeight;
        sizeRef.current = { w: svgW, h: svgH };
        const width = svgW - margin.left - margin.right;
        const height = svgH - margin.top - margin.bottom;
        const centerY = height / 2;
        // Skip degenerate boxes (mid-layout measurements, hidden ancestors) —
        // the observer will re-fire with a real size.
        if (width < 40 || height < 40) return;

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

        // Span mini-lanes: time-overlapping spans get distinct vertical lanes
        // so their bars never draw on top of each other. Assignment is
        // time-based (zoom-invariant), so it's fixed for the filter's lifetime.
        const spanLaneById = assignSpanLanes(filteredEvents);
        const spanBarY = id => centerY + spanLaneOffset(spanLaneById.get(id) ?? 0);

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
        const spansGroup = g.append('g').attr('class', 'span-bars');
        // Bar hit targets live BELOW chips/dots/labels: inside a bar, the more
        // specific mark (a chip pill, a dot's hit circle, a label rect) must win
        // pointer precedence over the bar itself.
        const barHitsGroup = g.append('g').attr('class', 'span-hits');
        const leadersGroup = g.append('g').attr('class', 'leaders');
        const chipsGroup = g.append('g').attr('class', 'cluster-chips');
        const dotsGroup = g.append('g').attr('class', 'dots');
        const labelLayer = g.append('g').attr('class', 'label-texts');
        const hitGroup = g.append('g').attr('class', 'dot-hits');
        const axisG = g.append('g')
            .attr('class', 'x-axis')
            .attr('transform', `translate(0,${height})`);
        // Always-visible readout of the time range currently on screen.
        const rangeReadout = g.append('text')
            .attr('class', 'range-readout')
            .attr('x', width)
            .attr('y', -16)
            .attr('text-anchor', 'end');

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
            showTooltipHtml(event,
                `<div class="tt-title">${escapeHtml(d.title)}</div>` +
                `<div class="tt-year">${formatYearRange(d)}</div>` +
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
        const HALO_PAD = 1.5; // width of the dark ring separating a dot from marks behind it

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
            haloSel.filter(d => d.id === id)
                .interrupt('hover').transition('hover').duration(100)
                .attr('r', dotBaseR(id) + (on ? 2 : 0) + HALO_PAD);
            spansGroup.selectAll('rect.span-bar')
                .filter(d => d.id === id)
                .interrupt('hover').transition('hover').duration(100)
                .attr('fill-opacity', on ? 0.85 : 0.55);
        };

        // Shared handlers for dot hit-circles (datum = event) and label
        // hit-rects (datum = placed object wrapping the event).
        const eventOf = d => d.event ?? d;
        const onClickMark = (event, d) => {
            event.stopPropagation();
            // Touch taps get a compatibility mouseenter (tooltip shows) but
            // never a mouseleave — clear it or it survives the modal.
            hideTooltip();
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
        // Each dot rides in a group with a background-colored halo disc under
        // it (same trick as the label-text halos): a dot crossing a span bar
        // or the spine gets a dark separation ring and reads as "in front of"
        // the mark behind it, and its translucent fill blends against the
        // background instead of the bar's color.
        const dotNodes = dotsGroup.selectAll('g.dot-mark')
            .data(filteredEvents, d => d.id)
            .enter().append('g')
            .attr('class', 'dot-mark');
        const haloSel = dotNodes.append('circle')
            .attr('class', 'dot-halo')
            .attr('fill', '#0a0e27');
        const dotSel = dotNodes.append('circle')
            .attr('class', 'event-dot')
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
        hitSel.append('title').text(d => `${d.title} — ${formatYearRange(d)}`);

        // --- Navigation scrubber: a piecewise-equal era strip. Each era gets
        // the same share of the strip (symlog within its band), so the Modern
        // era stays readable instead of inheriting the main axis' compression.
        // Statics (bands, labels, event marks) are built once per effect run;
        // only the viewport window updates per render.
        const miniSvgEl = miniRef.current;
        d3.select(miniSvgEl).selectAll('*').remove();
        const miniW = miniSvgEl.clientWidth - margin.left - margin.right;
        const MINI_H = 40;
        const STRIP_Y = 8;
        const STRIP_H = 24;
        d3.select(miniSvgEl)
            .attr('width', miniW + margin.left + margin.right)
            .attr('height', MINI_H);
        const miniG = d3.select(miniSvgEl).append('g')
            .attr('transform', `translate(${margin.left},0)`);
        const eraScale = createEraScale(domainMin, domainMax);
        const bandW = miniW / eraScale.eras.length;
        const bandsG = miniG.append('g');
        eraScale.eras.forEach((era, i) => {
            bandsG.append('rect')
                .attr('x', i * bandW).attr('y', STRIP_Y)
                .attr('width', bandW).attr('height', STRIP_H)
                .attr('fill', i % 2 ? 'rgba(102, 126, 234, 0.10)' : 'rgba(102, 126, 234, 0.05)');
            bandsG.append('text')
                .attr('class', 'era-band-label')
                .attr('x', i * bandW + bandW / 2)
                .attr('y', STRIP_Y + STRIP_H / 2)
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'middle')
                .text(era.label);
        });
        const marksG = miniG.append('g');
        for (const e of filteredEvents) {
            const fx = eraScale.frac(e.year) * miniW;
            if (e.endYear != null) {
                marksG.append('line')
                    .attr('x1', fx).attr('x2', eraScale.frac(e.endYear) * miniW)
                    .attr('y1', STRIP_Y + STRIP_H - 4).attr('y2', STRIP_Y + STRIP_H - 4)
                    .attr('stroke', getCategoryColor(e.category))
                    .attr('stroke-width', 2)
                    .attr('stroke-opacity', 0.5);
            } else {
                marksG.append('line')
                    .attr('x1', fx).attr('x2', fx)
                    .attr('y1', STRIP_Y + 4).attr('y2', STRIP_Y + STRIP_H - 8)
                    .attr('stroke', getCategoryColor(e.category))
                    .attr('stroke-width', 1)
                    .attr('stroke-opacity', 0.35);
            }
        }
        const miniWindow = miniG.append('rect')
            .attr('class', 'mini-window')
            .attr('y', STRIP_Y - 2)
            .attr('height', STRIP_H + 4)
            .attr('rx', 3);
        // Scrubbing centers the main view on the pointer's time position
        // (video-scrubber semantics); zoom level is left unchanged.
        const scrubTo = (mx) => {
            const f = fracScale(eraScale.invert(mx / miniW));
            currentTranslateX = Math.max(-width * (currentScale - 1),
                Math.min(0, width / 2 - width * currentScale * f));
            render();
        };
        miniG.append('rect')
            .attr('class', 'mini-overlay')
            .attr('x', 0).attr('y', 0)
            .attr('width', miniW).attr('height', MINI_H)
            .attr('fill', 'transparent')
            .style('cursor', 'pointer')
            .call(d3.drag()
                .container(miniG.node())
                .on('start drag', (event) => {
                    hideTooltip();
                    cancelAnim();
                    scrubTo(event.x);
                }));

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
        // Restore the previous zoom/center when the time domain is unchanged —
        // i.e. this run is a resize (or a filter flip that kept the same
        // extremes) — so a rebuild never resets navigation. centerFrac is a
        // domain fraction, so it's independent of the box the view was saved at.
        const savedView = viewRef.current;
        if (savedView && savedView.domainMin === domainMin && savedView.domainMax === domainMax) {
            currentScale = Math.max(minScale, Math.min(maxScale, savedView.scale));
            currentTranslateX = Math.max(-width * (currentScale - 1),
                Math.min(0, width / 2 - width * currentScale * savedView.centerFrac));
        }
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
                `<span class="tt-item-year"> · ${formatYearRange(m)}</span></div>`).join('');
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
        // animId/animRunning cover both flights (animateTo) and momentum
        // glides (startGlide below): one animation at a time, and a pointer
        // landing mid-animation "catches" the view (see pointerdown).
        let animId = null;
        let animRunning = false;
        const cancelAnim = () => {
            cancelAnimationFrame(animId);
            animRunning = false;
        };
        const animateTo = (targetS, targetCenterFrac) => {
            cancelAnim();
            animRunning = true;
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
                else animRunning = false;
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

        // Era preset flights: fit the era to ~94% of the viewport. Exposed to
        // the React button row via navRef.
        const zoomToEra = (key) => {
            hideTooltip();
            if (key === 'all') {
                animateTo(1, 0.5);
                return;
            }
            const era = eraScale.eras.find(e => e.key === key);
            if (!era) return; // era outside the filtered domain
            const f0 = fracScale(era.y0);
            const f1 = fracScale(era.y1);
            const span = Math.max(f1 - f0, 1e-12);
            animateTo(Math.min(maxScale, Math.max(1, 0.94 / span)), (f0 + f1) / 2);
        };
        navRef.current = { zoomToEra };

        const render = () => {
            // Snapshot the view for the next effect run (resize restore above).
            viewRef.current = {
                domainMin, domainMax, scale: currentScale,
                centerFrac: (width / 2 - currentTranslateX) / (width * currentScale),
            };

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

            // Orientation: visible-range readout + scrubber viewport window.
            const v0 = scale.invert(0);
            const v1 = scale.invert(width);
            rangeReadout.text(`${formatYearCompact(v0)}  –  ${formatYearCompact(v1)}`);
            const mw0 = eraScale.frac(v0) * miniW;
            const mw1 = eraScale.frac(v1) * miniW;
            miniWindow
                .attr('x', Math.min(mw0, miniW - 3))
                .attr('width', Math.max(3, mw1 - mw0));

            const geoById = new Map(filteredEvents.map(e => [e.id, markGeometry(e, scale, width)]));
            const barIds = new Set(filteredEvents
                .filter(e => { const geo = geoById.get(e.id); return geo.isBar && geo.visible; })
                .map(e => e.id));

            dotNodes.attr('transform', d => `translate(${geoById.get(d.id).x},${centerY})`);
            hitSel.attr('cx', d => geoById.get(d.id).x);

            // Span bars: rounded rects for spans wide enough to read as ranges
            // (narrow ones stay point dots). Each bar sits in its mini-lane —
            // on the spine, or nudged below/above when it time-overlaps another
            // span. Coordinates are clamped to the viewport neighborhood — at
            // deep zoom a bar's true endpoints can be millions of px away.
            const clampX = x => Math.max(-margin.left - 10, Math.min(width + margin.right + 10, x));
            const bars = filteredEvents.filter(e => barIds.has(e.id));
            const barSel = spansGroup.selectAll('rect.span-bar').data(bars, d => d.id);
            barSel.exit().remove();
            barSel.enter().append('rect')
                .attr('class', 'span-bar')
                .attr('rx', 3)
                .attr('height', 6)
                .attr('y', d => spanBarY(d.id) - 3)
                .attr('fill', d => getCategoryColor(d.category))
                .attr('fill-opacity', 0.55)
                .merge(barSel)
                .attr('x', d => clampX(geoById.get(d.id).x0))
                .attr('width', d => clampX(geoById.get(d.id).x1) - clampX(geoById.get(d.id).x0));
            // A bar-mode span is hit-targeted by a rect along the bar, not by
            // its (anchor-positioned) hit circle. Height 10 (bar + 2px each
            // side): fat enough to hit, thin enough that stacked bars in
            // adjacent mini-lanes keep mostly-exclusive hover bands.
            const barHitSel = barHitsGroup.selectAll('rect.span-hit').data(bars, d => d.id);
            barHitSel.exit().remove();
            const barHitEnter = barHitSel.enter().append('rect')
                .attr('class', 'span-hit')
                .attr('height', 10)
                .attr('y', d => spanBarY(d.id) - 5)
                .attr('fill', 'transparent')
                .style('cursor', 'pointer')
                .on('click', onClickMark)
                .on('mouseenter', onEnterMark)
                .on('mousemove', onMoveMark)
                .on('mouseleave', onLeaveMark);
            barHitEnter.append('title').text(d => `${d.title} — ${formatYearRange(d)}`);
            barHitEnter.merge(barHitSel)
                .attr('x', d => clampX(geoById.get(d.id).x0))
                .attr('width', d => clampX(geoById.get(d.id).x1) - clampX(geoById.get(d.id).x0));

            const { placed, occupancy } = placeLabels(scale);
            placedNow = new Set(placed.map(p => p.event.id));

            // Cluster the unlabeled residue — visible bars are big marks in
            // their own right and never hide inside a chip; degenerate (point-
            // sized) spans cluster like any other dot. Members' dots and hit
            // circles are hidden — the chip represents them.
            const unlabeled = filteredEvents
                .filter(e => !placedNow.has(e.id) && !barIds.has(e.id))
                .map(e => ({ e, x: geoById.get(e.id).x }))
                .filter(p => p.x >= -20 && p.x <= width + 20)
                .sort((a, b) => (a.x - b.x) || (a.e.id - b.e.id));
            const { chips, clusteredIds } = clusterize(unlabeled);

            // Dot membership styling — transition only dots whose labeled state
            // actually changed; transitioning every wheel tick looks flickery.
            // The halo tracks the dot's radius through the same transitions.
            dotNodes.each(function (d) {
                const node = d3.select(this);
                node.style('display', (clusteredIds.has(d.id) || barIds.has(d.id)) ? 'none' : null);
                const labeled = placedNow.has(d.id);
                const target = labeled
                    ? { r: 4.5, fillOp: 1, strokeOp: 0.35 }
                    : { r: 3, fillOp: 0.55, strokeOp: 0 };
                const animate = labeled !== prevLabeledIds.has(d.id);
                const dot = node.select('circle.event-dot');
                const halo = node.select('circle.dot-halo');
                (animate ? dot.transition('mem').duration(150) : dot)
                    .attr('r', target.r)
                    .attr('fill-opacity', target.fillOp)
                    .attr('stroke-opacity', target.strokeOp);
                (animate ? halo.transition('mem').duration(150) : halo)
                    .attr('r', target.r + HALO_PAD);
            });
            prevLabeledIds = placedNow;
            hitSel.style('display', d => (clusteredIds.has(d.id) || barIds.has(d.id)) ? 'none' : null);

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
                .attr('x1', d => d.x)
                // A bar-mode span's leader starts at the bar's mini-lane, not
                // the spine (degenerate spans and points sit on the spine).
                .attr('y1', d => (barIds.has(d.event.id) ? spanBarY(d.event.id) : centerY))
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

        // scroll over the chart = pan. CTRL + scroll = zoom — handled at the
        // window level so it works no matter where the pointer hovers (and so
        // the browser's own page-zoom never kicks in). The zoom anchors at the
        // pointer's x relative to the chart, clamped into it, so zooming over
        // the scrubber or the era buttons still zooms toward where you point.
        const applyZoom = (deltaY, anchorX) => {
            const zoomDelta = deltaY > 0 ? 1 / 1.15 : 1.15;
            const newScale = Math.max(minScale, Math.min(maxScale, currentScale * zoomDelta));
            if (newScale === currentScale) return;
            const scaleFactor = newScale / currentScale;
            currentTranslateX = anchorX - (anchorX - currentTranslateX) * scaleFactor;
            currentTranslateX = Math.max(-width * (newScale - 1), Math.min(0, currentTranslateX));
            currentScale = newScale;
            render();
        };
        svg.on('wheel', function (event) {
            event.preventDefault();
            if (event.ctrlKey) return; // zoom is owned by the window listener
            hideTooltip(); // never let the tooltip trail during pan/zoom
            cancelAnim(); // wheel input overrides any flight or glide
            const panDelta = event.deltaY > 0 ? 50 : -50;
            const maxPan = -width * (currentScale - 1);
            currentTranslateX = Math.max(maxPan, Math.min(0, currentTranslateX + panDelta));
            render();
        });
        const onWindowWheel = (event) => {
            if (!event.ctrlKey) return;
            // Must be registered with passive: false for this to stick.
            event.preventDefault();
            hideTooltip();
            cancelAnim();
            const rect = svgEl.getBoundingClientRect();
            const anchorX = Math.max(0, Math.min(width, event.clientX - rect.left - margin.left));
            applyZoom(event.deltaY, anchorX);
        };
        window.addEventListener('wheel', onWindowWheel, { passive: false });

        // --- Touch & drag gestures (Q9 / D11). The wheel handlers above stay
        // the scroll-device path; these add: one pointer dragged past a small
        // slop = pan (mouse included — drag-panning now works on desktop too),
        // and two touch pointers = pinch zoom that keeps the domain point under
        // the start midpoint pinned under the moving midpoint, so pinch-zoom
        // and two-finger pan are one continuous motion. touch-action: pan-y on
        // the svg (App.css) hands horizontal gestures to us while vertical
        // swipes still scroll the page; when the browser claims a gesture for
        // scrolling it sends pointercancel and we stand down.
        const activePointers = new Map(); // pointerId -> { x, y, lastX }
        let panning = false;
        let downX = 0;             // pointerdown x, for the pan slop test
        let pinch = null;          // gesture-start snapshot while two pointers are down
        let suppressClick = false; // swallow the synthetic click after a pan/pinch
        const PAN_SLOP = 6;

        // Momentum: a pan released above FLICK_MIN px/s keeps gliding under
        // exponential friction, like native scrolling. Velocity comes from the
        // last VEL_WINDOW ms of pointer samples, so drag–hold–release reads as
        // a stop (v≈0) while a flick reads as fast. The glide stops dead at
        // the domain edges; any other input cancels it via cancelAnim().
        const FLICK_MIN = 200;      // px/s — slower releases don't glide
        const GLIDE_STOP = 40;     // px/s — the glide ends below this
        const GLIDE_TAU = 0.28;    // s — friction time constant (iOS-ish feel)
        const VEL_WINDOW = 75;    // ms of samples that define release velocity
        const velSamples = [];     // { t, x } ring of recent pan positions

        const releaseVelocity = (event) => {
            velSamples.push({ t: event.timeStamp, x: event.clientX });
            const recent = velSamples.filter(s => s.t >= event.timeStamp - VEL_WINDOW);
            const dtMs = recent.length < 2 ? 0 : recent[recent.length - 1].t - recent[0].t;
            if (dtMs < 10) return 0; // too little history to call it a flick
            return (recent[recent.length - 1].x - recent[0].x) / dtMs * 1000;
        };

        const startGlide = (v0) => {
            let v = Math.max(-5000, Math.min(5000, v0));
            if (Math.abs(v) < FLICK_MIN) return;
            let last = performance.now();
            animRunning = true;
            const tick = (now) => {
                const dt = Math.min(64, now - last) / 1000; // clamp rAF hiccups
                last = now;
                const target = currentTranslateX + v * dt;
                currentTranslateX = Math.max(-width * (currentScale - 1),
                    Math.min(0, target));
                const hitEdge = currentTranslateX !== target;
                v *= Math.exp(-dt / GLIDE_TAU);
                render();
                if (hitEdge || Math.abs(v) < GLIDE_STOP) {
                    animRunning = false;
                    return;
                }
                animId = requestAnimationFrame(tick);
            };
            animId = requestAnimationFrame(tick);
        };

        const beginPinch = () => {
            const [a, b] = [...activePointers.values()];
            const rect = svgEl.getBoundingClientRect();
            panning = false;
            pinch = {
                // Floor the distance so a near-touching start can't explode the ratio.
                dist: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)),
                midX: (a.x + b.x) / 2 - rect.left - margin.left,
                scale: currentScale,
                translateX: currentTranslateX,
            };
            suppressClick = true; // releasing a pinch must never read as a tap
            hideTooltip();
            cancelAnim();
        };

        svg.on('pointerdown.gesture', (event) => {
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            // A pointer landing mid-glide (or mid-flight) is a "catch": it
            // stops the motion, and its click is swallowed — you grabbed the
            // timeline, not the event that happened to pass under your finger.
            // Otherwise: fresh gesture, fresh chance to be a tap.
            suppressClick = animRunning;
            cancelAnim();
            if (activePointers.size >= 2) return; // ignore 3rd+ fingers
            activePointers.set(event.pointerId,
                { x: event.clientX, y: event.clientY, lastX: event.clientX });
            if (activePointers.size === 1) {
                panning = false;
                downX = event.clientX;
            } else {
                beginPinch();
            }
        });

        svg.on('pointermove.gesture', (event) => {
            const p = activePointers.get(event.pointerId);
            if (!p) return;
            p.x = event.clientX;
            p.y = event.clientY;
            if (pinch && activePointers.size === 2) {
                const [a, b] = [...activePointers.values()];
                const rect = svgEl.getBoundingClientRect();
                const dist = Math.max(20, Math.hypot(a.x - b.x, a.y - b.y));
                const mid = (a.x + b.x) / 2 - rect.left - margin.left;
                const newScale = Math.max(minScale,
                    Math.min(maxScale, pinch.scale * (dist / pinch.dist)));
                // Domain fraction that sat under the midpoint at pinch start:
                // keeping it under the current midpoint gives zoom + pan in one.
                const f = (pinch.midX - pinch.translateX) / (width * pinch.scale);
                currentTranslateX = Math.max(-width * (newScale - 1),
                    Math.min(0, mid - width * newScale * f));
                currentScale = newScale;
                render();
            } else if (activePointers.size === 1) {
                if (!panning) {
                    if (Math.abs(event.clientX - downX) < PAN_SLOP) return;
                    panning = true;
                    suppressClick = true;
                    hideTooltip();
                    cancelAnim();
                    velSamples.length = 0;
                    // Capture so a pan that leaves the svg keeps feeding us —
                    // touch captures implicitly on pointerdown; mouse does not.
                    // NOT captured at pointerdown: capture retargets the
                    // synthetic click to the svg, which would break tap-to-open
                    // on dots/labels/chips.
                    try { svgEl.setPointerCapture(event.pointerId); } catch { /* already released */ }
                    svgEl.style.cursor = 'grabbing';
                    p.lastX = event.clientX; // slop distance is discarded — no hop
                }
                velSamples.push({ t: event.timeStamp, x: event.clientX });
                if (velSamples.length > 12) velSamples.shift();
                const dx = event.clientX - p.lastX;
                p.lastX = event.clientX;
                currentTranslateX = Math.max(-width * (currentScale - 1),
                    Math.min(0, currentTranslateX + dx));
                render();
            }
        });

        const endPointer = (event) => {
            if (!activePointers.delete(event.pointerId)) return;
            if (pinch && activePointers.size < 2) {
                pinch = null;
                // The remaining finger starts over as a fresh pan candidate.
                const rest = activePointers.values().next().value;
                if (rest) { downX = rest.x; rest.lastX = rest.x; }
            }
            if (activePointers.size === 0) {
                // Only a true release flicks — a pointercancel means the
                // browser took the gesture (e.g. for vertical page scroll).
                if (panning && event.type === 'pointerup') {
                    startGlide(releaseVelocity(event));
                }
                panning = false;
                svgEl.style.cursor = '';
            }
        };
        svg.on('pointerup.gesture pointercancel.gesture', endPointer);
        // An un-captured mouse leaving the svg before the slop is crossed would
        // otherwise leave a stale entry (its pointerup lands elsewhere) that a
        // later touch could pair into a phantom pinch.
        svg.on('pointerleave.gesture', (event) => {
            if (!svgEl.hasPointerCapture(event.pointerId)) endPointer(event);
        });
        // Swallow the click that follows a pan/pinch — capture phase, so it
        // dies before any dot/label/chip handler sees it. (Touch usually
        // withholds the click itself past ~10px of movement; mouse never does.)
        svg.on('click.gesture', (event) => {
            if (!suppressClick) return;
            suppressClick = false;
            event.stopPropagation();
        }, true);

        return () => {
            // The SVG is rebuilt on re-run, but the tooltip div persists — hide
            // it so it can't survive a filter change orphaned at full opacity.
            // The window wheel listener MUST be removed or effect re-runs
            // (filter changes) would stack zoom handlers.
            window.removeEventListener('wheel', onWindowWheel);
            clearTimeout(ttTimer);
            cancelAnim();
            tooltipEl.style.opacity = 0;
            navRef.current = null;
        };
    }, [events, selectedCategory, viewSize]);

    return (
        <div className="timeline-wrapper" ref={wrapperRef}>
            <div className="era-presets" role="toolbar" aria-label="Zoom to era">
                <button onClick={() => navRef.current?.zoomToEra('all')}>All Time</button>
                {ERA_DEFS.map(era => (
                    <button key={era.key} onClick={() => navRef.current?.zoomToEra(era.key)}>
                        {era.label}
                    </button>
                ))}
            </div>
            <svg
                ref={svgRef}
                className="d3-timeline"
                aria-label="Interactive timeline"
            />
            <svg
                ref={miniRef}
                className="timeline-minimap"
                aria-label="Timeline overview scrubber"
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
                                        <span className="cluster-item-year">{formatYearRange(ev)}</span>
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
                        <p className="event-year">{formatYearRange(selectedEvent)}</p>
                        <p className="event-description">{selectedEvent.description}</p>
                        <span className={`event-category category-${selectedEvent.category}`}>
                            {selectedEvent.category}
                        </span>
                        {linkIndex.has(selectedEvent.id) && (
                            <div className="related-events">
                                <h3>Connected events</h3>
                                <ul className="related-list">
                                    {linkIndex.get(selectedEvent.id).map(rel => (
                                        <li key={`${rel.event.id}:${rel.type}:${rel.dir}`}>
                                            <button
                                                className="related-item"
                                                onClick={() => setSelectedEvent(rel.event)}
                                                title={rel.note || undefined}
                                            >
                                                <span className="relation-type">{relationLabel(rel)}</span>
                                                <span
                                                    className="cluster-item-dot"
                                                    style={{ backgroundColor: getCategoryColor(rel.event.category) }}
                                                />
                                                <span className="cluster-item-title">{rel.event.title}</span>
                                                <span className="cluster-item-year">{formatYearRange(rel.event)}</span>
                                            </button>
                                            {rel.note && <p className="relation-note">{rel.note}</p>}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
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
    // Tick budget follows the pixel width (~80px per compact-format label),
    // so narrow (mobile) charts thin further instead of colliding labels.
    const budget = Math.max(4, Math.min(14, Math.floor((x1 - x0) / 80)));
    const span = v1 - v0;
    const absMax = Math.max(Math.abs(v0), Math.abs(v1));
    if (span < absMax * 0.5) return d3.ticks(v0, v1, Math.min(8, budget));

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
    if (ticks.length < 5) return d3.ticks(v0, v1, Math.min(8, budget));
    // Thin: full decades only, then every other decade, then an even pick
    // to force the budget (narrow screens can still exceed it on decades).
    if (ticks.length > budget) {
        ticks = ticks.filter(t => t === 0 ||
            Math.abs(t) === 10 ** Math.round(Math.log10(Math.abs(t))));
    }
    if (ticks.length > budget) {
        ticks = ticks.filter(t => t === 0 ||
            Math.round(Math.log10(Math.abs(t))) % 2 === 0);
    }
    ticks.sort((a, b) => a - b);
    if (ticks.length > budget) {
        const step = Math.ceil(ticks.length / budget);
        ticks = ticks.filter((_, i) => i % step === 0);
    }
    return ticks;
}

// Off-DOM text width measurement so the packer knows each label's footprint
// without laying it out in the document.
function makeTextMeasurer(font) {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = font;
    return text => ctx.measureText(text).width;
}

// Human-readable phrasing for a link relation. Links are stored
// directionally; the mirrored ('in') view gets the inverse phrasing, so
// "A causes B" reads "led to B" on A and "caused by A" on B.
const RELATION_LABELS = {
    related: { out: 'related', in: 'related' },
    causes: { out: 'led to', in: 'caused by' },
    precedes: { out: 'followed by', in: 'preceded by' },
    partOf: { out: 'part of', in: 'includes' },
    contrasts: { out: 'contrasts', in: 'contrasts' },
};
function relationLabel(rel) {
    return RELATION_LABELS[rel.type]?.[rel.dir] ?? rel.type;
}

// Format a signed year as a human-readable label (negative years are BCE).
function formatYear(year) {
    const y = Math.round(year);
    return y < 0
        ? `${Math.abs(y).toLocaleString()} BCE`
        : y.toLocaleString();
}

// Format an event's time: a single year for point events, a range for spans.
function formatYearRange(e) {
    return e.endYear != null
        ? `${formatYear(e.year)} – ${formatYear(e.endYear)}`
        : formatYear(e.year);
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
