# Event Links

> Topic design doc. How events reference each other, how relations are phrased,
> and how they surface in the UI.
> Indexed from the main [`DESIGN.md`](../../DESIGN.md).

**Status:** v1 implemented (answers main-doc Q3).
**Last updated:** 2026-07-12

---

## 1. Model (answers Q3's semantics half)

Links are stored **directionally, once** — on the source event, as
`links: [{ to, type, note? }]` (schema v2, main doc §4). The other direction is
derived, not stored: `buildLinkIndex()` (src/data.js) mirrors every edge at load
time, so a link stored on either endpoint is visible from both. This keeps the
data free of A→B/B→A bookkeeping (nothing to keep in sync, no asymmetric-pair
bugs) while the UI stays symmetric.

Each index entry carries `dir: 'out' | 'in'` — which end of the stored edge the
viewer is on — and the UI phrases the relation accordingly:

| stored `type` | `out` reads | `in` (mirrored) reads |
|---|---|---|
| `related`   | related        | related        |
| `causes`    | led to         | caused by      |
| `precedes`  | followed by    | preceded by    |
| `partOf`    | part of        | includes       |
| `contrasts` | contrasts      | contrasts      |

Unknown types render as their raw string (the schema allows freeform); adding a
phrasing is a one-line change in `RELATION_LABELS` (Timeline.jsx).

## 2. Display (v1: modal list, not canvas drawing)

The detail modal gets a **"Connected events"** section: one row per relation —
relation tag, category dot, title, year — sorted by the linked event's year,
with the curator's `note` shown under the row. Clicking a row swaps the modal
to that event, so link chains can be walked (Faraday → Maxwell → Radio) without
leaving the modal.

Why a modal list first, not connector lines on the timeline: on a symlog axis
most linked pairs are close in time (screen-adjacent when zoomed out) while some
span eras (Big Bang → CMB); drawn connectors would either vanish or cross the
whole viewport, and they'd have to negotiate with the label lanes, chips, and
span bars for space. The modal list ships the *information* with zero layout
interaction; canvas visualization can layer on later (LK-Q1).

The index is built over **all** events, not the filtered set, so links reach
across category filters (a science event's history-event links stay visible;
clicking one opens its modal even if its dot is currently filtered out).

## 3. Data (v1 curation)

44 hand-curated links added (48 stored edges total, ~everyone mirrored to ~96
displayed relations), spanning all eras and all five types. Chains were chosen
to reward walking: Copernicus → Kepler → Newton → General Relativity;
Faraday → Maxwell → Radio; Transistor → Integrated Circuit → Personal Computer;
Fall of Constantinople → (Renaissance, Columbus). Notes are one-sentence
explanations of *why* the link holds, written to be defensible mainstream
claims.

`verify:layout` hard-fails on: link targets that don't exist, self-links, and
duplicate `(from, to, type)` edges. `buildLinkIndex()` also skips bad edges
defensively at runtime, but the verify script is where they actually fail.

Side effect: links feed the priority heuristic's richness term (LD3), so
heavily-linked events get a small label-priority bump — intended (linked events
are landmarks).

## 4. Open items

- **LK-Q1 — On-canvas visualization.** Hover an event → highlight its linked
  events' dots/labels on the timeline (triad-highlight style), or draw
  connector arcs. Needs an answer for cross-viewport links and lane interplay.
- **LK-Q2 — "Fly to" action.** A secondary affordance on a connected-event row
  that closes the modal and animates the viewport to the target (reusing the
  chip-zoom flight) instead of opening its modal.
- **LK-Q3 — Coverage.** 44 links over 191 events is a showcase, not a graph.
  If links become central (path-walking, clustering), curation stops scaling —
  same threshold question as main-doc Q4 (Wikidata automation).
- **LK-Q4 — Controlled vocabulary.** `type` is freeform with five suggested
  values; verify:layout doesn't restrict it. Lock it down once the set feels
  stable (pairs with main-doc Q5).
