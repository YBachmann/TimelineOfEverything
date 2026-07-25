# Color contrast — measuring the dark theme (A-Q3)

> Topic design doc for **D23**. Closes [`accessibility.md`](accessibility.md)'s
> **A-Q3** ("contrast has not been measured"): a browser-driven audit of every
> text and meaningful-graphic surface in the app, the palette changes it forced,
> and the five shortfalls kept on purpose. Indexed from the main
> [`DESIGN.md`](../../DESIGN.md).

**Status:** implemented (D23) — 118 surfaces measured, gated by
`npm run verify:contrast`.
**Last updated:** 2026-07-25

---

## 1. Problem — and what the open question got wrong

A-Q3 was recorded as a suspicion, not a finding: *"The palette is dark-on-dark by
design and several greys (`#6f779c` footer, `#8a90b8` axis ticks) are plausibly
under 4.5:1."* Measuring settled it, and the guess scored one from two:

| Named suspect | Verdict |
|---|---|
| `#6f779c` footer text | **guilty** — 4.34:1, just under the 4.5:1 minimum |
| `#8a90b8` axis ticks | **innocent** — 6.12:1 on the chart, 5.20:1 on panels |

The greys were never the problem. **The worst failure in the app was white text
on the light category badges** — `history` teal at **1.93:1**, less than half the
minimum, on a surface nobody had thought to suspect because it isn't grey at all
and isn't dark-on-dark. Two lessons, and the second is the reusable one:

- A palette audit cannot be driven by which colors *look* risky. Dark-on-dark was
  the assumed failure mode; light-on-light was the actual one.
- The one badge that already broke the pattern — `.category-technology` carried a
  lone `color: #000` override — was a note someone had left at the scene of the
  bug. It read as a quirk of yellow. It was the general case.

## 2. Why the audit runs in a browser, not over the stylesheet

Reading `App.css` cannot answer the question, for three separate reasons:

1. **Ten of the foreground colors exist in no source file.** On-canvas event
   labels are mixed at render time — `d3.interpolateLab(categoryColor,
   '#f5f7ff')(0.55)` for tier 1, `(…, '#e0e0e0')(0.35)` for tier 2 — so the
   colors that actually reach the screen are computed per category per tier.
2. **The `<h1>`'s `color` is a lie.** It paints a gradient clipped to the glyphs
   (`-webkit-text-fill-color: transparent`), so its *background* stops are its
   text color. A naive read measures a transparent foreground.
3. **Translucent marks have no color until composited.** Dots at
   `fill-opacity: 0.66`, span bars at `0.55`, the spine at `stroke-opacity: 0.35`
   only acquire a measurable value once painted over what is behind them.

And most of the palette is not on screen at rest. A tooltip, an open dropdown, a
detail modal per category, a cluster list, the legal dialog, an empty result set,
hover states, the focus ring — each has to be *entered* before it can be
measured. So the script is a **state walk** (`scripts/verify-contrast.mjs`), the
same headless-Edge-over-CDP approach as `verify:a11y`, not a stylesheet parse.

## 3. The measurement model

**Thresholds.** WCAG 2.2 SC 1.4.3 for text — 4.5:1, or 3:1 for large text
(≥24px, or ≥18.66px bold) — and SC 1.4.11 for non-text: 3:1 for marks and
control boundaries that carry meaning. Ratios from sRGB relative luminance.

**Foreground** is `color` (HTML) or `fill` (SVG), multiplied by `fill-opacity`
and by the **product of `opacity` up the whole ancestor chain** — the last of
those matters because the chart's edge fade (LD10) lives on the label group, not
the glyph.

**Background** is resolved by walking ancestors and compositing every translucent
`background-color` onto the first opaque one. Four rules earn their keep:

- **Start at the element itself, not its parent.** A badge or pill paints its own
  background behind its own glyphs. Starting one level up is what hid the
  category-badge failure through the first run of the audit.
