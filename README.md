# TimelineOfEverything <!-- omit from toc -->

**Interactive timeline from the Big Bang to speculative futures**

**Live demo:** [ybachmann.github.io/TimelineOfEverything](https://ybachmann.github.io/TimelineOfEverything/)

## Table of Contents <!-- omit from toc -->

- [Summary](#summary)
- [Origin](#origin)
- [Project Plan](#project-plan)
  - [1. Prototype Phase (POC)](#1-prototype-phase-poc)
  - [2. Full Version (Future Goals)](#2-full-version-future-goals)
- [Technical Plan](#technical-plan)
  - [POC](#poc)
  - [Full Version](#full-version)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Data](#data)
- [Development Steps (POC)](#development-steps-poc)
- [Branch Naming \& Git Workflow](#branch-naming--git-workflow)
  - [Branch Naming Rules](#branch-naming-rules)
  - [Git Workflow Recommendations](#git-workflow-recommendations)
- [Development](#development)
- [Credits / References](#credits--references)
- [License](#license)


---

## Summary

**TimelineOfEverything** is a project to create a highly detailed and interactive timeline spanning the entirety of history and possible futures. It visualizes ancient events (e.g., the Big Bang, first life forms), historical milestones, contemporary events, and speculative future scenarios.

The timeline covers:

- Major natural events (Big Bang, ice ages, extinctions)  
- Human history (civilizations, rulers, philosophers, scientists, artists)  
- Technological milestones (from rubber and steam engines to PCR tests, antibiotics, blue LED, Internet)  
- Cultural and societal shifts (e.g., Renaissance, wars, political milestones)  
- Speculative futures (AI superintelligence, environmental scenarios, cosmic fate)  
- Cosmic events (death of the Sun, end of the universe scenarios)  

---

## Origin

Originally envisioned as a **printable panoramic poster**, the scale differences between ancient and recent history made static visualization impractical. This led to an **interactive web app** concept with:

- Zoomable timeline (logarithmic/linear scaling)  
- Filters by category (natural events, technology, culture, future)  
- Linked events (related historical figures, technologies)  
- Optional future branches (speculative scenarios)  

---

## Project Plan

### 1. Prototype Phase (POC)

- Minimal dataset (10–20 events) in JSON format  
- React + D3.js timeline  
- Zoom & scroll functionality  
- Event click shows tooltip/modal with description  
- Minimal manually created links between events  
- Filters by category  
- Deployment via GitHub Pages  

### 2. Full Version (Future Goals)

- Automated extraction of events from Wikidata/Wikipedia via SPARQL  
- Graph-based event linking (PageRank, community detection)  
- Rich dataset: hundreds/thousands of events  
- Advanced interactive visualization: zoom, pan, filters, linked events  
- Optional user contributions / crowdsourcing  
- Export feature: selected range as printable poster  

---

## Technical Plan

### POC

- **Data:** `data/events.json`  
- **Frontend:** React + D3.js  
- **Backend:** optional (static JSON for now)  
- **Interactivity:** zoom, filters, click tooltips, minimal event links  
- **Deployment:** GitHub Pages — every push to `main` lints, checks layout
  invariants, builds, and deploys via GitHub Actions
  (`.github/workflows/deploy.yml`)  

### Full Version

- **Data pipeline:**  
  - SPARQL queries to Wikidata for structured events  
  - JSON or graph database storage (MongoDB, Neo4j, ArangoDB)  
  - Optional Python scripts for automated processing  
- **Frontend:** React + D3.js, advanced zoom, clustering  
- **Backend:** GraphQL API serving filtered events and links  
- Optional ML/graph algorithms for related-event suggestions  

---

## Features

**Current (POC):**
- [x] Interactive D3.js timeline spanning from Big Bang to future scenarios
- [x] Symmetric-log time scale (handles BCE/CE and 13.8-billion-year spans)
- [x] Zoomable timeline (Ctrl + scroll or pinch, up to 5000×) and horizontal pan (scroll or drag)
- [x] De-cluttered labels: priority-based level-of-detail — labels never overlap
- [x] +N cluster chips aggregate dense pile-ups (click to zoom in or list members)
- [x] Era/span events (`endYear`) rendered as bars on the timeline
- [x] Navigation: era preset buttons, an overview scrubber with viewport window, and a visible-range readout
- [x] Hover tooltips on every mark; click modal with expanded details
- [x] Category filtering (natural, history, science, technology, future)
- [x] Responsive dark theme UI
- [x] Chronological sorting of events
- [x] Linked events: 48 curated relations (led to / preceded by / part of / contrasts) shown
      as a clickable "Connected events" list in the detail modal
- [x] Responsive layout: the chart fills the window, re-renders on resize/rotation without
      losing your place, and compacts its chrome on small screens
- [x] Touch & drag gestures: drag to pan with flick momentum (finger or mouse), pinch to
      zoom, tap for details

**Planned:**
- [ ] Mobile polish: bigger touch targets, double-tap zoom  
- [ ] Export selected range as poster/PDF  

---

## Installation

**Requirements:**
- Node.js 16+ and npm (or yarn)

**Steps:**
```bash
# Clone the repository
git clone https://github.com/yourusername/TimelineOfEverything.git
cd TimelineOfEverything

# Install dependencies
npm install

# Start development server
npm run dev

# Open browser to http://localhost:5173
```

**Build for production:**
```bash
npm run build
npm run preview
```

---

## Usage

1. **Browse the timeline:** Scroll through events from past to future
2. **Filter by category:** Click category buttons to view events by type
   - All
   - Natural
   - History
   - Science
   - Technology
   - Future
3. **View event details:** Each event card shows:
   - Year (formatted with commas)
   - Title
   - Description
   - Category badge

---

## Data

**Schema:** `data/events.json`

```json
{
  "events": [
    {
      "id": 1,
      "year": -13800000000,
      "title": "Big Bang",
      "category": "natural",
      "description": "The beginning of the universe"
    }
  ]
}
```

**Fields (required):**
- `id` (number): Unique event identifier
- `year` (number): Year of event (negative for BCE, positive for CE/AD); for spans, the start year
- `title` (string): Event name
- `category` (string): One of `natural`, `history`, `science`, `technology`, `future`
- `description` (string): Brief description of the event

**Fields (optional, schema v2):** `endYear` (marks the event as a span/era), `subcategory`,
`tags[]`, `precision`, `links[]`, `sources[]`, `importance` — see the full schema
specification in [DESIGN.md](DESIGN.md).

**Current dataset:** 191 curated events (32 spans) spanning the Big Bang to the far future,
balanced across categories and eras (deep time, antiquity, medieval, early modern, modern)

---

## Development Steps (POC)

- [x] Setup React project and GitHub repo  
- [x] Create example `events.json` with sample events - 191 curated events spanning 13.8 billion years, balanced across categories (natural, history, science, technology, future) and eras
- [x] Build interactive Timeline component with D3.js - SVG timeline with a symmetric-log scale and alternating above/below event markers
- [x] Implement zoom & scroll - Ctrl + scroll to zoom toward the cursor; scroll to pan horizontally
- [x] Add event click tooltip/modal - Clicking an event dot or label opens a modal with full details
- [x] Add minimal manual links - 48 curated directional links, mirrored at load, browsable from the event detail modal
- [x] Enhance category filters - Category filtering implemented with button controls
- [x] Deploy POC — GitHub Pages, auto-deployed from `main` by GitHub Actions
- [ ] Iterative expansion: more events, automated linking, UX polish  

---

## Branch Naming & Git Workflow

### Branch Naming Rules

- **Keep names short, descriptive, lowercase, no spaces**  
- **Use prefixes** to indicate branch purpose:  

| Type     | Prefix      | Example                      |
| -------- | ----------- | ---------------------------- |
| Feature  | `feature/`  | `feature/timeline-component` |
| Bugfix   | `bugfix/`   | `bugfix/load-json-error`     |
| Hotfix   | `hotfix/`   | `hotfix/fix-deployment`      |
| Refactor | `refactor/` | `refactor/timeline-ui`       |
| Chore    | `chore/`    | `chore/add-license`          |
| Docs     | `docs/`     | `docs/update-readme`         |

**Example branch names for this project:**  
- `feature/load-events-from-json`  
- `feature/interactive-timeline-ui`  
- `bugfix/fix-timeline-order`  
- `chore/add-license`  

### Git Workflow Recommendations

1. **Main branches**  
   - `main` → stable, deployable code  
   - `develop` → optional, integrate all features before merging to `main`  

2. **Typical workflow**  
   ```bash
   git checkout -b feature/load-events-from-json main
   # make changes
   git add .
   git commit -m "[feature] Load events from JSON"
   git push -u origin feature/load-events-from-json
   # open Pull Request to main or develop
   ```

3. **Best practices**
- Keep branches small and focused
- Use clear commit messages: [Type] Short description
- Regularly merge to avoid conflicts
- PR reviews before merging
- Tag releases, e.g., v0.1.0, v0.2.0

---

## Development

**Current stack:**
- React 19.1+
- Vite 7.1+
- CSS3 (no external UI frameworks yet)

**Future stack considerations:**
- D3.js for advanced timeline visualization
- React Query for data management
- GraphQL for full version backend
- Testing libraries (Jest, React Testing Library)

---

## Credits / References

- Big Bang data: [WMAP](https://wmap.gsfc.nasa.gov/)
- Natural events: [Wikipedia - Geological timescale](https://en.wikipedia.org/wiki/Geologic_time_scale)
- Historical events: [Wikipedia](https://en.wikipedia.org/)
- Technology milestones: Various historical sources

---

## License

Copyright (c) 2025 Yannic Bachmann

All rights reserved.

This software is proprietary. You may not use, copy, modify, or distribute this software without express written permission from the copyright owner.

The copyright owner retains all rights to the software and may, at their sole discretion, relicense it under any terms in the future, including open-source licenses or commercial licenses.

---

**Note:** This README is a living document. Sections will be updated as development progresses.
