# Keyboard navigation & the chart's accessible representation (D19)

> Closes **A-Q1** (the chart had no accessible representation), **A-Q2**
> (keyboard navigation of the timeline) and **NAV-Q3** (arrows pan, +/− zoom,
> 0 = all time). These were three tickets in three docs describing one hole:
> the chart could only be driven by a pointer, and could only be read by eye.

---

## 1. What was actually broken

After D18 the app's *chrome* was keyboard-complete — filters, search, era
buttons, dialogs, footer. The chart in the middle was not, in two ways that
sound like one problem but are not:

| # | Defect | Who it hurt |
|---|---|---|
| K1 | No key did anything to the chart. Pan, zoom, hover-preview and open-details were pointer-only; the SVG was `tabIndex={-1}`, deliberately not even a Tab stop | anyone without a mouse — motor impairments, keyboard-first users, a broken trackpad |
| K2 | `aria-label="Interactive timeline"` was the entirety of what a screen reader got. The 191 events live in an SVG scene with no text nodes except the ~35 titles the label packer happens to place, and those are `<text>` elements inside a graphic | screen-reader users |

D18 recorded the honest state of K2: *"the search combobox is the accessible
path to event data."* That is a real path — it reaches all 191 events and opens
the same modal — but it only works if you already know what to ask for. It can
answer "tell me about the Moon landing"; it cannot answer "what is in here?".

---

## 2. Decisions

### D19.1 — One tab stop with a managed cursor

The chart is a single Tab stop (`tabIndex={0}`) holding a **cursor**: one event
that the arrow keys move between. Two alternatives were rejected:

- **A Tab stop per event.** 191 of them would make Tab useless for reaching
  anything past the chart, and Tab is not a navigation device — it is how you
  leave.
- **A parallel semantic list** (a visually-hidden `<ul>` of all events beside
  the chart). Tempting because it is easy and needs no key handling at all, but
  it is a *second renderer of the same data*: it would show events the chart is
  currently clustering away, keep its own order, and drift the first time either
  side changes. It also answers K2 while leaving K1 completely untouched — a
  sighted keyboard user gets nothing from a hidden list.

One cursor, three outputs, is what makes this one feature instead of two:

| Output | Serves |
|---|---|
| A ring on the cursor's mark + the preview tooltip that hover already had | sighted keyboard users |
| A `role="status"` live region speaking each event as it is reached | screen-reader users |
| `Enter` → the same detail modal a click opens | both |

### D19.2 — The cursor steps in *time* order

`←`/`→` move to the previous/next event **by year** — the order the dataset is
already sorted in (`data.js`) — not in on-screen or label-placement order.

Placement order changes with every zoom level: which events carry labels, which
are bare dots, and which are hidden inside a `+N` chip are all functions of the
current scale. If "next" followed that, the same two keypresses would land
somewhere different depending on how far you happened to be zoomed in. Time
order is the one ordering this dataset has that a reader can predict, and it is
also the ordering the live region's "42 of 191" counts against.

### D19.3 — The cursor is a *render state*, not an effect layered on top

This is the crux of the implementation, and the first version got it wrong.

The obvious move is to reuse `setHighlight(id, true)` — the hover triad that
already brightens a dot, its leader and its label. It does not survive: every
`render()` rewrites *every* dot's radius, *every* leader's opacity and *every*
label's fill from the resting-value helpers. Hover gets away with it because
hovering does not move the camera, so no render happens while it is up. A
keyboard cursor moves the camera on purpose, and each of the ~30 frames of that
flight would wipe the emphasis it was flying towards.

So the cursor is folded into the resting values themselves — `dotBaseR`,
`dotBaseFillOpacity`, `leaderOpacity`, `labelFill` all ask `isCursor(id)`. The
emphasis then survives pans, zooms, flights and full scene rebuilds for free,
and `setHighlight` stays what it was: a hover effect. The ring and the tooltip
placement live at the end of `render()` for the same reason — they are glued to
their mark through the flight, not positioned once when the key was pressed.

### D19.4 — The camera follows only when it has to

Moving the cursor recentres the view **only** when the target is off-screen or
inside a 12% comfort band at either edge. A camera that recentres on every
keypress makes the whole chart lurch sideways while you step through events that
were already in front of you — the motion is then noise, not information.

When it does move it uses `animateTo`, the same flight the era presets use, so
it inherits reduced-motion behavior (cut straight to the destination) without a
second implementation. Zoom keys are instant instead, matching the wheel: they
are a discrete decision, not a camera the app chose to move on your behalf.

### D19.5 — Two flags, neither of them effect-local

Whether the cursor shows is `kbActive && chartFocused`, and the two are kept
apart on purpose:

- **`kbActive`** — the keyboard is driving. A pointer gesture takes it back
  (`pointerdown` clears it), so a mouse user never sees a ring; the cursor's
  *id* is kept, so tabbing back in resumes where the mouse left off.
- **`chartFocused`** — the chart holds focus right now. A dialog or a Tab away
  takes it.

Splitting them is what lets the cursor come back: opening a detail modal blurs
the chart (`chartFocused` false, ring gone) and closing it focuses the chart
again (ring back, on the same event, without a keypress). One combined flag
would have to choose between "a dialog kills the cursor" and "a ring hangs over
a chart that no longer has focus".

Neither may be a fresh `let` inside the render effect, which re-runs on resize
and on every filter change. `kbActive` rides a ref (like `viewRef` and the
cursor id itself); `chartFocused` is re-read from `document.activeElement` at
effect start, because the DOM is its actual source of truth and a stale copy of
it would be a ghost — a cursor that vanished because the window was dragged.

### D19.6 — `role="application"`, a label that describes the data, and a live region

