# TimelineOfEverything — Design Doc

> **Living document.** This is the project's persistent memory and warm-start context.
> Keep it current: when a decision is made, log it; when a question arises, record it;
> when something is learned, capture it. The README is the *public* description of the
> project; this doc is the *working* brain behind it.

**Last updated:** 2026-07-25 (D21–D24)

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
| [`responsive-layout.md`](docs/design/responsive-layout.md) | Flex-fill chart sizing, a `ResizeObserver` rebuild that restores the view from a domain-fraction snapshot, and the small-screen chrome (D10). *Retroactive doc.* |
| [`touch-gestures.md`](docs/design/touch-gestures.md) | Touch & drag gestures: pointer-event pan/pinch, slop + capture + click suppression, `touch-action: pan-y` scoping. |
| [`search-filtering.md`](docs/design/search-filtering.md) | Search & tag/subcategory filtering: the combobox search box, suggestion dropdown with contextual counts, pinned AND-chips, event-title lookup. |
| [`mobile-polish.md`](docs/design/mobile-polish.md) | Coarse-pointer pass (D13): 44px hit targets, press-and-hold preview, edge overscan + border fade; a hub over `touch-gestures.md §5` + `label-decluttering.md` LD10. *Retroactive doc.* |
| [`tag-taxonomy.md`](docs/design/tag-taxonomy.md) | The controlled `subcategory` vocabulary + cross-cutting `tags` threads, and the `verify:layout` gate that keeps both clean (D14). *Retroactive doc.* |
| [`precision-rendering.md`](docs/design/precision-rendering.md) | Surfacing event date precision (Q6): dashed dots, faded bar ends, and a text prefix mark, all funneled through `formatYearRange()`. |
| [`site-metadata.md`](docs/design/site-metadata.md) | Site identity & link previews (D16): a generated icon set + OG card, OG/Twitter meta, web manifest, and the Vite base-path traps. *Retroactive doc.* |
| [`legal-privacy.md`](docs/design/legal-privacy.md) | Legal & privacy (D17): no Impressum but a bilingual Datenschutzerklärung, the footer + attribution, and the dialog contract D18 later extracts. *Retroactive doc.* |
| [`accessibility.md`](docs/design/accessibility.md) | Reduced motion, the shared dialog shell + focus ownership, combobox ARIA, focus-visible, error boundary; machine-gated by `verify:a11y`. |
| [`keyboard-navigation.md`](docs/design/keyboard-navigation.md) | The chart as one tab stop with an event cursor: time-order stepping, camera follow, the cursor as render state, and the live region that makes it the chart's screen-reader representation. |
| [`data-sourcing.md`](docs/design/data-sourcing.md) | Wikidata reconciliation + enrichment: a QID per event via variant search + confidence-tiered matching, a human-gated review file, Wikipedia `sources` backfill, and a date audit — automating provenance while selection stays editorial. |
| [`contrast.md`](docs/design/contrast.md) | Measuring the dark theme (A-Q3): a browser state-walk over 118 surfaces because ten foreground colors exist only at run time, the 17 palette fixes it forced, and the five shortfalls kept on purpose. |
| [`palette-tokens.md`](docs/design/palette-tokens.md) | Naming what D23 measured: a `:root` token layer, eleven text greys collapsed to a five-step ramp, and `--knockout` split from `--bg` so a background layer behind the chart has one seam to move. |

### Feature ↔ branch ↔ design-doc map

Intentionally **not 1:1**: a feature can span several branches (`span-rendering` +
`span-lanes`), one doc can be shaped by several branches (`label-decluttering`), and a few
shipped features have no dedicated deep-dive — their entry in the decisions log below is
enough. Ordered by decision (≈ merge order). **ⓡ** marks a doc written *retroactively* — a
disclaimer sits at the top of each.

