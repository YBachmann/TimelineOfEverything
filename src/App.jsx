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
        <p><strong>Zoom:</strong> Use scroll wheel to zoom in/out</p>
        <p><strong>Pan:</strong> Click and drag to move the timeline</p>
        <p><strong>Details:</strong> Click on any event dot or label</p>
      </div>
    </div>
  );
}

export default App;
