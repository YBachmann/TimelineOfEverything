export async function loadEvents() {
    try {
        const response = await fetch('/data/events.json');
        const data = await response.json();
        return data.events.sort((a, b) => a.year - b.year);
    } catch (error) {
        console.error('Failed to load events:', error);
        return [];
    }
}

export function getEventsByCategory(events, category) {
    return events.filter(event => event.category === category);
}

export function getCategories(events) {
    return [...new Set(events.map(e => e.category))];
}
