# Tag & Subcategory Taxonomy

> ⚠️ **Retroactive doc — written after the fact.** Unlike the topic docs authored alongside
> their feature, this one was reconstructed on **2026-07-24** from the merged branch
> `feature/tag-taxonomy` (PR #15, commit `75d519e`), its diff, and the Claude Code session
> that produced it (`3a8271e3`, 2026-07-19). It reports the decisions as they can be recovered,
> not as a contemporaneous log — wording and emphasis are a later reading, and the dataset
> counts are those at the time of the merge. The **decision entry of record remains
> [`DESIGN.md` → D14](../../DESIGN.md).**

> Topic design doc. The controlled `subcategory` vocabulary (one per event, from a fixed
> per-category set) and the cross-cutting `tags` threads (each shared by ≥2 events, never
> restating a subcategory), plus the `verify:layout` gate that stops both from rotting.
> Closes main-doc **Q5** and [`search-filtering.md`](search-filtering.md)'s **SF-Q3**.
> Indexed from the main [`DESIGN.md`](../../DESIGN.md).

**Status:** implemented (D14).
**Last updated:** 2026-07-24 (retroactive).

---

## 1. Problem — search made the rot visible

While the tag/subcategory layer was data-only, inconsistency had no cost: nothing displayed
it. The moment search (D12, [`search-filtering.md`](search-filtering.md)) surfaced tags and
subcategories as **user-facing filter suggestions with live counts**, every defect became a
visible dead-end. An audit of the 191-event dataset found:

- **52 events** — almost entirely the original pre-expansion set (Formation of Earth, Roman
  Empire, WWI/WWII, Moon Landing, the "First X" inventions) — carried **no subcategory and no
  tags** at all.
- **71 of 122 tags were singletons.** A tag on one event is a filter that narrows to one
  event — a dead end in the dropdown, and something the event-title suggestion already does.
- **14 tags merely restated the event's own subcategory** (`society`, `politics`, `physics`,
  `astronomy`, `cosmology`, `religion`, `philosophy`, `medicine`, `law`, `navigation`,
  `communication`, `exploration`, `prehistory`, `ai`) — redundant, since the dropdown suggests
  subcategories on their own line.
- A near-duplicate split: `galaxy` vs `galaxies`.

This is main-doc **Q5** ("is `subcategory`/`tags` controlled or freeform?") and **SF-Q3**
("vocabulary hygiene") colliding: search turned an abstract open question into a concrete UX
bug, which is what forced the answer.

## 2. Two decisions (the forks taken)

Two questions were put explicitly, each with a chosen and a rejected path.

- **(a) What are tags *for*, and how hard to prune?** — **Chosen: tags are cross-cutting
  threads, each carried by ≥2 events.** The strongest are geographic (`greece`, `china`,
  `europe`, `india`, `americas`, `rome`, `mesopotamia`, `germany`, `usa`) and thematic
  (`empire`, `war`, `evolution`, `deep-time`, `electricity`, `computing`, `space`, `genetics`,
  `nuclear`). *Rejected:* "keep specific meaningful singletons" and "minimal cleanup" — a
  singleton is definitionally **not a thread** (it connects nothing), and as a filter it just
  reaches a single event.
- **(b) Should `subcategory` be controlled or stay freeform?** — **Chosen: a controlled
  vocabulary, one value per event, from a fixed per-category set, enforced by `verify:layout`.**
  *Rejected:* "fill the gaps but stay freeform" — freeform is exactly what rotted; near-
  duplicates creep back in the next time an event is added, and that cost is now user-visible.

The through-line of both: **the vocabulary is a UI surface now, so it earns the same
"verify the shipped data" discipline as the layout invariants** — a machine gate, not a style
guide humans are trusted to follow.

## 3. The controlled `subcategory` set

One `subcategory` per event — the event's *primary* classifier — drawn from its `category`'s
set (this table is the source of truth, mirrored in `scripts/verify-layout.mjs` `SUBCATS` and
[`DESIGN.md` §4](../../DESIGN.md)):

