// Shared event-display helpers: year formatting and the category palette.
// Used by the Timeline scene (dots, bars, tooltips, modals) and by App's
// search dropdown — a separate module because component files must only
// export components for Fast Refresh to work.

// Format a signed year as a human-readable label (negative years are BCE).
export function formatYear(year) {
    const y = Math.round(year);
    return y < 0
        ? `${Math.abs(y).toLocaleString()} BCE`
        : y.toLocaleString();
}

// Format an event's time: a single year for point events, a range for spans.
export function formatYearRange(e) {
    return e.endYear != null
        ? `${formatYear(e.year)} – ${formatYear(e.endYear)}`
        : formatYear(e.year);
}

export function getCategoryColor(category) {
    const colors = {
        natural: '#ff6b6b',
        history: '#4ecdc4',
        science: '#45b7d1',
        technology: '#f9ca24',
        future: '#a29bfe'
    };
    return colors[category] || '#666';
}
