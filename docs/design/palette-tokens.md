# Palette tokens — naming the colors D23 measured

> Topic design doc for **D24**. The dark theme was *measured* by D23 and still had no
> vocabulary: every color was a literal, repeated. This pass gives the palette a token
> layer, collapses eleven text greys into a five-step ramp, and splits the one seam a
> background layer behind the chart will have to move. Prerequisite for
> [`era-parallax.md`](era-parallax.md) (D25). Indexed from the main
> [`DESIGN.md`](../../DESIGN.md).

**Status:** implemented (D24) — 119 contrast surfaces, 114 pass, 5 accepted, 0 fail.
**Last updated:** 2026-07-25

---

## 1. Problem — measured, but not named

D23 established what every color in the app *scores*. It did not establish what any of
them are *called*, and the difference started to cost:

- **`#0a0e27` had six declaration sites doing three unrelated jobs.** It is the page
  background; it is the color three separate mechanisms paint to *erase* what is behind
  them (the label-text halo LD4, the dot halo, the D19 cursor halo); and it is the dark
  **ink** on light category badges (D23 C1). Those three have no reason to move together
  — but a literal cannot say so, and one of the six sites was a `.attr('fill', '#0a0e27')`
  inside `Timeline.jsx`, invisible to anyone reading the stylesheet.
- **Eleven distinct greys carried text**, doing perhaps five jobs: `#e0e0e0`, `#d0d4e8`,
  `#b9c0dd`, `#b8bde0`, `#c7cbf0`, `#b0b0b0`, `#999`, `#8b93b8`, `#8a90b8`, `#7b82a4`,
  `#fff`. Several pairs were near-identical (`#b9c0dd`/`#b8bde0`, `#8a90b8`/`#8b93b8`),
  which is the exact hazard D23's **C3** warns about, one level up: C3 says don't invent a
  bespoke near-threshold value, and the file had accumulated a dozen bespoke values that
  merely happened to pass.
- **Three of the greys were pure neutrals** (`#e0e0e0`, `#b0b0b0`, `#999`) in a theme whose
  every surface is blue-black. They predate the theme cohering, and against `#1a1f3a` they
  read faintly muddy next to their tinted neighbours.

None of this is a contrast defect. It is the reason a contrast defect had somewhere to
hide (§5), and the reason a background layer behind the chart could not be built.

## 2. The token model

One `:root` block, and two properties it is built to have.

**Elevation reads as lightness**, `--bg` < `--surface` < `--surface-raised` <
`--surface-high`. The app previously had two real surface levels and three stray literals
(`#232a4d`, `#2a3158`, `#3a4370`) filling in wherever depth was wanted.

The delicate part is *which direction* to introduce the missing step. Raising the elevated
surfaces would have lightened the background under every panel, modal, dropdown and
tooltip — lowering the ratio of all the light text on them and eating the margin D23 had
just bought. So the **base surface moved down instead** (`#1a1f3a` → `#151a31`, now
`--surface`, carrying the buttons, the search box and the hints panel), and every raised
surface kept the exact value D23 measured. Depth was bought entirely in the safe
direction: nothing regressed to pay for it.

| Token | Value | Carries |
|---|---|---|
| `--bg` | `#0a0e27` | page, chart, the badge-ink value |
| `--surface` | `#151a31` | buttons, search box, control hints |
| `--surface-raised` | `#1a1f3a` | dropdown, tooltip, modals, legal panel, chip pill |
| `--surface-high` | `#232a4d` | `<kbd>` keys |

**`--knockout` is separate from `--bg`, though equal today.** This is the whole reason the
branch is sequenced before the parallax work. Three mechanisms paint the background color
to erase what sits behind them, and they are invisible *only because the thing behind them
is that color*. Put anything else back there — a starfield, an era gradient — and each
becomes a visible dark blob: a black disc under every dot, a black outline around every
label. `--knockout` is the single seam D25 has to move; `--bg` (the page, which stays
opaque behind the chrome) and `--badge-ink` (dark ink on a *light* badge, no relationship
to the background at all) must not follow it.