Three parts to what a screen reader now gets:

- **`role="application"`** so arrow keys reach our handler at all. In browse
  mode NVDA and JAWS consume arrows for their own reading cursor, and every key
  in D19.2 would be swallowed before the page saw it. This is the standard
  escape hatch for a composite widget, and the honest cost is that it suppresses
  browse-mode reading of the subtree — a subtree that consists of ~35
  positioned `<text>` fragments and is not worth reading anyway.
- **An accessible name carrying the *shape* of the data** — `"191 events from
  13,800,000,000 BCE to 7,000,000,000"`, recomputed from the filtered set. A
  screen reader cannot walk an SVG scene, so the name has to answer "what is in
  here?" before the cursor answers "what is this?". It also makes filtering
  audible: narrow to a category and the chart renames itself.
- **A `role="status"` live region** announcing `title. year. category. N of M.`
  on every cursor move. Timeline owns its own, separate from App's filter-count
  region (D18.5): they speak about different things at different moments, and
  sharing one would make each interrupt the other.

The tooltip is `aria-hidden` — for the cursor it would duplicate the live
region, and for hover no screen reader reaches it anyway.

**Unverified:** whether `role="application"` behaves as intended in real AT is
exactly the residual A-Q4 tracked in
[`accessibility.md`](accessibility.md) — everything here is verified by DOM
state, not by listening to NVDA.

### D19.7 — The cursor is exempt from clustering

An event you have navigated to has to be visible, so the cursor's event is
filtered out of the clusterer's input and can never be swallowed by a `+N` chip.
This is the one place the cursor reaches into layout, and it has a visible
consequence worth stating: a chip may split and re-form as the cursor passes
through it, because the clusterer's hysteresis is one member short while it sits
there. That is the honest reading of "this one is out".

What the cursor deliberately does **not** do is force its *label* into the
packer. Forcing a placement would evict whichever label legitimately won that
lane, and the packer's guarantee (no overlaps, ever) is worth more than a title
the preview tooltip is already showing.

### D19.8 — The key map, and what is deliberately missing

| Key | Does |
|---|---|
| `←` / `→` | previous / next event in time |
| `Home` / `End` | first / last event |
| `Enter` / `Space` | open the cursor event's details |
| `+` / `−` | zoom in / out, anchored on the cursor |
| `0` | fit the whole timeline |
| `Escape` | dismiss the cursor (and only then — otherwise the key is left alone) |

The first arrow press **orients rather than moves**: it puts the cursor on the
last event you opened (by click or search — `openEvent` records it), or else on
the event nearest the middle of what is already on screen. Jumping to the Big
Bang because you pressed `→` would throw away the position you had.

Modified keys are never taken (`Ctrl+F` is the search shortcut, `Ctrl+−` is
page zoom), and `preventDefault` fires only on a key actually handled —
otherwise arrows, `Home`/`End` and `Space` would scroll the page out from under
the chart.

**Deliberately absent: free panning** (e.g. `Shift`+arrows to slide the view
without moving the cursor). Every pixel of this chart that carries information
carries it *as an event*, and cursor movement reaches all 191 of them, so a pan
that skips over nothing would only ever land you on empty axis. Revisit if the
axis itself becomes content — era background bands are the obvious trigger
(NAV-Q5).

Era jumps needed nothing: the preset buttons are real `<button>`s and were
already in the tab order.

---

## 3. What the machine checks

`npm run verify:a11y` grew section 6 — 15 checks, on the production build in
headless Edge (`npm run build` first):

- the chart is a tab stop, takes `role="application"`, has a name matching
  `N events from … to …`, and a description that lists the keys
- no cursor exists before the first keypress (a mouse user never sees one)
- `→` raises a cursor and the live region speaks a well-formed
  `title. year. category. N of M.`; a second `→` says something different
- `Home` reaches `1 of M` and `End` reaches `M of M`, and in both cases the ring
  is inside the chart's box afterwards — i.e. the camera actually followed
- `Enter` opens a dialog whose heading is the event the live region just named
  (the two channels agree), and `Escape` returns focus to the chart with the
  cursor still standing
- `+` shrinks the scrubber's viewport window and keeps the cursor on screen,
  `−` widens it again, `0` returns to the fitted width
- five consecutive `→` presses at the fitted view each leave the cursor drawn as
  its own mark. This is the D19.7 exemption: at that zoom most events *are*
  inside chips, so it fails if the exemption is removed

The scrubber's viewport-window width is used as the camera probe rather than the
range readout: it is a single number that moves monotonically with zoom, where
the readout is formatted text that would have to be parsed back.

---

## 4. Open (KN-Q)

- **KN-Q1 — No real assistive-technology test.** Specifically: whether
  `role="application"` gets the arrow keys through in NVDA, JAWS and VoiceOver,
  and whether the live region's phrasing survives contact with actual speech.
  Same residual as A-Q4, now with more riding on it.
- **KN-Q2 — Crossing the dataset takes 191 presses.** `Home`/`End` and the era
  buttons help, but the era buttons move the *camera*, not the cursor. A coarser
  jump (next era, next category, `PageUp`/`PageDown` by ten) is the obvious next
  increment; not added yet because it is a guess about how people will use this,
  and no one has used it yet.
- **KN-Q3 — The minimap is still pointer-only.** Scrubbing has no keyboard
  equivalent. Arguably it needs none — it is an orientation aid, and the era
  buttons plus `0` cover jumping — but it is the last pointer-only surface left.
- **KN-Q4 — Cursor and hover can both be up at once** if you keyboard to an
  event and then move the mouse over a different one without pressing anything.
  Cosmetic, self-clearing on the next input of either kind.
