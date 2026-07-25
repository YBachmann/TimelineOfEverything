# Portrait mode — a vertical time axis for phones

> Topic design doc for **D27**. A phone-shaped viewport is a bad fit for a horizontal
> timeline, and three previous passes (D10, D13, D26) worked around the consequences
> rather than the cause. This doc covers the rotation: why it pays, the one place it is
> not a rename, and what the layout module now guarantees in both orientations.
> Indexed from the main [`DESIGN.md`](../../DESIGN.md).

**Status:** implemented (D27). Phase 1 made the layout engine orientation-free; phase 2
rotated the renderer, gestures and chrome, and answered PM-Q1/PM-Q2 (§7).
**Last updated:** 2026-07-25

---

## 1. Problem

At 390×844 the chart gets a 390px time axis. A label is a ~9:1 box — median **151px wide,
16px tall** across the 191 events — so at most ~2.3 labels fit per lane, and the packer
falls back to `+N` chips almost immediately. Measured on the real dataset, a portrait
phone places **16 labels** at the fitted view, and the ones it does place are clipped at
both screen edges because a 151px label centred near the axis end overhangs it.

This is the cause behind three previous passes treating symptoms:

- **D10** hid `.timeline-info` on small screens to buy chart height.
- **D13** added 44px hit targets and press-and-hold, because marks are too dense to aim at.
- **D26** added a gesture coach, because the hints box D10 hid was the only thing that
  said gestures existed.

None of them addressed the fact that the axis is running along the short side of the
screen.

## 2. Why rotating pays — and by how much

The de-cluttering doctrine ([`label-decluttering.md`](label-decluttering.md) §2) is built
on one asymmetry: time is 1-D, labels are 2-D boxes, and the axis *perpendicular* to time
is the entire budget. Rotating swaps **which dimension of a label lies along time** — its
width (151px) becomes its line height (18px), a ~8× reduction in the scarce direction,
paid for by lanes that now cost a column width instead of 22px.

Measured by `verify:layout` on a 390×700 chart, same dataset, same packer:

| | labels at fitted view | lane hops over the gesture sim |
|---|---|---|
| Horizontal (ships today) | 16 | 723 |
| Vertical | **26** | **42** |

**Two findings worth recording, because both contradicted the estimate that justified
starting.**

- *The capacity gain is 1.63×, not the 3–4× a back-of-envelope predicted.* That estimate
  assumed events spread evenly along the axis. They do not: at the fitted view **113 of
  191 events fall inside a single 24px slot** of the 700px axis. What absorbs a clump that
  dense is *columns*, not axis length — and a 390px screen affords exactly one column per
  side. A probe confirmed lane count is the binding constraint (1→4 lanes/side gives
  23→38→49→59 labels), which is also why tablets do better than phones here for free.
- *The larger win was the one nobody predicted: lane churn drops to 0.06×.* A "lane hop"
  is a label changing lane between frames — the thing that makes the horizontal phone
  layout read as chaotic while panning. A 181px column that holds a whole title barely
  repacks at all. Raw label count understates the improvement, so **both** properties are
  gated (§5).

## 3. The model: one renderer, two axes

`src/timelineLayout.js` no longer knows which way time runs. Everything is stated in:

- **`t`** — position *along* the time axis (screen x when horizontal, y when vertical)
- **`cross`** — position *across* it, where lanes stack

The camera was already 1-D (`scale` + `translate` over an axis length), so it needed
renaming rather than rethinking. `assignSpanLanes` and `computePriorities` are
orientation-invariant outright — span overlap is a fact about time, not about pixels.

The caller supplies the metrics that genuinely differ, as a per-orientation object:

| | `lanePitch` | `labelGap` | `enterSlack` | label extent along time | chip extent along time |
|---|---|---|---|---|---|
| Horizontal | 22px (`LANE_HEIGHT`) | 8 | 14 | its measured **width** | pill width (grows with count) |
| Vertical | column width, from `verticalLaneMetrics()` | 2 | 3 | `LABEL_LINE_H` (18px) | `CHIP_H` (18px), constant |

`labelGap` and `enterSlack` are along-time quantities and had to shrink: 8px either side
of a 151px label is 10% of its box; either side of an 18px row it is 89%. Carrying the
landscape values over cost 4 of 27 placeable labels. The vertical values are set by the
*proportion* the landscape ones imply rather than tuned by eye — `enterSlack` is ~9% of a
horizontal label box and ~14% of a vertical one, so LD6's anti-flicker hysteresis is if
anything stronger, not weaker.

**A simplification falls out.** Vertically a label occupies one line height *whatever it
says*, so packing is text-independent — which means truncating a title to fit its column
cannot change the layout. The D22 hazard (measuring one string while drawing another,
silently under-reserving space) **cannot arise in this orientation**. `fitLabelText()`
still lives in one place in `format.js`, but only so the two callers agree on shape.

## 4. The one place it is not a rename

Horizontal and vertical disagree about what a lane's cross coordinate *means*:

- **Horizontal:** a label is centred on its lane, so `cross` is its baseline, and lanes
  step outward by a full pitch.
