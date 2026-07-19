# Touch & Drag Gestures

> Topic design doc. How the chart is panned and zoomed without a scroll wheel:
> pointer-event gestures for touch (and mouse dragging), and how taps stay taps.
> Indexed from the main [`DESIGN.md`](../../DESIGN.md).

**Status:** v1.1 — gestures + the coarse-pointer polish pass (TG-Q3): hit targets,
long-press preview, emulated-mobile performance check. Closes main-doc Q9 up to a
real-device spot check.
**Last updated:** 2026-07-19

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

6. **Press-and-hold = preview** (TG-Q3's tooltip-less-discovery answer). Touch
   has no hover, so a 500ms hold (`LONG_PRESS_MS`) on a dot / label / chip /
   span bar shows the same preview tooltip hover shows — positioned *above*
   the touch point, where the finger and hand can't cover it — plus the
   dot↔leader↔label highlight triad. The release is swallowed (previewing must
   not commit to the modal), and the preview lingers after release until the
   next gesture clears it, so it can be read with the finger lifted. Crossing
   the pan slop, a second finger, or the hold starting as a catch (grabbing a
   moving timeline is not inspecting) all cancel the hold; `contextmenu` is
   suppressed on coarse pointers so Android's long-press menu can't hijack it.
   The mark under the finger is resolved from the pointerdown target's d3
   datum (`closest('.event-hit, .label-hit, .span-hit')` / the chip group),
   so it reuses the exact hit geometry taps use. Mouse is excluded — hover
   already does this. A held preview never pairs into a double-tap.

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

## 5. Coarse-pointer polish pass (TG-Q3, 2026-07-19)

**Hit targets.** Sized off `matchMedia('(pointer: coarse)')` — SVG-internal
targets in `Timeline.jsx`, HTML chrome in a matching `@media (pointer: coarse)`
block in `App.css` (placed after the small-screen compaction block on purpose:
tappability wins over compactness on phones). Where the surrounding geometry
caps a target below 44px, the cap is deliberate and width/browser touch-target
adjustment carry the rest:

| Target | Fine | Coarse | Cap |
|---|---|---|---|
| Dot hit circle | 24px ⌀ | **44px ⌀** | — |
| Label hit-rect height | 20px | **22px** | lane pitch is 22px — taller overlaps the next lane |
| Span-bar hit band | 10px | **14px** | mini-lane pitch is 7px — fatter fully covers neighbors |
| Chip tap area | 18px pill | **+8px x / +12px y pad** | lane-0 label rects win the contested band (label layer is above) |
| Minimap strip | 40px | **48px** | CSS owns the height; strip geometry follows `clientHeight` |
| Filter buttons / search box / dropdown rows / modal lists | ~33px | **~40–44px** | — |
| Era preset pills | ~24px | **~34px + wider gap** | full 44px would eat chart height |

Plus: search input font goes to 16px on coarse pointers (below that iOS zooms
the whole page into a focused input), and the chip tooltip hint says
"Tap …" instead of "Click …".

**Discovery.** Press-and-hold preview, §2.6.

**Performance** (headless Edge + CDP, production build, 390×844@3x mobile
emulation, touch gestures dispatched via `Input.dispatchTouchEvent`, rAF
frame-time stats; CPU throttling approximates phone hardware — 4× ≈ mid-range,
6× ≈ low-end):

| Gesture | 4× mean (jank >33ms) | 6× mean (jank >33ms) |
|---|---|---|
| Drag pan (350px) | 13.6ms / 73fps (1%) | 14.9ms / 67fps (2%) |
| Flick + glide | 13.3ms / 75fps (0%) | 13.4ms / 75fps (0%) |
| Drag while zoomed | 13.3ms / 75fps (0%) | 13.5ms / 74fps (1%) |
| Double-tap flight | 13.8ms / 73fps (1%) | 13.7ms / 73fps (1%) |
| **Pinch zoom (in/out)** | **19.8ms / 51fps (29%)** | **26.9ms / 37fps (38%)** |

Pan-class gestures are translation-only — the placed-label set can't churn
(sticky lanes + overscan admission) — and hold ~60fps+ even at 6×. **Pinch is
the heavy path**: every frame re-runs admission at a changing scale, so labels
enter/exit, chips re-key, and D3 joins + transitions dominate. Still
interactive at 6× (p50 was 16ms — the jank is spiky, not uniform). If real
hardware stutters, the candidate fix is throttling the full repack to
alternate frames during an active pinch (translating the previous placement
in between). Both harnesses are committed: `npm run perf:mobile` (frame
stats, throttle as arg) and `npm run verify:touch` (functional checks:
long-press preview, tap→modal, overscan placing off-screen labels once
zoomed — 6/6 green), on top of `scripts/cdp-mobile.mjs`; run
`npm run build` first.

## 6. Open items

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
  the modal overlay, not just on the svg.
- ~~**TG-Q3**~~ — resolved: the coarse-pointer polish pass, §5 (hit targets,
  press-and-hold preview, emulated-mobile perf check). The related border-pop
  flicker fix (labels/chips popping into existence at the viewport edge during
  a pan — most visible on mobile) landed alongside as edge overscan + a
  distance-based border fade, LD10 in
  [`label-decluttering.md`](label-decluttering.md).
- **TG-Q4** — Real-device confirmation of the §5 numbers and feel (the CPU
  throttle is an approximation; scrolling/rasterization behave differently on
  real phones), and a zoom-*out* step gesture (two-finger tap) if pinch-out
  alone proves clumsy in practice.
