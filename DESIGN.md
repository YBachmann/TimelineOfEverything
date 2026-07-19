# TimelineOfEverything — Design Doc

> **Living document.** This is the project's persistent memory and warm-start context.
> Keep it current: when a decision is made, log it; when a question arises, record it;
> when something is learned, capture it. The README is the *public* description of the
> project; this doc is the *working* brain behind it.

**Last updated:** 2026-07-19

---

## Topic Design Docs

Deep-dives on individual topics live in [`docs/design/`](docs/design/) so this main doc
stays a readable overview. Add a one-line entry here for each new one.

| Doc | Topic |
|---|---|
| [`label-decluttering.md`](docs/design/label-decluttering.md) | Placing event labels so they never overlap: priority-based level-of-detail + greedy lane packing. |
| [`span-rendering.md`](docs/design/span-rendering.md) | Rendering `endYear` spans as bars on the spine: degenerate-dot fallback, visible-portion label anchoring, cluster interplay, mini-lanes for overlapping bars. |
| [`navigation.md`](docs/design/navigation.md) | Orientation across 13.8B years: era preset flights, the piecewise-equal era scrubber (minimap), visible-range readout. |
| [`event-links.md`](docs/design/event-links.md) | Event links: directional storage + load-time mirroring, relation phrasing, the modal "Connected events" list. |
| [`touch-gestures.md`](docs/design/touch-gestures.md) | Touch & drag gestures: pointer-event pan/pinch, slop + capture + click suppression, `touch-action: pan-y` scoping. |
| [`search-filtering.md`](docs/design/search-filtering.md) | Search & tag/subcategory filtering: the combobox search box, suggestion dropdown with contextual counts, pinned AND-chips, event-title lookup. |

---

## 1. Context

**TimelineOfEverything** is an interactive web app that visualizes events from the Big
Bang (−13.8 billion) to speculative futures (+5 billion) on a single navigable timeline.
It began as an idea for a printable panoramic poster, but the extreme scale differences
between cosmic and human timescales made static visualization impractical — hence an
interactive, zoomable app.

Currently in **prototype / pre-alpha** stage: a working React + D3 single-page app driven
by a hand-curated static JSON dataset (191 events, balanced across categories and eras).

---

## 2. Goals & Requirements

### POC (current focus)
- Render events across 13.8B years on one navigable timeline. ✅
- Zoom & pan. ✅ (Ctrl+scroll = zoom, scroll = pan)
- Category filtering. ✅
- Click event → detail modal. ✅
- A time scale that handles both deep time and recent detail. ✅ (symlog)
- **Prove the visualization works at scale.** ✅ (191 events: invariants hold, default view
  self-selects cross-era landmarks — see §8)
- Deploy the POC. ✅ (GitHub Pages, auto-deployed from `main` — see D8; one-time manual
  step: enable Pages with source "GitHub Actions" in repo settings)

### Full version (later, not yet justified)
- Hundreds–thousands of events, spans/eras, linked events.
- Possibly automated data extraction (Wikidata/Wikipedia via SPARQL).
- Possibly graph-based linking (PageRank, community detection).
- Export a selected range as a printable poster.

### Guiding principle
Attack the **riskiest unknown cheaply** before building infrastructure. For this project
the riskiest unknown is *visualization + navigation at scale*, not the backend. Defer the
backend until data volume actually demands it.

---

## 3. Current State / Architecture

- **Stack:** React 19 + Vite 7, D3 7 for the timeline. No backend.
- **Data:** `data/events.json`, imported directly into the bundle (see decision D2).
- **Key files:**
  - `src/App.jsx` — top-level UI: filters, timeline, control hints.
  - `src/components/Timeline.jsx` — the D3 SVG timeline (rendering, zoom/pan, tooltip, modals).
  - `src/timelineLayout.js` — pure layout logic: label priority, lane packer, +N clusterer.
  - `scripts/verify-layout.mjs` — invariant checker over the real layout module
    (`npm run verify:layout`).
  - `scripts/cdp-mobile.mjs` + `verify-touch.mjs` + `perf-mobile.mjs` — headless-Edge
    mobile harness: touch-behavior checks (`npm run verify:touch`) and gesture
    frame-time stats (`npm run perf:mobile`); both need `npm run build` first.
  - `src/data.js` — loads + sorts events, category helpers, `filterEvents()` +
    search suggestions.
  - `src/format.js` — shared display helpers (year formatting, category colors).
  - `data/events.json` — the dataset (schemaVersion 2).

