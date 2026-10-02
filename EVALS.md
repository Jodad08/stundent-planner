# EVALS

Run: `npm run evals` (writes `evals/results.json`). Engine tests: `npm test`.

| Eval | What passes | Anti-vacuity |
|---|---|---|
| Seeded-error suite | Every broken fixture yields exactly its listed issue codes; the valid fixture yields no errors. Reports precision/recall. | An evaluator that flags nothing fails recall. |
| Official-roadmap check | `evaluatePlan` on each CS roadmap in `roadmaps.json`. Any flagged error is investigated and logged in `decisions.md`. | |
| Planner comparison | Empty plan, official roadmap, deterministic planner, Gemini (after repair) on 3 goals. Metrics: errors, groups satisfied, semesters, units, goal-track match, repair attempts. | Empty plan must score worst. |
| Shuffle control | Reversing the semester order of the deterministic plan must produce `PREREQ_ORDER`. | |
| Invented ID | A Gemini plan containing a fake course ID has it rejected (`UNKNOWN_COURSE`). | |

Rules: engine reports and scores never enter the plan-generation prompt. The evaluate prompt may receive them (`plan.md` §11.3).
