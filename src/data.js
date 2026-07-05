import eventsData from '../data/events.json';

/**
 * Loads timeline events, sorted chronologically (ascending by year).
 *
 * The dataset is imported directly so it is bundled at build time. This keeps
 * dev and production behaviour identical and avoids relying on a runtime fetch
 * path (only files under `public/` are served by a Vite production build).
 *
 * @returns {Promise<Array<{id:number, year:number, title:string, category:string, description:string}>>}
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