---

## 4. Data Schema (schemaVersion 2)

Top level: `{ "schemaVersion": 2, "events": [ ...Event ] }`

### Event
| Field         | Type                | Req | Notes |
|---------------|---------------------|-----|-------|
| `id`          | number              | ✅  | Unique. |
| `year`        | number              | ✅  | Signed year (negative = BCE). Point time **and** the sort key. For spans, this is the start. |
| `title`       | string              | ✅  | |
| `category`    | string              | ✅  | One of `natural`, `history`, `science`, `technology`, `future`. |
| `description` | string              | ✅  | |
| `endYear`     | number              | ⬜  | If present, the event is a **span** `year → endYear` (e.g. Industrial Revolution 1760–1840). |
| `subcategory` | string              | ⬜  | Finer classification within a category (e.g. `cosmology`, `electronics`). Freeform for now. |
| `tags`        | string[]            | ⬜  | Cross-cutting freeform labels for filtering/search. |
| `precision`   | string              | ⬜  | `exact` (default) \| `approximate` \| `estimated` \| `speculative`. Intended to later drive fuzzy rendering. |
| `links`       | Link[]              | ⬜  | Relations to other events. |
| `sources`     | Source[]            | ⬜  | Provenance. |
| `importance`  | number              | ⬜  | Hand-tagged label priority in [0, 1]; overrides the derived heuristic (use 0.9–1.0 so anchors always outrank it). Future Wikipedia-derived ranking slots in here. See [`docs/design/label-decluttering.md`](docs/design/label-decluttering.md) §5. |

### Link
`{ "to": <eventId>, "type": string, "note"?: string }`
- Suggested `type` values: `related`, `causes`, `precedes`, `partOf`, `contrasts` (freeform allowed).
- Stored **directionally**; the renderer may mirror (see open question Q3).

### Source
`{ "label": string, "url"?: string }`

**Design notes:**
- All new fields are optional/additive — v1 point-events remain valid.
- `year` stays canonical so sorting/point-rendering are unchanged; spans are an overlay concept.

---

## 5. Decisions Log (answered questions)

- **D1 — Iterate, don't rewrite; defer the backend.** The React+D3+JSON foundation can
  carry us to hundreds/low-thousands of events. The full-version backend (Neo4j/GraphQL/
  SPARQL/ML) solves problems we don't have yet and doesn't change the UX. *Rationale:* the
  make-or-break risk is visualization at scale, testable within the current stack.
- **D2 — Bundle the dataset via direct `import` instead of runtime `fetch`.** A Vite
  production build only serves `public/`; the old `fetch('/data/events.json')` worked in
  dev but would break in production. Importing bundles the data and keeps dev≡prod.
- **D3 — Single data source.** Removed the dead `src/utils/fetchEvents.js` loader and the
  stray `public/events.json` (which had a divergent `{date}` schema). `data/events.json` is
  the sole source of truth.
- **D4 — `scaleSymlog`, not `scaleLog`+shift.** symlog natively handles negative (BCE)
  years and the year-zero boundary, so we dropped the "shift all years positive by 13.8B"
  hack. Cleaner and represents recent history better.
- **D5 — Spans via optional `endYear`, not a second event type.** Least churn, unambiguous,
  keeps `year` as the sort key. (Schema §4.)
