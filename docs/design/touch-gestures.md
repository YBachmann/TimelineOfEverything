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
4. **Momentum.** A pan released above `FLICK_MIN` px/s keeps gliding under
   exponential friction (time constant `GLIDE_TAU`), ending below `GLIDE_STOP`
   px/s or dead at a domain edge. Release velocity is measured over the last
   `VEL_WINDOW` ms of pointer samples, so drag–hold–release reads as a stop
   while a flick reads as fast. Mouse drags glide too; pinch releases don't
   (v1). A pointer landing mid-glide — or mid chip-zoom flight — is a
   **catch**: it stops the motion and its click is swallowed (you grabbed the
   timeline, not whatever passed under your finger). **Fling boost:** a flick
   released within `BOOST_WINDOW` ms of a catch, in the same direction,
   inherits the caught velocity — repeated fast swipes build up speed like
   native scrolling. Exponential decay makes that feel right for free: glide
   *distance* scales linearly with velocity (v·τ) but glide *duration* only
   logarithmically (τ·ln(v/stop)), so pumped flicks fly much farther yet
   settle almost as quickly. Speed is capped at `GLIDE_VMAX` (12k px/s). A
   `pointercancel` (browser took the gesture for page scroll) never flicks.
   The constants live at the top of the gesture block in `Timeline.jsx`,
   hand-tuned on-device (2026-07-12).

5. **Double-tap / double-click = zoom in a step** (`DOUBLE_TAP_FACTOR`, 2.5×)
   toward the tapped point, via the shared flight animation — the tapped time
   lands pinned under the finger, same anchoring as wheel zoom. Only *clean*
   taps pair up: a catch-tap, a pan, or any gesture that grew a second finger
   resets the sequence; `DOUBLE_TAP_MS` / `DOUBLE_TAP_RADIUS` bound the pairing
   in time and space.

Wheel handlers are unchanged (desktop trackpad pinch already arrives as
Ctrl+wheel). Any gesture cancels an in-flight chip-zoom animation or glide and
hides the tooltip, mirroring the wheel handlers' behavior.

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

- ~~**TG-Q1**~~ — resolved (first real-device feedback, 2026-07-12): momentum
  glide on pan release, see §2.4. Not included: glide after a *pinch* release,
  and rubber-band overscroll at the domain edges (the glide stops dead there).
- ~~**TG-Q2**~~ — resolved: double-tap (and desktop double-click) zooms in a
  step toward the tap (§2.5). Single taps act immediately (no 300ms
  disambiguation delay), so when the first tap lands on a mark its modal opens
  and briefly flashes before the second tap undoes it and zooms. This "on a
  mark" case is the *common* one on phones — mobile Chromium's touch-target
  adjustment snaps near-miss taps onto nearby hit targets (discovered via CDP:
  a tap dispatched at verified background coords arrived on a `label-hit`) —
  which is why the second tap is caught at the window level when it lands on
  the modal overlay, not just on the svg. A zoom-*out* companion (two-finger
  tap) is not implemented; add to TG-Q3's pass if missed.
- **TG-Q3** — The coarse-pointer polish half of Q9 is untouched: hit-target
  sizes (~44px), tooltip-less discovery, on-device performance.
