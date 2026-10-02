# GatorGraph web board

`index.html` is the semester board for SF State's B.S. Computer Science (2026–27 Bulletin). It uses the same rules
engine (`planner.js`) as the server.

## Run it

```
npm install && npm start          # from the repo root, then open http://localhost:3000
```

With the server, AI Plan and Evaluate call `/api/plan` and `/api/evaluate`. The model is a mock unless
`GEMINI_API_KEY` and `GEMINI_MODEL` are set. Without the server (`web/dist/gatorgraph.html` opened as a file, or
`python3 -m http.server` in `web/`), the page is engine-only and AI Plan uses the deterministic planner.

Rebuild after data changes:

```
python3 scraper/build_cs_dag.py && python3 scraper/build_contracts.py   # data/
python3 web/make_data.py                                                # web/data.js
python3 web/bundle.py                                                   # web/dist/gatorgraph.html
```

## Using the canvas

- **Move a course:** drag it to another semester. Or click it, then click a semester (or its "Move … here" button). Or use
  the ⋯ menu on the card.
- **Add / remove:** drag a course from the left list onto a semester; drag a card back onto the list to remove it.
- **Navigate:** drag empty space to pan (or use a trackpad / Shift+wheel). Ctrl/⌘+wheel or pinch zooms. Fit shows every
  semester; the minimap jumps to a spot.
- **Trace:** hover a course to light up its direct prerequisites and the courses it unlocks. Click it to show the whole chain.
- **Arrows:** grey for prerequisites, dashed for "one of", dotted for same-term and corequisites. Red animated with a "!"
  marker means the prerequisite isn't in an earlier semester.
- **Semester colours:** green is fine, amber is above the normal load, red is below full time or above the
  registration maximum. The numbers come from `data/policies.json`.
- **"needs X" chip:** adds the missing prerequisite to the earliest semester where it fits.
- **Tabs:** plans are saved in this browser (`localStorage`). Double-click a tab to rename it.

## Transcript input (what the extraction step should return)

```json
{
  "student": "Name",
  "current_term": {"season": "Fall", "year": 2026},
  "placement": {"calculus": true},
  "courses": [
    {"code": "CSC 220", "grade": "B", "units": 3, "term": "Fall 2025", "confidence": 0.98},
    {"code": "CSC 256", "grade": "IP", "units": 3, "term": "Fall 2026", "confidence": 0.99}
  ]
}
```

An uploaded transcript isn't saved to `localStorage`. With the server running, AI Plan and Evaluate send it to your
local server, which saves each call in `runs/` (gitignored).