- **D6 — Next priority is de-cluttering + navigation, not feature breadth.** (See §7.)
- **D7 — Label de-cluttering approach chosen:** priority-based LOD + greedy lane packing,
  single horizontal spine first, category swimlanes deferred; importance ranking is a
  deterministic placeholder for now (real ranking from Wikipedia signals later). Full
  detail in [`docs/design/label-decluttering.md`](docs/design/label-decluttering.md).
- **D8 — Deploy to GitHub Pages, not Vercel/Netlify (answers Q7).** The repo already
  lives on GitHub, so Pages needs no new account or service connection, and free static
  hosting is all a bundled SPA requires. `.github/workflows/deploy.yml` deploys on every
  push to `main` and doubles as the project's first CI: lint + `verify:layout` gate the
  build, so a broken layout can't reach the live site. Vercel-style per-PR preview
  deploys are the main thing given up — revisit if PR review pain appears. Requires
  `base: '/TimelineOfEverything/'` in `vite.config.js` (see §8).
- **D9 — Event links v1 (answers Q3): store directionally, mirror at load, display as a
  modal list.** Each edge is stored once on its source event; `buildLinkIndex()` derives
  the reverse view with inverse phrasing, so the data has no A→B/B→A duplication to keep
  in sync. Displayed as a clickable "Connected events" section in the detail modal —
  on-canvas connectors deferred (they'd fight the label lanes/chips/bars for space and
  mostly degenerate at symlog zoom levels). 44 links hand-curated across all eras.
  Detail in [`docs/design/event-links.md`](docs/design/event-links.md).
- **D10 — Responsive layout: flex-fill sizing + ResizeObserver rebuild with view
  restore.** The chart fills its flex container instead of a fixed 600px; a debounced
  ResizeObserver re-runs the render effect on any box change (window resize, rotation),
  and the zoom/center — saved every frame as a *domain fraction*, so it's independent
  of the old pixel width — are restored whenever the time domain is unchanged. So
  resizing never resets navigation, and a filter flip that keeps the same extremes now
  also preserves the view. Small screens compact the chrome via media queries and hide
  the (desktop-only) control hints; phones may scroll the page vertically as a fallback;
  `100dvh` guards against mobile URL-bar clipping; the axis tick budget follows chart
  width (~80px per tick) so narrow charts thin ticks instead of colliding labels.
  Resolves NAV-Q4. Touch input is NOT part of this — that's Q9/D11.