**The text ramp is five steps.**

| Token | Value | Job | Worst measured |
|---|---|---|---|
| `--text-strong` | `#ffffff` | headings, hover | 16.14:1 |
| `--text` | `#e4e7f5` | body | 13.10:1 |
| `--text-muted` | `#c7cbf0` | secondary: descriptions, dialog body, years | 10.17:1 |
| `--text-dim` | `#8a90b8` | tertiary: placeholders, axis, section headers | 5.20:1 |
| `--text-faint` | `#7b82a4` | footer, error detail | 5.04:1 |

Consolidation direction follows C3 — merge onto the token with the most margin, never onto
a near-threshold one — so every absorbed value moved *up*. `#b0b0b0` (modal descriptions)
gained the most, and it is the most visible single change in the pass.

## 3. Key decisions

- **P1 — Buy depth downward.** §2. A palette change that improves some ratios and worsens
  none needs no argument about whether the worsened ones were "still fine".
- **P2 — Split a token by *role*, not by value.** `--bg`, `--knockout` and `--badge-ink`
  are all `#0a0e27` and a linter would call two of them redundant. They are not: they are
  three independent claims that happen to agree today, and the next feature separates them.
  Equal values are not the same token when they answer different questions.
- **P3 — Five text steps, even though the bottom two nearly touch.** `--text-dim` (5.20:1)
  and `--text-faint` (5.04:1) are close enough to look like the near-duplicates this pass
  set out to remove, and merging them was considered and rejected. The compression is not
  sloppiness — it is **the 4.5:1 floor squeezing the bottom of a dark ramp**. There is very
  little room between "quietest legible tier" and "illegible", so the two quietest jobs
  necessarily sit near each other. D23 tuned `#7b82a4` for the footer five days ago
  precisely to clear that floor; collapsing it to save a token would undo a calibrated
  decision to make a table look tidier.
- **P4 — Static presentation moves to CSS; per-datum color stays in JS.** This is the line
  drawn through the chart's colors, and it is not "CSS good, JS bad":
  - *Moved to CSS:* the dot halo's fill, the `+N` chip pill's fill, the gridlines and the
    spine ticks. All four were fixed palette values that happened to be set by d3, two of
    them on elements that had no class at all until now.
  - *Stayed in JS, correctly:* the five category colors in `format.js`, the
    `d3.interpolateLab` endpoints that mix label-tier fills at render time, the chip's
    per-cluster stroke, the cursor's white. These are **data or color math**. `var()` is
    not usable in either — SVG presentation attributes don't resolve it, and
    `interpolateLab` needs a parseable color, not a reference.

  The chart therefore keeps two color systems on purpose, with a stated boundary, rather
  than one system and a pile of exceptions.
- **P5 — Every D23 fork survives intact.** `--accent` (border role) and `--accent-fill`
  (fill-under-white-text role) stay separate per C2, with the reason restated at the
  declaration so a future tidy-up doesn't merge them back. `--badge-ink` keeps C1's dark
  ink on unmodified category colors. The five category colors did not move at all — they
  are the dataset's encoding.

## 4. What the tokens are *not*

Not a theming mechanism. `:root` is the only scope, there is no `[data-theme]` selector,
and nothing reads the tokens at runtime. A light theme remains the large job D23 C1
describes — the category colors are light-to-mid *because* the chart is near-black, so
inverting the background means re-deriving the dataset's encoding, not swapping variables.
The tokens make that job *possible* to attempt; they do not make it done.

## 5. What the pass found: an assertion that opted out of failing

