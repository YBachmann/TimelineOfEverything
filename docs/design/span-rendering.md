# Span Rendering

> Topic design doc. How events with an `endYear` (eras, wars, periods) are rendered
> and how they interact with the label/cluster system.
> Indexed from the main [`DESIGN.md`](../../DESIGN.md).

**Status:** v1 implemented.
**Last updated:** 2026-07-09

---

## 1. Model

A span is an ordinary event with an optional `endYear` (schema v2, decision D5 in the
main doc): `year` stays the canonical sort key and the span is `year → endYear`.
Current spans in the dataset: Agricultural Revolution, Roman Empire, Industrial
Revolution, World War I, World War II, Berlin Wall.

## 2. Rendering rules (v1)

- **Bar mode:** when the span's screen width ≥ `SPAN_MIN_PX` (8px), it renders as a
  rounded bar on the spine (height 6, centered, category color at 0.55 fill-opacity;
  0.85 while hovered). Bars sit under leaders/chips/dots in the layer order.
- **Degenerate mode:** narrower than 8px, the span renders as an ordinary point dot
  (anchored at the span's midpoint) — at wide zooms an era IS effectively a point.
  Degenerate spans participate in +N clusters like any other dot; visible bars never
  hide inside a chip.
- **Label anchoring:** a bar's label (and leader line) anchors at the midpoint of the
  bar's **visible portion**, so a span you are zoomed inside still gets an on-screen
  label that slides to stay centered while panning. Packer visibility for spans is
  "any part of the bar on screen," not "start year on screen." Implemented in
  `markGeometry()` (src/timelineLayout.js), which is the single geometry source for
  the packer, the component, and the verify script.
- **Hit target:** a bar gets a fat invisible rect along its full length (its
  anchor-positioned hit circle is disabled in bar mode). Hover joins the triad
  highlight (bar brightens with leader + label); tooltip and modal show the
  `year – endYear` range.
- **Coordinate clamping:** bar rect coordinates are clamped to the viewport
  neighborhood — at 5000× zoom a bar's true endpoints can be millions of px away.
- **Spans are importance anchors.** The priority heuristic structurally undervalues
  major eras (WWII scored ~0.07: its *start year* sits in the dense modern pile, so
  isolation ≈ 0) — which would leave the marquee spans as unlabeled colored stripes.
  All six spans carry hand-tagged `importance` ≥ 0.9 (LD3 anchor mechanism), so era
  bars double as labeled orientation landmarks. Rule of thumb going forward: **a span
  worth storing is usually worth anchoring.** If span counts grow large, revisit with
  a span-aware heuristic term (e.g. duration share) instead of hand tags.
- **Time display consistency:** every surface (tooltip, chip-member preview, cluster
  list, modal, SVG `<title>`) renders spans via one `formatYearRange()` helper.

## 3. Open items

- **SR-Q1 — Overlapping bars.** All bars share the single spine row; two spans
  overlapping in time would overlap visually. Current data has none, but this arrives
  with dataset growth (e.g. Roman Empire × Han Dynasty). Likely fix: mini-lanes for
  bars (±5px offsets) or merging into the future era-band layer. Revisit with the
  dataset-expansion work.
- **SR-Q2 — Fuzzy edges for imprecise spans** (`precision: approximate`): fade the
  bar's ends instead of hard caps. Pairs with the main doc's Q6 (precision rendering).
- **SR-Q3 — Should a bar's start/end show ticks** (small end-caps) once wide enough?

## 4. Data hygiene (done alongside, 2026-07-09)

- Converted start/end pairs into spans: WWI (was ids 30+31), WWII (32+33), Roman
  Empire (24+25), Berlin Wall (36+37).
- Merged duplicates: Egyptian Civilization (23) into Ancient Egypt (8); First Moon
  Landing (64) into Moon Landing (13).
- Dataset: 65 → 59 events. Side effects: the two permanent same-year chips from
  duplicates are gone (default view now has 1 chip) and lane hops in the stability
  sim halved (152 → 74 across the gesture suite).
