
# TimelineOfEverything <!-- omit from toc -->

**Interactive timeline from the Big Bang to speculative futures**

## Table of Contents <!-- omit from toc -->

- [Summary](#summary)
- [Origin](#origin)
- [Project Plan](#project-plan)
  - [1. Prototype Phase (POC)](#1-prototype-phase-poc)
  - [2. Full Version (Future Goals)](#2-full-version-future-goals)
- [Technical Plan](#technical-plan)
  - [POC](#poc)
  - [Full Version](#full-version)
- [Development Steps (POC)](#development-steps-poc)
- [Branch Naming \& Git Workflow](#branch-naming--git-workflow)
  - [Branch Naming Rules](#branch-naming-rules)
  - [Git Workflow Recommendations](#git-workflow-recommendations)
- [Future README Structure (TODOs)](#future-readme-structure-todos)
  - [Features](#features)
  - [Installation](#installation)
  - [Usage](#usage)
  - [Data](#data)
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
- Deployment via Vercel/Netlify  

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
- **Deployment:** Vercel / Netlify  

### Full Version

- **Data pipeline:**  
  - SPARQL queries to Wikidata for structured events  
  - JSON or graph database storage (MongoDB, Neo4j, ArangoDB)  
  - Optional Python scripts for automated processing  
- **Frontend:** React + D3.js, advanced zoom, clustering  
- **Backend:** GraphQL API serving filtered events and links  
- Optional ML/graph algorithms for related-event suggestions  

---

## Development Steps (POC)

- [ ] Setup React project and GitHub repo  
- [ ] Create example `events.json` with sample events  
- [ ] Build basic Timeline component with D3.js  
- [ ] Implement zoom & scroll  
- [ ] Add event click tooltip/modal  
- [ ] Add minimal manual links  
- [ ] Add category filters  
- [ ] Deploy POC to Vercel/Netlify  
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

## Future README Structure (TODOs)

### Features

- [ ] Zoomable timeline  
- [ ] Filters by category  
- [ ] Linked / related events  
- [ ] Tooltip / modal for details  
- [ ] Export selected range as poster/PDF  

### Installation

- [ ] Local setup instructions  
- [ ] Dependencies (React, D3.js, etc.)  

### Usage

- [ ] How to interact with the timeline  
- [ ] Example screenshots  

### Data

- [ ] JSON schema  
- [ ] Wikidata/SPARQL pipeline description  
- [ ] Future event generation ideas  

### Development

- [ ] Roadmap from POC → full version  
- [ ] Contribution guidelines  

### Credits / References

- [ ] Sources of historical and technological data  
- [ ] Acknowledgements  

### License

- [ ] License info  

---

**Note:** This README is a living document. TODOs will be updated as development progresses.
