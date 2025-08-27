import React, { useEffect, useState } from 'react';
import { fetchEvents } from '../utils/fetchEvents';


/**
 * Minimal interactive timeline:
 * - loads events from /events.json
 * - sorted list
 * - click on entry to toggle description
 */
export default function Timeline() {
    const [events, setEvents] = useState([]);
    const [error, setError] = useState(null);
    const [selectedId, setSelectedId] = useState(null);

    useEffect(() => {
        fetchEvents().then(setEvents).catch(err => setError(err.message));
    }, []);

    // if (error) return <div role="alert">Fehler beim Laden: {error}</div>;
    if (error) return <div role="alert">Loading Error.{error}</div>;
    if (!events.length) return <p>No Events found.</p>;

    return (
        <div className="timeline">
            {events.map(ev => {
                const open = selectedId === ev.id;
                return (
                    <button
                        key={ev.id}
                        className={`timeline-item ${open ? 'open' : ''}`}
                        onClick={() => setSelectedId(open ? null : ev.id)}
                        aria-expanded={open}
                        title="Click to toggle description"
                    >
                        <span className="dot" />
                        <div className="meta">
                            <time className="date">{ev.date}</time>
                            <h3 className="title">{ev.title}</h3>
                            {open && ev.description && <p className="desc">{ev.description}</p>}
                        </div>
                    </button>
                );
            })}
        </div>
    );
}
