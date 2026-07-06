# Label De-cluttering

> Topic design doc. Deep-dive on how event labels are placed so they **never overlap**.
> Indexed from the main [`DESIGN.md`](../../DESIGN.md).

**Status:** v1.5 implemented — priority heuristic + anchors, tooltips, hover triad,
two-tier typography, sticky lanes, quiet axis. Clusters, swimlanes, rotation deferred.
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
- **LD3 — Importance (updated in v1.5):** hand-tagged `importance` field (0.9–1.0, ~10
  anchor events) overrides a content-aware heuristic:
  `0.85 × (0.5·isolation + 0.3·deepTime + 0.2·richness)` — isolation = symlog-projected
  nearest-neighbor gap, deepTime = log distance from now, richness = description/links/
  sources volume. The 0.85 factor guarantees anchors always outrank heuristic scores.
  Replaced the v1 hash placeholder, whose arbitrary-looking selection ("Big Bang" as a
  bare dot while a minor event got a label) read as brokenness. Real Wikipedia-derived
  ranking later slots into the `importance` field.
- **LD4 — Leader lines (updated in v1.5):** superseded "reduced-opacity on crossings" with
  something strictly better — all leaders render in a layer below all label text, and each
  label has a background-color halo (`paint-order: stroke` in the svg bg color) that knocks
  out anything passing behind it. Leaders originate at the spine, stop 9px short of the
  text, and their opacity grades down with lane distance (0.55 lane 0 → 0.3 floor).
- **LD5 — Lane budget capped at 4 per side** (was 11): a label 5+ lanes out has a leader
  too long to associate with its dot; a dot + tooltip beats an unassociable label. Fewer
  labels at default zoom is intentional. Tune 3–5 by eye.
- **LD6 — Stability (answers LD-Q5):** sticky lanes (a label prefers its remembered lane;
  moves only for a same-side ≥2-lane inward improvement, side-flips only as last resort),
  enter hysteresis (new labels need an ENTER_SLACK=14px-widened box to be *admitted*, but
  only the standard box is *recorded* — no packing capacity lost), symmetric 120ms
  enter/exit fades with a contested-exit rule (an exiting label whose box intersects a
  newly placed label is removed instantly — the fade is cosmetic, the invariant is not),
  and `.exiting` ghosts purged before each join to avoid exit/re-enter collisions.
  Animated y-transitions on lane moves were rejected: a mid-flight label occupies
  unreserved space, a transient invariant breach.
- **LD7 — Discoverability:** every mark (labeled or bare) gets a singleton HTML hover
  tooltip (80ms intent delay, hidden on wheel) + an invisible 24px hit circle; hovering
  anything highlights the dot↔leader↔label triad. Bare dots recede (r3, 55% opacity, no
  ring) while labeled dots come forward — visual weight now agrees with the hierarchy.

## 7. Open questions (this topic)

- **LD-Q1** — Short-form label source: dedicated `shortTitle` field vs smart truncation?
  (Third LOD tier deferred — evaluate once the two-tier hierarchy has been used a while.)
- **LD-Q2** — Lane budget: capped at 4/side for now (LD5); derive from viewport height?
- **LD-Q3** — Rotation: expose as an automatic high-density fallback, a user toggle, or not
  at all?
- **LD-Q4** — Cluster expansion UX (+N chips): expand purely by zoom, by click, or both?
  Note from the v1.5 design panel: chips are labels — they must join the packer's
  occupancy map or they violate the invariant; membership needs merge/split hysteresis.
- **LD-Q6** — Tinted label text: v1.5 tints both tiers toward category colors; if the five
  hues read busy (esp. technology yellow), fall back to tinting tier 1 only
  (one-line change in `tierFill`).

## 8. Implementation steps

- [x] Deterministic placeholder priority per event (FNV-style hash of id, in `Timeline.jsx`).
- [x] Measure label box sizes via off-DOM canvas `measureText`.
- [x] Greedy lane packer (above/below, nearest-first) with a lane budget → returns placed
      labels + which events are dot-only. Re-runs on every zoom/pan.
- [x] Render placed labels + leader lines (centered spine); dot-only for the rest.
- [x] Zoom-driven detail tiers (dot ↔ label) — emerges from the packer as positions spread;
      new labels fade in.
- [ ] (Later) clusters, then swimlanes, then optional rotation.

**Verification:** a state sweep (1,275 zoom/pan combinations over the real dataset)
confirms zero label overlaps; 39/65 labels show at the default view, the rest collapse to
dots until zoomed. The no-overlap guarantee holds by construction: within a lane the packer
keeps label intervals disjoint, and lane spacing (22px) exceeds label height (~16px), so
adjacent lanes can't collide either. `LABEL_GAP` (8px/side) absorbs any font-measurement
slack between canvas and SVG.
