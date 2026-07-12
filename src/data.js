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

export function getEventsByCategory(events, category) {
    return events.filter(event => event.category === category);
}

export function getCategories(events) {
    return [...new Set(events.map(e => e.category))];
}