- **Vertical:** a label is anchored at its column's **inner** edge and grows outward
  (`text-anchor: end` on the left, `start` on the right), so lane 0 sits one gutter off the
  spine and each further lane steps out by a column width.

`crossForH` / `crossForV` name that difference; the packer takes one as a parameter.

**This is the bug the spike caught, and it is why the spike existed.** The first vertical
render placed every label at `crossCenter ± lanePitch` — the column's *far* edge — so
every title rendered off the side of the screen. **Every invariant still passed**: the
packer only ever compares cross values for equality, so a uniformly wrong mapping is
invisible to it. Ninety seconds of screenshot caught what 1,326 verified frames could not,
which is D25's lesson arriving on schedule.

The overlap check had to follow. A cross-distance test is the wrong shape vertically —
lane 0 left and lane 0 right sit 28px apart and can *never* collide, while two labels in
one column sit at distance 0 and collide unless their time intervals are disjoint. So the
predicate is per-orientation, and what keeps different *columns* apart is the truncation
invariant (§5), not their spacing.

## 5. What the machine checks

`verify:layout` runs its whole gesture sim — 1,326 frames over 6 zoom-pan-zoom
gestures — **twice**, against the same real module, and adds three checks:

- **A truncation invariant** (vertical only): every rendered title must fit its column.
  Nothing else would catch an overrun, precisely because packing is text-independent
  there. Currently **55/191 titles truncate** to the 181px column on a 390px phone.
- **A capacity floor**: portrait must place ≥1.3× the labels landscape does *on the same
  phone*, against a measured 1.63×.
- **A churn ceiling**: portrait lane hops must stay under 0.3× landscape's, against a
  measured 0.058×.

The last two exist because the entire justification for a second orientation is that it
pays — so that claim is gated rather than asserted in prose. Thresholds sit well clear of
the measured values so neither is a curve fit, and the measured numbers are printed on
every run, which is the real regression signal.

Landscape output is **byte-identical** to before the refactor (33 labels, 6 chips, 589
lane hops, 310px overscan), which is what makes the change safe to have made at all.

### 5.1 What the browser gate needed (`verify:touch`, 13 → 16)

The phone profile now renders portrait, so `verify:touch` exercises the vertical layout
end to end. Three things came out of that, and two are about the *checks*, not the app:

- **A positive orientation assertion.** `verify:touch` asserts the phone profile *is*
  vertical. Without it, a regression that silently reverted to horizontal would leave
  every other check passing — D26's lesson (a feature that only appears under a condition
  has an absence that looks like correctness) applied to a whole layout.
- **Two checks were measuring the wrong axis.** The overscan and edge-fade checks read
  screen-x, which in portrait is the *cross* axis. They failed against a chart that was
  behaving perfectly. Fixed to follow whichever axis carries time.
- **The overscan check was a proxy, and the proxy does not survive rotation.** It asked
  whether a label's rendered box sat *entirely* off-screen. That works horizontally only
  because the band is ~310px against a ~150px label; vertically the band is 28px against
  an 18px line, leaving a ~17px window per side, so whether any label lands in it is down
  to the data at that zoom. Replaced with the property itself — **a placed label's anchor
  may lie outside the viewport**, which is exactly what overscan buys over edge-culling
  and is band-independent. The better check in both orientations.

### 5.2 A check that could not fail, caught by running the control

The pan gesture got a functional check: drag along the time axis, assert the range readout
changed. Running the **control** — reverting `touch-action` to D11's `pan-y`, which should
break portrait panning — showed it **still passed**. CDP's `Input.dispatchTouchEvent`
synthesizes touch events directly and does not reproduce the compositor's `touch-action`
arbitration, so the browser never claims the gesture the way a real phone would. The
magnitude did collapse (260 BCE → 376 BCE instead of → 13.4 kya), but gating on a
magnitude threshold would be fitting a number to the control rather than testing the
property.

So it split in two: the **declaration** is asserted on the computed style, where it is
exact and where the control run does fail; the **behaviour** check stays as a labelled
smoke test. The transferable part is the method — D18 established that a motion check
needs a control proving it can fail, and this is the first time that control caught a
check that could not.

## 6. Interplay

- **LD10 (edge overscan).** Overscan is one max label extent along time, so it falls from
  310px to 28px vertically — correct, not a regression: the thing that could pop is now
  18px tall rather than 271px wide. The "no border pops during pan" invariant holds in
  both orientations.
