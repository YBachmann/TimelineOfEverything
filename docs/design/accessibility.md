# Accessibility & robustness (Q10, D18)

> The third and last slice of the "generic but important web basics" audit
> (Q10), after site identity (D16) and legal (D17). Scope: reduced motion,
> dialog keyboard semantics, combobox ARIA, focus visibility, and an error
> boundary. **Out of scope and still open:** full keyboard navigation *of the
> chart itself*, which belongs to the navigation model (Q1) — see §7.

---

## 1. What was actually broken

The audit (2026-07-21) found five concrete defects, not a checklist gap:

| # | Defect | Who it hurt |
|---|---|---|
| A1 | Nothing in `src/` read `prefers-reduced-motion`, while the app shipped 500ms era flights, momentum glides, entry flights on every filter change, and per-frame edge fades | vestibular disorders; the preference is an accessibility *setting the user already made* |
| A2 | The detail and cluster modals had no `role="dialog"`, no Escape, no focus management — focus stayed on whatever was behind them, and Tab walked straight into the chart | keyboard and screen-reader users |
| A3 | The search box had a keyboard cursor (`activeIdx`) that existed only as a CSS highlight — no `role="combobox"`, no `aria-activedescendant` | screen-reader users, for whom arrowing through suggestions was silent |
| A4 | Focus-visible styling existed on exactly the surfaces D17 shipped; everything older had the browser default suppressed or nothing | anyone navigating by keyboard |
| A5 | An uncaught throw anywhere in `Timeline` unmounted the whole React tree — a blank page with the story only in the console | everyone |

D17 had already built the fix for A2 *once*, inside `LegalModal`, and explicitly
recorded that this pass should "copy rather than reinvent" it.

---

## 2. Decisions

### D18.1 — Extract the dialog contract instead of copying it

`LegalModal`'s Escape/focus-in/Tab-trap implementation moved wholesale into
`src/components/Modal.jsx`; the legal dialog and both timeline modals now render
through it. Copying would have made "our dialogs are accessible" a habit three
files each have to keep; extracting makes it a property of one file that a
single test covers.

`Modal` takes its class names from the caller. That is not generalization for
its own sake: Timeline's double-tap handler keys off the literal class
`event-modal-overlay` to decide that a tap hit a backdrop (D11), so the legal
dialog **must** keep its own `legal-*` classes or a double-tap on the privacy
notice would drive timeline zoom.

### D18.2 — Focus restore belongs to the opener (carried over from D17, now load-bearing)

`Modal` moves focus *in* and deliberately does not send it back out. D17 found
that restoring from `document.activeElement` captured at mount silently fails
when the trigger was never focused. The timeline makes that failure the *normal*
case rather than an edge case: its openers are SVG dots, labels and chips, which
cannot hold focus at all, so `document.activeElement` at open time is `<body>`.

So each owner restores its own:

- `SiteFooter` → the "Privacy & credits" button (a ref it already holds).
- `Timeline` → `restoreFocusRef`: the remembered opener if it is still
  connected (the search input, when the modal was opened from the dropdown),
  otherwise **the chart**, which gained `tabIndex={-1}` for exactly this.

`tabIndex={-1}` — not `0`. The chart is not a Tab stop, because it has no
keyboard interaction to offer yet (§7); it is only focusable *programmatically*,
so closing a modal can put focus back near where the user was working instead of
dropping it at the top of the document.

One subtlety worth keeping: the detail modal is keyed by event id. Following a
"Connected events" link swaps the panel's entire contents, and without a remount
focus would sit on a button that the new event's (shorter, or absent) link list
just unmounted — dropping focus to `<body>` *with the dialog still open*, which
breaks the trap. Remounting re-seeds it.

### D18.3 — Reduced motion: three doors, all reading the query live

Every animated path in the app now goes through one of three places:

| Door | Covers | Reduced-motion behavior |
|---|---|---|
| `anim(sel, name, ms)` in `Timeline.jsx` | D3 transitions: label enter/exit fades, dot membership grow, chip fades, hover triad | applies the end state to the selection directly |
| `animateTo()` | era preset flights, chip zooms, double-tap zoom, the entry flight after a domain-changing filter (D12/SF6) | cuts to the destination |
| `startGlide()` | flick momentum (D11) | no glide — the view stops where the finger let go |

