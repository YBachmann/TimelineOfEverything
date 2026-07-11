# Span Rendering

> Topic design doc. How events with an `endYear` (eras, wars, periods) are rendered
> and how they interact with the label/cluster system.
> Indexed from the main [`DESIGN.md`](../../DESIGN.md).

**Status:** v1.1 implemented (v1 + mini-lanes for overlapping bars).
**Last updated:** 2026-07-11

---

## 1. Model

A span is an ordinary event with an optional `endYear` (schema v2, decision D5 in the
main doc): `year` stays the canonical sort key and the span is `year → endYear`.
The dataset now carries 32 spans (eras, empires, wars, lives), 24 pairs of which
overlap in time.

## 2. Rendering rules (v1)

- **Bar mode:** when the span's screen width ≥ `SPAN_MIN_PX` (8px), it renders as a
  rounded bar on the spine (height 6, centered, category color at 0.55 fill-opacity;
  0.85 while hovered). Bars sit under leaders/chips/dots in the layer order.
- **Mini-lanes (v1.1, answers SR-Q1):** bars that overlap in time never share a row.
  See §3.
- **Dot halos (v1.1):** every point dot rides on an svg-background-colored halo disc
  (same knockout trick as the label-text halos, LD4), so point events whose years fall
  inside a spine-lane span read as *in front of* the bar instead of part of it — a
  translucent dot otherwise blends with the bar's color. The halo tracks the dot's
  radius through membership/hover transitions.
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

## 3. Mini-lanes (v1.1 — answers SR-Q1)

The dataset expansion made overlapping bars real (24 overlapping pairs: Han Dynasty ×
Roman Empire, WWII × The Holocaust, Cold War × Berlin Wall, …), all drawing on one
spine row. Fix: **`assignSpanLanes()`** (src/timelineLayout.js) greedily colors the
interval graph of the filtered spans — start-year order, longer span first on ties —
so time-overlapping bars land in distinct mini-lanes.

- **Time-based, not screen-based.** Screen x is monotonic in year, so "overlap in
  time" ⇔ "bars overlap on screen at every zoom". One assignment per filter change is
  valid at all zooms — lanes can never churn during pan/zoom, no hysteresis needed.
- **Offsets:** lane 0 = the spine (a lone bar looks exactly as before), lane 1 = +7px
  (below), lane 2 = −7px (above) — `spanLaneOffset()`. Bars are 6px tall → 1px gap
  between lanes; max extent ±10px clears the lane-0 label hit-rects at ±12px.
- **Tie order means enclosing eras take the spine:** Cold War sits on the spine with
  Berlin Wall stacked off it; WWII on the spine, The Holocaust below.
- **Touching counts as overlapping** (`a.endYear === b.year`): bars meeting at 0px
  would read as one continuous bar.
- **Budget `SPAN_MAX_LANES = 3`** is a *data* budget enforced by `verify:layout`
  (current data uses exactly 3; max overlap depth is Buddha × Confucius × Achaemenid
  Persia). A dataset needing a 4th lane fails the check loudly instead of silently
  pushing bars into the label lanes — then either widen the band or rethink (era-band
  layer).
- **Leader lines and hit rects follow the bar's lane.** Bar hit rects shrank 16px →
  10px so stacked bars keep mostly-exclusive hover bands; degenerate dots stay on the
  spine.
- `verify:layout` asserts: every time-overlapping pair gets distinct lanes, lane count
  within budget, and the mini-lane band's static clearance from label lane 0.

## 4. Open items

- ~~**SR-Q1 — Overlapping bars.**~~ Answered in v1.1 — mini-lanes, see §3.
- **SR-Q2 — Fuzzy edges for imprecise spans** (`precision: approximate`): fade the
  bar's ends instead of hard caps. Pairs with the main doc's Q6 (precision rendering).
- **SR-Q3 — Should a bar's start/end show ticks** (small end-caps) once wide enough?
- **SR-Q4 — Same-lane spans nearly touching** can read as one bar at zooms where the
  screen gap shrinks to ~1px (e.g. Renaissance ends 1600, Enlightenment starts 1685 —
  a gap only ~40% of the Renaissance's own width), since only *touching* spans are
  forced into different lanes. Cosmetic; revisit if it confuses.
- **SR-Q5 — Dot halos are "works for now", not loved** (user verdict 2026-07-11:
  better than without, not 100% happy). Alternatives if revisited: halo only where a
  dot actually crosses a bar (keeps the spine un-notched), dimming the bar under dots
  instead, or opaque dot fills over bars.

## 5. Data hygiene (done alongside, 2026-07-09)

- Converted start/end pairs into spans: WWI (was ids 30+31), WWII (32+33), Roman
  Empire (24+25), Berlin Wall (36+37).
- Merged duplicates: Egyptian Civilization (23) into Ancient Egypt (8); First Moon
  Landing (64) into Moon Landing (13).
- Dataset: 65 → 59 events. Side effects: the two permanent same-year chips from
  duplicates are gone (default view now has 1 chip) and lane hops in the stability
  sim halved (152 → 74 across the gesture suite).