- **D13 / D26 (mobile polish, gesture coach).** Both were working around this problem.
  Neither is removed by phase 1; whether the coach still earns its place once the chart
  is legible on a phone is an open question (OB-Q3's sibling).
- **D11 (`touch-action: pan-y`).** Phase 2 collides with this head-on — see §7.
- **D22 (one function decides what a label says).** Preserved and, vertically, made
  structurally unnecessary; see §3.

## 7. Phase 2 — the renderer, and the two decisions it settled

The camera was already 1-D, so phase 2 is mostly mechanical: `axisLen` replaces `width`
in every camera expression, `crossCenter` replaces `centerY`, and two helpers `PX(t,
cross)` / `PY(t, cross)` decide which screen axis is which at paint time. Four things
needed more than that:

- **The gradients rotate.** A fuzzy span's end-fade runs along the bar's long side, which
  is the time axis, so the `linearGradient` vector is orientation-dependent.
- **Bars, chips and label hit-rects swap which attribute carries length.** Each is
  expressed once, as a helper taking a thickness and a cross position.
- **Labels anchor differently** — §4, `text-anchor: end/start` vertically instead of
  `middle`, and the hit rect hangs off `cross` in the direction of `side`.
- **The ruler becomes a left gutter** (`d3.axisLeft`, `margin.left` 20 → 50, ticks one
  size down), because a bottom ruler has no vertical equivalent — the ticks have to run
  alongside time, not across it.

### PM-Q1 — answered: `touch-action: none`, which settles half of RL-Q1

Vertical time means the pan *is* a vertical swipe, exactly the gesture D11 handed to the
browser. Portrait takes it back. That resolves the tension
[`responsive-layout.md`](responsive-layout.md) §8 recorded but declined to act on: RL-Q1
said pull-to-refresh could not be restored because a downward drag on the chart would
become an accidental reload. In portrait, the chart claims vertical gestures outright, so
PTR **cannot originate there** — the hazard that made RL-Q1 not worth fixing is gone on
exactly the screens portrait mode covers.

### PM-Q2 — answered: the chart box's own aspect ratio

`vertical = svgH > svgW * 1.1`, computed from the measurement the render effect already
takes. Not a media query restated in JS — the same instinct as D26/OB1 (ask the DOM, do
not duplicate the CSS that governs it) and D19 (read `activeElement` rather than cache
it). The geometric fact *is* the condition, so it cannot drift from a breakpoint, and a
phone rotation flips it for free through the `ResizeObserver` that already rebuilds the
scene. The 1.1 bias means a near-square box stays horizontal: landscape is the default the
desktop layout is tuned for, so ambiguity resolves toward "don't change".

### The minimap stays horizontal — on purpose

Rotating it was rejected. Its era band labels need horizontal room to be readable at all
(a vertical strip would need rotated text or a strip too narrow to label), and it would
spend cross-axis width that the label columns need more. It is an orientation aid whose
axis is *time*, not a spatial mirror of the chart — the same argument that lets a
horizontal scrubber sit under a vertical list anywhere else. The honest cost is that the
chart's axis and the minimap's axis disagree in portrait; the viewport window and the era
bands still read correctly, and the scrub gesture is unchanged.

## 8. Open items

- ~~**PM-Q1 / PM-Q2**~~ — answered in §7.
- **PM-Q3 — truncation is the real cost, and the shipped columns are narrower than the
  spike's.** The spike modelled 181px columns; the shipped chart gives **141px** on a
  390px phone, because the year gutter (50px) and the spine clearance (18px per side)
  come out of the cross axis first. Most titles at the fitted view now show as
  `≈ Dinosaur Exti…`. Still legible enough to identify an event, and a tap gives the full
  record — but this makes [`label-decluttering.md`](label-decluttering.md)'s **LD-Q1** (a
  dedicated `shortTitle` field vs. smart truncation) load-bearing for the first time.
  Three levers exist if it grates, in increasing cost: turn
  `settings.precisionMarksOnLabels` off in portrait (the `~`/`≈` prefix costs two
  characters of every label, and D22 built that setting for exactly this kind of trade),
  drop the year gutter and rely on the minimap, or add `shortTitle` (191 hand edits).
- **PM-Q4 — the chart gets ~40% of a phone screen**, because the category row and the era
  preset row each wrap to two lines before the chart starts. Pre-existing — portrait mode
  neither caused nor fixed it — but it caps the payoff, and it is now the largest single
  win available on a phone.
- **PM-Q5 — portrait keyboard navigation is unverified.** `verify:a11y` runs the desktop
  profile, which is horizontal, so D19's cursor, camera follow and the new Up/Down arrows
  are exercised in one orientation only. Same shape as C-Q2 and OB-Q1: the harness has a
  `launchMobile()` profile, nothing has been pointed at it.
- **PM-Q6 — the far-future stretch is a large empty band.** Symlog puts +5e9 at the
  bottom with almost nothing above it, which on a tall screen reads as ~30% dead space.
  This is equally true horizontally today (the empty right edge) and is arguably more
  noticeable vertically. No fix proposed; noted because the spike made it obvious.
- **PM-Q7 — tablets get more than phones, untested.** `verticalLaneMetrics` yields 2
  columns per side above ~250px of half-width, capped at `MAX_LANES_V = 2` because a third
  column's leader would cross two others. That cap is reasoning, not measurement.
- **PM-Q8 — posters.** A portrait poster shares this geometry but drops the LOD system
  entirely (a `+N` chip is a dead end on paper), so it needs a different density policy and
  a print render target. The README's Origin section abandoned the poster because scale
  differences made static visualization impractical — D4 (symlog) is precisely the answer
  to that, and is now proven, so the idea is revivable. Out of scope for D27.
