# TimelineOfEverything — Design Doc

> **Living document.** This is the project's persistent memory and warm-start context.
> Keep it current: when a decision is made, log it; when a question arises, record it;
> when something is learned, capture it. The README is the *public* description of the
> project; this doc is the *working* brain behind it.

**Last updated:** 2026-07-21

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
| [`precision-rendering.md`](docs/design/precision-rendering.md) | Surfacing event date precision (Q6): dashed dots, faded bar ends, and a text prefix mark, all funneled through `formatYearRange()`. |

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
  - `scripts/make-icons.mjs` — regenerates `public/` icons + the OG card from one
    artwork definition (`npm run icons`); output is committed, so this only runs
    when the artwork changes (D16).
  - `src/data.js` — loads + sorts events, category helpers, `filterEvents()` +
    search suggestions.
  - `src/format.js` — shared display helpers (year formatting, category colors).
  - `src/components/SiteFooter.jsx` + `LegalModal.jsx` + `src/legalContent.js` —
    the footer credit/links line and the bilingual privacy & credits dialog (D17).
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
| `subcategory` | string              | ✅* | The event's **primary** classifier: one value from a **controlled set per category** (below). Now required in practice and gated by verify:layout, though schema-optional for back-compat. |
| `tags`        | string[]            | ✅* | **Cross-cutting threads** (geography, recurring motifs) that connect events *across* categories/subcategories. Each tag must be carried by **≥2 events** and must **not** restate the event's own subcategory. Gated by verify:layout. |
| `precision`   | string              | ⬜  | `exact` (default) \| `approximate` \| `estimated` \| `speculative`. Intended to later drive fuzzy rendering. |
| `links`       | Link[]              | ⬜  | Relations to other events. |
| `sources`     | Source[]            | ⬜  | Provenance. Still thin dataset-wide (a separate backfill). |
| `importance`  | number              | ⬜  | Hand-tagged label priority in [0, 1]; overrides the derived heuristic (use 0.9–1.0 so anchors always outrank it). Future Wikipedia-derived ranking slots in here. See [`docs/design/label-decluttering.md`](docs/design/label-decluttering.md) §5. |

\* `subcategory`/`tags` are structurally optional (a bare v1 point-event still
parses) but the **data-quality gate** in `verify:layout` requires both on every
event, so a new event without them fails CI. This is the Q5 resolution (D14).

### Subcategory — controlled vocabulary (D14)
One per event, from its category's set. `verify:layout` fails on any value
outside these, so the vocabulary can't silently grow near-duplicates.
- **natural:** cosmology, planetary, geology, biology
- **history:** prehistory, society, politics, culture, religion, philosophy, economics, law, exploration
- **science:** physics, astronomy, chemistry, biology, mathematics, medicine, geology, philosophy, institution
- **technology:** industry, electronics, computing, communication, transport, materials, navigation, spaceflight, imaging, internet, appliances, ai
- **future:** cosmology, planetary, environment

### Tags — cross-cutting threads (D14)
Freeform *values*, but governed by two machine-checked rules: **≥2 events per
tag** (a singleton is a dead-end filter in the search dropdown) and **never
equal to the event's own subcategory** (the dropdown suggests subcategories
separately). 76 tags at 191 events; the strongest threads are geographic
(`greece`, `china`, `europe`, `india`, `americas`, `rome`, `mesopotamia`,
`germany`, `usa`) and thematic (`empire`, `war`, `evolution`, `deep-time`,
`electricity`, `computing`, `space`, `genetics`, `nuclear`).

### Link
`{ "to": <eventId>, "type": string, "note"?: string }`
- Suggested `type` values: `related`, `causes`, `precedes`, `partOf`, `contrasts` (freeform allowed).
- Stored **directionally**; the renderer mirrors at load (D9).

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
- **D14 — Taxonomy: controlled subcategories + cross-cutting tag threads
  (closes Q5).** Search (D12) put the vocabulary on screen, exposing its rot:
  52 events had no tags/subcategory, 71 of 122 tags were singletons (dead-end
  filters), and 14 tags merely restated a subcategory. Fix: (1) `subcategory`
  is now a **controlled set per category** (schema §4), one per event, required;
  (2) `tags` are **cross-cutting threads** — each carried by ≥2 events, never
  equal to the event's own subcategory. Result: 122 → 76 tags, all ≥2, every
  event fully classified. Enforced by a new `verify:layout` data-quality gate
  (unknown subcategory / missing subcategory / singleton tag / tag==subcategory
  all fail CI), so the vocabulary can't rot again — this is the same
  "verify the shipped data" discipline as the layout invariants. The retag was
  a one-shot transform (explicit subcategory+tags per id, self-asserting before
  writing); `events.json` was also normalized to a consistent key order. Not in
  scope: `sources` (still thin dataset-wide) and `precision` backfill, and
  whether the *subcategory* set itself is final (a few 1–2 member buckets like
  `law`, `appliances`, `ai` could later merge). *Sub-answers SF-Q3.*
