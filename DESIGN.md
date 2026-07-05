# TimelineOfEverything — Design Doc

> **Living document.** This is the project's persistent memory and warm-start context.
> Keep it current: when a decision is made, log it; when a question arises, record it;
> when something is learned, capture it. The README is the *public* description of the
> project; this doc is the *working* brain behind it.

**Last updated:** 2026-07-05

---

## 1. Context

**TimelineOfEverything** is an interactive web app that visualizes events from the Big
Bang (−13.8 billion) to speculative futures (+5 billion) on a single navigable timeline.
It began as an idea for a printable panoramic poster, but the extreme scale differences
between cosmic and human timescales made static visualization impractical — hence an
interactive, zoomable app.

Currently in **prototype / pre-alpha** stage: a working React + D3 single-page app driven
by a hand-curated static JSON dataset.

---

## 2. Goals & Requirements

### POC (current focus)
- Render events across 13.8B years on one navigable timeline. ✅
- Zoom & pan. ✅ (Ctrl+scroll = zoom, scroll = pan)
- Category filtering. ✅
- Click event → detail modal. ✅
- A time scale that handles both deep time and recent detail. ✅ (symlog)
- **Prove the visualization works at scale** — the core open risk. ⬜
- Deploy the POC (Vercel/Netlify). ⬜

### Full version (later, not yet justified)
- Hundreds–thousands of events, spans/eras, linked events.
- Possibly automated data extraction (Wikidata/Wikipedia via SPARQL).
- Possibly graph-based linking (PageRank, community detection).
- Export a selected range as a printable poster.

### Guiding principle
Attack the **riskiest unknown cheaply** before building infrastructure. For this project
the riskiest unknown is *visualization + navigation at scale*, not the backend. Defer the
backend until data volume actually demands it.

---

## 3. Current State / Architecture

- **Stack:** React 19 + Vite 7, D3 7 for the timeline. No backend.
- **Data:** `data/events.json`, imported directly into the bundle (see decision D2).
- **Key files:**
  - `src/App.jsx` — top-level UI: filters, timeline, control hints.
  - `src/components/Timeline.jsx` — the D3 SVG timeline (scale, markers, zoom/pan, modal).
  - `src/data.js` — loads + sorts events, category helpers.
  - `data/events.json` — the dataset (schemaVersion 2).

---

## 4. Data Schema (schemaVersion 2)

Top level: `{ "schemaVersion": 2, "events": [ ...Event ] }`

### Event
| Field         | Type                | Req | Notes |
|---------------|---------------------|-----|-------|
| `id`          | number              | ✅  | Unique. |
| `year`        | number              | ✅  | Signed year (negative = BCE). Point time **and** the sort key. For spans, this is the start. |
| `title`       | string              | ✅  | |
| `category`    | string              | ✅  | One of `natural`, `history`, `science`, `technology`, `future`. |
| `description` | string              | ✅  | |
| `endYear`     | number              | ⬜  | If present, the event is a **span** `year → endYear` (e.g. Industrial Revolution 1760–1840). |
| `subcategory` | string              | ⬜  | Finer classification within a category (e.g. `cosmology`, `electronics`). Freeform for now. |
| `tags`        | string[]            | ⬜  | Cross-cutting freeform labels for filtering/search. |
| `precision`   | string              | ⬜  | `exact` (default) \| `approximate` \| `estimated` \| `speculative`. Intended to later drive fuzzy rendering. |
| `links`       | Link[]              | ⬜  | Relations to other events. |
| `sources`     | Source[]            | ⬜  | Provenance. |

### Link
`{ "to": <eventId>, "type": string, "note"?: string }`
- Suggested `type` values: `related`, `causes`, `precedes`, `partOf`, `contrasts` (freeform allowed).
- Stored **directionally**; the renderer may mirror (see open question Q3).

### Source
`{ "label": string, "url"?: string }`

**Design notes:**
- All new fields are optional/additive — v1 point-events remain valid.
- `year` stays canonical so sorting/point-rendering are unchanged; spans are an overlay concept.

---

## 5. Decisions Log (answered questions)

- **D1 — Iterate, don't rewrite; defer the backend.** The React+D3+JSON foundation can
  carry us to hundreds/low-thousands of events. The full-version backend (Neo4j/GraphQL/
  SPARQL/ML) solves problems we don't have yet and doesn't change the UX. *Rationale:* the
  make-or-break risk is visualization at scale, testable within the current stack.
