import eventsData from '../data/events.json';

/**
 * Loads timeline events, sorted chronologically (ascending by year).
 *
 * The dataset is imported directly so it is bundled at build time. This keeps
 * dev and production behaviour identical and avoids relying on a runtime fetch
 * path (only files under `public/` are served by a Vite production build).
 *
 * See DESIGN.md for the full event schema (schemaVersion 2). Required fields:
 * id, year, title, category, description. Optional: endYear (span end),
 * subcategory, tags[], precision, links[], sources[].
 *
 * @returns {Promise<Array<object>>} events sorted ascending by `year`
 */
export async function loadEvents() {
    return [...eventsData.events].sort((a, b) => a.year - b.year);
}

/**
 * Builds a per-event index of link relations, mirrored so a link stored on
 * either endpoint is visible from both (links are stored directionally in
 * the data — DESIGN.md §4). `dir` records which end the caller is on: 'out'
 * for the stored direction, 'in' for the mirrored view — the UI phrases the
 * relation accordingly ("led to" vs "caused by"). Unknown targets and
 * self-links are skipped here; verify:layout fails on them, so they can't
 * ship silently.
 *
 * @returns {Map<number, Array<{event: object, type: string, dir: string, note?: string}>>}
 */
export function buildLinkIndex(events) {
    const byId = new Map(events.map(e => [e.id, e]));
    const index = new Map();
    const push = (id, entry) => {
        if (!index.has(id)) index.set(id, []);
        index.get(id).push(entry);
    };
    for (const e of events) {
        for (const link of e.links ?? []) {
            const target = byId.get(link.to);
            if (!target || link.to === e.id) continue;
            push(e.id, { event: target, type: link.type, dir: 'out', note: link.note });
            push(link.to, { event: e, type: link.type, dir: 'in', note: link.note });
        }
    }
    for (const list of index.values()) list.sort((a, b) => a.event.year - b.event.year);
    return index;
}

export function getCategories(events) {
    return [...new Set(events.map(e => e.category))];
}

/**
 * Applies the combined filter set to the event list. All active criteria AND
 * together: `category` (the button row), `terms` (pinned tag/subcategory
 * chips, each `{ kind: 'tag'|'subcategory', value }`), and `query` (free
 * text, case-insensitive substring over title, description, subcategory,
 * and tags).
 */
export function filterEvents(events, { category = null, terms = [], query = '' } = {}) {
    const q = query.trim().toLowerCase();
    return events.filter(e => {
        if (category && e.category !== category) return false;
        for (const term of terms) {
            if (term.kind === 'tag' && !(e.tags ?? []).includes(term.value)) return false;
            if (term.kind === 'subcategory' && e.subcategory !== term.value) return false;
        }
        if (q) {
            const hay = [e.title, e.description, e.subcategory ?? '', ...(e.tags ?? [])]
                .join('\n').toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });
}

// Facet counts (tag / subcategory → number of carrying events) are a pure
// function of the event array, but the dropdown asks for suggestions on
// every keystroke. Cached per array INSTANCE: the caller (App) memoizes its
// context array, so identity is a valid cache key, and the WeakMap lets
// replaced arrays be collected.
const facetCountsCache = new WeakMap();
function facetCounts(events) {
    let counts = facetCountsCache.get(events);
    if (!counts) {
        const tagCounts = new Map();
        const subCounts = new Map();
        for (const e of events) {
            for (const t of e.tags ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
            if (e.subcategory) subCounts.set(e.subcategory, (subCounts.get(e.subcategory) ?? 0) + 1);
        }
        counts = { tagCounts, subCounts };
        facetCountsCache.set(events, counts);
    }
    return counts;
}

/**
 * Suggestion lists for the search dropdown: tags and subcategories matching
 * the query (all of them, count-ranked, when the query is empty — the
 * focused-empty-input "browse" view), plus events whose title matches (none
 * when the query is empty). Counts are computed over the events passed in,
 * so pass the set already narrowed by the OTHER active filters (category,
 * pinned chips): each count is then exactly what pinning that suggestion
 * would leave visible.
 */
export function getSuggestions(events, query,
    { maxTags = 8, maxSubcategories = 6, maxEvents = 6 } = {}) {
    const q = query.trim().toLowerCase();
    const { tagCounts, subCounts } = facetCounts(events);
    // Prefix matches outrank substring matches; then higher counts, then A–Z.
    const startsWith = s => (s.toLowerCase().startsWith(q) ? 0 : 1);
    const pick = (counts, max) => [...counts.entries()]
        .filter(([v]) => !q || v.toLowerCase().includes(q))
        .sort(([a, ca], [b, cb]) =>
            (q ? startsWith(a) - startsWith(b) : 0) || (cb - ca) || a.localeCompare(b))
        .slice(0, max)
        .map(([value, count]) => ({ value, count }));
    return {
        tags: pick(tagCounts, maxTags),
        subcategories: pick(subCounts, maxSubcategories),
        events: q
            ? events.filter(e => e.title.toLowerCase().includes(q))
                .sort((a, b) =>
                    (startsWith(a.title) - startsWith(b.title)) || (a.year - b.year))
                .slice(0, maxEvents)
            : [],
    };
}
