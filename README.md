# PlanEd

**Same SFSU degree requirements, three planners: SFSU's official roadmap, a deterministic prerequisite engine, and Gemini constrained by that engine.** Watch which plans break prerequisite rules, which reach graduation soonest, and which fit the student's career goal, with every rule traced to a Bulletin quote.

Built at SF Hacks x GDG AI Hackathon (SFSU, 2026-10-02). Tracks: Build for SFSU, GDG AI for Social Good.

## The problem (observed, not assumed)
SFSU's Student Center has a Degree Planner (suggested courses per term) and a Degree Progress Report (a long requirement audit). Neither shows prerequisites, why a course is placed where it is, or how a plan fits a career goal. SFSU's planner lists what to take; PlanEd shows how it connects.

## What it does
1. **Onboarding.** Name, major (all 117 SFSU bachelor's programs listed; B.S. Computer Science is mapped), units and semesters completed, expected graduation, courses per semester, the courses you already took (type codes, checked against the catalog), and your career goal. Then **✦ Auto plan it** or **I'll plan it myself**.
2. **Your degree as semester columns.** One card per course. Each card's "Needs" chips turn green when that prerequisite is planned earlier. Card color is the rules engine's verdict: green OK, red broken rule, amber warning. Credit totals per semester are colored by SFSU's unit-load rules. Drag cards between semesters, or press + in the course list. A **Graph** toggle shows every prerequisite as a line.
3. **Auto Plan.** One click fills your remaining semesters for your goal. The AI proposes, the engine checks every rule and sends mistakes back for repair, and you see the reasoning step by step.
4. **Evaluate.** Your plan from start to end (the longest prerequisite chain, semester by semester), where it's heading (career direction), career paths to consider, and the rule check with the Bulletin's own words.
5. **The gator 🐊.** Tells you what to add next until your next semester has enough credits; click it for Auto plan, Evaluate, and Export for SFSU (a one-page plan to send to the university).

## Where AI is used, and what happens when it is wrong
| | |
|---|---|
| Gemini does | Plan from a free-text career goal; explain a plan; suggest swaps |
| Gemini never does | Decide validity, change data or policy numbers, write to `data/` |
| Invented course ID | Dropped and reported back to the model; never auto-corrected |
| Rule violation | Engine messages go back for repair (max 2), then deterministic fallback |
| Model down (503) | Fallback model chain, then the labeled deterministic plan |

## Evidence (`npm run evals`, `evals/results.json`)
- Seeded-error suite: 9 planted mistakes, **precision 1.00, recall 1.00**; the valid plan has 0 errors.
- **Both official SFSU CS roadmaps pass the engine with 0 prerequisite errors**: our engine agrees with SFSU's own sample plans. They do show 16-17 unit semesters (above the Bulletin's 12-15 normal load) and leave electives unnamed.
- Anti-vacuity: empty plan scores worst, a reversed plan fails, invented IDs are rejected, scores never enter the generation prompt.
- 15 engine unit tests, including pins against the original `web/planner.js`.

## Run it
```bash
npm install
cp .env.example .env      # add GEMINI_API_KEY (works without it in mock mode)
npm run dev               # simulated AI, no API calls (default); board http://localhost:5173, API :3000
npm run dev:gemini        # live Gemini (needs GEMINI_API_KEY with quota)
npm test                  # engine tests
AI_PROVIDER=mock npm run evals   # writes evals/results.json
npm run build && npm start   # single server on http://localhost:3000 (simulated AI; start:gemini for live)
```

## Data
Public SFSU 2026-27 Bulletin only (`data/sfsu/`, scraped with robots.txt respected; every record keeps its page URL). Unit-load rules come from `academic_rules.json` with verbatim, machine-checked quotes. Course data is machine-checked, not human-verified: the UI says so. No SFSU login, no student records.

## Limits (honest)
B.S. Computer Science only; fresh 8-semester plans (no transfer/AP credit yet); GE areas, SF State Studies and the 30 upper-division-unit rule are not tracked course-by-course; GPA and instructor-permission conditions are shown, not enforced; no term-offering data exists in the Bulletin. Always confirm with an SFSU advisor.

## Responsible AI
Privacy: no student data leaves the browser except plan + goal text to Gemini; plans live in localStorage. Bias: career directions come from the department's own elective tracks, not model guesses. Accessibility: colors are paired with text labels (chips, "⚠ order"). Accountability: every AI step is saved in `runs/` and every decision is in `decisions.md`.

Architecture: `architecture.md`. Decisions: `decisions.md`. Demo script: `DEMO.md`.