| Decision | Feature / work | Branch(es) — PR | Design doc |
|---|---|---|---|
| D1–D4 | Prototype foundation | `feature/crude_pre_alpha_prototype` #3 | — |
| — | Cluster chips | `feature/cluster-chips` #4 | — |
| D5 | Span rendering (`endYear` bars) | `feature/span-rendering` #5 · `feature/span-lanes` #8 (dot-halo follow-up) | [`span-rendering.md`](docs/design/span-rendering.md) |
| — | Dataset expansion | `feature/dataset-expansion` #6 | — |
| D6 | Navigation / orientation | `feature/navigation` #7 | [`navigation.md`](docs/design/navigation.md) |
| D7 | Label de-cluttering | origin `feature/crude_pre_alpha_prototype` #3; refined in #7 & `feature/mobile-polish` #14 | [`label-decluttering.md`](docs/design/label-decluttering.md) |
| D8 | Deploy to GitHub Pages | `chore/deploy-gh-pages` #9 | — |
| D9 | Event links | `feature/event-links` #10 | [`event-links.md`](docs/design/event-links.md) |
| D10 | Responsive layout | `feature/responsive-layout` #11 | [`responsive-layout.md`](docs/design/responsive-layout.md) ⓡ |
| D11 | Touch & drag gestures | `feature/touch-gestures` #12 | [`touch-gestures.md`](docs/design/touch-gestures.md) |
| D12 | Search & tag/subcategory filtering | `feature/search-filtering` #13 | [`search-filtering.md`](docs/design/search-filtering.md) |
| D13 | Mobile polish | `feature/mobile-polish` #14 | [`mobile-polish.md`](docs/design/mobile-polish.md) ⓡ |
| D14 | Tag & subcategory taxonomy | `feature/tag-taxonomy` #15 | [`tag-taxonomy.md`](docs/design/tag-taxonomy.md) ⓡ |
| D15 | Precision rendering | `feature/precision-rendering` #16 | [`precision-rendering.md`](docs/design/precision-rendering.md) |
| D16 | Site identity & link previews | `feature/site-metadata` #17 | [`site-metadata.md`](docs/design/site-metadata.md) ⓡ |
| D17 | Legal / privacy (Datenschutz, footer) | `feature/legal-privacy` #18 | [`legal-privacy.md`](docs/design/legal-privacy.md) ⓡ |
| D18 | Accessibility & robustness | `feature/accessibility` #19 | [`accessibility.md`](docs/design/accessibility.md) |
| D19 | Keyboard navigation | `feature/keyboard-navigation` #20 | [`keyboard-navigation.md`](docs/design/keyboard-navigation.md) |
| D20 | Data sourcing — Wikidata reconcile + enrich | `feature/data-enrichment` #21 (doc named `data-sourcing`) | [`data-sourcing.md`](docs/design/data-sourcing.md) |
| D21 | `precision` backfill (coarsen-only) | `feature/precision-backfill` #23 | [`data-sourcing.md`](docs/design/data-sourcing.md) §6 (extends D20's doc) |
| D22 | Legible fuzzy-date cue (soft rim + label marks) | `feature/precision-backfill` #23 | [`precision-rendering.md`](docs/design/precision-rendering.md) §2 (revises D15) |
| D23 | Contrast audit + gate (closes A-Q3) | `feature/contrast-audit` #24 | [`contrast.md`](docs/design/contrast.md) |
| D24 | Palette tokens + grey consolidation | `feature/palette-refresh` #25 | [`palette-tokens.md`](docs/design/palette-tokens.md) |

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
  - `src/components/Timeline.jsx` — the D3 SVG timeline (rendering, zoom/pan,
    gestures, keyboard cursor, tooltip, modals).
  - `src/timelineLayout.js` — pure layout logic: label priority, lane packer, +N clusterer.
  - `scripts/verify-layout.mjs` — invariant checker over the real layout module
    (`npm run verify:layout`).
  - `scripts/cdp-mobile.mjs` — headless-Edge harness (mobile + desktop profiles)
    driving `verify-touch.mjs` (touch behavior), `perf-mobile.mjs` (gesture
    frame-times), `verify-a11y.mjs` (keyboard/ARIA/reduced motion) and
    `verify-contrast.mjs` (WCAG contrast over a state walk, D23); all four
    need `npm run build` first.
  - `scripts/make-icons.mjs` — regenerates `public/` icons + the OG card from one
    artwork definition (`npm run icons`); output is committed, so this only runs
    when the artwork changes (D16).
  - `scripts/wikidata-lib.mjs` + `reconcile-wikidata.mjs` + `enrich-wikidata.mjs`
    — the data-sourcing pipeline (D20): reconcile events to Wikidata QIDs via a
    human-gated review file (`data/wikidata-review.json`), then backfill Wikipedia
    `sources` + `precision` (coarsen-only, D21) and audit dates. Networked at run
    time; output committed.
    (`npm run data:reconcile` / `data:reconcile:apply` / `data:enrich` / `data:audit`.)
  - `src/data.js` — loads + sorts events, category helpers, `filterEvents()` +
    search suggestions.
  - `src/format.js` — shared display helpers (year formatting, category colors,
    precision marks, and `labelTextFor()` — the one source of truth for what an
    on-canvas label says, so the packer measures the string it draws, D22).
  - `src/settings.js` — display preferences. Compile-time constants today, shaped
    so they can move behind a settings menu without touching call sites (PR-Q4).
  - `src/components/SiteFooter.jsx` + `LegalModal.jsx` + `src/legalContent.js` —
    the footer credit/links line and the bilingual privacy & credits dialog (D17).
  - `src/components/Modal.jsx` — the shared dialog shell (role/aria-modal,
    Escape, focus-in, Tab trap) behind every modal surface; `ErrorBoundary.jsx`;
    `src/motion.js` — the live `prefers-reduced-motion` read (D18).
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
| `precision`   | string              | ⬜  | `exact` (default) \| `approximate` \| `estimated` \| `speculative`. Drives fuzzy rendering (D15) — dashed dots, faded bar ends, a `~`/`≈`/`?` text mark. Backfilled from Wikidata date-precision under a coarsen-only rule (D21); present on 87/191. Gated by verify:layout: in-vocab, and never `exact` in deep time or before the written record. |
| `links`       | Link[]              | ⬜  | Relations to other events. |
| `wikidata`    | string              | ⬜  | The event's Wikidata QID (`Q323`). A durable join key and itself provenance; the anchor for all enrichment. Present on 171/191 (20 are deliberately unreconciled — see D20). Gated by verify:layout (well-formed, dataset-unique). |
| `sources`     | Source[]            | ⬜  | Provenance. Backfilled from `wikidata` (D20): one English-Wikipedia ref per reconciled event, tagged `via:"wikidata"`; hand-curated sources are kept. 171/191 now sourced (was 2). |
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
`{ "label": string, "url"?: string, "via"?: string }`
- `via:"wikidata"` marks an auto-generated source (D20) so `enrich-wikidata` can
  regenerate it idempotently without touching hand-curated entries.

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
- **D18 — Accessibility & robustness pass (closes Q10).** Five concrete defects,
  not a checklist: nothing read `prefers-reduced-motion` despite shipping era
  flights, momentum glides and entry flights; the timeline modals had no
  `role="dialog"`, Escape or focus handling; the search box's keyboard cursor
  existed only as a CSS highlight; focus-visible styling covered only the
  surfaces D17 shipped; and a Timeline throw white-screened the app. Decisions:
  - *Extract, don't copy.* D17's dialog contract moved out of `LegalModal` into a
    shared `Modal` shell now used by all three dialogs — "our dialogs are
    accessible" becomes a property of one file instead of a habit three files
    keep. Class names stay per-caller because Timeline's double-tap handler keys
    off the literal `event-modal-overlay` class (D11).
  - *Focus restore is the opener's job* — D17's finding, now load-bearing: the
    timeline's openers are SVG marks, which cannot hold focus at all, so
    `document.activeElement` is `<body>` in the **normal** case. `Timeline`
    restores to the remembered opener (the search input, when opened from the
    dropdown) or else to the chart, which gained `tabIndex={-1}` for exactly
    that — programmatically focusable, deliberately not a Tab stop, since it has
    no keyboard interaction to offer yet.
  - *Reduced motion via three doors, all reading the query live* — `anim()` for
    D3 transitions, `animateTo()` for flights, `startGlide()` for momentum, plus
    a blanket CSS block. Read live (never snapshot into state) so the setting can
    flip mid-session with no rebuild; and `anim()` applies the end state directly
    rather than using `duration(0)`, which would still defer a frame and make
    enter-fading marks flicker. Direct manipulation (drag-pan, pinch) is
    untouched — only self-propelled motion is suppressed.
  - *Combobox ARIA over roving tabindex* — `aria-activedescendant` maps onto the
    existing `activeIdx` with no logic change, and doesn't fight the
    mousedown-preventDefault / blur-closes-list plumbing (D12).
  - *Ctrl+F (and `/`) belong to the app's search here* — only the ~35 titles the
    packer currently places exist as DOM text and no description/tag text ever
    does, so find-in-page searches a shifting fraction of the data and misses
    events that are on screen. Guarded so `/` still types inside a text field and
    neither key escapes an open dialog, and announced in the control hints — an
    undiscoverable override is the bad kind.
  - *One error boundary per blast radius* — around the chart (header, filters and
    the privacy notice survive a Timeline throw, with a working retry) and one at
    the root as a last resort. Does not catch throws inside D3 handlers, which
    run outside React's stack.
  Gated by `npm run verify:a11y` — 30 headless-Edge checks including a control
  case proving the reduced-motion check isn't passing against a dead button.
  Detail in [`docs/design/accessibility.md`](docs/design/accessibility.md).
