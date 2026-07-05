# Label De-cluttering

> Topic design doc. Deep-dive on how event labels are placed so they **never overlap**.
> Indexed from the main [`DESIGN.md`](../../DESIGN.md).

**Status:** Concept approved — not yet implemented.
**Last updated:** 2026-07-05

---

## 1. Problem & hard constraint

Events sit on a horizontal, symlog time axis. Many cluster in recent history, so at most
zoom levels their labels compete for the same horizontal space.

**Hard constraint:** labels must **never overlap**. This means hiding labels is not a bug
but the mechanism — at a wide zoom most events are dots, and labels earn their place as you
zoom in. The design question is therefore *which* labels survive, which makes an **importance
ranking** the quiet core of the whole feature (not the geometry).

---

## 2. Core framing — the three levers

Time is 1-D; labels are 2-D boxes (wide, short). Two labels close in *time* can only be
separated using the axis **perpendicular** to time — that perpendicular axis is the entire
"de-cluttering budget." Every technique is one of three levers:

1. **Shrink each label's footprint** along the time axis (more fit before colliding).
2. **Add lanes** on the perpendicular axis (collided labels stack).
3. **Drop labels** when 1 + 2 aren't enough (selection / level-of-detail).

## 3. Options considered

| Idea | Lever | Verdict |
|---|---|---|
| Only render what fits + detail tiers (full → short → icon) | 3 + 1 | **Core / backbone** |
| Multiple rows/levels (stack labels) | 2 | **Core / workhorse** (greedy lane packing) |
| Labels above *and* below the spine | 2 | **Core** — free doubling of lanes |
| Rotate labels (≤45°/90°) | 1 | Option, not default — shrinks time footprint but hurts readability |
| Category **swimlanes** (a band per category) | 2 | **Strong — deferred.** Multiplies lane budget ~5× and adds meaning. Build after single-line. |
| Snake / zig-zag wrap | 2 (global) | Good for a future *fit-everything overview* mode; breaks smooth zoom/pan |
| Rotate whole timeline 90° | — | Skip — time is already horizontal; vertical scroll loses the panoramic overview |
| Spiral / non-straight | — | Later "cosmic overview" showcase; hard to read precise time/durations |

---

## 4. Chosen approach (v1): priority LOD + greedy lane packing

Time stays horizontal with the current zoom/pan. Single spine first; swimlanes later.

1. **Priority score per event** — process highest-priority first so de-cluttering is
   meaningful and stable (like map apps drawing big cities before small towns).
2. **Greedy lane assignment** — for each event in priority order, measure its label box and
   place it in the nearest free lane (above/below, then outward) where it doesn't
   horizontally overlap an already-placed label. No free lane within the budget → **dot
   only, no label**. Guarantees no overlap by construction.
3. **Detail tiers by zoom** — wide zoom → mostly dots; zoom in → short labels; further →
   full text. Two tiers (dot ↔ label) to start.
4. **Clusters** — where many low-priority events pile onto ~one pixel, show a `＋N` marker
   that expands on zoom/click.
5. **Leader lines** — thin; nearest-lane-first so they stay short. Originate at the label's
   **inner edge** (near the spine). Crossings over other labels are allowed but drawn at
   **reduced opacity** where they cross (we relax strict non-crossing routing for v1).
6. **Stability** — deterministic assignment by priority → the visible set changes smoothly
   with zoom; fade labels in/out rather than pop.

Ship 1–3 first (the backbone); clusters, swimlanes, and rotation are independent add-ons.

---

## 5. Importance / priority ranking

The ranking does **not** need to be correct to build and test the de-cluttering — any
stable ordering exercises the machinery.

- **Now (placeholder):** derive a priority in code with something trivial and deterministic
  (e.g. a hash of the id, or a simple heuristic). Deterministic matters for lane stability;
  avoid true randomness that reshuffles every render.
- **Later (real):** derive from Wikipedia signals — article length, number of inbound links
  (there are pre-computed Wikipedia network graphs / PageRank-style datasets). Possibly
  stored as an optional `importance` field on events, with a manual override.

---

## 6. Decisions (this topic)

- **LD1 — Approach:** priority-based LOD + greedy lane packing (§4). Approved.
- **LD2 — Single horizontal spine first;** category swimlanes deferred but kept in mind
  (swimlanes = "run the packer per band," so the single-line packer is the reusable core).
- **LD3 — Importance is a deterministic placeholder for now;** real ranking from Wikipedia
  signals later (§5).
- **LD4 — Leader lines:** relax "never cross a label" → reduced-opacity on crossings;
  originate at the label's inner edge rather than true center.

## 7. Open questions (this topic)

- **LD-Q1** — Short-form label source: dedicated `shortTitle` field vs smart truncation?
- **LD-Q2** — Lane budget: fixed max lanes, or derived from viewport height?
- **LD-Q3** — Rotation: expose as an automatic high-density fallback, a user toggle, or not
  at all in v1?
- **LD-Q4** — Cluster expansion UX: expand purely by zoom, by click, or both?
- **LD-Q5** — Transition/hysteresis details to keep the visible set from flickering near
  thresholds.

## 8. Implementation steps

- [ ] Deterministic placeholder priority per event.
- [ ] Measure label box sizes (text metrics) at render.
- [ ] Greedy lane packer (above/below, nearest-first) with a lane budget → returns placed
      labels + which events are dot-only.
- [ ] Render placed labels + leader lines; dot-only for the rest.
- [ ] Zoom-driven detail tiers (dot ↔ label) with fade transitions.
- [ ] (Later) clusters, then swimlanes, then optional rotation.
