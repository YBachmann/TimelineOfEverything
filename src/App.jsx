import { useState, useEffect, useRef } from 'react';
import { loadEvents, getCategories } from './data';
import './App.css';

// Custom hook: map mouse wheel (and trackpad) to horizontal scroll
function useWheelToHorizontalScroll() {
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    const handleWheel = (event) => {
      // Allow browser zoom gestures (trackpad pinch shows up as ctrl+wheel on many systems)
      if (event.ctrlKey) return;

      const scrollContainer = scrollContainerRef.current;
      if (!scrollContainer) return;

      // We want the page to never scroll vertically.
      event.preventDefault();

      // Use whichever axis is dominant (helps trackpads that emit deltaX for horizontal gestures)
      const dominantDelta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;

      // Normalize deltaMode (0=pixel, 1=line, 2=page) to pixels
      let deltaPixels = dominantDelta;
      if (event.deltaMode === 1) deltaPixels *= 28;            // approx line-height
      else if (event.deltaMode === 2) deltaPixels *= window.innerHeight; // page

      scrollContainer.scrollLeft += deltaPixels;
    };

    // Capture at window so it works anywhere on the page, not only when hovering the timeline
    window.addEventListener("wheel", handleWheel, { passive: false, capture: true });

    return () => {
      window.removeEventListener("wheel", handleWheel, { capture: true });
    };
  }, []);

  return scrollContainerRef;
}



function App() {
  const [events, setEvents] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const timelineContainerRef = useWheelToHorizontalScroll();

  useEffect(() => {
    loadEvents().then(data => {
      setEvents(data);
      setLoading(false);
    });
  }, []);

  const categories = getCategories(events);
  const filteredEvents = selectedCategory
    ? events.filter(e => e.category === selectedCategory)
    : events;

  if (loading) return <div className="container">Loading...</div>;

  return (
    <div className="app">
      <h1>Timeline of Everything</h1>
      <div className="filters">
        <button
          onClick={() => setSelectedCategory(null)}
          className={selectedCategory === null ? 'active' : ''}
        >
          All
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={selectedCategory === cat ? 'active' : ''}
          >
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>
      <div
        className="timeline-container"
        ref={timelineContainerRef}
        tabIndex={0}
        aria-label="Timeline"
      >
        <div className="timeline-track">
          {filteredEvents.map((event, index) => (
            <div key={event.id} className="event-marker">
              <div className="marker-dot"></div>
              <div className="event-popup">
                <div className="event-year">{event.year.toLocaleString()}</div>
                <h3>{event.title}</h3>
                <p>{event.description}</p>
                <span className="event-category">{event.category}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
