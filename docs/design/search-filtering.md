# Search & Tag/Subcategory Filtering

> Topic design doc. How events are found and filtered beyond the category
> button row: free-text search, tag/subcategory chips, and the suggestion
> dropdown. Indexed from the main [`DESIGN.md`](../../DESIGN.md).

**Status:** v1 implemented (answers the filter/search half of main-doc roadmap;
resolves the "Filter/search by `tags` and `subcategory`" TODO).
**Last updated:** 2026-07-19

---

## 1. Problem

The dataset carries a rich second layer of classification — 122 distinct tags
and 28 subcategories across 139 of the 191 events — that was completely
invisible in the UI: nothing displayed it, nothing could filter by it. And
finding one known event ("where's the Renaissance?") meant panning and zooming
across 13.8 billion years by hand.

The tag space is a long tail (most tags appear 1–4 times; only `empire`,
`deep-time`, `evolution` reach ~10), so the category-filter pattern — one
button per value — cannot scale to it. Whatever surfaces tags must handle a
vocabulary two orders of magnitude wider than the category row.

## 2. The model (v1)

One combobox-style search box in the filters row:

1. **Free text live-filters the chart.** Case-insensitive substring match
   over title, description, subcategory, and tags. The timeline shows only
   matching events; the domain adapts to their extent (same semantics as the
   category filter).
2. **A suggestion dropdown** offers, for the current text: matching **tags**
   and **subcategories** (with counts) to pin as filter chips, and matching
   **event titles** that open the event's detail modal directly. On focus
   with an empty box it shows the top tags/subcategories by count — the
   browse view that makes the vocabulary discoverable at all.
3. **Pinned chips** (`#empire`, `physics`) AND together, and AND with the
   category row and any further free text. Backspace in an empty input pops
   the last chip; a × clears everything.
4. **A result count** (`23/191`) sits in the box whenever a query or chip is
   active.
5. **Keyboard:** ↑/↓ move through the dropdown, Enter picks, Esc closes the
   dropdown then clears the text.

## 3. Key decisions

- **SF1 — One search box, not per-tag UI.** The long-tail distribution rules
  out buttons/checkbox lists; a query-driven surface is the only thing that
  scales with vocabulary growth (and will absorb Wikidata-scale tag sets
  later, main-doc Q4).
- **SF2 — Filtering lifted out of Timeline into App.** `filterEvents()` in
  `src/data.js` is the single filter implementation (category + chips +
  query, AND semantics); App passes the already-filtered, **memoized** array
  to Timeline, which renders what it is given. Memoization matters: the
  events prop's referential stability is what keeps unrelated App re-renders
  (every keystroke) from rebuilding the D3 scene. The query is additionally
  routed through `useDeferredValue`, so the input and dropdown stay
  keystroke-immediate while the scene rebuild trails by a beat.
- **SF3 — Suggestion counts are contextual.** Counts are computed over the
  set narrowed by every *other* active filter (category + pinned chips, not
  the live query), so each count is exactly what pinning that suggestion
  would leave visible. Already-pinned terms are dropped from the list
  (picking them again is a no-op).
- **SF4 — Event suggestions open the detail modal, not a fly-to.** Timeline
  exposes `{ openEvent }` through an `apiRef` prop (same pattern as the
  internal `navRef` for era flights). A fly-to-on-the-chart action stays
  open (see LK-Q1 in the event-links doc — same missing primitive).
- **SF6 — Domain changes animate: the entry flight.** A filter/search that
  moves the domain extremes doesn't snap the rebuilt scene to its fitted
  view. The camera *enters* on the time window the user was just looking at,
  re-expressed in the new domain — the symlog window→pixel mapping is
  domain-independent (linear in transform space), so surviving marks are
  pixel-identical across the swap (probe-verified: 0.000px rebuild-frame
  delta) — then flies home to the fitted view with the same `animateTo`
  flight the era presets use. A narrowing search puts the camera *wider
  than the domain* (scale < 1) for the flight; the translate clamp is
  relaxed there, and any user input that grabs the camera mid-flight
  (wheel/drag/pinch/scrub) normalizes to the fitted view first — flights
  themselves handle a scale < 1 start and need no normalization. The
  rebuilt scene's first render also suppresses all intro animations (label
  fade-ins, 150ms dot grow-ins, chip fades): replaying them at flight
  start read as a flash. A rebuild now registers as a content update, not
  a scene cut — which also removed the long-standing flash on window
  resize. Same-extremes filter flips still hold the view (D10) — no domain
  jump, nothing to smooth.