- **D19 — Keyboard navigation of the chart, which is also its accessible
  representation (closes A-Q1, A-Q2 and NAV-Q3).** Three tickets in three docs
  described one hole: after D18 the app's chrome was keyboard-complete but the
  chart in the middle could only be *driven* by a pointer and only be *read* by
  eye — `aria-label="Interactive timeline"` was everything a screen reader got
  for 191 events. The fix is a single mechanism, which is why the three close
  together:
  - *One tab stop with a managed cursor.* The chart is `tabIndex={0}` and holds
    a cursor the arrow keys move. Rejected: a tab stop per event (191 of them
    would make Tab useless for leaving the chart) and a parallel hidden list of
    the events (a second renderer of the same data, free to drift — and it would
    have fixed the screen-reader half while leaving keyboard users with nothing).
  - *One cursor, three outputs* — a ring plus the existing preview tooltip
    (sighted keyboard users), a live region speaking `title. year. category.
    N of M.` (screen readers), and `Enter` into the same detail modal a click
    opens (both). That is what makes it one feature rather than two.
  - *Stepping is in time order*, not on-screen order: which events are labeled,
    bare, or inside a `+N` chip is a function of the zoom level, so "next" would
    otherwise mean something different at every scale.
  - *The cursor is a render state, not a hover effect.* `setHighlight` (the
    hover triad) cannot carry it: every `render()` rewrites every dot radius,
    leader opacity and label fill from the resting-value helpers, and hover only
    survives because hovering never moves the camera. Folding the cursor into
    those helpers instead makes it survive pans, flights and rebuilds for free.
  - *The camera follows only when the cursor would leave a 12% comfort band*,
    via the era-preset flight (so reduced motion is inherited, not
    reimplemented). Zoom keys are instant, matching the wheel.
  - *`role="application"`* so arrow keys reach the handler instead of the screen
    reader's browse cursor, and an accessible name carrying the shape of the
    data (`"191 events from … to …"`, recomputed per filter) — a name that
    answers "what is in here?" before the cursor answers "what is this?".
  - *The cursor is exempt from clustering*, so a navigated-to event is always a
    visible mark. Its label is deliberately **not** force-placed: evicting a
    label that legitimately won its lane costs more than a title the preview
    tooltip already shows.
  Gated by 15 new `verify:a11y` checks (45 total), including one that walks five
  events at the fitted view — where most events *are* inside chips — to prove
  the clustering exemption is real. Detail in
  [`docs/design/keyboard-navigation.md`](docs/design/keyboard-navigation.md).
- **D20 — Data sourcing: enrich the curated set from Wikidata; don't
  auto-generate events (answers Q4).** Q4 asked when hand-curation stops scaling.
  It's two jobs with two answers: *selection + narrative* is the product and
  never stops being hand-work (auto-generating events would dilute the editorial
  density that makes this a timeline); *provenance + canonical facts* already
  stopped — the tell was `sources: 2/191`. So the pipeline automates only the
  second job. Wikidata fits: its facts are **CC0** (no attribution burden — eases
  the D17 LICENSE/CC-BY-SA tension), reachable with no backend, so the tooling is
  a build-time "generate, commit the output" script like `make-icons` (no
  violation of D1). Shipped: a `wikidata` QID per event (durable join key + the
  anchor for all future enrichment), reconciled by `reconcile-wikidata` (variant
  search + confidence-tiered matching → a human-gated review file → `--apply`),
  and a Wikipedia `sources` backfill + date audit by `enrich-wikidata`. Result:
  **171/191 reconciled, sources 2 → 171**; 20 deliberately `none` (speculative
  futures, vague eras, commodity "first-commercial-X"). The date audit found **no
  data errors** (35 flags are person-birth-year artifacts or defensible
  range/definitional differences; a few show *ours* is more accurate). The
  decisive lesson: **a recalled QID is worthless, a read/searched QID is
  reliable** — batch-verification caught ~16 memory-recalled QIDs pointing at
  unrelated entities (abiogenesis→"Envy", Sputnik→"James Bond"), so every QID was
  read off a search result and machine-verified. Gated by a new `verify:layout`
  provenance block (offline). Deliberately **not** built: the README's bulk-SPARQL
  "Full Version" pipeline — it solves a volume problem we don't have at the cost
  of the editorial layer. Detail in
  [`docs/design/data-sourcing.md`](docs/design/data-sourcing.md).
