# Claude Code — project instructions

TimelineOfEverything: a React 19 + D3 single-page interactive timeline (Big Bang → far
future). No backend; the dataset is bundled JSON. **[DESIGN.md](DESIGN.md) is the living
design doc** — the decision log (D-numbers), the open questions, and the
feature↔branch↔design-doc map. Read it at the start of a session.

## Design docs

The project keeps a deep-dive design doc per non-trivial feature in
[docs/design/](docs/design/), indexed from DESIGN.md.

- **Read before you build.** Before working on an area, read its doc in `docs/design/`
  (find it via the map table in DESIGN.md) plus the relevant D-entries.
- **Create/update a doc when a feature carries a non-obvious decision** — a tradeoff, a
  rejected alternative, or a non-trivial mechanism. Match the house style of the existing
  docs (problem → model → key decisions → interplay → open items). Add a one-line index
  row and a map row in DESIGN.md, and log a `D<n>` entry in the decisions section.
- **Commit the doc _with_ the feature**, on the same feature branch — not as an
  afterthought. A commit-time hook (`.claude/hooks/check-design-doc.mjs`) will remind you
  if a `feature/*` branch changed `src/` but added no `docs/design/*.md`. It only warns,
  never blocks — the judgment is yours.
- **Skip the doc** for pure chores, data-only changes, and trivial fixes; an inline
  DESIGN.md decision entry (or nothing) is enough. The `—` rows in the map show which
  branches legitimately have no dedicated doc.

Retroactive docs (reconstructed after the fact) carry a disclaimer at the top and are
marked **ⓡ** in the map — see the existing retroactive five for the format.
