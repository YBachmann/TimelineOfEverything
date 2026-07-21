import { useState, useEffect, useMemo, useRef, useDeferredValue } from 'react';
import { loadEvents, getCategories, filterEvents, getSuggestions } from './data';
import Timeline from './components/Timeline';
import SiteFooter from './components/SiteFooter';
import ErrorBoundary from './components/ErrorBoundary';
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
  const searchRef = useRef(null);

  useEffect(() => {
    loadEvents().then(data => {
      setEvents(data);
      setLoading(false);
    });
  }, []);

  // Ctrl/Cmd+F and "/" jump to the search box.
  //
  // Overriding the browser's find-in-page is normally hostile, but here it is
  // the honest move: the events live in an SVG scene, so only the ~35 titles
  // the label packer currently places exist as text nodes, and no description
  // or tag text is ever in the document. Find-in-page therefore searches a
  // shifting fraction of the titles and reports "not found" for events that
  // are on screen — while this box searches all of them, plus descriptions,
  // tags and subcategories. Same reasoning as an editor or a docs app taking
  // Ctrl+F for its own, better, search.
  //
  // The override is announced in the control hints below; an undiscoverable
  // one would be the bad kind.
  useEffect(() => {
    const onKeyDown = (e) => {
      const el = searchRef.current;
      if (!el) return;
      const isFind = (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'f';
      // Shift is NOT excluded: "/" is Shift+7 on a German keyboard, and e.key
      // reports the character produced, not the physical key.
      const isSlash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey;
      if (!isFind && !isSlash) return;
      // A slash typed into any text field must stay a slash. (Ctrl+F while
      // already in the search box falls through on purpose — it selects the
      // query so retyping replaces it, which is what find does everywhere.)
      const t = e.target;
      if (isSlash && (t instanceof HTMLElement)
        && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      // Never pull focus out from behind an open dialog — that would break the
      // focus trap and leave the user typing into something they can't see.
      // Queried from the DOM rather than tracked in state because the timeline
      // owns its modals internally; the shared Modal shell guarantees the role.
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      el.focus();
      el.select();
      setDropdownOpen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
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
  // The listbox exists only while it has something to show; the combobox ARIA
  // below has to agree with that, since aria-expanded / aria-controls describe
  // a popup a screen reader will try to look up.
  const listOpen = dropdownOpen && flatSuggestions.length > 0;
  const optionId = i => `sug-opt-${i}`;

  return (
    <div className="app">
      <h1>Timeline of Everything</h1>
      <p className="subtitle">An interactive journey through 13.8 billion years of history</p>

      <div className="filters">
        {/* aria-pressed carries what the .active class only shows: which
            category the timeline is currently filtered to. */}
        <button
          onClick={() => setSelectedCategory(null)}
          className={selectedCategory === null ? 'active' : ''}
          aria-pressed={selectedCategory === null}
        >
          All
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={selectedCategory === cat ? 'active' : ''}
            aria-pressed={selectedCategory === cat}
          >
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}

        {/* Filtering is live and silent — the chart is the feedback, and a
            screen reader gets none of it. This announces the match count on
            every settled change. Always rendered (a live region that appears
            with its first message is often missed) and out of flow, so it
            costs no layout: absolutely-positioned children are not flex items. */}
        <span className="sr-only" role="status" aria-live="polite">
          {query !== '' || terms.length > 0
            ? `${visibleEvents.length} of ${events.length} events match`
            : ''}
        </span>

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
          {/* Combobox ARIA (WAI-ARIA 1.2 pattern): the input keeps DOM focus
              while aria-activedescendant names the option the arrow keys are
              on, so a screen reader follows the dropdown cursor that was
              previously visible only as a highlight. */}
          <input
            className="search-input"
            type="text"
            ref={searchRef}
            value={query}
            placeholder={terms.length ? 'Add filter…' : 'Search events, #tags…'}
            onChange={e => { setQuery(e.target.value); setDropdownOpen(true); setActiveIdx(-1); }}
            onFocus={() => setDropdownOpen(true)}
            onBlur={() => setDropdownOpen(false)}
            onKeyDown={onSearchKeyDown}
            aria-label="Search events, tags, and subcategories"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={listOpen}
            aria-controls={listOpen ? 'search-suggestions' : undefined}
            aria-activedescendant={listOpen && activeIdx >= 0 ? optionId(activeIdx) : undefined}
          />
          {(query !== '' || terms.length > 0) && (
            // aria-hidden: the sr-only live region above already says this,
            // and "12/191" alone reads as noise.
            <span className="result-count" aria-hidden="true">
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
          {listOpen && (
            <div
              className="search-dropdown"
              id="search-suggestions"
              role="listbox"
              aria-label="Search suggestions"
              onMouseDown={e => e.preventDefault()}
            >
              {suggestions.tags.length > 0 && (
                <div className="sug-group" role="group" aria-labelledby="sug-header-tags">
                  <div className="sug-header" id="sug-header-tags" role="presentation">Tags</div>
                  {suggestions.tags.map((s, i) => (
                    <button
                      key={s.value}
                      id={optionId(i)}
                      role="option"
                      aria-selected={activeIdx === i}
                      // The count renders as a bare number; spell it out so
                      // the option doesn't announce as "#empire 12".
                      aria-label={`#${s.value}, ${s.count} events`}
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
                <div className="sug-group" role="group" aria-labelledby="sug-header-subcats">
                  <div className="sug-header" id="sug-header-subcats" role="presentation">Subcategories</div>
                  {suggestions.subcategories.map((s, i) => (
                    <button
                      key={s.value}
                      id={optionId(subOffset + i)}
                      role="option"
                      aria-selected={activeIdx === subOffset + i}
                      aria-label={`${s.value}, ${s.count} events`}
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
                <div className="sug-group" role="group" aria-labelledby="sug-header-events">
                  <div className="sug-header" id="sug-header-events" role="presentation">Events</div>
                  {suggestions.events.map((ev, i) => (
                    <button
                      key={ev.id}
                      id={optionId(evtOffset + i)}
                      role="option"
                      aria-selected={activeIdx === evtOffset + i}
                      aria-label={`${ev.title}, ${formatYearRange(ev)}`}
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

      {/* The chart is the one subtree complex enough to throw (D3 scene build,
          gesture handlers, layout engines). Scoping the boundary to it keeps
          the header, the filters and the footer's privacy notice standing when
          it does, instead of the whole page going blank. */}
      <div className="timeline-section">
        <ErrorBoundary
          title="The timeline could not be drawn"
          hint="This is a bug. Try again, or narrow the filters to fewer events."
        >
          <Timeline events={visibleEvents} allEvents={events} apiRef={timelineApi} />
        </ErrorBoundary>
      </div>

      <div className="timeline-info">
        {coarseInput ? (
          <>
            <p><strong>Zoom:</strong> Pinch the timeline with two fingers, or double-tap to zoom in</p>
            <p><strong>Pan:</strong> Drag the timeline left/right</p>
            <p><strong>Jump:</strong> Use the era buttons, or scrub the overview strip below the timeline</p>
            <p><strong>Preview:</strong> Press and hold any event dot or label</p>
            <p><strong>Details:</strong> Tap any event dot or label</p>
          </>
        ) : (
          <>
            <p><strong>Zoom:</strong> Hold Ctrl and scroll to zoom in/out (works anywhere on the page), or double-click to zoom in</p>
            <p><strong>Pan:</strong> Scroll, or drag the timeline left/right</p>
            <p><strong>Jump:</strong> Use the era buttons, or scrub the overview strip below the timeline</p>
            <p><strong>Search:</strong> Press <kbd>Ctrl</kbd>+<kbd>F</kbd> or <kbd>/</kbd> to search all events — the timeline's own search reaches every event, which the browser's find cannot</p>
            <p><strong>Keyboard:</strong> <kbd>Tab</kbd> to the timeline, then <kbd>←</kbd>/<kbd>→</kbd> to step through events, <kbd>Home</kbd>/<kbd>End</kbd> for the first/last, <kbd>Enter</kbd> for details, <kbd>+</kbd>/<kbd>−</kbd> to zoom, <kbd>0</kbd> to fit everything</p>
            <p><strong>Preview:</strong> Hover any dot or label</p>
            <p><strong>Details:</strong> Click on any event dot or label</p>
          </>
        )}
      </div>

      <SiteFooter />
    </div>
  );
}

export default App;