- **D21 — `precision` backfill from Wikidata, under a coarsen-only rule
  (closes DS-Q2).** D15 shipped a full rendering tier for `precision` and then
  117/191 events carried no value — and absent means `exact`, so the dataset was
  asserting a *known year* for the Formation of the Solar System
  (−4,600,000,000). Wikidata time values carry an integer precision (11 = day,
  9 = year, 6 = millennium, 0 = 1e9 years) plus qualifiers, which maps cleanly
  onto our four tiers; the trap is that "circa 1500" is stored at *year*
  precision with a `sourcing circumstances = circa` qualifier, so the integer
  alone lies. Decisions:
  - *A proposal may only ever coarsen.* The tiers are ordered, and the backfill
    applies one only when it is fuzzier than what the data already claims. This
    is what makes the step safe to auto-apply with no second review file:
    sharpening is the destructive direction, and the dataset was over-confident
    by construction. Three payoffs fall out of the one rule — it neutralizes the
    person-QID problem (DS-Q1: an event mapped to a person reads a day-precise
    *birth date*, which would have flattened "Life of the Buddha" to `exact`);
    it protects `speculative` (the Andromeda collision has a real billion-year
    date that proposes `estimated` — a downgrade of a projection to an estimate);
    and it makes hand corrections stable under re-runs, i.e. idempotent.
  - *`speculative` is never machine-proposed.* Nothing in Wikidata says "this has
    not happened yet"; that tier stays editorial.
  - *The held list is the review surface.* 8 coarsened, 22 held, 64 with no dated
    claim; the 22 are printed with the property and precision that produced them.
    Reading them vindicated the rule — nearly all are Wikidata storing a
    *conventional* date at year precision (Han Dynasty, Mongol Empire) — and none
    were worth sharpening.
  - *An invariant for what the pipeline is structurally blind to.* Coarsening
    needs a date to read, and concept/material items (`wheel`, `steel`,
    `Formation of the Solar System`) carry none — five nonsense-`exact` events
    survived the pass, and no pipeline tuning would find them. So `verify:layout`
    gets the claim itself: an event cannot be `exact` in **deep time**
    (|year| ≥ 1e6 — the value is a rounded estimate by construction) or **before
    the written record** (year < −3000 — there is no record to be exact from).
    Offline, and it fires on exactly the class the pipeline can't see. Those five
    plus two of the same family inside the record (`Discovery of Steel` −1200,
    `Discovery of Electricity` −600 — conventional attributions, not dates) were
    set by hand. Result: `precision` present on 87/191 (was 74). Detail in
    [`docs/design/data-sourcing.md`](docs/design/data-sourcing.md) §6.
- **D22 — The fuzzy-date cue moves from the dot's stroke to its fill (revises
  D15, closes PR-Q1).** D21 filled the field; looking at the result showed the
  rendering couldn't carry it — the dashed ring needed deliberate zooming and
  close inspection to tell from a solid one. Not a tuning miss: the dash was a
  ~3.5px-period modulation of a **1px, 0.35-opacity** white hairline (~8 dashes
  with 1.5px gaps around a 28px circumference), and on unlabeled dots
  `stroke-opacity` is 0, so it was *literally invisible* there. The general
  lesson: **a signal cannot ride as a high-frequency modulation of a channel
  that is itself near the threshold of visibility.** Decisions:
  - *Fade the rim instead.* A fuzzy dot's fill is a `radialGradient` that fades
    over its outer 35% — the same "uncertain = soft-edged" metaphor already
    shipped for fuzzy span bars, turned radial, reusing the `objectBoundingBox`
    trick so five defs serve every dot at every radius. Uncertain *looks*
    uncertain, pre-attentively, with no neighbour to compare against.
  - *Rejected: brighten the ring.* It would add visual weight in proportion to
    fuzziness — orthogonal to importance, and directly against the
    de-cluttering hierarchy (LD3) whose whole job is keeping the brightest
    pixels on the most important marks. Fading **subtracts** contrast instead.
  - *A fuzzy dot forgoes the labeled white ring entirely* — it would redraw a
    hard edge exactly where the gradient is softening. Labeled-vs-unlabeled
    still reads through `r` and `fill-opacity`. And because the cue now rides
    `fill` rather than `stroke-opacity`, it survives de-cluttering — which is
    what closes PR-Q1.
  - *The text marks finally reach the canvas.* Placed labels rendered
    `event.title` alone, so `~`/`≈`/`?` existed everywhere except the chart.
    They now prefix placed labels, behind `settings.precisionMarksOnLabels`.
    **One function** (`labelTextFor`) feeds the width measurer, the `.text()`
    call *and* verify-layout's approximation — measuring `title` while drawing
    `~ title` would under-reserve space and reintroduce overlaps. It costs
    labels (default view 35 → 33, overscan 303 → 310px), which is why it's a
    setting; flipping it off restores those numbers exactly, which is how the
    toggle is verified live rather than decorative. No UI yet (PR-Q4). Detail in
    [`docs/design/precision-rendering.md`](docs/design/precision-rendering.md) §2.