| Category | Allowed subcategories |
|---|---|
| `natural` | cosmology, planetary, geology, biology |
| `history` | prehistory, society, politics, culture, religion, philosophy, economics, law, exploration |
| `science` | physics, astronomy, chemistry, biology, mathematics, medicine, geology, philosophy, institution |
| `technology` | industry, electronics, computing, communication, transport, materials, navigation, spaceflight, imaging, internet, appliances, ai |
| `future` | cosmology, planetary, environment |

Notes:

- **Primary classifier only.** The single best answer to "what kind of event is this?" Every
  other cross-cutting aspect is a *tag*, never a second subcategory.
- **Names are reused across categories on purpose** (`biology`, `geology`, `cosmology`,
  `planetary`, `philosophy` appear under more than one top level). The `(category,
  subcategory)` pair disambiguates — a `science/geology` event reads differently from a
  `natural/geology` one — and the search dropdown scopes suggestions by the active category
  filter anyway.
- A few buckets are deliberately thin today (`law`, `appliances`, `ai`, future's
  `environment`); kept distinct rather than force-merged, and flagged for possible later
  consolidation (§6).

## 4. Tags — cross-cutting threads, two machine rules

Tag **values stay freeform** — there is no fixed list, because the entire point of the tag
layer is that new threads can emerge as the dataset grows. What is fixed are two
machine-checked rules:

1. **≥2 events per tag.** A singleton is a dead-end filter in the dropdown.
2. **A tag never equals the event's own subcategory.** Redundant — the dropdown already
   suggests subcategories separately.

Result: **122 → 76 tags**, every one used ≥2×, none restating a subcategory, and all 191
events fully classified. Post-cleanup the strongest threads are `evolution` (12), `empire`
(11), `deep-time` (9); the largest subcategories are `politics` (23), `society` (22),
`biology` (21).

**Why not control tags too?** `subcategory` already gives every event a controlled primary
key. Tags are the one open-ended layer where geographic and thematic threads accrete;
controlling them as well would kill the only place the taxonomy is allowed to grow — while the
≥2 rule already removes the failure mode (dead-end facets) that mattered.

## 5. Execution — a self-asserting one-shot transform + a permanent gate

Two artifacts, one throwaway and one permanent:

- **The retag** (a scratch `retag.mjs`, *not* committed): an explicit `{ id → { subcategory,
  tags } }` map for all 191 events — no heuristics, every assignment hand-decided — that
  **asserts its own invariants on a dry run before writing** (every event covered, every tag
  ≥2, no `tag === subcategory`). The dry run earned its keep immediately: event **#45**
  (Electronic Camera) was missed in the first pass and the assertion flagged it. The same
  transform normalized `events.json` to a consistent key order.
- **The gate** (`scripts/verify-layout.mjs`, committed, +40 lines): the `SUBCATS` map lives
  here as the enforced source of truth, and CI fails on any unknown/missing subcategory,
  singleton tag, or `tag === subcategory`. This is what makes the cleanup **stick** — the
  vocabulary can't silently rot again the next time an event is added. Precision rendering
  (D15, [`precision-rendering.md`](precision-rendering.md) §6) later reused exactly this
  enum-gate pattern for its `precision` field.

Pre-merge verification: `verify:layout` green (191 events all in-vocab, 76 tags all ≥2);
`src/data.js` confirmed **vocabulary-agnostic** (no hardcoded tag/subcategory names, so the
new data flows through untouched); and a headless check of the search dropdown confirmed the
browse view and contextual counts render from the clean vocabulary (`empire` → 11 events,
`writing` → 4, the `galaxy`/`galaxies` merge confirmed).

## 6. Interplay & open items

- **Search (D12)** is the direct beneficiary. `filterEvents` / `getSuggestions` in
  `src/data.js` are vocabulary-agnostic, so cleaning the *data* cleaned the *dropdown* with
  zero code change; **SF-Q3 is closed**, and the contextual suggestion counts (SF3) now come
  from a vocabulary with no dead-ends.
- **Precision rendering (D15)** reuses this doc's `verify:layout` enum-gate pattern.
- **Q5, open remainder.** Whether the five *top-level* categories are final is still open, as
  is whether the thin subcategory buckets (`law`, `appliances`, `ai`) should later merge.
- **Not in scope.** `sources` (still thin dataset-wide) and `precision` backfill remain TODO —
  this pass covered `subcategory` + `tags` only.
