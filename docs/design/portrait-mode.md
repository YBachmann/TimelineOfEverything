# Portrait mode — a vertical time axis for phones

> Topic design doc for **D27**. A phone-shaped viewport is a bad fit for a horizontal
> timeline, and three previous passes (D10, D13, D26) worked around the consequences
> rather than the cause. This doc covers the rotation: why it pays, the one place it is
> not a rename, and what the layout module now guarantees in both orientations.
> Indexed from the main [`DESIGN.md`](../../DESIGN.md).

**Status:** phase 1 of 2 implemented — the layout engine is orientation-free and gated in
both orientations; `Timeline.jsx` still renders horizontally only. Phase 2 (the renderer,
gestures, minimap, keyboard cursor, orientation switch) is scoped in §7.
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

## 7. Phase 2 — scope, and the two decisions waiting in it

Phase 1 deliberately stops at the layout engine, which is verifiable end-to-end on its
own. `Timeline.jsx` (1971 lines) still renders horizontally, so **no user-visible change
has shipped yet**. What remains:

1. **The render pass** — map `(t, cross)` → `(x, y)` at every mark: spine, dots, span
   bars and their mini-lanes, leaders, labels, chips, the axis, the edge fade.
2. **Gestures** — pan/pinch/momentum/double-tap along the new axis.
3. **The minimap** — a vertical strip. `eraScale.js` is already orientation-free (it maps
   year ↔ fraction), so this is render and CSS, not math.
4. **The keyboard cursor** — D19's 12% comfort band and camera follow on the new axis.
5. **Orientation switch + CSS**, and a portrait profile added to the three browser gates.

Two decisions are deliberately *not* pre-made here, because both should be made while
looking at the real thing rather than a spike:

- **PM-Q1 — `touch-action` must change, and it reopens RL-Q1.** Vertical time means
  vertical drag is the pan, so the chart must take `touch-action: none`; the browser
  cannot keep vertical swipes. That is *half* of the "real fix" that
  [`responsive-layout.md`](responsive-layout.md) §8 says pull-to-refresh needs — so
  portrait mode forces a decision RL-Q1 chose to defer, rather than inheriting it.
- **PM-Q2 — when to switch.** Candidates: a `(orientation: portrait)` media query, an
  aspect-ratio threshold, or asking the DOM the way D26/OB1 does. The D26 instinct
  (resolve it from the DOM rather than duplicating a media query in JS) probably applies,
  but there is no hidden element to read here, so it needs its own answer.

## 8. Open items

- **PM-Q1 / PM-Q2** — above, both belong to phase 2.
- **PM-Q3 — 29% of titles truncate on a phone** (55/191, at the 181px column). Acceptable
  — the mark still opens full details on tap — but it makes
  [`label-decluttering.md`](label-decluttering.md)'s **LD-Q1** (a dedicated `shortTitle`
  field vs. smart truncation) load-bearing for the first time. Truncation is the answer
  for now because `shortTitle` is 191 hand edits.
- **PM-Q4 — the far-future stretch is a large empty band.** Symlog puts +5e9 at the
  bottom with almost nothing above it, which on a tall screen reads as ~30% dead space.
  This is equally true horizontally today (the empty right edge) and is arguably more
  noticeable vertically. No fix proposed; noted because the spike made it obvious.
- **PM-Q5 — tablets get more than phones, untested.** `verticalLaneMetrics` yields 2
  columns per side above ~250px of half-width, capped at `MAX_LANES_V = 2` because a third
  column's leader would cross two others. That cap is reasoning, not measurement.
- **PM-Q6 — posters.** A portrait poster shares this geometry but drops the LOD system
  entirely (a `+N` chip is a dead end on paper), so it needs a different density policy and
  a print render target. The README's Origin section abandoned the poster because scale
  differences made static visualization impractical — D4 (symlog) is precisely the answer
  to that, and is now proven, so the idea is revivable. Out of scope for D27.