- **D23 — Contrast measured, not guessed (closes A-Q3).** A-Q3 named two greys
  as suspects; measuring scored one from two (`#6f779c` footer guilty at 4.34:1,
  `#8a90b8` axis ticks innocent at 6.12:1) and found the real worst failure
  somewhere nobody had looked: **white text on the light category badges —
  `history` teal at 1.93:1**, under half the minimum. Dark-on-dark was the
  assumed failure mode; light-on-light was the actual one. Decisions:
  - *Audit in a browser, walking states — not over the stylesheet.* Ten
    foreground colors exist in no source file (label fills are mixed at render
    time by `d3.interpolateLab`), the `<h1>`'s real color is a gradient clipped
    to its glyphs so its `color` is a lie, and translucent marks have no color
    until composited. And most of the palette is off screen at rest, so each
    surface has to be *entered* — tooltip, dropdown, a modal per category,
    cluster list, legal dialog, empty state, hover, focus ring. 118 surfaces.
  - *Flip the text, never the category colors.* The five category colors are the
    dataset's encoding and are light-to-mid *because* they must read against a
    near-black chart; darkening them for white text would trade a badge problem
    for a chart problem. Badges keep the color and take `#0a0e27` as ink
    (6.85–12.22:1). `technology`'s lone pre-existing `color: #000` override —
    which had read as a quirk of yellow — was the general case all along, and
    now disappears into the shared rule.
  - *Split the accent by role.* `#667eea` passes as a **border** against every
    background it borders and fails only as a **fill under white text** (3.66:1),
    so the fill role forked to `#5467c0` (5.15:1) and the border role did not
    move — dimming it globally would walk the borders toward the floor they
    currently clear.
  - *Prefer an existing token over a bespoke near-threshold value.* Several
    failures cleared with a 2% lift (`#6981ea` → 4.56:1); all such were rejected
    for existing palette entries with margin (`#8fa3ff` 6.80:1, `#c7cbf0`
    6.36:1). A value on the threshold is one any future background tweak
    silently breaks. The audit ends with *fewer* accent colors, not more.
  - *A bare dot owes 3:1, and the hierarchy survives paying it.* LD7 recedes
    unlabeled dots on two channels (`r` 3 vs 4.5, `fill-opacity` 0.55 vs 1). A
    dot is what the chart is made of, so it can't be exempted as decoration —
    but raising only the opacity channel (0.55 → 0.66, worst category 2.77 →
    3.52:1) and leaving the radius gap alone keeps the encoding intact.
  - *Five shortfalls kept, each with its reason inside the gate.* Accepted:
    the fuzzy dot rim and fuzzy bar end fade (contrast loss **is** the cue —
    D22/D15; cores measured separately), the minimap window's fill (1.4.11 asks
    about the boundary, which is its stroke at 3.33:1), the spine (a structural
    guide; reaching 3:1 needs `stroke-opacity` ~0.68, putting the brightest
    pixels on the least important mark — inverting LD3), and the `aria-hidden`
    footer `·`. The rule: a shortfall is acceptable when contrast loss is the
    feature, when the boundary rather than the fill carries the component, or
    when the DOM already declares the thing decorative — **not** because a mark
    is small, quiet, or redundant with a tooltip.
  - *The measurer needed verifying as much as the app did.* Three successive runs
    reported failures that were artifacts of the tool, every one
    plausible-looking (badges compared against the modal panel rather than their
    own fill; swatches compared against themselves; the spine compared against a
    chip pill). Hand calculation against an independent implementation is what
    caught them.
  Gated by `npm run verify:contrast` (118 surfaces, 113 pass, 5 accepted, 0 fail);
  `audit:contrast` prints the full table without failing. Local-only for the same
  reason as `verify:a11y`/`verify:touch` — no browser in the deploy CI (C-Q1).
  Detail in [`docs/design/contrast.md`](docs/design/contrast.md).
- **D24 — Palette tokens: name what D23 measured (first of three design passes).**
  D23 established what every color *scores* and nothing about what any is *called*.
  The cost had become concrete: `#0a0e27` had six declaration sites doing three
  unrelated jobs (page background; the color three mechanisms paint to *erase*
  what is behind them — the label halo LD4, the dot halo, the D19 cursor halo;
  and dark **ink** on light category badges), one of them a `.attr()` inside
  `Timeline.jsx` invisible from the stylesheet. Eleven distinct greys carried
  text across maybe five jobs, several near-identical (`#b9c0dd`/`#b8bde0`,
  `#8a90b8`/`#8b93b8`) — C3's hazard one level up — and three were pure neutrals
  left over from before the theme cohered. Decisions:
  - *Buy depth downward.* The palette needed a third surface level. Raising the
    elevated surfaces would have lightened the background under every panel,
    modal, dropdown and tooltip, eating the margin D23 had just bought. So the
    **base** moved down instead (`#1a1f3a` → `#151a31`, now `--surface`) and every
    raised surface kept the exact value D23 measured: some ratios improve, none
    regress, so there is no argument to have about whether a worsened one was
    "still fine".
  - *Split a token by role, not by value.* `--bg`, `--knockout` and `--badge-ink`
    are all `#0a0e27`, and two look redundant. They are three independent claims
    that happen to agree today — and D25 separates them. **`--knockout` is the one
    seam a background layer behind the chart has to move**: the halos are invisible
    only because what is behind them *is* that color, so a starfield turns each
    into a black disc under every dot and a black outline around every label.
    Equal values are not the same token when they answer different questions.
  - *Five text steps, though the bottom two nearly touch.* `--text-dim` (5.20:1)
    and `--text-faint` (5.04:1) look like the near-duplicates this pass removed;
    merging them was rejected. The compression is the **4.5:1 floor squeezing the
    bottom of a dark ramp** — there is little room between "quietest legible" and
    "illegible" — and D23 tuned `#7b82a4` for exactly that floor five days ago.
  - *Static presentation moves to CSS; per-datum color stays in JS.* The dot halo
    fill, chip pill fill, gridlines and spine ticks moved (two had no class at
    all). The category colors, the `d3.interpolateLab` label-tier endpoints and
    the chip's per-cluster stroke stayed: they are **data or color math**, and
    `var()` resolves in neither — SVG presentation attributes ignore it and
    `interpolateLab` needs a parseable color. Two color systems with a stated
    boundary, not one system plus exceptions.
  - *Every D23 fork survives*, with its reason restated at the declaration so a
    tidy-up can't merge it back: `--accent`/`--accent-fill` (C2), `--badge-ink`
    on unmodified category colors (C1).
  **What it found:** `.tt-hint` was `--accent` at 10px on the raised panel — the
  identical pair D23 caught as `.tt-year` at **4.41:1** and moved for. It was
  never moved because it was never measured: its sample carried
  `required: false` and sat in the *event-mark* hover block, while that hint
  renders only on a **cluster chip's** tooltip. So it matched nothing on every
  run and the flag turned "unreachable" into silence — straight through D23 §7's
  rule that an unreachable surface must fail. Fixed both ends: the hint takes
  `--accent-text` (6.80:1), and the walk now hovers a chip and requires the
  sample (finding a hoverable chip needs `elementFromPoint`, since lane-0 label
  hit-rects overlap the chip band and the label layer draws above it). The
  4.41:1 was reproduced by hand before being called a failure. *The lesson: an
  optional assertion is one that will eventually be skipped, silently — surface
  count is now the tell, and 119 going down is a regression like any ratio.*
  Gated unchanged: `verify:contrast` **119 surfaces, 114 pass, 5 accepted, 0
  fail**, plus lint / `verify:layout` (33 labels, 0 border pops) / `verify:a11y`
  45/45 / `verify:touch` 9/9. Detail in
  [`docs/design/palette-tokens.md`](docs/design/palette-tokens.md).