- **A gradient has no single color, so every stop is a candidate and the worst
  one is reported.** Conservative, and it needs no guess about where in the
  gradient the text happens to sit. (This is how the minimap's era labels are
  measured: the minimap `<svg>` has no background of its own, so the walk reaches
  `.timeline-section`'s three-stop gradient.)
- **Gradient *paints* are picked by alpha, not position** — `core` = the most
  opaque stop, `rim` = the least. A fuzzy dot's gradient runs
  opaque→transparent, but a fuzzy span bar's runs transparent→opaque→transparent,
  so "the first stop" means the mark's body in one case and its invisible edge in
  the other.
- **One SVG text sits on a painted rect rather than the svg background**: the
  `+N` chip count, on its pill. Matched by class on both sides
  (`.chip-count` → `rect.chip-bg`) because the loose version of this rule — "any
  rect in my parent group" — grabbed a chip pill for the spine and the range
  readout, which share the chart's top-level `<g>` with every chip.

**Event labels are a special case that needs no special code.** Their halo (LD4 —
`paint-order: stroke` in the svg background color) knocks out whatever passes
behind the glyphs, so their background genuinely *is* `#0a0e27` rather than
whatever leader line or span bar happens to be under them. The ancestor walk
gets the right answer, and the halo is the reason it is the right answer.

### 3.1 The audit's own bugs, which is the transferable part

The first three runs each reported failures that were artifacts of the measurer,
not of the app: badges compared against the modal panel instead of their own
fill; category swatches compared against themselves once that was fixed; the
spine and range readout compared against a chip pill; fuzzy span bars measured at
their deliberately-transparent end. Every one of them *looked* like a plausible
finding.

> **A measurement tool is code under test like any other, and a contrast
> checker's failure mode is indistinguishable from a real finding.** What caught
> these was checking a handful of results by hand against an independent
> calculation — the spine composites `#667eea` at 0.35 over `#0a0e27` to
> `#2a356b`, which is what the tool now says and was not what it said at first.
> Any number in this doc that drove a code change was reproduced that way.

## 4. What it found, and what changed

17 text/control failures, all fixed. Ratios are worst-instance, before → after:

| Surface | Was | Now | Fix |
|---|---|---|---|
| Category badge — history / science / future / natural | 1.93 / 2.35 / 2.43 / 2.78 | 6.85–12.22 | dark ink instead of white |
| Filter button, active | 3.66 | 5.15 | darker accent fill |
| Filter button, hover | 4.23 | 5.97 | same |
| Suggestion count pill | 3.25 | 6.36 | `#c7cbf0` ink |
| Detail-modal year, tooltip year | 4.41 | 6.80 | `#8fa3ff` |
| Footer text | 4.34 | 5.04 | `#7b82a4` |
| `<h1>` gradient, purple end | 2.98 | 4.55 | `#906db4` |
| Language-toggle border | 1.70 | 3.52 | `#6d7495` |
| Axis tick marks | 2.37 | 3.32 | `#61657d` |
| Bare event dot | 2.77 | 3.52 | `fill-opacity` 0.55 → 0.66 |

## 5. Key decisions

- **C1 — Flip the text, never the category colors.** The five category colors are
  the dataset's encoding: they identify dots, bars, leader lines, tooltip
  headings and list swatches everywhere in the app, and they are light-to-mid
  *because* they have to read against a near-black chart. Darkening them to
  carry white text would have traded a badge problem for a chart problem. So the
  badges keep the color and take `#0a0e27` — the app's own page black — as ink:
  6.85:1 on the red through 12.22:1 on the yellow. `technology`'s existing
  `color: #000` override then vanishes into the shared rule, which is the tell
  that this was the right direction.
- **C2 — Split the accent into "fill" and "border" roles.** `#667eea` is the
  app's accent, and it passes comfortably as a *border* against every background
  it borders. It fails only where it is a **fill under white text** (3.66:1). So
  the fill role forked to `#5467c0` (white 5.15:1) and the border role did not
  move. Darkening the token globally would have been a worse trade: the borders
  are measured against the background, and dimming them walks toward the
  1.4.11 floor they currently clear.
- **C3 — Prefer an existing token over a bespoke near-threshold value.** Several
  failures could be cleared by a 2% lift — `#667eea` → `#6981ea` reaches 4.56:1.
  Every one of those was rejected in favour of an existing palette entry with
  real margin (`#8fa3ff` at 6.80:1 for accent text, `#c7cbf0` at 6.36:1 for the
  count pill). A value sitting on the threshold is a value that any future
  background tweak silently breaks, and it grows the palette to boot. The audit
  ends with *fewer* distinct colors in the accent family, not more.
- **C4 — A bare dot is a data mark and owes 3:1; the hierarchy survives anyway.**
  LD7 recedes unlabeled dots deliberately (`r` 3 vs 4.5, `fill-opacity` 0.55 vs
  1) so visual weight agrees with label priority. But a dot is the thing the
  chart is *made of*, so it cannot be exempted as decoration. The fix raises only
  the opacity channel, 0.55 → 0.66 (worst category 2.77 → 3.52:1), and leaves the
  radius gap untouched — the hierarchy rides two channels, so spending one of
  them still leaves the encoding intact.
- **C5 — Five shortfalls are kept, each with a reason in the gate itself.** The
  exceptions live in an `ACCEPTED` map in `verify-contrast.mjs` keyed by surface,
  so accepting a shortfall is a reviewable edit to a list with a written
  justification, not a number quietly drifting:

  | Accepted | Why |
  |---|---|
  | Fuzzy dot rim (1.00:1) | D22: the rim fade **is** the fuzzy-date cue. Gating it gates the feature. The core is measured separately and passes. |
  | Fuzzy span-bar end fade (1.00:1) | D15/SR-Q2: the same cue on spans. The bar body is measured separately. |
  | Minimap viewport window fill (1.24:1) | 1.4.11 asks about a component's **boundary**; this one's boundary is its stroke, at 3.33:1. The fill is a tint that has to let the era bands underneath read through, and cannot reach 3:1 at any usable alpha. |
  | Chart spine (1.65:1) | A structural guide carrying no value of its own — position is carried by the axis ticks and labels, which both pass. Reaching 3:1 needs `stroke-opacity` ~0.68, which roughly doubles the presence of the longest mark on screen: the brightest pixels on the least important thing, exactly inverting LD3. |
  | Footer separator (2.01:1) | Pure decoration and marked as such — the `·` carries `aria-hidden="true"`. Explicitly exempt. |

  The through-line: **a shortfall is acceptable when contrast loss is the
  feature, when the boundary rather than the fill carries the component, or when
  the DOM already declares the thing decorative.** It is not acceptable because a
  mark is small, quiet, or redundant with a tooltip.

## 6. Interplay

- **LD3 / LD7 (label hierarchy).** The reason C4 spends the opacity channel and
  not the radius, and the reason the spine is accepted rather than brightened.
  Contrast minimums and a brightness hierarchy pull in opposite directions; the
  resolution is that the hierarchy may quiet *relative* weights but not push any
  information-carrying mark under the floor.
- **D22 / D15 (fuzzy cues).** Both deliberately spend contrast, and both are
  measured at core *and* rim so the gate can accept the rim while still watching
  the body. A future change that dimmed a fuzzy dot's core would fail.
- **D18 (`verify:a11y`).** Same harness, same launch profile, same
  PASS/FAIL-plus-summary shape. This is the fourth machine gate over the shipped
  artifact rather than the source.

## 7. The gate

`npm run verify:contrast` (build first) enforces; `npm run audit:contrast` prints
the full table without failing, for a survey run. A surface whose state
cannot be reached is a failure too — otherwise a selector rotting into a no-match
would read as a pass.

> **Amended by D24.** That last sentence had an exception in the code:
> `sample()` took `required: false`, and one surface used it — `.tt-hint`, sampled
> in the *event-mark* hover block though the hint renders only on a **cluster
> chip's** tooltip. It therefore matched nothing on every run, silently, and hid a
> real failure (`--accent` at 10px on the raised panel, the same 4.41:1 pair this
> audit caught as `.tt-year`). The walk now enters a chip tooltip and requires the
> sample; the count is **119 surfaces, 114 pass, 5 accepted, 0 fail**, and the
> count itself is now the tell — a surface leaving the walk is a regression like
> any ratio. See [`palette-tokens.md`](palette-tokens.md) §5.

**Not in the deploy CI**, and for a pre-existing reason: `deploy.yml` runs on
`ubuntu-latest` with no browser, which is why `verify:a11y` and `verify:touch`
aren't there either. All three are local gates. Putting the browser trio into CI
means teaching `cdp-mobile.mjs` to find Chrome on Linux — one change that would
promote three gates at once, which is the argument for doing it (C-Q1).

## 8. Open items

- **C-Q1 — The browser gates don't run in CI.** `verify:contrast`, `verify:a11y`
  and `verify:touch` all need headless Edge and are Windows-path-bound. A single
  fix in the shared harness would let all three gate the deploy alongside `lint`
  and `verify:layout`.
- **C-Q2 — Desktop profile only.** The coarse-pointer block changes padding and
  font sizes, not colors, so the *pairs* are the same — but the small-screen
  breakpoints are unmeasured, and `launchMobile()` already exists.
- **C-Q3 — No forced-colors / high-contrast-mode check.** Windows high-contrast
  mode replaces the palette wholesale; SVG `fill` attributes generally survive it,
  which is a known hazard for chart-heavy apps and entirely untested here.
- **C-Q4 — Threshold-based, not perceptual.** WCAG 2.x luminance ratios are known
  to be unkind to dark themes (a light-on-dark pair often reads better than its
  number suggests). APCA would model this palette more faithfully but is not
  normative; the numbers here are the ones an auditor would compute.
- **C-Q5 — `src/index.css` still ships a dead light-theme block** (`.timeline-item`,
  `.sub`, `#fff` cards) from the pre-D1 prototype. Unmeasured because unreachable —
  only `.container` is still referenced, by the loading state. Cleanup, not a
  contrast finding.
- ~~**C-Q6 — the palette has no token layer.**~~ — not an open item this doc
  raised, but the one it made cheap: D24 replaced ~150 color literals with a
  `:root` block, verified by re-running this gate. The sequencing lesson is
  recorded in the main doc — an audit buys a window in which structural cleanup
  of the audited thing is verifiable, and it is worth spending before the numbers
  go stale. See [`palette-tokens.md`](palette-tokens.md).
- **A-Q4 / KN-Q1 remain open and separate:** contrast is now measured, but nothing
  here has been tested against a real screen reader.