- **D15 — Precision rendering (closes Q6): binary dashed/solid on canvas, 3-way marks in
  text.** `precision` (schema §4) had been read nowhere despite 74/191 events already
  carrying a non-default value. Dots get one orthogonal signal — a dashed vs solid stroke,
  set once at creation, layered under the existing labeled/unlabeled r+fill-opacity encoding
  rather than fighting it. Bars fade at their ends via a per-category SVG gradient
  (`objectBoundingBox`, so one def serves every bar width) — closes SR-Q2. Every text
  surface gets a prefix mark (`~` approximate, `≈` estimated, `?` speculative) through the
  single `formatYearRange()` helper, so tooltip/modal/chip-list/search all update from one
  change; the modal additionally gets a small dashed pill spelling out the word. Full 3-way
  resolution lives in text only — a dot's stroke has room for one bit, not three. Gated by a
  new `verify:layout` enum check mirroring D14's `SUBCATS` pattern. Detail in
  [`docs/design/precision-rendering.md`](docs/design/precision-rendering.md).
- **D16 — Site identity & link previews (first slice of "generic web basics", Q10).**
  The app still shipped Vite's default `vite.svg` favicon and a bare `<head>`, so
  sharing the URL anywhere produced a naked link — bad for a project whose whole
  value is visual. Added: a description, canonical URL, Open Graph + Twitter card
  meta, a real icon set, and a web manifest (installable, matching the mobile work
  in D10/D11/D13). *Key choice:* all raster assets are **generated, not
  hand-drawn** — `scripts/make-icons.mjs` derives the favicon, PWA icons, Apple
  touch icon and the 1200×630 OG card from a single `iconSvg()` definition, so
  they can't drift; it rasterizes by screenshotting headless Edge over CDP,
  reusing the no-Playwright approach already established by the mobile harness.
  The mark is the project's own visual language reduced to what survives 16px: a
  spine with three category-colored dots whose gaps shrink rightward (the symlog
  compression). Two base-path traps that this resolves (see §8): `og:image` must
  be an absolute URL, and manifest-internal paths are resolved by the *browser*,
  not Vite. Also dropped the unreferenced `vite.svg` / `react.svg` template
  leftovers. Deliberately **not** added: `robots.txt`/`sitemap.xml` (a project
  site lives at `/TimelineOfEverything/`, so crawlers only ever read
  `ybachmann.github.io/robots.txt` — one in our subpath is dead weight), a cookie
  banner (nothing to consent to), and a CSP meta (no network calls to constrain).