---

## 6. Open Questions

- ~~**Q1 — Navigation model**~~ — answered: the continuous symlog axis works *with an
  orientation layer on top* — era preset flights, a piecewise-equal era scrubber, and a
  visible-range readout. See [`docs/design/navigation.md`](docs/design/navigation.md)
  (open: active-era state; window-resize handling landed with D10, keyboard
  navigation with D19).
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
- ~~**Q4 — Data sourcing.**~~ — answered (D20). Not one threshold: *selection +
  narrative* stays hand-curated by design (it's the product), while *provenance +
  canonical facts* had already stopped scaling (`sources: 2/191`) and is now
  automated from Wikidata (CC0) — a `wikidata` QID per event + a Wikipedia
  `sources` backfill, via a human-gated reconcile/enrich pipeline. 171/191
  reconciled, sources 2 → 171; the bulk-SPARQL "Full Version" pipeline stays
  unjustified. DS-Q2 (`precision` backfill) followed in D21 — coarsen-only, 87/191
  now marked. Still open: DS-Q1 (~8 events mapped to *person* QIDs could use a
  tighter event/work item — D21 defused the consequence, not the mapping) and
  DS-Q3 (64 reconciled events carry no dated claim, so no precision signal). See
  [`docs/design/data-sourcing.md`](docs/design/data-sourcing.md).
- ~~**Q5 — Taxonomy.**~~ — answered (D14): `subcategory` is a controlled set per category
  (one per event, required), `tags` are cross-cutting threads (≥2 events each, never
  restating a subcategory); both gated by verify:layout. Closes SF-Q3 (the singleton /
  near-duplicate tags search surfaced). Still open, smaller: whether the 5 top-level
  categories are final, and whether a few 1–2 member subcategories should merge.
- ~~**Q6 — Precision in the UI.**~~ — answered (D15), the on-canvas half revised
  (D22): a fuzzy dot's fill fades at the rim (D15's dashed stroke proved illegible),
  faded bar ends via a per-category gradient (closes SR-Q2), and a text prefix mark
  (`~`/`≈`/`?`) funneled through `formatYearRange()` everywhere a date displays —
  now also prefixing on-canvas labels, behind a setting. The detail modal gets a
  precision pill. The underlying *data* was backfilled later (D21), which is what
  exposed the legibility problem. Still open: a UI for the label-mark setting
  (PR-Q4). See
  [`docs/design/precision-rendering.md`](docs/design/precision-rendering.md).
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
- ~~**Q10 — "Generic but important" web basics.**~~ — answered across three
  passes. The things every public site owes its visitors, which a feature-driven
  build never surfaces on its own. Audited 2026-07-21:
  - *Site identity & previews* — **answered (D16)**: favicon/icon set, OG + Twitter
    cards, description, web manifest.
  - *Legal* — **answered and shipped (D17)**: no Impressum (private-use exemption);
    the Datenschutzerklärung owed under DSGVO Art. 13 ships bilingually (DE/EN,
    defaulting to the browser locale) in a footer dialog, together with the on-site
    source attribution that settles the tension between the all-rights-reserved
    LICENSE and a dataset derived from CC-BY-SA sources.
  - *Accessibility & robustness* — **answered (D18)**: reduced motion through
    three live-reading doors, a shared dialog shell with owner-restored focus,
    combobox ARIA, a global `:focus-visible` ring, a live-region result count,
    and error boundaries around the chart and the root. Gated by
    `npm run verify:a11y`. See
    [`docs/design/accessibility.md`](docs/design/accessibility.md).
  - *The chart itself* — **answered (D19)**: one tab stop with an event cursor,
    a live region that speaks it, and a name stating how many events over what
    span. Closes A-Q1 and A-Q2 (and, from the other side, NAV-Q3). See
    [`docs/design/keyboard-navigation.md`](docs/design/keyboard-navigation.md).
  - *Contrast* — **answered (D23)**: 118 surfaces measured in a browser state
    walk; 17 text/control failures fixed (worst: white on the light category
    badges at 1.93:1), five shortfalls kept with stated reasons, gated by
    `npm run verify:contrast`. See [`docs/design/contrast.md`](docs/design/contrast.md).
  - Residual: nothing has been tested against a real screen reader
    (A-Q4/KN-Q1) — which D19 made a bigger bet on, since `role="application"`
    assumes arrow keys reach the page rather than the reader's own browse
    cursor. The three browser-based gates also still can't run in the deploy CI
    (C-Q1).

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
      ≥2 uses, none restating a subcategory; gated by verify:layout.
