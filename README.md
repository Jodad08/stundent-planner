# GatorGraph

A degree planner for SF State's B.S. Computer Science, built on the 2026–27 Bulletin. You lay out 8 semesters on a
board. A rules engine checks every move: prerequisite order, corequisites, units per semester, standing and requirement
groups. It draws broken prerequisites as red lines. An AI planner (Gemini, or a mock without a key) proposes a full plan
from a career goal. The engine checks that plan before you see it, and falls back to a deterministic planner when the
model's plan still breaks rules after 2 repairs.

Unofficial. Nothing here is advisor-verified yet.

## Run it on your machine

Needs Node 18 or newer (tested on 22) and git.

```
git clone https://github.com/Jodad08/stundent-planner.git
cd stundent-planner
git checkout claude/optimistic-babbage-loeauu
npm install
npm start
```

Open http://localhost:3000. Use `PORT=4000 npm start` to pick another port.

That runs the mock model (deterministic code, labelled "Mock model (not AI)" in the UI). To use Gemini:

```
GEMINI_API_KEY=your-key GEMINI_MODEL=<current Gemini model ID> npm start
```

The key stays on the server and is never sent to the browser.

No server needed: open `web/dist/gatorgraph.html` in a browser. Everything works except the AI calls; AI Plan then uses
the deterministic planner.

## Check it

```
npm test                         # engine + server tests
npm run evals                    # seeded errors, official roadmaps, planner comparison (see EVALS.md)
python3 scripts/validate_catalog.py
python3 harness.py scan
```

## Where things are

| Path | What |
|---|---|
| `web/index.html`, `web/planner.js` | The board and the rules engine (the same engine runs in the browser and on the server) |
| `server/` | Express API: `/api/plan` (model → schema check → engine → repair ×2 → fallback), `/api/evaluate`, saved runs |
| `data/catalog.json`, `data/programs/`, `data/policies.json`, `data/career_tags.json` | Contract data generated from `data/sfsu/` by `scraper/build_contracts.py` |
| `data/sfsu/` | The scraped Bulletin: 4,995 courses, 423 programs, 113 policy rules, roadmaps, RAG chunks |
| `evals/`, `EVALS.md` | Eval runner and results |
| `decisions.md` | Every design decision, with evidence |
| `plan.md`, `architecture.md`, `prompt.md` | Planning documents |