Plus a blanket `@media (prefers-reduced-motion: reduce)` block in `App.css` for
the CSS half (dialog fade/slide, tooltip opacity ramp).

Two choices inside that:

- **Read live, never snapshot.** `src/motion.js` holds one `MediaQueryList` and
  every consumer calls `prefersReducedMotion()` at the moment it is about to
  move something — inside a render pass, an rAF callback, a gesture handler.
  Those all run long after the React render that created them, so reading live
  means the setting can be flipped mid-session with no subscription, no
  re-render, and no scene rebuild. (Contrast `coarsePointer`, read once per
  scene: input modality genuinely does not change mid-run.)
- **Not `duration(0)`.** A zero-duration D3 transition still defers to the next
  tick. Enter-fading marks start at `opacity: 0`, so deferring would leave them
  invisible for a frame — reduced motion would introduce a flicker. `anim()`
  therefore returns the *selection* itself, and the end state lands in the same
  synchronous pass.

What deliberately stays: **direct manipulation**. Dragging still pans, pinching
still zooms — the user is driving those frame by frame. Only self-propelled
motion (the glide *after* release, camera flights the app chose to run) is
suppressed. The edge fade (D13) also stays: it is a static function of a mark's
x position, not an animation, and removing it would bring back the border
popping it exists to prevent.

### D18.4 — Combobox ARIA over a roving tabindex

The search box keeps DOM focus on the `<input>` and names the active suggestion
with `aria-activedescendant` (WAI-ARIA 1.2 combobox pattern), rather than moving
real focus between options. Moving focus would have meant re-plumbing the
existing `onMouseDown`-preventDefault trick that keeps the dropdown open while
clicking an item, and it would fight `onBlur` closing the list. The existing
`activeIdx` state maps onto `aria-activedescendant` with no logic change at all —
the cursor was already there, it just had no accessible name.

Option *labels* are explicit (`aria-label="#empire, 12 events"`), because the
visible row is a name and a bare number, which would otherwise announce as
"#empire 12".

### D18.5 — Announce the filter result count in a live region

Filtering is live and silent: the chart is the only feedback, and a screen
reader gets none of it. A visually-hidden `role="status"` region announces
"N of M events match".

It is **always rendered**, empty when no filter is active, because a live region
that first appears together with its message is commonly missed. `.sr-only` is
absolutely positioned, so — being out of flow — it is not a flex item and adds
no `gap` to the rows it sits in. The visible `12/191` counter is
`aria-hidden` to avoid announcing the same thing twice.

### D18.6 — Take Ctrl+F for the app's own search

`Ctrl`/`Cmd`+`F` and `/` focus and select the search box.

Overriding find-in-page is normally hostile — you are replacing a browser
function that works. It does not work here. The events live in an SVG scene, so
only the **~35 titles the label packer currently places** exist as text nodes;
the other ~156 have no DOM presence at all, and no description, tag or
subcategory text is ever in the document outside an open modal. Find-in-page
therefore searches a shifting fraction of the titles and reports "not found" for
events sitting on screen, while this box searches all 191 across every field.
That is the editor/docs-app case where taking the shortcut is the user's gain.

Three guards make it safe rather than merely convenient:

- **`/` inside any text field types a slash.** (It is `Shift`+`7` on a German
  keyboard, so the handler must not exclude the Shift modifier — `e.key` reports
  the character produced, not the physical key.)
- **`Ctrl+F` already in the box falls through** to focus+select, so retyping
  replaces the query. That is what find does everywhere.
- **Neither fires while a dialog is open.** Pulling focus out would break the
  trap and leave the user typing into something they cannot see. The check
  queries `[role="dialog"]` from the DOM rather than tracking modal state,
  because the timeline owns its modals internally — and the shared `Modal` shell
  is what guarantees that role is there to find.

The override is **announced** in the control hints (`Ctrl+F` or `/`). An
undiscoverable override is the bad kind: the user presses the key they know,
gets something else, and has no way to learn why.

### D18.7 — One error boundary per blast radius

