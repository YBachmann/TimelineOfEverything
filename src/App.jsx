import { useState, useEffect } from 'react';
import { loadEvents, getCategories } from './data';
import Timeline from './components/Timeline';
import './App.css';

function App() {
  const [events, setEvents] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEvents().then(data => {
      setEvents(data);
      setLoading(false);
    });
  }, []);

  const categories = getCategories(events);

  // Which input modality to phrase the control hints for. Read per render —
  // it's a cheap media query, and hybrid devices are rare enough that a live
  // subscription isn't worth the plumbing.
  const coarseInput = window.matchMedia('(pointer: coarse)').matches;

  if (loading) return <div className="container">Loading...</div>;

  return (
    <div className="app">
      <h1>Timeline of Everything</h1>
      <p className="subtitle">An interactive journey through 13.8 billion years of history</p>

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

      <div className="timeline-section">
        <Timeline events={events} selectedCategory={selectedCategory} />
      </div>

      <div className="timeline-info">
        {coarseInput ? (
          <>
            <p><strong>Zoom:</strong> Pinch the timeline with two fingers</p>
            <p><strong>Pan:</strong> Drag the timeline left/right</p>
            <p><strong>Jump:</strong> Use the era buttons, or scrub the overview strip below the timeline</p>
            <p><strong>Details:</strong> Tap any event dot or label</p>
          </>
        ) : (
          <>
            <p><strong>Zoom:</strong> Hold Ctrl and scroll to zoom in/out (works anywhere on the page)</p>
            <p><strong>Pan:</strong> Scroll, or drag the timeline left/right</p>
            <p><strong>Jump:</strong> Use the era buttons, or scrub the overview strip below the timeline</p>
            <p><strong>Preview:</strong> Hover any dot or label</p>
            <p><strong>Details:</strong> Click on any event dot or label</p>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