- **D2 — Bundle the dataset via direct `import` instead of runtime `fetch`.** A Vite
  production build only serves `public/`; the old `fetch('/data/events.json')` worked in
  dev but would break in production. Importing bundles the data and keeps dev≡prod.
- **D3 — Single data source.** Removed the dead `src/utils/fetchEvents.js` loader and the
  stray `public/events.json` (which had a divergent `{date}` schema). `data/events.json` is
  the sole source of truth.
- **D4 — `scaleSymlog`, not `scaleLog`+shift.** symlog natively handles negative (BCE)
  years and the year-zero boundary, so we dropped the "shift all years positive by 13.8B"
  hack. Cleaner and represents recent history better.
- **D5 — Spans via optional `endYear`, not a second event type.** Least churn, unambiguous,
  keeps `year` as the sort key. (Schema §4.)
- **D6 — Next priority is de-cluttering + navigation, not feature breadth.** (See §7.)

---

## 6. Open Questions

- **Q1 — Navigation model.** Is a single continuous symlog axis actually navigable across
  13.8B years, or do we need era landmarks / zoom presets (Cosmic → Geological → Human →
  Modern) and/or a minimap? *This is the central UX question.*
- **Q2 — Span rendering.** How should spans display (bars? brackets? shaded bands?) and how
  do they coexist visually with point markers?
- **Q3 — Link semantics & display.** Are links directional or symmetric? Auto-mirror? How
  are they visualized (draw connectors? highlight related on hover? a side panel)?
- **Q4 — Data sourcing.** At what volume does hand-curation stop scaling and Wikidata/SPARQL
  automation become worth it? What's the threshold?
- **Q5 — Taxonomy.** Is the 5-category set final? Should `subcategory`/`tags` be a controlled
  vocabulary or stay freeform?
- **Q6 — Precision in the UI.** How is `precision` surfaced (fuzzy/faded markers, error bars,
  a label)?
- **Q7 — Deployment.** Target (Vercel vs Netlify) and when to first deploy?

---

## 7. TODOs / Roadmap

**Next up (highest leverage — the scale/navigation risk):**
- [ ] Label **de-cluttering / level-of-detail**: only render labels that fit; cluster the
      rest and expand on zoom. *Single most important item.*
- [ ] Rethink **navigation** (Q1): era landmarks or zoom presets, maybe a minimap.
- [ ] Grow dataset to a few hundred events to genuinely stress layout.

**Data / schema:**
- [ ] Convert obvious start/end **pairs into spans**: WWI (30/31), WWII (32/33), Roman
      Empire rise/fall (24/25), Berlin Wall construction/fall (36/37).
- [ ] **Dedup** near-duplicates: "Ancient Egypt" (8) vs "Egyptian Civilization" (23);
      "Moon Landing" (13) vs "First Moon Landing" (64).
- [ ] Backfill `subcategory`/`tags`/`sources`/`precision` across the full dataset (only a
      representative handful are enriched so far).

**Rendering / features:**
- [ ] Render spans (Q2).
- [ ] Visualize links (Q3).
- [ ] Surface `precision` visually (Q6).
- [ ] Filter/search by `tags` and `subcategory`.

**Ops:**
- [ ] Deploy POC (Q7).

---

## 8. Technical Insights

- **Vite production serves only `public/`.** Anything fetched at runtime from another path
  works in `vite dev` (project root is served) but 404s in the built app. Prefer importing
  static data so it's bundled. (→ D2)
- **`d3.scaleSymlog` is the right tool for signed, multi-order-of-magnitude time.** It
  handles negatives and zero, unlike `scaleLog`, removing the need to shift the domain. (→ D4)
- **65 events is far too few to stress the layout.** Everything clusters at the recent
  (right) end and there's currently **no label-collision handling** — zooming into a dense
  era produces overlapping text. This is the first thing real scale will expose. (→ §7)

---

## 9. References

- Big Bang timing: [NASA WMAP](https://wmap.gsfc.nasa.gov/)
- Geologic timescale: [Wikipedia](https://en.wikipedia.org/wiki/Geologic_time_scale)
- Blue LED: [Nobel Prize in Physics 2014](https://www.nobelprize.org/prizes/physics/2014/summary/)