- **D11 — Touch & drag gestures via pointer events (answers the gesture half of Q9).**
  One pointer past a 6px slop = pan (mouse included — desktop gains drag-panning);
  two touch pointers = pinch zoom that keeps the start-midpoint's domain point pinned
  under the moving midpoint (pinch + two-finger pan as one motion). `touch-action:
  pan-y` on the chart hands us horizontal gestures while vertical swipes still scroll
  the page (`none` on the minimap — scrubbing owns it). Pointer capture only after the
  slop (capture at pointerdown would retarget tap-clicks away from dots/labels/chips);
  a capture-phase click listener swallows the one synthetic click that follows a
  pan/pinch. Taps stay native clicks — the existing modal handlers just work. Wheel
  input is unchanged. Flick releases glide with momentum (exponential friction,
  velocity sampled from the drag's final instants); touching a moving view "catches"
  it — stops the motion, swallows the click — and a quick same-direction re-flick
  pumps the caught speed back in (fling boost), so repeated swipes accumulate
  velocity like native scrolling. Double-tap / double-click zooms in a step toward
  the pointer (TG-Q2). Detail in
  [`docs/design/touch-gestures.md`](docs/design/touch-gestures.md).
- **D12 — Search & tag/subcategory filtering via one combobox (closes the
  tags/subcategory-filter TODO).** Free text live-filters the chart (substring over
  title/description/tags/subcategory); a suggestion dropdown pins tags and
  subcategories as AND-chips (counts show exactly what pinning would leave visible)
  and opens event-title matches' detail modals directly. A button-per-tag UI was
  rejected: 122 tags in a long tail can't work as buttons. Filtering logic lifted
  out of Timeline into `filterEvents()` (data.js); App passes a memoized filtered
  array — referential stability keeps keystroke re-renders from rebuilding the D3
  scene — with the query deferred via `useDeferredValue`. Empty result sets now
  clear the scene (the old early-return left a stale, dead-handler chart up).
  Domain-changing filter updates *fly* (the entry flight, SF6): the camera enters
  on the previous time window re-expressed in the new domain (pixel-continuous —
  the symlog window mapping is domain-independent) and animates to the fitted
  view via the era-preset flight; the rebuilt scene's first render suppresses
  intro animations, so rebuilds — including resize — no longer flash.
  Detail in [`docs/design/search-filtering.md`](docs/design/search-filtering.md).
- **D13 — Mobile polish pass (closes TG-Q3 and, with D10/D11, Q9) + edge
  overscan.** Three pieces. (1) *Hit targets:* coarse pointers get ~44px targets
  where geometry allows — dot hit circles 24→44px, minimap 40→48px, bigger
  chrome buttons via an `@media (pointer: coarse)` CSS block, 16px search input
  (iOS zoom guard) — and deliberate caps where it doesn't (label rects at the
  22px lane pitch, span bands at 14px over the 7px mini-lane pitch, era pills
  kept small to protect chart height). (2) *Press-and-hold preview:* 500ms hold
  on any mark shows the hover tooltip above the finger (touch has no hover);
  release is swallowed, preview lingers until the next gesture. (3) *Edge
  overscan + fade:* labels/chips are admitted to packing/clustering ~one
  max-label-width beyond the viewport, so marks slide into view during pans instead
  of popping into existence at the border (the mobile-visible edge flicker);
  machine-gated in verify-layout ("0 border pops during pan"). Overscan alone read
  static, so labels/leaders/chips also fade by distance from the border
  (smoothstepped ~50–120px band) — entries *materialize* gradually; dots/bars stay
  solid as the persistent anchors. Perf on emulated mobile
  (headless Edge, CPU-throttled): pans/glides/flights hold ~60fps+ even at 6×
  throttle; pinch-zoom is the known heavy path (37–51fps, spiky) — acceptable,
  with a candidate fix noted. Details + numbers in
  [`docs/design/touch-gestures.md`](docs/design/touch-gestures.md) §5,
  overscan in [`docs/design/label-decluttering.md`](docs/design/label-decluttering.md)
  LD10.

---

## 6. Open Questions

- ~~**Q1 — Navigation model**~~ — answered: the continuous symlog axis works *with an
  orientation layer on top* — era preset flights, a piecewise-equal era scrubber, and a
  visible-range readout. See [`docs/design/navigation.md`](docs/design/navigation.md)
  (open: active-era state, keyboard nav; window-resize handling landed with D10).
- ~~**Q2 — Span rendering**~~ — answered: rounded bars on the spine with a degenerate-dot
  fallback below 8px, visible-portion label anchoring, and mini-lanes so time-overlapping
  bars never draw on top of each other. See
  [`docs/design/span-rendering.md`](docs/design/span-rendering.md) (open: fuzzy edges,
  end-cap ticks).
- ~~**Q3 — Link semantics & display**~~ — answered: stored directionally once, mirrored at
  load time, phrased per direction ("led to" / "caused by"); displayed as a clickable
  "Connected events" list in the detail modal, not as canvas connectors (deferred). See
  [`docs/design/event-links.md`](docs/design/event-links.md) (open: on-canvas
  visualization, fly-to action).
- **Q4 — Data sourcing.** At what volume does hand-curation stop scaling and Wikidata/SPARQL
  automation become worth it? What's the threshold?
- **Q5 — Taxonomy.** Is the 5-category set final? Should `subcategory`/`tags` be a controlled
  vocabulary or stay freeform? Now more pressing: search (D12) surfaces the vocabulary in
  the UI, so near-duplicate and singleton tags are user-visible (SF-Q3).
