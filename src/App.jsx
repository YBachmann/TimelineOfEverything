import { useState, useEffect, useMemo, useRef, useDeferredValue } from 'react';
import { loadEvents, getCategories, filterEvents, getSuggestions } from './data';
import Timeline from './components/Timeline';
import { getCategoryColor, formatYearRange } from './format';
import './App.css';

function App() {
  const [events, setEvents] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  // Pinned tag/subcategory chips ({ kind, value }); AND-combined with the
  // category button row and the free-text query.
  const [terms, setTerms] = useState([]);
  const [query, setQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1); // keyboard cursor in the dropdown
  const [loading, setLoading] = useState(true);
  const timelineApi = useRef(null); // { openEvent } exposed by Timeline

  useEffect(() => {
    loadEvents().then(data => {
      setEvents(data);
      setLoading(false);
    });
  }, []);

  const categories = getCategories(events);

  // The chart rebuild trails fast typing by a beat (deferred value) while the
  // input and dropdown stay immediate; memoization keeps the events prop
  // referentially stable so unrelated re-renders never rebuild the scene.
  // On top of that, a filter change that yields the IDENTICAL result set
  // (keystrokes that don't change the matches, flipping a filter back and
  // forth) returns the previous array instance, so the D3 scene isn't
  // rebuilt at all — filterEvents() always allocates, and Timeline's effect
  // keys on the array's identity.
  const deferredQuery = useDeferredValue(query);
  const prevVisibleRef = useRef([]);
  const visibleEvents = useMemo(() => {
    const next = filterEvents(events, { category: selectedCategory, terms, query: deferredQuery });
    const prev = prevVisibleRef.current;
    // Same objects in the same order (filtering preserves both) = no-op.
    if (next.length === prev.length && next.every((e, i) => e === prev[i])) return prev;
    prevVisibleRef.current = next;
    return next;
  }, [events, selectedCategory, terms, deferredQuery]);

  // Suggestions are counted against everything EXCEPT the free-text query,
  // so each count is exactly what pinning that suggestion would leave visible.
  const suggestionContext = useMemo(
    () => filterEvents(events, { category: selectedCategory, terms }),
    [events, selectedCategory, terms]);
  const suggestions = useMemo(() => {
    const s = getSuggestions(suggestionContext, query);
    // Already-pinned terms would be no-op picks — drop them from the list.
    const notPinned = kind => x => !terms.some(t => t.kind === kind && t.value === x.value);
    return {
      ...s,
      tags: s.tags.filter(notPinned('tag')),
      subcategories: s.subcategories.filter(notPinned('subcategory')),
    };
  }, [suggestionContext, query, terms]);
  // One flat list across the dropdown's sections for arrow-key navigation.
  const flatSuggestions = useMemo(() => [
    ...suggestions.tags.map(s => ({ kind: 'tag', ...s })),
    ...suggestions.subcategories.map(s => ({ kind: 'subcategory', ...s })),
    ...suggestions.events.map(e => ({ kind: 'event', event: e })),
  ], [suggestions]);

  const pinTerm = (kind, value) => {
    setTerms(t => t.some(x => x.kind === kind && x.value === value)
      ? t : [...t, { kind, value }]);
    setQuery('');
    setActiveIdx(-1);
  };
  const removeTerm = (kind, value) =>
    setTerms(t => t.filter(x => !(x.kind === kind && x.value === value)));
  const pickSuggestion = (s) => {
    if (s.kind === 'event') {
      timelineApi.current?.openEvent(s.event);
      setDropdownOpen(false);
    } else {
      pinTerm(s.kind, s.value);
    }
  };
  const onSearchKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setDropdownOpen(true);
      setActiveIdx(i => Math.min(i + 1, flatSuggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      if (dropdownOpen && activeIdx >= 0 && flatSuggestions[activeIdx]) {
        pickSuggestion(flatSuggestions[activeIdx]);
      } else {
        // Free-text filtering is already live; Enter just dismisses the list.
        setDropdownOpen(false);
      }
    } else if (e.key === 'Escape') {
      if (dropdownOpen) setDropdownOpen(false);
      else setQuery('');
    } else if (e.key === 'Backspace' && query === '' && terms.length > 0) {
      const last = terms[terms.length - 1];
      removeTerm(last.kind, last.value);
    }
  };

  // Which input modality to phrase the control hints for. Read per render —
  // it's a cheap media query, and hybrid devices are rare enough that a live
  // subscription isn't worth the plumbing.
  const coarseInput = window.matchMedia('(pointer: coarse)').matches;

  if (loading) return <div className="container">Loading...</div>;

  // Flat-list offsets of each dropdown section, for the keyboard cursor.
  const subOffset = suggestions.tags.length;
  const evtOffset = subOffset + suggestions.subcategories.length;

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

        {/* Search / tag filtering. Chips render inside the box, combobox-
            style; the dropdown suggests tags and subcategories (pin as chip)
            and events (open detail modal). Items use onMouseDown-preventDefault
            so picking one doesn't blur the input (blur closes the dropdown). */}
        <div className="search-box">
          {terms.map(term => (
            <span key={`${term.kind}:${term.value}`} className="search-chip">
              {term.kind === 'tag' ? `#${term.value}` : term.value}
              <button
                className="chip-remove"
                onMouseDown={e => e.preventDefault()}
                onClick={() => removeTerm(term.kind, term.value)}
                aria-label={`Remove ${term.value} filter`}
              >
                ×
              </button>
            </span>
          ))}
          <input
            className="search-input"
            type="text"
            value={query}
            placeholder={terms.length ? 'Add filter…' : 'Search events, #tags…'}
            onChange={e => { setQuery(e.target.value); setDropdownOpen(true); setActiveIdx(-1); }}
            onFocus={() => setDropdownOpen(true)}
            onBlur={() => setDropdownOpen(false)}
            onKeyDown={onSearchKeyDown}
            aria-label="Search events, tags, and subcategories"
          />
          {(query !== '' || terms.length > 0) && (
            <span className="result-count">
              {visibleEvents.length}/{events.length}
            </span>
          )}
          {(query !== '' || terms.length > 0) && (
            <button
              className="search-clear"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { setQuery(''); setTerms([]); }}
              aria-label="Clear search and filters"
            >
              ×
            </button>
          )}
          {dropdownOpen && flatSuggestions.length > 0 && (
            <div className="search-dropdown" onMouseDown={e => e.preventDefault()}>
              {suggestions.tags.length > 0 && (
                <div className="sug-group">
                  <div className="sug-header">Tags</div>
                  {suggestions.tags.map((s, i) => (
                    <button
                      key={s.value}
                      className={`sug-item${activeIdx === i ? ' active' : ''}`}
                      onClick={() => pickSuggestion({ kind: 'tag', ...s })}
                    >
                      <span className="sug-label">#{s.value}</span>
                      <span className="sug-count">{s.count}</span>
                    </button>
                  ))}
                </div>
              )}
              {suggestions.subcategories.length > 0 && (
                <div className="sug-group">
                  <div className="sug-header">Subcategories</div>
                  {suggestions.subcategories.map((s, i) => (
                    <button
                      key={s.value}
                      className={`sug-item${activeIdx === subOffset + i ? ' active' : ''}`}
                      onClick={() => pickSuggestion({ kind: 'subcategory', ...s })}
                    >
                      <span className="sug-label">{s.value}</span>
                      <span className="sug-count">{s.count}</span>
                    </button>
                  ))}
                </div>
              )}
              {suggestions.events.length > 0 && (
                <div className="sug-group">
                  <div className="sug-header">Events</div>
                  {suggestions.events.map((ev, i) => (
                    <button
                      key={ev.id}
                      className={`sug-item${activeIdx === evtOffset + i ? ' active' : ''}`}
                      onClick={() => pickSuggestion({ kind: 'event', event: ev })}
                    >
                      <span
                        className="sug-dot"
                        style={{ backgroundColor: getCategoryColor(ev.category) }}
                      />
                      <span className="sug-label">{ev.title}</span>
                      <span className="sug-year">{formatYearRange(ev)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="timeline-section">
        <Timeline events={visibleEvents} allEvents={events} apiRef={timelineApi} />
      </div>

      <div className="timeline-info">
        {coarseInput ? (
          <>
            <p><strong>Zoom:</strong> Pinch the timeline with two fingers, or double-tap to zoom in</p>
            <p><strong>Pan:</strong> Drag the timeline left/right</p>
            <p><strong>Jump:</strong> Use the era buttons, or scrub the overview strip below the timeline</p>
            <p><strong>Details:</strong> Tap any event dot or label</p>
          </>
        ) : (
          <>
            <p><strong>Zoom:</strong> Hold Ctrl and scroll to zoom in/out (works anywhere on the page), or double-click to zoom in</p>
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