Tokenizing `.tt-hint` (the *"Click to zoom in"* line on a cluster chip's tooltip) surfaced
that it was `--accent` at 10px on the raised panel — the identical pair that D23 caught as
`.tt-year`, measured there at **4.41:1** against a 4.5 minimum, and moved to `--accent-text`
for it. `.tt-hint` was never moved, because it was never measured:

```js
await sample('tooltip hint', '.timeline-tooltip .tt-hint', { required: false });
```

The sample sat in the state walk's **event-mark** hover block, and that hint renders *only*
on a **cluster chip's** tooltip. So the selector matched nothing on every run, and
`required: false` turned "unreachable" into silence. D23 §7 states the governing rule —
*"a surface whose state cannot be reached is a failure too — otherwise a selector rotting
into a no-match would read as a pass"* — and the opt-out flag is a hole straight through it.

Two fixes, and the second is the one that matters:

1. `.tt-hint` takes `--accent-text` (**6.80:1**), consolidating onto the token `.tt-year`
   already uses rather than adding a value.
2. The walk now **hovers a chip** and samples the hint as *required*. Finding a hoverable
   chip needed `elementFromPoint` rather than the chip's own bounding box: lane-0 label
   hit-rects overlap the chip band and the label layer draws above chips, so a chip's
   geometric centre frequently belongs to a label. Probing three points across each
   candidate until one hit-tests back to `g.cluster-chip` is what makes it reliable instead
   of positionally lucky.

The 4.41:1 figure was reproduced by hand against the sRGB luminance formula before it was
called a failure — D23 §3.1's rule that a measurement tool's bug is indistinguishable from
a finding applies just as much to a tool that reports *nothing*.

> **The transferable lesson: an optional assertion is an assertion that will eventually be
> skipped, and it will be silent about it.** `required: false` existed for surfaces that
> may legitimately be absent; what it actually bought was a check that had never once run.
> Surface count is now the tell — the walk measures **119**, and the number going *down*
> is as much a regression as a ratio going down.

## 6. Interplay

- **D23 (contrast).** This pass changes no accepted shortfall and no threshold, and every
  fix moves in the direction D23's own C3 prefers. The gate is what made a change this
  broad safe to attempt at all: ~150 substitutions across 1,200 lines of CSS, verified in
  one command. Doing this *before* D23 would have been reckless; doing it after is cheap.
  That sequencing is the argument for doing palette work immediately after a contrast audit
  rather than at any other time.
- **D22 / LD4 / D19 (the three halos).** Now one token, `--knockout`. The rationale for why
  the trick works — the halo is invisible because it matches what is behind it — lives at
  the token rather than being re-derived in three comments.
- **D25 (era parallax), next.** `--knockout` is the seam. The open question it inherits is
  §7's first item.

## 7. Open items

- **PT-Q1 — `--knockout` has to stop being a constant.** Once anything is painted behind
  the chart, the halos need "the darkest value of the local background", which a single
  token cannot express. The candidate answers are a scrim under the chart region (keeps one
  constant, costs some of the parallax's visibility) or per-mark sampling (expensive, and
  pinch is already the measured frame budget — D13). D25 has to pick one; this doc only
  guarantees there is exactly one place to change.
- **PT-Q2 — The category colors are declared twice.** `src/format.js` holds the canonical
  copy for the chart and `--cat-*` mirrors it for the badges. P4 explains why the JS side
  cannot read the CSS side, but nothing currently *checks* that the two agree — a drift
  hazard of exactly the kind `verify:layout` exists to catch, and a natural small addition
  to it (parse the `:root` block, compare to `CATEGORY_COLORS`).
- **PT-Q3 — `required: false` is still available in the contrast harness** and is now used
  nowhere. Either remove the option outright, or make skipping it print a visible NOTE so
  a future use cannot be silent (§5).
- **PT-Q4 — Contrast is still desktop-profile only** (C-Q2, unchanged). The new
  `--surface` value is used by the control hints, which are `display: none` on phones, and
  by the filter buttons, which are not — so the small-screen breakpoints remain unmeasured
  for the same reason as before.