- **Q6 — Precision in the UI.** How is `precision` surfaced (fuzzy/faded markers, error bars,
  a label)?
- ~~**Q7 — Deployment**~~ — answered: GitHub Pages via a GitHub Actions workflow that
  also serves as CI (see D8).
- **Q8 — Importance ranking source.** Deterministic placeholder for now; long-term likely
  derived from Wikipedia signals (article length, inbound links / existing network graphs).
  How exactly, and when to invest, is open. See
  [`docs/design/label-decluttering.md`](docs/design/label-decluttering.md) §5.
- ~~**Q9 — Mobile / touch support**~~ — answered across three passes: responsive
  layout (D10), touch gestures (D11 — drag pan with momentum, pinch zoom, taps stay
  clicks), and the coarse-pointer polish pass (D13 — ~44px hit targets, press-and-hold
  preview, emulated-mobile perf check, edge overscan). Residual: a real-device
  confirmation of feel/perf (TG-Q4). See
  [`docs/design/touch-gestures.md`](docs/design/touch-gestures.md).

---

## 7. TODOs / Roadmap

**Next up (highest leverage — the scale/navigation risk):**
- [x] Label **de-cluttering / level-of-detail** — v1 (greedy lane packer), v1.5 (priority
      + anchors, tooltips, triad highlight, two-tier typography, sticky lanes, quiet axis),
      and v1.6 (+N cluster chips with zoom-or-list click; layout logic extracted to
      `src/timelineLayout.js` with `npm run verify:layout`) shipped. See
      [`docs/design/label-decluttering.md`](docs/design/label-decluttering.md) (decisions
      LD3–LD9). Remaining: swimlanes, era bands, optional rotation.
- [x] Rethink **navigation** (Q1) — v1 shipped: era preset flights, piecewise-equal era
      scrubber with viewport window, visible-range readout. See
      [`docs/design/navigation.md`](docs/design/navigation.md).
- [x] Grow dataset to a few hundred events to genuinely stress layout. *Now 191 events,
      balanced across categories and eras; the layout engine holds (verify:layout green).*

**Data / schema:**
- [x] Convert obvious start/end **pairs into spans**: WWI, WWII, Roman Empire, Berlin Wall
      (plus ~26 more eras/empires added with the expansion; 32 spans total).
- [x] **Dedup** near-duplicates: Egyptian Civilization → Ancient Egypt; First Moon
      Landing → Moon Landing.
- [ ] Backfill `subcategory`/`tags`/`sources`/`precision` across the **original** events
      (the 132 expansion events carry subcategory + most carry tags; the pre-expansion
      set is still sparsely enriched, and `sources` remain thin dataset-wide).
- [x] Curate event links — 44 hand-written links (48 edges with the pre-existing 4)
      spanning all eras and all five relation types, with one-sentence notes (D9).

**Rendering / features:**
- [x] Render spans (Q2) — bars on the spine with degenerate-dot fallback; see
      [`docs/design/span-rendering.md`](docs/design/span-rendering.md).
- [x] Span mini-lanes (SR-Q1) — the 32-span dataset has 24 time-overlapping pairs that
      all drew on one spine row; overlapping bars now stack into 3 zoom-stable
      mini-lanes (spine / +7px / −7px), machine-verified. See span-rendering doc §3.
- [x] Event links v1 (Q3) — mirrored link index + "Connected events" modal list (D9);
      on-canvas link visualization stays open (LK-Q1).
- [ ] Surface `precision` visually (Q6).
- [x] Filter/search by `tags` and `subcategory` — combobox search with suggestion
      dropdown, pinned AND-chips, and event-title lookup (D12). See
      [`docs/design/search-filtering.md`](docs/design/search-filtering.md).

**Mobile / responsive (Q9):**
- [x] Responsive layout (D10) — chart flex-fills the viewport (no fixed 600px), resize/
      rotation rebuilds preserving the view, compact small-screen chrome via media queries.