`ErrorBoundary` wraps the chart (in `App`) and, as a last resort, the whole app
(in `main.jsx`). The inner one is the point: a Timeline throw now leaves the
header, the filters, and the footer's privacy notice standing, with the error
message and a retry on screen. Retry is genuinely useful here — the render is a
pure function of the current filters, so changing them and retrying can succeed.

**Known limit:** React boundaries catch render and commit-phase errors, which
includes the scene-building effect. They do **not** catch throws inside D3 event
handlers (`.on('click')`, pointer handlers), which run outside React's call
stack — those still only reach the console.

---

## 3. What the machine checks

`npm run verify:a11y` (headless Edge over CDP, desktop profile — `npm run build`
first). Same no-Playwright approach as the mobile harness (D13/D16);
`cdp-mobile.mjs` grew a `launchDesktop()` profile plus `click`/`key`/`type`/
`setMedia` helpers. 30 checks:

- dialog semantics — `role`, `aria-modal`, `aria-labelledby` resolving to a
  non-empty heading, focus inside on open
- focus trap — Tab and Shift+Tab past the end of the panel's focusables, run
  over both a 1-focusable panel (self-wrap) and one with a "Connected events"
  list (real cycle)
- focus restore — Escape from a mark-opened modal lands on the chart; from a
  search-opened modal, back on the search input; from the legal dialog, back on
  the footer trigger. Never `<body>`.
- combobox ARIA — `aria-expanded`, `aria-controls` resolving to a real listbox,
  `aria-activedescendant` naming a real `role="option"` that is both
  `aria-selected` and the visually highlighted one, exactly one selected
- search shortcuts — `Ctrl+F` and `/` focus the box, `/` still types a character
  *inside* it, and `Ctrl+F` does not escape an open dialog
- reduced motion — with `prefers-reduced-motion: reduce` emulated, an era flight
  lands within one frame; **and**, with the preference off, the same flight is
  still mid-animation at 60ms. The control matters: without it the first check
  would pass just as happily against a dead era button.
- zero console errors/warnings across the run

Two traps this script hit, both worth remembering:

- **A filtered domain makes era buttons no-ops.** The motion checks originally
  ran while the search still held one match, so the domain spanned a few
  decades, every era outside it was dropped from the scale, and `zoomToEra`
  returned early. Both checks "passed" while measuring nothing. The script now
  clears the search first and asserts the scene came back.
- `Emulation.setTouchEmulationEnabled` rejects `maxTouchPoints: 0` even when
  disabling touch — it must stay in 1..16.
- CDP's `rawKeyDown` carries no character. Testing "`/` is a shortcut" and "`/`
  is a character" needs the two different dispatch types (`rawKeyDown` vs
  `keyDown` with `text`) — which is exactly the distinction the guard implements,
  so the test would be vacuous with either one alone.

Not machine-checked: the error boundary (verified once by building with a
temporary throw in Timeline — fallback rendered with `role="alert"`, filters and
footer survived — then reverted), and screen-reader output itself.

---

## 4. Open (A-Q)

- **A-Q1 — The chart has no accessible representation.** `aria-label="Interactive
  timeline"` is all a screen reader gets; the 191 events inside the SVG are
  invisible to it. Today the honest answer is that the **search combobox is the
  accessible path to event data** — type, arrow, Enter opens the same detail
  modal a click does, and it is verified end to end. A real fix is either a
  parallel semantic list or the keyboard navigation in A-Q2, and it needs a
  decision about which.
- **A-Q2 — Keyboard navigation of the timeline** (arrow to pan, +/− to zoom,
  Tab/arrow between marks) stays with **Q1**, the navigation model, because it
  is a navigation design question before it is an accessibility one.
- **A-Q3 — Contrast has not been measured.** The palette is dark-on-dark by
  design and several greys (`#6f779c` footer, `#8a90b8` axis ticks) are
  plausibly under 4.5:1. Needs measuring, then a decision about whether the
  visual language bends.
- **A-Q4 — No real assistive-technology test.** Everything here is verified by
  DOM state, not by listening to NVDA/VoiceOver. Same class of residual as TG-Q4
  (real-device touch confirmation).
