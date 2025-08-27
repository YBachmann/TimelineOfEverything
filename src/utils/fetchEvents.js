/**
 * Loads timeline events from /events.json sorts them ascending by date.
 * @returns {Promise<Array<{id:number|string,title:string,date:string,description?:string}>>}
 * @throws {Error} if loading or parsing fails
 */
export async function fetchEvents() {
    const res = await fetch('/events.json', { headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) throw new Error(`Failed to load events.json: ${res.status} ${res.statusText}`);
    const json = await res.json();
    const events = Array.isArray(json) ? json : [];
    return events
        .map(e => ({ ...e, date: String(e.date) }))
        .sort((a, b) => new Date(a.date) - new Date(b.date));
}