- **SF5 — Empty result sets clear the scene explicitly.** The old early
  return on a filtered-empty set left the previous chart on screen — looking
  interactive while every handler on it was stale. Now Timeline wipes the
  svg + minimap and App-side JSX shows a "no events match" message. A
  related guard: a query matching a single event *past the current year*
  collapses the domain range to zero (the domain max is normally propped up
  by `nowYear`); padding now falls back to the year's magnitude so the
  symlog scale never degenerates.

## 4. Interplay with existing systems

- The link index is built over **all** events (`allEvents` prop), so a
  filtered-out event is still reachable through a modal's "Connected events"
  list — unchanged from the category-filter behavior.
- View restore (D10) applies as-is: a filter change that keeps the same
  domain extremes preserves zoom/center; one that changes them *flies* to the
  full view of the new domain (SF6) — which for search doubles as "fit the
  results on screen".
- Era preset buttons already no-op for eras outside the filtered domain.
- The shared display helpers (`formatYear`, `formatYearRange`,
  `getCategoryColor`) moved to `src/format.js`: App's dropdown needed them,
  and component files must only export components for Fast Refresh.

## 5. Open items

- **SF-Q1 — Fly-to from search.** Clicking an event suggestion could animate
  the chart to the event instead of / in addition to opening the modal.
  Shares the missing fly-to-event primitive with LK-Q1.
- **SF-Q2 — Richer query semantics.** OR within a facet, negation
  (`-tag`), year-range queries. No demand yet at 191 events.
- ~~**SF-Q3 — Vocabulary hygiene.**~~ — resolved with main-doc Q5/D14: the 52
  untagged events were backfilled, singletons and near-duplicates removed
  (122→76 tags), subcategories made a controlled vocabulary, and all of it
  gated by `verify:layout` so the dropdown can't resurface dead-end or
  duplicate facets. The suggestion counts here now come from a clean
  vocabulary.
- **SF-Q4 — The browse view hides the subcategory facet.** *(Measured
  2026-07-26; recorded, not decided.)* On focus with an empty box the dropdown
  lists `maxTags = 8` tags before the "Subcategories" header
  (`getSuggestions`, `src/data.js`). At the coarse-pointer row height (~40px,
  D13) eight rows is ~320px — **taller than the visible dropdown on a phone**,
  so the second facet is always below the fold and its existence is
  undiscoverable in the view that exists to make the vocabulary discoverable.
  Once scrolled to, the only per-row difference is the `#` prefix on tags: one
  character carrying the whole distinction between a *primary classifier* and a
  *cross-cutting thread* (D14).

  Candidates, cheapest first — the first three are complementary and none
  touches the combobox keyboard model:

  1. **Rebalance the browse caps** (~4 tags + ~4 subcategories, larger caps once
     a query is typed). Hits the cause directly, and is principled rather than a
     compromise: SF1's argument is that browse shows a *sample* and typing is
     what reaches depth.
  2. **Sticky group headers** inside the scroller, so the current group is
     always named.
  3. **Show the facets as the different things they are.** A subcategory is
     scoped by category — D14 §3 says the `(category, subcategory)` pair is what
     disambiguates `natural/geology` from `science/geology` — and the dropdown
     currently discards that. Rendering a subcategory with its parent
     category's colour and name (`geology · natural`) against a tag's
     `#thread` is *informative*, not decorative. Needs `getSuggestions` to carry
     the parent category, which it does not today.
  4. **Two columns** (tags | subcategories). Reads well on desktop and makes the
     split structurally obvious, but helps least on the phone that prompted it
     (two ~170px columns truncate `communication`, `spaceflight`), and it is the
     option that costs the a11y model: D18.4 deliberately built a **linear**
     listbox driven by `aria-activedescendant` and ↑/↓. A 2-D layout either
     needs ←/→ column semantics or leaves the linear order disagreeing with the
     visual one — the same desync D19.2 rejected for the chart cursor.

  Note the interaction with **NAV-Q6**: putting eras in this dropdown adds a
  fourth group and makes the fold problem worse, so (1) would need to land with
  it rather than after.
