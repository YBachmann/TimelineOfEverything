# Navigation

> Topic design doc. How users orient themselves and move across 13.8 billion years:
> era presets, the overview scrubber, and the visible-range readout.
> Indexed from the main [`DESIGN.md`](../../DESIGN.md).

**Status:** v1 implemented (answers main-doc Q1).
**Last updated:** 2026-07-12

---

## 1. Problem

With 191 events and 5000× zoom, the symlog axis is powerful but disorienting:
once zoomed, nothing tells you *where* you are in the whole of time, getting from
the cosmic view to a specific era takes dozens of wheel ticks, and returning to
the full view is tedious. Q1 asked whether a continuous symlog axis is navigable
at all — the answer is "yes, with an orientation layer on top."

## 2. The three pieces (v1)

1. **Era preset buttons** — All Time · Cosmic · Earth & Life · Human Era · Modern
   · Future. Clicking flies the viewport to fit that era (~94% of the width),
   reusing the chip-zoom animation (log-scale + center-fraction interpolation).
   Era definitions live in `src/eraScale.js` (`ERA_DEFS`); boundaries: solar-system
   formation (−4.6 B), Homo sapiens (−300 k), ~Renaissance (1500), "now-ish" (2030).
2. **Overview scrubber (minimap)** — a 24px strip below the chart showing the full
   domain at all times: labeled era bands, per-event marks (ticks for points,
   lines for spans, category-colored), and a viewport window showing what the main
   view covers (min-width 3px so it never vanishes). Click/drag anywhere scrubs —
   the main view centers on the pointer's time position, zoom unchanged
   (video-scrubber semantics).
3. **Visible-range readout** — "13.8 Bya – +5B yrs" top-right of the chart,
   updated every frame with the compact year format.

## 3. The key design decision: a piecewise-equal era scale

A minimap sharing the main symlog scale would inherit its compression — the
Modern era (1500–2030), where most events sit, would be **~8px** of a 1200px
strip, unusable as a scrub target. Instead the scrubber gives **every era an
equal share of the strip**, mapping symlog-style *within* each band
(`createEraScale()` in `src/eraScale.js`). Time is deliberately non-uniform
across the strip; the labeled bands make that legible. Eras outside a filtered
domain are dropped and the survivors re-split the strip.

`frac(year) ↔ invert(f)` are exact inverses; `npm run verify:layout`
property-tests monotonicity and round-tripping across the strip and across
year magnitudes, and asserts the full dataset resolves to 5 eras.

## 4. Interplay with existing systems

- Scrubbing and era flights go through the existing `currentScale` /
  `currentTranslateX` / `render()` pipeline — the packer, chips, and spans just
  see another pan/zoom, so all no-overlap invariants apply unchanged.
- Scrub and era-flight both hide the tooltip and cancel any in-flight zoom
  animation; wheel input still overrides everything.
- The minimap statics (bands, marks) rebuild only on filter change; per-frame
  work is two attributes on the window rect plus the readout text.

## 5. Open items

- **NAV-Q1** — Era buttons don't reflect state: no active-era highlight, and
  buttons for eras dropped by a category filter silently no-op (could disable).
- **NAV-Q2** — Scrubber sets position only; consider drag-to-resize the window
  (zoom) or a modifier-drag for range selection.
- ~~**NAV-Q3**~~ — resolved by main-doc D19: the chart is one tab stop holding a
  cursor that arrows step through the events in time order (rather than panning
  the camera directly — the events *are* the content), with `+`/`−` zooming
  around the cursor and `0` fitting all time. See
  [`keyboard-navigation.md`](keyboard-navigation.md).
- ~~**NAV-Q4**~~ — resolved by main-doc D10: the chart flex-fills the viewport (no
  fixed 600px) and a ResizeObserver rebuilds on size change, preserving the view.
- **NAV-Q5** — Era boundaries are debatable (is 1500 the right Modern start?);
  revisit if era bands gain more roles (e.g. main-view background bands, which
  should share `ERA_DEFS`).
