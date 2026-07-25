# Data sourcing — Wikidata reconciliation & enrichment

> Topic design doc for **D20**. How the hand-curated dataset gained machine
> provenance (a Wikidata QID per event) and a real `sources` backfill, without
> surrendering the editorial layer that *is* the product. Indexed from the main
> [`DESIGN.md`](../../DESIGN.md).

**Status:** implemented (D20); extended with the `precision` backfill (D21).
**Last updated:** 2026-07-25.

---

## 1. The reframe (why this isn't the README's "SPARQL pipeline")

Open question Q4 asked "at what volume does hand-curation stop scaling and
Wikidata/SPARQL automation become worth it?" — framed as one threshold. It isn't
one question, because curation is **two jobs**:

1. **Selection + narrative** — *which* 191 events of millions matter, their
   descriptions, the "led to / preceded by" links, the era balance. This is the
   product. There is no volume at which a machine should choose the events;
   auto-generating from SPARQL would dilute exactly the editorial density that
   makes this a timeline and not a data dump.
2. **Provenance + canonical facts** — sources, exact dates, stable identifiers.
   This **already stopped scaling**: the tell was `sources: 2/191`. Nobody
   hand-types 191 citation URLs, so nobody did.

So D20 automates job 2 only. Wikidata fits it precisely: its structured facts are
**CC0** (no attribution burden — and it eases the D17 tension between the
all-rights-reserved LICENSE and a CC-BY-SA-derived dataset), and it's reachable
as a public API with no backend, so the tooling is a build-time script in the
same "generate, commit the output" spirit as `make-icons.mjs` — no violation of
D1's defer-the-backend.

The unit of value is a **QID per event**: a durable join key that is itself
provenance and the anchor every future enrichment (sources now; coordinates,
images, a real importance signal later) hangs off.

## 2. Two scripts, one shared lib