- [x] **Touch gestures** (D11) — drag = pan with momentum (mouse too), pinch = zoom,
      taps stay clicks, modality-aware hint copy. See
      [`docs/design/touch-gestures.md`](docs/design/touch-gestures.md).
- [x] **Mobile polish pass** (D13) — ~44px hit targets, press-and-hold preview,
      edge overscan (no border pops during pan, machine-gated), emulated-mobile
      perf check. Remaining: real-device confirmation (TG-Q4).

**Ops:**
- [x] Deploy POC (Q7) — GitHub Pages + Actions CI (D8).

---

## 8. Technical Insights

- **Vite production serves only `public/`.** Anything fetched at runtime from another path
  works in `vite dev` (project root is served) but 404s in the built app. Prefer importing
  static data so it's bundled. (→ D2)
- **`d3.scaleSymlog` is the right tool for signed, multi-order-of-magnitude time.** It
  handles negatives and zero, unlike `scaleLog`, removing the need to shift the domain. (→ D4)
- **The layout engine scales.** At 191 events (from 65), the packer + clusterer hold every
  invariant across the gesture sim, and the default view self-selects to ~35 landmark labels
  spread across all eras (Big Bang → Cuneiform → Roman Empire → Renaissance → DNA →
  Andromeda collision) rather than a modern clump — the importance-anchoring strategy (LD3)
  paying off. Lane churn rose (56 → ~444 hops over the sim) with the higher density; still
  overlap-free, but a signal that sticky-lane tuning may want revisiting if it reads jittery.
- **GitHub Pages project sites serve from `/<repo>/`, not the domain root.** Vite must
  build with `base: '/TimelineOfEverything/'` or every asset URL in the built
  `index.html` 404s. `vite preview` serves at the same base path, so the prefix is
  testable locally. (→ D8)
- **Resize can be treated as "rebuild everything".** The render effect already tears
  down and rebuilds the whole SVG scene per run; piping a debounced ResizeObserver into
  its deps — with the view saved as `{scale, centerFrac}` in domain-fraction units and
  restored when the domain matches — gives correct responsive behavior with zero
  incremental-relayout code. At 191 events a rebuild is imperceptible. (→ D10)
- **Symlog compresses recent history so hard that intuition about zoom range fails.**
  Years 1700–2026 occupy ~0.4% of the transformed axis, so a "generous" 50× max zoom
  left decades-apart events 1–2px apart — clusters could never expand. Max zoom must be
  ~1000×+ (now 5000×). Corollaries: zoom animations must interpolate in log-scale space,
  and axis ticks must be generated for the *visible window* (d3's symlog ticks are linear
  over the full domain — bunched at the edges when wide, absent entirely when zoomed).
- **Culling at the exact viewport edge is visible; culling one label-width out is free.**
  Any per-frame admission test at x∈[0, width] makes marks pop into existence at the
  border during pans (the "edge flicker"). Widening only the admission window (~one max
  label width, LD10) moves every enter/exit/re-key off-screen at negligible cost — and
  the property "no label may newly appear with on-screen pixels during a pure pan" is
  machine-checkable, so it's now a gated verify-layout invariant.
- **Emulated-mobile perf: pan is cheap, zoom is the budget.** Headless Edge + CDP with
  touch dispatch and CPU throttling (4×/6×) is a decent phone proxy. Translation-only
  gestures hold ~60fps+ at 6× (sticky lanes + overscan keep the scene identical), while
  pinch re-runs admission at a changing scale every frame — label enter/exit, chip
  re-keying, D3 join/transition churn — landing at 37–51fps with spiky jank. If real
  hardware stutters, throttle the full repack to alternate frames during active pinches.

---

## 9. References

- Big Bang timing: [NASA WMAP](https://wmap.gsfc.nasa.gov/)
- Geologic timescale: [Wikipedia](https://en.wikipedia.org/wiki/Geologic_time_scale)
- Blue LED: [Nobel Prize in Physics 2014](https://www.nobelprize.org/prizes/physics/2014/summary/)
