import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

/**
 * D3-based interactive timeline:
 * - Logarithmic scaling for massive year ranges
 * - Horizontal zoom only (text/stroke stay fixed)
 * - Pan with mouse wheel, zoom with CTRL + mouse wheel
 * - Efficient SVG rendering
 * - Click events to show details in modal
 */
export default function Timeline({ events, selectedCategory }) {
    const svgRef = useRef(null);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const zoomStateRef = useRef({ scale: 1, translateX: 0 });

    useEffect(() => {
        if (!events.length || !svgRef.current) return;

        // Filter events by category
        const filteredEvents = selectedCategory
            ? events.filter(e => e.category === selectedCategory)
            : events;

        if (!filteredEvents.length) return;

        // Container dimensions
        const margin = { top: 40, right: 20, bottom: 40, left: 20 };
        const width = svgRef.current.clientWidth - margin.left - margin.right;
        const height = svgRef.current.clientHeight - margin.top - margin.bottom;

        // Clear previous content
        d3.select(svgRef.current).selectAll("*").remove();

        // Create SVG
        const svg = d3.select(svgRef.current)
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom);

        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        // Symmetric-log scale: compresses the vast ancient timespans while
        // preserving detail in recent history, and — unlike a plain log scale —
        // handles negative years (BCE) and the year-zero boundary natively, so
        // no positive-shifting hack is needed.
        const yearValues = filteredEvents.map(d => d.year);
        const minYear = Math.min(...yearValues);
        const maxYear = Math.max(...yearValues, new Date().getFullYear());

        // Add padding: 2% of the total span on each side
        const range = maxYear - minYear;
        const padding = range * 0.02;
        const domainMin = minYear - padding;
        const domainMax = maxYear + padding;

        const xScale = d3.scaleSymlog()
            .domain([domainMin, domainMax])
            .range([0, width]);

        // Calculate initial scale to fit all events
        const initialScale = 1;
        let currentScale = initialScale;
        let currentTranslateX = 0;

        // Create a group for zoomable content (only events, not axis/labels)
        const zoomableGroup = g.append('g').attr('class', 'zoomable-content');

        // Static axis and labels group
        const axisGroup = g.append('g').attr('class', 'axis-group');

        // Create axis in static group
        const xAxis = d3.axisBottom(xScale)
            .tickFormat(formatYear);

        axisGroup.append('g')
            .attr('class', 'x-axis')
            .attr('transform', `translate(0,${height})`)
            .call(xAxis)
            .append('text')
            .attr('x', width / 2)
            .attr('y', 35)
            .attr('fill', 'currentColor')
            .style('text-anchor', 'middle')
            .text('Time');

        // Create event dots and connector lines in zoomable group
        const eventGroup = zoomableGroup.selectAll('.event')
            .data(filteredEvents, d => d.id)
            .enter()
            .append('g')
            .attr('class', 'event')
            .attr('transform', d => `translate(${xScale(d.year)},0)`);

        // Connector lines
        eventGroup.append('line')
            .attr('x1', 0)
            .attr('y1', 0)
            .attr('x2', 0)
            .attr('y2', (d, i) => (i % 2 === 0 ? -30 : height + 30))
            .attr('stroke', d => getCategoryColor(d.category))
            .attr('stroke-width', 1)
            .attr('opacity', 0.3)
            .style('pointer-events', 'none');

        // Event dots
        eventGroup.append('circle')
            .attr('class', 'event-dot')
            .attr('cx', 0)
            .attr('cy', (d, i) => (i % 2 === 0 ? -30 : height + 30))
            .attr('r', 5)
            .attr('fill', d => getCategoryColor(d.category))
            .attr('stroke', '#fff')
            .attr('stroke-width', 2)
            .style('cursor', 'pointer')
            .on('click', function (event, d) {
                event.stopPropagation();
                setSelectedEvent(d);
            })
            .on('mouseenter', function () {
                d3.select(this).transition().attr('r', 7);
            })
            .on('mouseleave', function () {
                d3.select(this).transition().attr('r', 5);
            });

        // Event labels (not affected by zoom)
        eventGroup.append('text')
            .attr('x', 0)
            .attr('y', (d, i) => (i % 2 === 0 ? -45 : height + 45))
            .attr('text-anchor', 'middle')
            .attr('class', 'event-label')
            .style('font-size', '12px')
            .style('fill', 'currentColor')
            .style('cursor', 'pointer')
            .style('pointer-events', 'auto')
            .text(d => d.title)
            .on('click', function (event, d) {
                event.stopPropagation();
                setSelectedEvent(d);
            });

        // Custom zoom/pan behavior
        let minScale = 1;
        let maxScale = 50;

        const updateZoom = () => {
            // Create a zoomed x-scale based on current scale and translation
            const zoomedXScale = d3.scaleSymlog()
                .domain([domainMin, domainMax])
                .range([currentTranslateX, currentTranslateX + width * currentScale]);

            // Update event positions based on zoomed scale
            zoomableGroup.selectAll('.event')
                .attr('transform', d => `translate(${zoomedXScale(d.year)},0)`);

            // Update axis ticks based on zoom
            const axisXScale = d3.scaleSymlog()
                .domain([domainMin, domainMax])
                .range([0, width * currentScale]);

            const zoomedAxis = d3.axisBottom(axisXScale)
                .tickFormat(formatYear);

            axisGroup.select('.x-axis')
                .attr('transform', `translate(${currentTranslateX},${height})`)
                .call(zoomedAxis);
        };

        // Wheel event handling
        svg.on('wheel', function (event) {
            event.preventDefault();

            if (event.ctrlKey) {
                // CTRL + scroll = zoom
                const zoomDelta = event.deltaY > 0 ? 0.9 : 1.1;
                const newScale = Math.max(minScale, Math.min(maxScale, currentScale * zoomDelta));

                // Only update if scale actually changed
                if (newScale !== currentScale) {
                    // Zoom towards cursor position
                    const mouseX = event.offsetX - margin.left;
                    const scaleFactor = newScale / currentScale;
                    currentTranslateX = mouseX - (mouseX - currentTranslateX) * scaleFactor;

                    // Constrain translation to keep timeline in bounds
                    currentTranslateX = Math.max(-width * (newScale - 1), Math.min(0, currentTranslateX));
                    currentScale = newScale;
                }
            } else {
                // Normal scroll = pan left/right
                const panDelta = event.deltaY > 0 ? 50 : -50;
                const maxPan = -width * (currentScale - 1);
                currentTranslateX = Math.max(maxPan, Math.min(0, currentTranslateX + panDelta));
            }

            updateZoom();
        });

        // Store zoom state
        zoomStateRef.current = { scale: currentScale, translateX: currentTranslateX };

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