- **D17 — No Impressum; a Datenschutzerklärung still ships (partial Q10).** German
  § 5 DDG binds *geschäftsmäßige* digital services; this is an unmonetized personal
  project with no ads, affiliates, or client work, so it rests on the private-use
  exemption. Weighed against the alternative — a private person's Impressum needs a
  ladungsfähige Anschrift (a P.O. box does not satisfy case law), i.e. publishing a
  home address — the exemption is the better trade at this project's profile.
  *Revisit if* the site is ever monetized, used commercially, or fronts paid work.
  DSGVO Art. 13 is **separate and still applies**: GitHub Pages logs visitor IPs
  via a US provider, so a short privacy notice is owed regardless of commercial
  character. That notice is cheap and honest here — no cookies, no analytics, no
  CDN fonts, dataset bundled into the JS. *(Not legal advice; a decision recorded
  so it isn't silently re-litigated.)*
  **Shipped as:** a one-line always-visible footer (author credit → GitHub profile,
  repo link, and a "Privacy & credits" button) plus a dialog holding the notice.
  Three things that fell out of the build:
  - *Where the footer lives.* `.timeline-info` was the natural host but is
    `display:none` on phones (D10's compact chrome), and a privacy notice has to be
    reachable at every breakpoint — so the footer is its own element, one 25px line,
    since chart height is this layout's scarce resource. Machine-checked at three
    viewports.
  - *Not reusing `.event-modal-overlay`.* Timeline's double-tap handler keys off that
    exact class to decide a tap hit a backdrop (D11), so sharing it would let a
    double-tap on the dialog drive timeline zoom. Separate `.legal-*` classes keep
    the surfaces uncoupled.
  - *Focus restore belongs to the opener, not the dialog.* Restoring from whatever
    `document.activeElement` was at mount silently fails when the trigger was never
    focused (Safari doesn't focus buttons on click; programmatic `.click()` doesn't
    either) and dumps focus on `<body>`. `SiteFooter` holds a ref to its own trigger
    and restores on close. The dialog otherwise ships the keyboard contract the older
    Timeline modals still lack — Escape, focus-in, Tab trap — which the Q10
    accessibility pass should copy rather than reinvent.
  The claim the copy makes ("no cookies, no storage, no requests after load") was
  verified against the source, not assumed: zero storage APIs, zero `fetch`/XHR/
  beacon calls, zero external URLs anywhere in `src/`.

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
- ~~**Q5 — Taxonomy.**~~ — answered (D14): `subcategory` is a controlled set per category
  (one per event, required), `tags` are cross-cutting threads (≥2 events each, never
  restating a subcategory); both gated by verify:layout. Closes SF-Q3 (the singleton /
  near-duplicate tags search surfaced). Still open, smaller: whether the 5 top-level
  categories are final, and whether a few 1–2 member subcategories should merge.
- ~~**Q6 — Precision in the UI.**~~ — answered (D15): dashed vs solid dot stroke (binary,
  orthogonal to the existing labeled/unlabeled encoding), faded bar ends via a per-category
  gradient (closes SR-Q2), and a text prefix mark (`~`/`≈`/`?`) funneled through
  `formatYearRange()` everywhere a date displays; the detail modal also gets a precision pill.
  See [`docs/design/precision-rendering.md`](docs/design/precision-rendering.md).
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
- **Q10 — "Generic but important" web basics.** The things every public site owes
  its visitors, which a feature-driven build never surfaces on its own. Audited
  2026-07-21; splitting into three passes:
  - *Site identity & previews* — **answered (D16)**: favicon/icon set, OG + Twitter
    cards, description, web manifest.
  - *Legal* — **answered and shipped (D17)**: no Impressum (private-use exemption);
    the Datenschutzerklärung owed under DSGVO Art. 13 ships bilingually (DE/EN,
    defaulting to the browser locale) in a footer dialog, together with the on-site
    source attribution that settles the tension between the all-rights-reserved
    LICENSE and a dataset derived from CC-BY-SA sources.
  - *Accessibility & robustness* — **open**, and not box-ticking here: nothing in
    `src/` honors `prefers-reduced-motion` despite shipping era flights, momentum
    glides and edge fades; the detail/cluster modals have no Esc, no focus trap and
    no `role="dialog"`; the search box lacks `role="combobox"`/`aria-expanded`/
    `aria-activedescendant` so its dropdown cursor is invisible to screen readers;
    focus-visible styling is a single `:focus-within`; and an uncaught Timeline
    throw white-screens the app (no error boundary). Full keyboard navigation of
    the timeline is bigger and stays with Q1.

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
- [x] Backfill `subcategory`/`tags` across **all** events + taxonomy cleanup (D14): every
      event now has a controlled subcategory and ≥1 cross-cutting tag; 122→76 tags, all
      ≥2 uses, none restating a subcategory; gated by verify:layout. **Still open:**
      `sources` (thin dataset-wide) and `precision` backfill remain.
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
- [x] Surface `precision` visually (Q6) — dashed dots, faded bar ends (closes SR-Q2), text
      prefix marks, modal pill; gated by verify:layout. See
      [`docs/design/precision-rendering.md`](docs/design/precision-rendering.md).
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

**Ops / site basics (Q10):**
- [x] Deploy POC (Q7) — GitHub Pages + Actions CI (D8).
- [x] Site identity & link previews (D16) — generated icon set + OG card
      (`npm run icons`), description, canonical, web manifest.
- [x] Datenschutzerklärung + footer + on-site source attribution (D17) — bilingual
      dialog behind an always-visible footer line; no Impressum by decision.
- [ ] Accessibility pass — `prefers-reduced-motion`, modal Esc/focus-trap/
      `role="dialog"`, combobox ARIA, focus-visible styles, error boundary (Q10).

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
- **Vite's `base` rewrite covers element attributes, not strings it can't see.** In
  `index.html` a root-relative `href`/`src` is rewritten (`/favicon.svg` →
  `/TimelineOfEverything/favicon.svg`), which is why the icon links "just work". Two
  things it does *not* touch: `<meta content="...">` (so `og:image` would stay
  base-less — and social scrapers require an absolute URL anyway, so hardcode the
  full origin) and the contents of `public/` files like `manifest.webmanifest` (JSON
  Vite never parses). The manifest sidesteps this without hardcoding the base at all:
  per spec its `src`/`start_url` resolve against the *manifest's own URL*, so plain
  relative values (`"./"`, `"icon-192.png"`) land correctly under any base. (→ D16)
- **One `objectBoundingBox` gradient serves every bar width.** Fuzzy-span end-fades needed a
  gradient keyed by category, not by each span's actual pixel geometry — `gradientUnits`
  defaults to `objectBoundingBox` (0–1 relative to each shape's own box), so 5 defs (one per
  category) cover all 32 spans regardless of how wide any individual bar renders at a given
  zoom. (→ D15)

---

## 9. References

- Big Bang timing: [NASA WMAP](https://wmap.gsfc.nasa.gov/)
- Geologic timescale: [Wikipedia](https://en.wikipedia.org/wiki/Geologic_time_scale)
- Blue LED: [Nobel Prize in Physics 2014](https://www.nobelprize.org/prizes/physics/2014/summary/)
