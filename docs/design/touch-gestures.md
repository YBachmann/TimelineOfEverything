# Touch & Drag Gestures

> Topic design doc. How the chart is panned and zoomed without a scroll wheel:
> pointer-event gestures for touch (and mouse dragging), and how taps stay taps.
> Indexed from the main [`DESIGN.md`](../../DESIGN.md).

**Status:** v1 implemented (answers the gesture half of main-doc Q9).
**Last updated:** 2026-07-12

---

## 1. Problem

The chart's input model was wheel + hover only: scroll = pan, Ctrl+scroll = zoom,
hover = preview. None of those exist on a touch screen, so a phone could tap events
and scrub the minimap but never pan or zoom the chart — dense regions stayed locked
behind cluster chips forever. (The responsive layout, main-doc D10, made the chart
*fit* a phone; this makes it *usable* on one.)

## 2. The gesture model (v1)

All on the chart svg, via pointer events (one code path for touch, pen, and mouse):

1. **One pointer dragged past a 6px slop = pan.** Mouse included — drag-panning
   now works on desktop too, alongside scroll-panning.
2. **Two touch pointers = pinch zoom.** The zoom factor is the ratio of the current
   to the starting finger distance (euclidean, floored at 20px so a near-touching
   start can't explode the ratio), applied to the gesture-start scale. The domain
   point that sat under the fingers' midpoint at pinch start stays pinned under the
   *moving* midpoint — so pinch-zoom and two-finger pan are one continuous motion,
   like a map app. Third and later fingers are ignored.
3. **Tap = click.** Untouched: browsers synthesize `click` after a tap, so the
   existing dot/label/chip/bar handlers and modals just work.

Wheel handlers are unchanged (desktop trackpad pinch already arrives as
Ctrl+wheel). Any gesture cancels an in-flight chip-zoom animation and hides the
tooltip, mirroring the wheel handlers' behavior.

## 3. Key decisions

- **`touch-action: pan-y` on the chart, not `none`.** Horizontal drags and pinches
  are delivered to us; *vertical* swipes stay with the browser so the page can
  still scroll on phones (the small-screen layout allows page scroll as a
  fallback). When the browser claims a gesture for scrolling it sends
  `pointercancel` and we stand down. The minimap gets `touch-action: none` —
  scrubbing is its whole job. Page pinch-zoom outside the chart is untouched
  (accessibility), so the viewport meta keeps user scaling enabled.
- **Pointer capture only after the slop is crossed.** Touch captures implicitly at
  `pointerdown`; mouse does not, so a mouse pan that leaves the svg would stall.
  We capture explicitly at pan start — but *not* at `pointerdown`, because capture
  retargets the synthetic click to the svg, which would break tap-to-open on
  dots/labels/chips.
- **Click suppression after a pan/pinch.** Touch withholds the synthetic click
  itself past ~10px of movement, but mouse fires `click` after any drag that ends
  on its start element. A capture-phase click listener on the svg swallows exactly
  one click while the suppress flag is set (set at pan/pinch start, cleared at the
  next `pointerdown`, so a stale flag can never eat a legitimate tap).
- **Slop distance is discarded, not applied.** When the 6px threshold is crossed,
  panning starts from the current pointer position — applying the accumulated slop
  would show a visible hop on gesture start.
- **Stale-pointer hygiene.** An un-captured mouse leaving the svg before the slop
  is crossed gets dropped on `pointerleave` (its `pointerup` lands elsewhere);
  otherwise a later touch could pair with the stale entry into a phantom pinch.
  When a pinch loses one finger, the survivor restarts as a fresh pan candidate.

## 4. Interplay with existing systems

- Gestures go through the same `currentScale` / `currentTranslateX` / `render()`
  pipeline as wheel and scrubber input — the packer, chips, spans, and all
  no-overlap invariants apply unchanged.
- `onClickMark` now hides the tooltip: a touch tap gets a compatibility
  `mouseenter` (tooltip shows) but never a `mouseleave`, so without this the
  tooltip survived behind — and after — the detail modal.
- The control-hints box phrases itself per input modality
  (`matchMedia('(pointer: coarse)')`): pinch/drag/tap copy on touch devices,
  wheel/hover copy on fine-pointer ones.

## 5. Open items

- **TG-Q1** — No inertia/momentum on pan release; flick-scrolling feels dead
  compared to native maps. Worth it once real-device feedback exists.
- **TG-Q2** — Double-tap to zoom (in toward the tap point) is a common
  expectation; `touch-action: pan-y` already suppresses the browser's own
  double-tap zoom on the chart.
- **TG-Q3** — The coarse-pointer polish half of Q9 is untouched: hit-target
  sizes (~44px), tooltip-less discovery, on-device performance.
