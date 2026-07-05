import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

/**
 * D3-based interactive timeline.
 *
 * Layout: a horizontal, symmetric-log time axis with a central spine. Event dots
 * sit on the spine; labels are stacked in lanes above and below it.
 *
 * Label de-cluttering (see docs/design/label-decluttering.md): labels must never
 * overlap. On every zoom/pan we run a greedy lane packer over the visible events
 * in priority order — each label claims the nearest free lane whose horizontal box
 * doesn't collide with an already-placed label; events that find no free lane
 * render as a dot only. As you zoom in, positions spread out and more labels earn
 * a lane.
 *
 * Interaction: scroll = pan, CTRL + scroll = zoom, click a dot/label for details.
 */
export default function Timeline({ events, selectedCategory }) {
    const svgRef = useRef(null);
    const [selectedEvent, setSelectedEvent] = useState(null);

    useEffect(() => {
        if (!events.length || !svgRef.current) return;

        const filteredEvents = selectedCategory
            ? events.filter(e => e.category === selectedCategory)
            : events;
        if (!filteredEvents.length) return;

        const svgEl = svgRef.current;
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
        const yearValues = filteredEvents.map(d => d.year);
        const minYear = Math.min(...yearValues);
        const maxYear = Math.max(...yearValues, new Date().getFullYear());
        const range = maxYear - minYear;
        const padding = range * 0.02;
        const domainMin = minYear - padding;
        const domainMax = maxYear + padding;
        const baseScale = () => d3.scaleSymlog().domain([domainMin, domainMax]);

        // Placeholder importance ranking + measured label widths (both stable for
        // the lifetime of this render, so the packer stays deterministic).
        const priorityById = new Map(filteredEvents.map(e => [e.id, placeholderPriority(e)]));
        const fontFamily = getComputedStyle(svgEl).fontFamily || 'sans-serif';
        const measureText = makeTextMeasurer(`12px ${fontFamily}`);
        const labelWidthById = new Map(filteredEvents.map(e => [e.id, measureText(e.title)]));

        // Layers (drawn back-to-front): spine, dots, labels, axis.
        g.append('line').attr('class', 'timeline-spine')
            .attr('x1', 0).attr('y1', centerY).attr('x2', width).attr('y2', centerY);
        const dotsGroup = g.append('g').attr('class', 'dots');
        const labelsGroup = g.append('g').attr('class', 'labels');
        const axisGroup = g.append('g').attr('class', 'axis-group');
        const axisG = axisGroup.append('g')
            .attr('class', 'x-axis')
            .attr('transform', `translate(0,${height})`);
        axisGroup.append('text')
            .attr('x', width / 2).attr('y', height + 35)
            .attr('fill', 'currentColor')
            .style('text-anchor', 'middle')
            .text('Time');

        // Lane geometry. LANE_HEIGHT > label height guarantees vertical clearance
        // between lanes, so avoiding horizontal overlap within a lane is sufficient.
        const LANE_HEIGHT = 22;
        const LABEL_GAP = 8;      // horizontal padding added to each label box
        const DOT_R = 5;
        const LEADER_INNER = 9;   // stop the leader line just short of the text
        const lanesAbove = Math.max(1, Math.floor((centerY - 12) / LANE_HEIGHT));
        const lanesBelow = Math.max(1, Math.floor((height - centerY - 12) / LANE_HEIGHT));
        const maxLanes = Math.min(lanesAbove, lanesBelow);
        // Placement order: nearest lanes first, alternating above/below.
        const laneOrder = [];
        for (let i = 0; i < maxLanes; i++) {
            laneOrder.push({ side: -1, idx: i });
            laneOrder.push({ side: 1, idx: i });
        }

        // Dots: one per event, created once; only cx changes on zoom/pan.
        const dotSel = dotsGroup.selectAll('circle.event-dot')
            .data(filteredEvents, d => d.id)
            .enter().append('circle')
            .attr('class', 'event-dot')
            .attr('cy', centerY)
            .attr('r', DOT_R)
            .attr('fill', d => getCategoryColor(d.category))
            .attr('stroke', '#fff')
            .attr('stroke-width', 2)
            .style('cursor', 'pointer')
            .on('click', (event, d) => { event.stopPropagation(); setSelectedEvent(d); })
            .on('mouseenter', function () { d3.select(this).transition().attr('r', DOT_R + 2); })
            .on('mouseleave', function () { d3.select(this).transition().attr('r', DOT_R); });

        let currentScale = 1;
        let currentTranslateX = 0;

        const currentScaleFn = () =>
            baseScale().range([currentTranslateX, currentTranslateX + width * currentScale]);

        // Greedy lane packer: returns the events that earned a label, with their
        // resolved lane position. Everything else stays a dot.
        const placeLabels = (scale) => {
            const visible = filteredEvents
                .map(e => ({ e, x: scale(e.year) }))
                .filter(p => p.x >= 0 && p.x <= width);
            // Highest priority first; deterministic tie-breaks keep lanes stable.
            visible.sort((a, b) =>
                (priorityById.get(b.e.id) - priorityById.get(a.e.id)) ||
                (a.e.year - b.e.year) ||
                (a.e.id - b.e.id));

            const occupancy = new Map(); // laneKey -> [ [start,end], ... ]
            const placed = [];
            for (const { e, x } of visible) {
                const halfW = labelWidthById.get(e.id) / 2 + LABEL_GAP;
                const start = x - halfW;
                const end = x + halfW;
                for (const lane of laneOrder) {
                    const key = lane.side + ':' + lane.idx;
                    let occ = occupancy.get(key);
                    if (!occ) {
                        occ = [];
                        occupancy.set(key, occ);
                    }
                    if (occ.some(iv => start < iv[1] && end > iv[0])) continue;
                    occ.push([start, end]);
                    placed.push({
                        event: e,
                        x,
                        y: centerY + lane.side * (lane.idx + 1) * LANE_HEIGHT,
                        side: lane.side,
                    });
                    break;
                }
            }
            return placed;
        };

        const render = () => {
            const scale = currentScaleFn();

            dotSel.attr('cx', d => scale(d.year));
            axisG.call(d3.axisBottom(scale).tickFormat(formatYear));

            const placed = placeLabels(scale);
            const groups = labelsGroup.selectAll('g.event-label-group')
                .data(placed, d => d.event.id);
            groups.exit().remove();

            const enter = groups.enter().append('g')
                .attr('class', 'event-label-group')
                .style('opacity', 0);
            enter.append('line').attr('class', 'leader-line');
            enter.append('text')
                .attr('class', 'event-label')
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'middle')
                .on('click', (event, d) => { event.stopPropagation(); setSelectedEvent(d.event); });

            const merged = enter.merge(groups);
            merged.select('line.leader-line')
                .attr('x1', d => d.x).attr('y1', centerY)
                .attr('x2', d => d.x).attr('y2', d => d.y - d.side * LEADER_INNER)
                .attr('stroke', d => getCategoryColor(d.event.category));
            merged.select('text.event-label')
                .attr('x', d => d.x).attr('y', d => d.y)
                .text(d => d.event.title);

            enter.transition().duration(150).style('opacity', 1);
        };

        render();

        // scroll = pan, CTRL + scroll = zoom toward the cursor.
        const minScale = 1;
        const maxScale = 50;
        svg.on('wheel', function (event) {
            event.preventDefault();
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
    }, [events, selectedCategory]);

    return (
        <div className="timeline-wrapper">
            <svg
                ref={svgRef}
                className="d3-timeline"
                style={{ width: '100%', height: '600px' }}
                aria-label="Interactive timeline"
            />
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
                        <p className="event-year">{formatYear(selectedEvent.year)}</p>
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

// Deterministic placeholder importance ranking in [0, 1). The real ranking will
// later come from Wikipedia signals; see docs/design/label-decluttering.md §5.
// Determinism matters: it keeps lane assignment stable across re-renders.
function placeholderPriority(event) {
    let h = 2166136261;
    const s = String(event.id);
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967295;
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
