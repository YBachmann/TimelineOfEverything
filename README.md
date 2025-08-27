# TimelineOfEverything

**Interactive timeline from the Big Bang to speculative futures**

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

- [x] Setup React project and GitHub repo  
- [x] Create example `events.json` with sample events  
- [x] Build basic Timeline component with D3.js  
- [x] Implement zoom & scroll  
- [x] Add event click tooltip/modal  
- [x] Add minimal manual links  
- [x] Add category filters  
- [x] Deploy POC to Vercel/Netlify  
- [ ] Iterative expansion: more events, automated linking, UX polish  

---

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
