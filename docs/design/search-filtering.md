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
- ~~**SF-Q4 — The browse view hid the subcategory facet.**~~ — answered (D28), §6.

---

## 6. The browse view's two facets (D28, closes SF-Q4)

**The measured cause.** The dropdown is `max-height: 320px`, and the browse view
(focused, empty box) listed `maxTags = 8` before the "Subcategories" header. At the
coarse-pointer row height D13 mandates (~40px), eight rows is **exactly 320px** — so on
a phone the second facet was not merely easy to miss, it was *never on screen*. In the
one view whose entire job is making the vocabulary discoverable, half the vocabulary was
undiscoverable. Once scrolled to, the only per-row difference was the `#` prefix on
tags: one character carrying the distinction between a *primary classifier* and a
*cross-cutting thread*.

Three changes, none of which touches the combobox keyboard model (D18.4's linear
listbox with `aria-activedescendant` stays exactly as it was):

- **SF7 — Browse is capped tighter than typing.** 4 tags + 4 subcategories on an empty
  box; the typed caps (8/6/6) are unchanged. This is not a compromise but the two views'
  actual jobs: browse exists to show that the facets *exist*, and typing is what reaches
  depth — SF1's argument, applied to the cap. Measured after: the "Subcategories" header
  sits at **168px inside the 320px panel** on a phone, and the whole browse list fits
  without scrolling at all on desktop.
- **SF8 — Group headers are sticky.** `position: sticky; top: -4px` (the −4 cancels the
  panel's own padding, which would otherwise leave a gap for rows to slide through) over
  an opaque `--surface-raised`. Whatever you have scrolled into names itself.
- **SF9 — A subcategory shows the categories it belongs to.** D14 §3 reuses subcategory
  names across categories deliberately — the `(category, subcategory)` **pair** is what
  separates `natural/geology` from `science/geology` — and this dropdown had been
  discarding that half. Each subcategory row now carries one small swatch per category
  the value appears under.

### Why swatches, and why more than one

The obvious version — label the row `geology · natural` — is **wrong**, and the data says
so: **5 of the 32 subcategory values span two categories** (`biology` natural:15 +
science:6, `cosmology`, `planetary`, `geology`, `philosophy`). `filterEvents` matches on
the subcategory *value*, so picking `biology` returns natural **and** science events. A
single parent label would have been a plain lie about what the filter does.

So the row carries *every* parent, most common first, as swatches: `biology` shows red +
teal, `planetary` red + purple. That is the honest rendering, it costs no width on a
phone, and it does the distinguishing job the lone `#` was failing at — a subcategory row
is now unmistakably a different kind of thing from a tag at a glance, not on inspection.
Screen readers get it as words instead (`"biology, in natural and science, 21 events"`),
since a swatch announces nothing.

### What the gate needed

The swatch is a **meaningful graphic** — it carries information the row's text does
not — so it owes SC 1.4.11's 3:1 rather than being decoration. Added to the contrast
walk: **122 surfaces**, worst swatch 5.82:1 (natural red on the raised panel).

Adding it surfaced that **PT-Q3 was factually wrong**. It recorded `required: false` as an
option "now used nowhere"; it was used in exactly two places right here — the event year
and the event category dot — and both would have gone silent the day the walk stopped
listing events. The walk types a query, so both *are* reachable; they are now required,
which turns that from an assumption into a fact and closes the hole D24 left open.
