# First-run gesture coach

> Topic design doc for **D26**. On phones the control-hints box is hidden, so
> nothing announced that the chart's gestures exist at all. This is the smallest
> thing that closes that hole. Indexed from the main [`DESIGN.md`](../../DESIGN.md).

**Status:** implemented (D26).
**Last updated:** 2026-07-25

---

## 1. The hole

`.timeline-info` lists how to zoom, pan, preview and open events, and it is
`display: none` under the small-screen media query (D10) — the copy described desktop
input and the box was bulky on a phone. The copy was later made modality-aware (D11), but
the box stayed hidden on small screens.

Net effect: **on the devices where gestures are the only way to drive the chart, nothing
said the gestures existed.** D13 built press-and-hold specifically as touch's answer to
hover — a feature whose entire purpose is discovery — and its own discoverability was zero.

## 2. Decisions

- **OB1 — Shown exactly when the hints box is hidden, and that is asked of the DOM.**
  The condition is `getComputedStyle(hints).display === 'none'`, not a copy of
  `(max-width: 640px), (max-height: 540px)` in JavaScript. A duplicated media query is free
  to drift from the CSS that actually governs the element; a resolved style cannot. It also
  states the intent exactly — *this exists to cover for that element* — and it means the
  coach follows automatically if the breakpoints ever move. Same instinct as D19 reading
  `document.activeElement` from the DOM instead of keeping a copy of it.

- **OB2 — Nothing is persisted, and that is a legal constraint rather than a preference.**
  The obvious design is a "don't show again" flag in `localStorage`. The published privacy
  notice (D17) states, in **both** languages, that the app *"stores nothing in localStorage
  or sessionStorage"* — and D17 recorded that this claim was **verified against the source,
  not assumed**. A UI convenience does not get to falsify a published legal claim, and the
  alternative (amend the bilingual notice, and weaken the "no cookie banner is needed"
  argument that rests on it) is wildly disproportionate to the benefit.

  So the coach shows once per page load and is made **cheap to dismiss** instead: the first
  touch anywhere clears it. A returning visitor pays one glance at something that vanishes
  the moment they do anything.

- **OB3 — It is not a dialog.** No focus trap, no focus steal, no backdrop. It must not
  stand between the user and the chart it is describing. `role="status"` announces it
  politely; the dismiss button is an ordinary tab stop. The panel is
  `pointer-events: none` with only the button opting back in, so a tap aimed at the chart
  behind it reaches the chart — **dismissing must never cost the user their first gesture**,
  which is machine-checked (§3).

- **OB4 — Two or three words per item.** The first draft used phrases ("Pinch or double-tap
  to zoom"), which wrapped mid-sentence at 390px and grew the card to roughly a third of the
  screen — burying the chart it was describing. Terse also suits the job: this is a nudge
  that something is *possible*, not documentation. The hints box carries the full version
  wherever it fits. `white-space: nowrap` per item guarantees a phrase never breaks; wrapping
  happens between items only.

- **OB5 — Anchored to the bottom of the chart panel, not centred.** The marks and their
  labels live along the middle of the chart; a centred card would hide the thing it is
  explaining. The lower strip costs the minimap a moment instead, which is an orientation
  aid rather than the content.

## 3. What the machine checks

`npm run verify:touch` grew four checks (9 → **13**), and they run **first** in that
script — the coach clears on the first `pointerdown`, so any earlier gesture would dismiss
it and the checks would pass against an absent element:

- the coach is present exactly where `.timeline-info` computes to `display: none`
- its copy is the coarse variant — contains "Pinch", contains no "Ctrl" (telling a phone
  user to Ctrl+scroll is worse than saying nothing)
- the first touch dismisses it
- **that same touch is not swallowed** — no modal opened behind it, i.e. the gesture still
  reached the chart

The pre-existing 9 checks passing unchanged is itself the evidence that the panel does not
intercept gestures.

## 4. A bug worth recording

The first version used `useLayoutEffect` to read the hints box's style. `.timeline-info` is
a **later sibling** of the section the coach lives in, so React attaches its ref *after* the
child's layout effect has already run — the ref read `null`, the coach silently never
rendered, and it failed on exactly the screens it exists for. A plain `useEffect` runs after
paint, when every ref in the commit is attached.

Two things generalize: **a ref to a later sibling is not available in a child's layout
effect**, and a feature that only appears under a media query is a feature whose absence is
easy to mistake for correct behaviour — the desktop check passed the whole time.

## 5. Interplay & open items

- **D10** hides the hints box; this covers that gap and reads its state rather than
  re-deriving it.
- **D11/D13** own the gestures being advertised. The copy mirrors the hints box's own
  modality split, using the same `coarseInput` value App already computes.
- **D17** is what rules out persistence (OB2).
- **D18** — the fade-in is CSS animation, so the blanket
  `prefers-reduced-motion` block already covers it.
- **OB-Q1 — Unmeasured for contrast.** The coach is a mobile-only surface and
  `verify:contrast` runs the desktop profile (C-Q2). It introduces **no new colour pairs** —
  `--text-muted`/`--text-strong` on `--surface-raised` and `--text-strong` on
  `--accent-fill` are all measured elsewhere — but that is an argument, not a measurement.
- **OB-Q2 — It reappears every page load.** The honest cost of OB2. If it becomes annoying,
  the options are amending the privacy notice or accepting it; there is no third way that
  keeps both the claim and the memory.
- **OB-Q3 — Desktop never sees it**, by construction. A narrow desktop window does. Whether
  a first-run hint would help desktop users too is untested — the hints box is right there,
  but nobody has checked whether people read it.