- [x] Backfill `sources` + add `wikidata` QIDs (D20): Wikidata reconcile/enrich
      pipeline; 171/191 events carry a QID, sources 2 → 171.
- [x] Backfill `precision` (D21, closes DS-Q2) — coarsen-only proposals from
      Wikidata date-precision + circa/range qualifiers (8 applied, 22 held), plus
      a `verify:layout` invariant banning `exact` in deep time / before the
      written record (7 more set by hand). 74 → 87 of 191 marked. **Still open:**
      tightening ~8 person-QID mappings (DS-Q1); the 64 reconciled events with no
      dated claim get no signal (DS-Q3).
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
- [x] Surface `precision` visually (Q6) — soft-rimmed fuzzy dots (D22; D15's dashed
      ring was illegible), faded bar ends (closes SR-Q2), text prefix marks now
      reaching on-canvas labels behind `settings.precisionMarksOnLabels`, modal
      pill; gated by verify:layout. Remaining: a UI for that setting (PR-Q4). See
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
- [x] Accessibility pass (D18) — reduced motion, shared dialog shell with
      Esc/focus-trap/`role="dialog"` + owner-restored focus, combobox ARIA,
      live-region result count, global focus-visible, error boundaries;
      `npm run verify:a11y`. Remaining: contrast audit (A-Q3), real
      screen-reader test (A-Q4). See
      [`docs/design/accessibility.md`](docs/design/accessibility.md).
- [x] Keyboard navigation of the chart (D19, closes A-Q1/A-Q2/NAV-Q3) — one tab
      stop with an event cursor stepping in time order, camera follow, `+`/`−`/`0`
      zoom, `Enter` for details, and a live region that makes the cursor the
      chart's screen-reader representation; 15 more `verify:a11y` checks.
      Remaining: coarser jumps than one event at a time (KN-Q2), a keyboard
      route to the minimap (KN-Q3). See
      [`docs/design/keyboard-navigation.md`](docs/design/keyboard-navigation.md).
- [x] Contrast audit (D23, closes A-Q3) — 118 surfaces measured in a headless
      browser state walk (`npm run verify:contrast`); 17 text/control failures
      fixed, the worst being white text on the light category badges at 1.93:1,
      and five shortfalls kept with their reasons recorded inside the gate.
      Remaining: the browser gates still can't run in the deploy CI (C-Q1), and
      there is no forced-colors/high-contrast check (C-Q3). See
      [`docs/design/contrast.md`](docs/design/contrast.md).
