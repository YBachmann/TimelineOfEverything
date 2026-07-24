# Responsive Layout

> ⚠️ **Retroactive doc — written after the fact.** Reconstructed on **2026-07-24** from the
> merged branch `feature/responsive-layout` (PR #11, commit `da71b1d`), its diff, and the
> Claude Code session that produced it (`319e28bc`, 2026-07-12). It reports the decisions as
> they can be recovered, not as a contemporaneous log. The **decision entry of record remains
> [`DESIGN.md` → D10](../../DESIGN.md).**

> Topic design doc. How the chart stopped being a fixed 600px box: flex-fill sizing, a
> debounced `ResizeObserver` that rebuilds the scene on any box change, and a view snapshot
> (stored as a *domain fraction*) that survives the rebuild — plus the compact small-screen
> chrome. Resolves [`navigation.md`](navigation.md)'s **NAV-Q4**. Touch input is explicitly
> *not* here — that's Q9 ([`touch-gestures.md`](touch-gestures.md), [`mobile-polish.md`](mobile-polish.md)).
> Indexed from the main [`DESIGN.md`](../../DESIGN.md).

**Status:** v1 implemented (D10).
**Last updated:** 2026-07-24 (retroactive).

---

## 1. Problem

The timeline was a hard-coded `600px` SVG + a `40px` scrubber (inline styles). That clips on
short viewports, wastes space on tall ones, and — because size was baked into the render at
mount — a window resize or a phone rotation never re-fit the scene. This is the layout half of
NAV-Q4; the input half (pan/zoom on touch) is Q9 and deliberately out of scope.

## 2. The key move — a resize is a full rebuild

The render effect in `Timeline.jsx` already tears down (`selectAll('*').remove()`) and rebuilds
the *entire* SVG scene on every run. So responsiveness needs **no incremental relayout code at
all**: feed a debounced `ResizeObserver` into the effect's dependency list and let the existing
rebuild do the work. At 191 events a full rebuild is imperceptible, so trading re-render cost
for zero new layout math is the right call (logged as a project learning: *"resize can be
treated as rebuild everything"*).

Three details make it robust:

- **Debounce (150 ms).** `ResizeObserver` fires every frame during a drag-resize; each bump
  would otherwise rebuild the whole scene. The observer bumps a `viewSize` state; the render
  effect depends on it.
- **`sizeRef` no-op guard.** The scene records the `{ w, h }` it was built at; the observer's
  initial fire (and any notification that reports an unchanged box) is dropped instead of
  triggering a redundant rebuild of an identical scene.
- **Degenerate-box guard.** Runs measuring `width < 40 || height < 40` (mid-layout snapshots,
  a hidden ancestor) bail early — the observer re-fires once a real size exists.

## 3. Preserving the view across a rebuild

A rebuild must never reset where the user is. Every `render()` snapshots
`viewRef = { domainMin, domainMax, scale, centerFrac }`, where **`centerFrac` is a fraction of
the time domain, not a pixel offset** — which is exactly what lets it survive a change in box
width. On the next effect run, if `domainMin`/`domainMax` match the snapshot (so this run is a
resize, not a data/filter change that moved the domain), `scale` and the translate are restored
(clamped to the valid pan range).

- **The domain-fraction choice is the crux.** A saved pixel translate would be wrong the moment
  the width changes; a domain fraction re-projects correctly into any new width.
- **Bonus, same mechanism:** a filter flip that keeps the same domain *extremes* now preserves
  the view too — not just resizes. Search later builds its "entry flight" on exactly this
  same-extremes-vs-moved-extremes distinction (see [`search-filtering.md`](search-filtering.md)
  SF6).

## 4. CSS — the chart flex-fills

`.timeline-wrapper` is a column flexbox filling `.timeline-section`; the chart SVG is
`flex: 1 1 0; min-height: 0; width: 100%; display: block` — **CSS-sized**, so the `width`/
`height` attributes D3 sets are overridden. The era-preset row and the minimap are
`flex-shrink: 0`, so the chart takes exactly the height they leave over. The old inline
`height: 600px` / `40px` styles are gone.

## 5. Small-screen chrome

Media queries at `max-width: 640px` / `max-height: 540px`:

- Compact the title, subtitle, filter buttons, and section padding so the chart keeps most of
  the viewport (short landscape phones also drop the subtitle entirely).
- **Hide `.timeline-info`.** The hint box describes desktop input (wheel to zoom, hover for
  tooltips, Ctrl+scroll) — wrong and bulky on touch. Input-appropriate copy is tracked as Q9.
- **Page-scroll fallback.** On small screens `.app` becomes `overflow-y: auto` (desktop keeps
  its fixed, no-scroll layout); the event modal caps at `85dvh` and scrolls.
- **`100dvh` guard** (`@supports (height: 100dvh)`): the collapsing mobile URL bar can hide
  space that `100vh`/`100%` counts, clipping the app's bottom edge (minimap/hints); `dvh`
  tracks the *visible* viewport instead.
- A `theme-color` meta (`#0a0e27`) tints the mobile browser chrome to match the app.

## 6. Axis tick budget follows pixel width

`symlogTicks()` now derives a tick budget from the axis width — `clamp(4, 14, floor(width/80))`,
about one compact-format label per 80px. Narrow (phone-width) charts thin the ticks further
(full decades → every-other-decade → an even-index pick to force the budget) instead of
colliding labels. This was caught by the mobile geometry probe (§7), not by eye.

## 7. Verification

This feature is where the project's **headless verification harness was born**: a
headless-Edge + Chrome DevTools Protocol probe that measured the real SVG geometry at desktop
and phone widths, confirming flex-fill and exposing the tick-collision the budget fixes. That
throwaway probe is the seed of the committed `scripts/cdp-mobile.mjs` harness that
[`mobile-polish.md`](mobile-polish.md) (D13) later formalized into `npm run verify:touch` /
`perf:mobile`.

## 8. Scope & open items

- **Not touch input (Q9).** On a phone you can tap an event for its modal, drag the minimap
  scrubber (`d3.drag` handles touch), and use the era buttons — but you *cannot* pan or zoom the
  chart, and a pinch zooms the browser page. That gap is closed by touch gestures (D11,
  [`touch-gestures.md`](touch-gestures.md)) and the coarse-pointer pass (D13,
  [`mobile-polish.md`](mobile-polish.md)).
- **Resolves NAV-Q4** (the fixed-height clipping question in the navigation doc).