- `scripts/wikidata-lib.mjs` — events IO (canonical key order + CRLF/utf-8, so a
  write can't reorder keys or flip line endings), QID validation, string
  similarity, query-variant generation, and the only networked code (polite
  `getJson` with a descriptive UA + backoff; `searchEntities`, `searchFulltext`,
  `getEntities`).
- `scripts/reconcile-wikidata.mjs` — match events → QIDs (human-gated).
- `scripts/enrich-wikidata.mjs` — backfill `sources` + audit dates from QIDs.

npm: `data:reconcile`, `data:reconcile:apply`, `data:enrich`, `data:audit`.

## 3. Reconcile: event → QID

Selection stays editorial; reconcile only *attaches a machine identity* to events
we already chose. It never invents events.

**Search (recall).** Event titles are narrative ("Discovery of Steel", "First
Plane", "Watt's Steam Engine") while Wikidata labels are the bare entity ("steel",
"aircraft", "Watt steam engine"). Two moves close that gap:
- `queryVariants()` peels framing verbs/possessives to the core noun ("Discovery
  of Steel" → "Steel"; "Newton's Principia" → "Principia").
- each variant is searched through **both** `wbsearchentities` (label-prefix,
  precise) and CirrusSearch full-text (higher recall — finds "formation and
  evolution of the Solar System" for "Formation of the Solar System").

**Score.** Per candidate: best label similarity across the title's variants
(Sørensen–Dice bigrams), year proximity against the candidate's Wikidata date
(P585/P580/P571/P577…), and an **enwiki-sitelink bonus** — a Wikipedia article is
a strong "this is the canonical item" signal that lifts the real Q11768 "Ancient
Egypt" over an obscure exact-label twin and sinks date-less noise. Candidates
whose `instance-of` is a scholarly article / Wikimedia housekeeping page are
dropped outright.

**Classify** into `auto` / `ambiguous` / `none`:
- `auto` via two paths, both requiring an enwiki-backed candidate: (a) a
  corroborating date on a solid label, or (b) a canonical near-exact label with
  no contradicting date. The enwiki gate on the date path is what stops a 1926
  *publication* titled "Quantum Mechanics" from beating the field Q944.
- `none` when the best guess is essentially unrelated (narrative titles that only
  match noise) — better an honest gap than a wrong QID.
- everything else `ambiguous`.

**Review file** `data/wikidata-review.json` is the human checkpoint (committed):
each row carries the machine's pick plus its ranked alternatives; a human accepts,
swaps, or writes `"none"`. `--apply` merges only well-formed `chosen` QIDs into
`events.json`. Events that already carry a `wikidata` field drop out of the review
file, so re-running after adding events is additive.

## 4. The decisive lesson: verify by search, never by memory

The first machine pass produced 82 `auto` at ~96% precision, but the ~90
`ambiguous`/`none` rows needed editorial judgment. Adjudicating them surfaced a
rule that reshaped the whole approach:

> **A recalled QID is worthless; a read QID is reliable.** Batch-verifying every
> proposed QID against Wikidata (label + enwiki title + instance-of + date)
> caught that ~16 QIDs recalled "from memory" pointed at unrelated entities —
> abiogenesis→"Envy", Sputnik→"James Bond", CRISPR→"Thimma Bhupala",
> Newton's Principia→"Liao Linkun". The fix was to *search* for each and read the
> QID off the results (enwiki-confirmed), never to recall it.

Every QID that landed was either read off a review candidate or read off a search
result, then machine-verified. The over-strip failure mode is also real and
caught the same way: "Newton's Principia" → "Principia (alga)", "Life of the
Buddha" → the honorific not the person — flagged by enwiki title, corrected by
search.

## 5. Enrich: sources + date audit

For every QID'd event:
- **Sources.** Adds one `sources` entry — the event's **English Wikipedia
  article** (the human-readable, CC-BY-SA reference that satisfies attribution;
  the CC0 machine link is the `wikidata` field itself). Tagged `via:"wikidata"`
  so a re-run strips and regenerates only auto entries, leaving hand-curated
  sources (NASA WMAP on the Big Bang) intact. One Wikipedia ref, not two entries,
  to keep the `sources`-count term in the label-priority heuristic
  (`timelineLayout.js`, `20 * sources.length`) from inflating — verified that
  placement invariants still hold after the backfill.
- **Date audit** (report only — never rewrites a year). Compares the stored
  `year` to Wikidata's date beyond an era-scaled tolerance. The audit found **no
  data errors**: the 35 flags are person-birth-year artifacts (events mapped to a
  *person* QID return the person's birth, e.g. Galileo→1564, Dalton→1766) or
  legitimately-different-but-defensible date choices (Ancient Egypt 3100 vs 4000
  predynastic), and a few where **ours is more accurate** than Wikidata's chosen
  point (Newton's Principia 1687 vs 1680; Formation of Earth 4500M vs 5000M).

## 6. Precision backfill — the coarsen-only rule (D21, closes DS-Q2)

D15 built a whole rendering tier for `precision` — dashed dots, faded bar ends, a
`~`/`≈`/`?` text mark — and then 117 of 191 events carried no value at all. Absent
means `exact`, so the dataset was **asserting a known year** for the Formation of
the Solar System (−4,600,000,000), the Agricultural Revolution and the emergence
of *Homo sapiens*. The rendering was honest; the data behind it wasn't.

Wikidata answers this directly, because a Wikidata time value is not just a
timestamp — it carries an integer **precision** alongside it, plus qualifiers.
Reading the integer alone is not enough: "circa 1500" is stored as a *year*-precision
value with a `sourcing circumstances = circa` qualifier, so a naive reader takes
it at face value. Three signals, then — the integer, `P1480 = circa` (Q5727902),
and the presence of `P1319`/`P1326` earliest/latest bounds:

| Wikidata precision | Our tier | Why |
|---|---|---|
| 11 / 10 / 9 — day, month, year | `exact` | the year is a claim, not a rounding |
| 8 / 7 — decade, century | `approximate` | the historical "circa" register |
| ≤ 6 — millennium … 1e9 years | `estimated` | scientific inference, wide error bar |
| *any* + circa / bounded range | ≥ `approximate` | the qualifier overrides the digits |

That split is not new vocabulary — it's the existing meaning of the two fuzzy
tiers ([`precision-rendering.md`](precision-rendering.md) §1) read onto Wikidata's
scale. `speculative` is **never machine-proposed**: nothing in Wikidata says "this
has not happened yet", so that tier stays entirely editorial.

### The decision: a proposal may only ever coarsen

The tiers are ordered, and the backfill applies a proposal **only when it is
fuzzier than what the dataset already claims** — `max()` up the ladder, never
down. This is the whole reason the step needs no second `wikidata-review.json`:

- **An automated proposal cannot overwrite an editorial judgement.** Sharpening is
  the destructive direction; coarsening only ever withdraws a claim of confidence,
  and the dataset was over-confident by construction (absent = `exact`).
- **It neutralizes the person-QID problem (DS-Q1) for free.** An event mapped to a
  *person* item reads `P569 birth date` at day precision — "Life of the Buddha"
  would have been flattened from `approximate` to `exact` by its own QID. Under
  coarsen-only every one of those is a no-op, so the known-weak mappings can't do
  damage while they wait to be tightened.
- **It protects `speculative`,** the top of the ladder. The Andromeda–Milky Way
  collision carries a real QID with a real (billion-year-precision) date, which
  proposes `estimated` — a *downgrade* of a projection about the year 4,500,000,000
  to a mere scientific estimate. Held.
- **Hand corrections are stable.** Anything set by hand sits at or above the
  proposal, so re-running `data:enrich` never walks it back. The rule is monotone,
  which is also what makes the step idempotent.

The run: **8 coarsened, 22 held, 64 with no dated claim.** The held list is
printed rather than dropped — it's the human review surface, replacing the review
file — and reading it confirms the rule paid for itself: nearly every row is
Wikidata storing a *conventional* date at year precision (Han Dynasty, Mongol
Empire, Bronze Age Collapse) or a person's birthday standing in for an event.
None were worth sharpening by hand.

### What automation can't reach, a gate catches

Coarsening needs a date to read, and the events most likely to be wrongly `exact`
are exactly the ones without one: `wheel` (Q446) and `steel` (Q11427) are
*materials*, `Formation of the Solar System` (Q3535) a *process* — concept items
carry no `P585`. So the automated pass left five nonsense-`exact` events standing,
and no amount of pipeline tuning would find them.

`verify:layout` gets the invariant instead, stated as an epistemic claim rather
than a data-shape one: **an event cannot be `exact` in deep time (|year| ≥ 1e6 —
the stored value is a rounded estimate by construction) or before the written
record (year < −3000 — there is no record to be exact from).** Offline, and it
fires on exactly the class the pipeline is blind to. The five it caught plus two
of the same family inside the record (`Discovery of Steel` −1200, `Discovery of
Electricity` −600 — conventional attributions, not dates) were then set by hand.

Net: `precision` present on 87/191 events (was 74), and the four deep-time
landmarks that used to render as unmarked exact years now read `≈`.

## 7. Result & residuals

- **171/191 events reconciled** to unique QIDs; **170 Wikipedia sources**
  backfilled (one QID had no enwiki article), 2 manual sources preserved. Sources
  went 2 → 171.
- **20 deliberately `none`** — speculative futures ("Sun Becomes Red Giant"),
  vague eras ("Social Media Era"), and commodity "first commercial X" events with
  no distinct item. Recorded as `chosen:"none"` in the review file, not lost.
- Gated by a new `verify:layout` provenance block (offline): QIDs well-formed and
  dataset-unique; sources shaped `{label,url}`; every `via:"wikidata"` source
  traces to a QID on its event.
- **Open (DS-Q1):** ~8 events are mapped to *person* QIDs (Galileo, Dalton,
  Lavoisier, Planck, Shakespeare, Columbus…) — a valid source but the reason for
  the date-audit noise; an event/work item would be tighter where one exists.
  §6's coarsen-only rule defuses the *consequence* (their day-precise birth dates
  can't sharpen anything) without fixing the mapping.
- ~~**DS-Q2** — `precision` backfill~~ — answered (D21, §6): coarsen-only backfill
  from Wikidata date-precision + circa/range qualifiers, plus a `verify:layout`
  invariant for the events that carry no date to read.
- **Open (DS-Q3):** the 64 reconciled events with **no dated claim** get no
  precision signal at all, so the field stays as curated. Most are correct; the
  gate only covers the two regimes where `exact` is indefensible outright. A
  fuller pass would need a different signal than Wikidata dates.
- Q4's "when does hand-curation stop scaling?" is answered by the reframe:
  metadata automation was overdue and is now in place; **event selection stays
  hand-curated by design**, so the bulk-SPARQL "Full Version" pipeline remains
  unjustified.