- [x] Palette tokens (D24) — a `:root` layer replacing ~150 color literals,
      eleven text greys collapsed to a five-step ramp, `--knockout` split from
      `--bg` as the seam D25 moves, and a latent 4.41:1 failure (`.tt-hint`)
      found and fixed along with the `required: false` hole that hid it.
      119 surfaces, 0 fail. Remaining: `--knockout` must stop being a constant
      once anything is drawn behind the chart (PT-Q1), and the `--cat-*` tokens
      duplicate `format.js` with nothing checking they agree (PT-Q2). See
      [`docs/design/palette-tokens.md`](docs/design/palette-tokens.md).

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
- **A media query read live beats one snapshotted into state.** `prefers-reduced-
  motion` is consumed inside D3 render passes, rAF callbacks and gesture handlers —
  all of which run long after the React render that created them. Keeping one
  `MediaQueryList` in a module and calling `.matches` at the moment of motion means
  the setting can be flipped mid-session with no subscription, no re-render and no
  scene rebuild. (The opposite call is right for `pointer: coarse`, read once per
  scene: input modality doesn't change mid-run.) Related: a *zero-duration* D3
  transition is not the same as no transition — it still defers to the next tick,
  which would leave marks that enter at `opacity: 0` invisible for a frame. Apply
  the end state to the selection instead. (→ D18)
- **A filtered domain silently disables the era presets.** With a search narrowed to
  one event the time domain spans a few decades, `createEraScale` drops every era
  outside it, and `zoomToEra` returns early — the buttons still render but do
  nothing. This first showed up as two verification checks that passed while
  measuring an unmoving camera. Any test of camera motion must first assert the
  scene it expects is actually there. (→ D18)
- **In a full-repaint renderer, persistent state must live in the resting
  values — anything layered on top is erased.** `render()` rewrites every dot
  radius, leader opacity and label fill on every frame. Hover gets away with
  applying its highlight *after* the fact only because hovering never moves the
  camera, so no frame follows. The keyboard cursor does move the camera, so the
  same approach would have been wiped ~30 times during the flight it was flying
  towards. Folding it into the resting-value helpers instead (`dotBaseR`,
  `leaderOpacity`, `labelFill` all ask `isCursor(id)`) makes it survive pans,
  zooms, flights and scene rebuilds without a line of restore logic. The general
  shape: if a piece of state has to outlive a repaint, it belongs *inside* the
  paint, not after it. (→ D19)
- **`document.activeElement` is the source of truth for focus; a copy of it goes
  stale.** The render effect re-runs on resize and on every filter change, so an
  effect-local "does the chart have focus" flag silently resets while the chart
  still has focus — a cursor that vanishes when the window is dragged. Reading
  it back from the DOM at effect start costs nothing and cannot desync. The
  companion flag ("the keyboard is driving") has no DOM equivalent, so it rides
  a ref — the same pattern `viewRef` uses to carry the camera across rebuilds.
  (→ D19)
- **Reconciling records to an external knowledge base: read the identifier, never
  recall it.** Matching the 191 events to Wikidata QIDs, a recalled QID was wrong
  far more often than right — batch-verification caught ~16 "remembered" QIDs
  pointing at unrelated entities (abiogenesis→"Envy", Sputnik→"James Bond",
  CRISPR→"Thimma Bhupala"). QIDs read off a search result (then machine-checked by
  enwiki title + instance-of + date) were reliable. The corollary for the matcher:
  narrative record titles ("Discovery of Steel", "First Plane") don't match bare
  entity labels ("steel", "aircraft") — strip framing verbs/possessives to the
  core noun for *both* search recall and similarity scoring — and an English
  Wikipedia sitelink is the single best "this is the canonical item" signal for
  disambiguating exact-label twins and rejecting works-named-after-the-thing. (→ D20)
- **Make an automated field-backfill monotone and it needs no review gate.**
  Merging machine values into hand-curated data usually means a review file
  (D20's `wikidata-review.json`). But if the field's values are *ordered* and the
  merge only ever moves one direction — here, `precision` may only get fuzzier —
  then the worst case is a withdrawn claim of confidence, never an overwritten
  judgement. Three separate hazards collapsed into no-ops under that single rule:
  person-QID birth dates (day-precise, would have sharpened), `speculative`
  (would have been downgraded to `estimated`), and hand corrections (would have
  been walked back on the next run). Monotone also *is* idempotent, for free. The
  general shape: before building a human checkpoint, check whether the merge can
  be made unable to lose information instead. (→ D21)
- **A pipeline is blind to the records that lack the field it reads — so gate the
  claim, not the pipeline.** The `precision` backfill reads Wikidata dates, so the
  events it can't correct are precisely those with no date: concept and material
  items (`wheel`, `steel`, `Formation of the Solar System`). Five nonsense-`exact`
  events survived a pass that was working perfectly, and no tuning would have
  found them. What caught them was an offline invariant stating the underlying
  truth instead — nothing in deep time or before the written record can be dated
  `exact` — which is checkable without a network call and independent of whichever
  source filled the field. (→ D21)
- **A signal can't ride as a high-frequency modulation of a near-invisible
  channel.** The fuzzy-date cue was a `2,1.5` dash on a 1px, 0.35-opacity ring:
  ~8 dashes with 1.5px gaps around a 28px circumference, which antialiasing
  averages back into "a slightly dimmer ring". Picking the last *unused* channel
  isn't sufficient — it has to have headroom left. The fix wasn't to shout
  louder on the same channel (brightening the ring would have added weight in
  proportion to fuzziness, fighting the importance hierarchy) but to move to one
  with room: fading the fill's rim *subtracts* contrast instead of adding it, and
  works on the receded dots where the stroke was fully transparent. (→ D22)
- **When a layout measures text, exactly one function may decide what the text
  says.** The lane packer reserves space from a measured width, so the moment a
  label's rendered string and its measured string can diverge, the packer
  silently under-reserves and the overlap invariant it exists to guarantee fails
  quietly. Adding a two-character prefix to labels was therefore a *packing*
  change, not a text change: `labelTextFor()` feeds the measurer, the renderer
  and verify-layout's approximation alike. The cost is then visible instead of
  hidden — 35 → 33 labels at the default view. (→ D22)
- **A palette audit can't be steered by which colors look risky.** The open
  question named the two dim greys as the suspects (dark-on-dark being the
  theme's obvious hazard). One was fine at 6.12:1; the app's worst failure by a
  wide margin was **white text on the light category badges** — 1.93:1 — i.e.
  light-on-light, the failure mode a dark theme trains you not to look for. The
  tell was there and had been misread: one badge already carried a lone
  `color: #000` override, filed mentally as "yellow is special" rather than as a
  symptom of the shared rule. When a style has a single unexplained exception,
  check whether the exception is actually the general case. (→ D23)
- **A measurement tool's bug is indistinguishable from a finding.** Three runs of
  the contrast checker reported plausible-looking failures that were artifacts of
  the measurer: badges compared against the modal panel instead of their own
  fill, then swatches compared against themselves, then the spine and the range
  readout compared against a chip pill (a "sibling rect is the background"
  heuristic that was true for chip counts and false for everything sharing the
  chart's top-level `<g>`). None announced itself as a bug — each looked like a
  real problem in the app. The check that caught them was reproducing a handful
  of ratios by hand against an independent implementation before changing any
  code. A verifier earns trust the same way the code does. (→ D23)
- **An optional assertion is one that will eventually be skipped, silently.** The
  contrast harness sampled `.tt-hint` with `required: false` — an escape hatch for
  surfaces that may legitimately be absent. What it actually bought was a check
  that had *never once run*: the sample sat in the event-mark hover block while
  that hint renders only on a cluster chip's tooltip, so it matched nothing on
  every run and reported nothing about it, hiding a real 4.41:1 failure through a
  gate whose own doc says an unreachable surface must fail. The structural fix
  isn't a better selector, it's removing the way to opt out — and making the
  **count** an assertion, so a surface disappearing from the walk is a regression
  exactly like a ratio dropping. (→ D24)
- **Equal values are not the same token when they answer different questions.**
  `--bg`, `--knockout` and `--badge-ink` are all `#0a0e27` and any de-duplicating
  instinct says collapse them. They are the page, the color three mechanisms paint
  to *erase* what is behind them, and dark ink on a *light* badge — three
  independent claims that coincide today and stop coinciding the moment anything
  is drawn behind the chart. Naming by role rather than by value is what turns
  "find every literal and decide, one at a time, whether this one meant the
  background" into changing one declaration. The cost of the wrong call here is
  paid later and by someone else, which is why it's worth paying attention to at
  declaration time. (→ D24)
- **A palette is cheapest to refactor immediately after it is measured.** ~150
  color substitutions across 1,200 lines of CSS is a change nobody would risk by
  eye — but D23's 119-surface gate verifies the whole thing in one command, so the
  work went from unjustifiable to routine. The corollary for sequencing: an audit
  doesn't just fix the defects it finds, it buys a window in which structural
  cleanup of the audited thing is verifiable. Spend it before the numbers go
  stale. (→ D24)
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
