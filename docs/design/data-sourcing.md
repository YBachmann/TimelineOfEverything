# Data sourcing — Wikidata reconciliation & enrichment

> Topic design doc for **D20**. How the hand-curated dataset gained machine
> provenance (a Wikidata QID per event) and a real `sources` backfill, without
> surrendering the editorial layer that *is* the product. Indexed from the main
> [`DESIGN.md`](../../DESIGN.md).

**Status:** implemented (D20).
**Last updated:** 2026-07-24.

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

## 6. Result & residuals

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
- **Open (DS-Q2):** `precision` backfill from Wikidata date-precision qualifiers
  is now possible (the entity fetch already reads them) but not yet done.
- Q4's "when does hand-curation stop scaling?" is answered by the reframe:
  metadata automation was overdue and is now in place; **event selection stays
  hand-curated by design**, so the bulk-SPARQL "Full Version" pipeline remains
  unjustified.
