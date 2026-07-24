# Mobile Polish (Coarse-Pointer Pass)

> ⚠️ **Retroactive doc — written after the fact.** Reconstructed on **2026-07-24** from the
> merged branch `feature/mobile-polish` (PR #14, commits `72b94aa` feature + `68591bd`
> harness), its diff, and the Claude Code session that produced it (`3a8271e3`, 2026-07-19).
> It reports the decisions as they can be recovered, not as a contemporaneous log. The
> **decision entry of record remains [`DESIGN.md` → D13](../../DESIGN.md).**

> **Hub / synthesis doc.** The third and final pass of **Q9** — after responsive layout
> ([`responsive-layout.md`](responsive-layout.md), D10) and touch gestures
> ([`touch-gestures.md`](touch-gestures.md), D11): coarse-pointer hit targets, a
> press-and-hold preview, and the edge overscan + border fade that stops marks popping in at
> the viewport edge — plus the committed headless-mobile harness. The deep mechanics live in
> **[`touch-gestures.md`](touch-gestures.md) §5** (hit-target table, long-press, perf numbers)
> and **[`label-decluttering.md`](label-decluttering.md) LD10** (overscan + fade); this doc
> ties them together and records *why*. Closes **TG-Q3**. Indexed from the main
> [`DESIGN.md`](../../DESIGN.md).

**Status:** implemented (D13). Residual: real-device confirmation (TG-Q4).
**Last updated:** 2026-07-24 (retroactive).

---

## 1. Why a polish pass

D10 made the layout responsive; D11 gave touch pan/pinch/tap. But the app was still built for
a **fine pointer with hover**: 24px dot targets, tooltips that only exist on hover, hint copy
about the mouse wheel, and — most visibly on a phone, where drag-pan is the primary gesture —
labels and chips *popping into existence at the viewport edge*. TG-Q3 is that cleanup, in three
threads (§2–4), plus a performance check and a committed harness (§5–6).

## 2. Hit targets — 44px where geometry allows, capped where it doesn't

Targets are sized off `matchMedia('(pointer: coarse)')`: SVG-internal ones in `Timeline.jsx`,
HTML chrome in a matching `@media (pointer: coarse)` block in `App.css` — placed *after* the
small-screen compaction block on purpose, because on a phone **tappability beats compactness**.
Dot hit circles go 24→44px, the minimap 40→48px, chrome (buttons / search / dropdown rows /
modal lists) to ~40–44px, and the search input to 16px (below that iOS zooms the page on focus).

The design principle worth preserving: **a target is capped wherever its own geometry would
make it overlap a neighbor** — a fat tap area that eats the next lane is worse than a small
honest one. So label rects stay at the 22px lane pitch, span bands at 14px over the 7px
mini-lane pitch, and era pills stay small to protect chart height. The full per-target table
(fine vs coarse vs the cap reason) is in [`touch-gestures.md`](touch-gestures.md) §5.

## 3. Press-and-hold preview — hover for a world without hover

Touch has no hover, so "what is this dot?" had no answer short of opening the modal. A 500ms
hold on any mark now shows the same preview tooltip hover shows, positioned *above* the touch
point (where the finger and hand can't cover it), with the dot↔leader↔label highlight triad.
The release is swallowed (a preview must not commit to the modal) and the preview lingers until
the next gesture, so it can be read with the finger lifted. A pan-slop crossing, a second
finger, or a hold that began as a *catch* (grabbing a moving timeline) all cancel it. Mechanics
in [`touch-gestures.md`](touch-gestures.md) §2.6.

## 4. Edge overscan + border fade — the two-step no commit explains

This is the thread the session preserves and the diff cannot. It landed in two moves, each
driven by a direct reaction to the previous build.

- **Step 1 — overscan (fixes the pop).** Cause of the flicker: events were admitted to label
  packing / chip clustering only while their anchor sat in `[0, width]`, and the dot swapped
  its labeled (big) ↔ bare (small) size *right at the border*. Fix: admit within a window
  widened ~one max label width per side, so every enter/exit/re-key/size-swap happens
  **off-screen** and marks *slide* into view; the *rendering* geometry stays honest (true
  viewport). Machine-gated — `verify:layout` asserts "no label newly appears with on-screen
  pixels during a pure pan" (0 border pops at 191 events). Full rationale in
  [`label-decluttering.md`](label-decluttering.md) LD10.
- **Step 2 — the fade (because overscan felt dead).** The reaction to the overscan build was
  that it fixed the pop but made the borders read *"static and dull"* — could it get "some more
  life back," maybe an opacity or font-size fade? So labels, leader lines, and chips now fade by
  distance from the border (smoothstepped ~50–120px band, narrower on phones so the vignette
  doesn't swallow a small screen): an entering mark **materializes** as it travels inward, and
  because opacity is a continuous function of position there is no discrete on/off moment left
  at the edge at all. **Opacity, not font-size** — a per-frame font ramp would re-layout every
  label (pinch is the measured mobile bottleneck, §5) and read as wobble. Dots and span bars
  stay solid: they are the persistent anchors, and a solid dot under a fading label keeps edge
  content grounded.

## 5. Performance — pan is cheap, pinch is the budget

Measured on headless Edge + CDP against the production build (390×844@3x emulation, touch
gestures dispatched via `Input.dispatchTouchEvent`, rAF frame-time stats; CPU throttling
approximates hardware — 4× ≈ mid-range, 6× ≈ low-end). **Pan-class gestures** (drag, flick +
glide, drag-while-zoomed, double-tap flight) hold ~60fps+ even at 6×: they are translation-only,
so the placed-label set can't churn (sticky lanes + overscan admission keep the scene
identical). **Pinch is the heavy path** (37–51fps, spiky): every frame re-runs admission at a
changing scale, so labels enter/exit, chips re-key, and D3 joins + transitions dominate. Judged
acceptable — still interactive, and the jank is spiky rather than uniform (p50 ≈ 16ms at 6×) —
with a candidate fix recorded: throttle the full repack to alternate frames during an active
pinch. Full tables in [`touch-gestures.md`](touch-gestures.md) §5.

## 6. The committed harness (the `chore` commit)

The throwaway CDP probes that began with D10 (see [`responsive-layout.md`](responsive-layout.md)
§7) were promoted here into committed tooling, in a separate commit from the feature:
`scripts/cdp-mobile.mjs` + `verify-touch.mjs` + `perf-mobile.mjs`, wired as **`npm run
verify:touch`** (functional checks — long-press preview, tap→modal, overscan placing off-screen
labels once zoomed: 6/6 green) and **`npm run perf:mobile`** (frame stats, throttle as an arg).
Both need `npm run build` first. A **`dev:host`** script was also added after a "page won't load
on my phone" detour that turned out to be Windows PowerShell 5.1 swallowing the bare `--` in
`npm run dev -- --host` (so Vite bound localhost-only) — `dev:host` makes LAN exposure
un-foot-gunnable.

## 7. Scope & open items

- **Closes TG-Q3**, and with D10/D11 closes **Q9**.
- **TG-Q4 (open):** a real-device confirmation of the §5 numbers and overall feel (the CPU
  throttle is only an approximation; rasterization/scrolling differ on real phones), and a
  zoom-*out* step gesture (two-finger tap) if pinch-out alone proves clumsy.
- Deep detail is deliberately **not duplicated** here — see
  [`touch-gestures.md`](touch-gestures.md) §5 and [`label-decluttering.md`](label-decluttering.md)
  LD10.
