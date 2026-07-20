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

// Precision (schema §4, Q6/D15): 'exact' (default/absent) needs no mark — the
// majority of events stay unmarked. The three fuzzy tiers each get a distinct
// symbol, prefixed once on the whole formatted string:
//   ~  approximate  — roughly known (historical convention, "circa")
//   ≈  estimated    — scientific estimate, typically a much wider error bar
//                      (deep-time/prehistoric events)
//   ?  speculative  — hypothetical/projected; may not occur as dated at all
const PRECISION_MARK = { approximate: '~', estimated: '≈', speculative: '?' };
const PRECISION_WORD = { approximate: 'approximate', estimated: 'estimated', speculative: 'speculative' };

// True for any non-default precision tier — the single place that answers
// "does this event's date need fuzzy treatment"; dots, bars, and the modal
// pill all key off this instead of each re-deriving it.
export function isFuzzy(e) {
    return e.precision != null && e.precision !== 'exact';
}

// Modal precision pill text ("~ approximate"), or null for exact/absent so
// callers can skip rendering the pill entirely.
export function precisionLabel(e) {
    return isFuzzy(e) ? `${PRECISION_MARK[e.precision]} ${PRECISION_WORD[e.precision]}` : null;
}

// Format an event's time: a single year for point events, a range for spans.
// A fuzzy event's mark prefixes the whole string once ("~1400 – 1600", not
// "~1400 – ~1600") — matches the historical-writing convention of one
// leading qualifier over a range.
export function formatYearRange(e) {
    const range = e.endYear != null
        ? `${formatYear(e.year)} – ${formatYear(e.endYear)}`
        : formatYear(e.year);
    const mark = PRECISION_MARK[e.precision];
    return mark ? `${mark} ${range}` : range;
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
