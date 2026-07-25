# Precision Rendering

> Topic design doc. How `precision` (Q6) surfaces on-canvas and in text — a mostly-invisible
> tier for the common `exact` case, dashed dots + faded bar ends for the fuzzy tiers, and a
> prefixed symbol wherever a date is displayed as text.
> Indexed from the main [`DESIGN.md`](../../DESIGN.md).

**Status:** v1 implemented; the field itself was backfilled later (D21).
**Last updated:** 2026-07-25

---

## 1. Model

`precision` is an existing optional field (schema v2, §4) on every event: `exact` (the
default, and what an absent value means) | `approximate` (mostly ancient/medieval spans and
point events) | `estimated` (mostly deep-time/prehistoric — cosmological and geological
events dated by scientific inference rather than record) | `speculative` (far-future events
past the domain's "now" edge — hypothetical, may not occur as stated at all).

> **Since D21** the field is no longer only hand-set: it is backfilled from Wikidata's
> date-precision under a coarsen-only rule, and gated against claiming `exact` in deep time
> or before the written record. 87 of 191 events are now non-`exact` (was 74) — see
> [`data-sourcing.md`](data-sourcing.md) §6. That the *rendering* shipped a year before the
> *data* was filled in is the reason −4,600,000,000 read as a known year for so long.

Two different kinds of "not exact" are conflated on purpose: `approximate`/`estimated` both
mean "this date is fuzzy, we're not sure to the year/decade", while `speculative` means
something categorically different — "this hasn't happened, we're projecting". They share one
tier system because both cash out the same way for the reader: *don't take this year
literally*.

## 2. On-canvas: binary, not 3-way

The dot's `r`/`fill-opacity` pair (Timeline.jsx `render()`, the membership loop) already
encodes labeled-vs-unlabeled — the one channel a 3–4.5px circle has spare bandwidth for is its
stroke. Rather than three dash patterns (unreadable at that radius, and a third state nobody
would remember without a legend), precision gets **one on-canvas signal: dashed vs solid**,
set once at dot creation from `isFuzzy(e)` (`format.js`) — `exact` stays a solid `#fff` ring,
any non-exact tier gets `stroke-dasharray: 2,1.5`. The existing per-frame membership loop
(labeled → stroke-opacity 0.35, unlabeled → 0) is untouched, so the dash only reads once a dot
has earned a label — consistent with the rest of the de-cluttering philosophy (small receded
dots carry minimal visual weight) and harmless for discovery: every dot's hover tooltip shows
the full-resolution precision via the text mark (§4) regardless of labeled state.

The **3-way distinction is reserved for text** (§4, §5) where a word ("approximate" /
"estimated" / "speculative") can actually be read, rather than inferred from a dash pattern.

## 3. Bars: fade the ends (closes SR-Q2)

`span-rendering.md`'s SR-Q2 asked for fuzzy spans to fade at the ends instead of a hard cap.
Implementation: one SVG `<linearGradient>` per category present in the filtered set (5 max),
`gradientUnits="objectBoundingBox"` (the default) so **one gradient def serves every bar of
that category regardless of pixel width** — no per-span/per-width gradient needed. Stops:
0%/100% at `stop-opacity 0`, 12%/88% at `stop-opacity 1`, all `stop-color` = the category
color. A fuzzy bar's `fill` becomes `url(#fuzzy-fade-<category>)` instead of the flat color;
non-fuzzy bars are unchanged. The existing `fill-opacity` (0.55 flat / 0.85 hover) still
applies on top and composes correctly — hover brightens a faded bar exactly like a solid one,
multiplying rather than replacing the gradient's own per-pixel opacity.

21 of the dataset's 32 spans are fuzzy — 20 `approximate` (Renaissance, Mongol Empire,
Industrial Revolution, Han Dynasty, …) and, since the D21 backfill, one `estimated`
(Agricultural Revolution, whose Wikidata start *and* end are millennium-precision). The
gradient is keyed off `isFuzzy()`, not a literal `precision === 'approximate'` check, so
that new tier needed no code — which is what the original note predicted.

## 4. Text: a prefix mark via `formatYearRange()`

Per the project's "one time-display helper" convention (span-rendering.md §2), the mark is
added inside `formatYearRange()` itself so every surface (tooltip, SVG `<title>`, chip
member preview/list, "Connected events" rows, search suggestions, detail modal) gets it for
free with no separate call sites to update:

| Tier | Mark | Meaning |
|---|---|---|
| `exact` (default) | *(none)* | unmarked — the common case stays clean |
| `approximate` | `~` | roughly known (historical convention, "circa") |
| `estimated` | `≈` | scientific estimate, typically a much wider error bar (deep time) |
| `speculative` | `?` | hypothetical/projected — may not occur as dated at all |

The mark prefixes the whole formatted string once (`~1400 – 1600`, not `~1400 – ~1600`) —
simpler, and matches the historical-writing convention of a single leading qualifier over a
range.

## 5. Modal: a precision pill

The detail modal gets a small pill next to the existing category badge (reuses
`.event-category`'s box model: `display: inline-block`, matching padding/radius/font-size)
via a new `.event-precision` class — visually distinct as an *outlined, dashed* pill (echoing
the dot's dashed-ring treatment) in a single neutral color (`#8a92d8`, the app's existing
"mixed/ambiguous" signal color, already used for multi-category cluster chips) rather than
inventing three new per-tier colors. Text is mark + word (`"~ approximate"`) via
`precisionLabel()` (format.js) — spelling out what the symbol means the first time a reader
meets it. Only rendered when `isFuzzy(selectedEvent)` — `exact` events show no pill, keeping
the modal uncluttered for the majority case.

## 6. Data-quality gate

`verify:layout` gets a new enum check (mirrors the D14 `SUBCATS` pattern): every event's
`precision`, when present, must be one of the four controlled values — an unrecognized value
would otherwise silently render as unmarked `exact` instead of failing CI.

D21 added a second, stronger clause to the same block. The enum check only polices values
that *are* there, and the failure mode this doc's whole tier system exists for is the value
that **isn't**: absent renders as unmarked `exact`, indistinguishable from a deliberate
claim. So `exact` is now banned outright in the two regimes where it cannot be true — deep
time (|year| ≥ 1e6) and before the written record (year < −3000). Rationale in
[`data-sourcing.md`](data-sourcing.md) §6.

## 7. Open items

- **PR-Q1 — Unlabeled fuzzy dots show no on-canvas cue.** Deliberate (§2) — revisit if user
  testing says the fuzzy/exact distinction needs to survive de-cluttering, not just labeling.
- **PR-Q2 — Cluster chips don't reflect member precision.** A chip aggregates events of
  potentially mixed precision; showing one tier on the chip pill would be misleading, and the
  member list it opens into already carries full per-member marks. Not planned.
- **PR-Q3 — No on-canvas legend for the three text marks** (`~`/`≈`/`?`). The modal pill
  spells the word out on first encounter; a persistent legend can be added if hover-first
  discovery proves insufficient.
- SR-Q3 (bar end-cap ticks) and SR-Q4 (near-touching same-lane spans) remain open,
  independent of this doc.
