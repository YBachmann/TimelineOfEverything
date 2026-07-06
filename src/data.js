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

export function getEventsByCategory(events, category) {
    return events.filter(event => event.category === category);
}

export function getCategories(events) {
    return [...new Set(events.map(e => e.category))];
}
