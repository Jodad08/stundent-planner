# EVALS

**Claim under test:** the rules engine (`web/planner.js` `evaluatePlan`) catches every rule a CS plan can break, and passes the official SFSU roadmaps. The planner (deterministic, or model + repair) produces plans the engine accepts.

Run `npm run evals`. It writes `evals/report.md` (all tables) and `evals/results.json`, and exits 1 if any check below fails. No API key is needed; the Gemini variant runs only when `GEMINI_API_KEY` and `GEMINI_MODEL` are set.

## What is measured

| Eval | How | Pass bar |
|---|---|---|
| Seeded errors | 15 single-mistake edits of a valid plan, each with a hand-written list of the issues it must raise (26 total). Only issues that are new compared to the valid plan count. | precision and recall 100%; 0 errors on the valid plan |
| Official roadmaps | The 3 official CS roadmaps in `data/sfsu/roadmaps.json`, converted to plans by `evals/roadmaps.js` | 0 errors, graduation-ready |
| Planner comparison | 4 career goals × 2 made-up students (new freshman; mid-degree sample) × planners: empty plan, official roadmap, deterministic planner, mock model + repair, Gemini + repair | deterministic and model plans have 0 errors |
| Anti-vacuity | empty plan scores worst; reversed plan fails `PREREQ_ORDER`; a model's invented course ID is rejected; an evaluator that passes everything scores recall 0 | all pass |

The valid plan is the official 4-year roadmap (QR Category 1/2), not one of our own plans, so the engine isn't graded against its own output (D-026).

## Results (2026-10-02)

- **Seeded errors:** precision 100%, recall 100% (26/26 found, 0 unexpected).
- **Official roadmaps:** all 3 have 0 errors, graduation-ready, 120 units. The two 4-year roadmaps get `UNITS_HEAVY` warnings (16–17-unit terms: 2 terms in Cat 1/2, 4 in Cat 3/4). That's correct. SFSU's own roadmaps go above the 15-unit normal load, so heavy stays a warning and is not an error.
- **Planner comparison:** the deterministic planner gives a valid 120-unit, 8-term plan for every goal (freshman), and a valid 3-term plan for the mid-degree student. The mock model never passes on its own; it always ends in the deterministic fallback after 2 repairs. That's expected: the mock is a code stand-in, not AI. **Gemini: not run yet (no key).**
- **Anti-vacuity:** all 11 checks pass.

## What the evals caught (all fixed, see `decisions.md`)

1. **Corequisite taken later passed** (S04). The engine accepted PHYS 222 six terms after PHYS 220, but the Bulletin says "Concurrent enrollment". Fixed (D-025).
2. **"No calculus placement" was not checkable** (S15). An explicit `false` was treated like "unknown". Fixed (D-025).
3. **Quant plans could not graduate.** The goal-elective picker skipped the "12 of 15 elective units in CSC" rule and picked MATH 400/448, which pull in MATH 228/325/440. The plan had 121 units, an overloaded last term, and an incomplete elective group. Fixed: goal electives obey the CSC minimum and prefer ones with no extra prerequisite chain.
4. **"Cybersecurity analyst" mapped to Software Engineer.** Goal matching missed "cybersecurity" and "penetration". Fixed.
5. **A model plan that retook finished GE passed.** For the mid-degree student, the mock plan was accepted at 156 units over 6 terms (the deterministic plan: 122 units, 3 terms). It had zero errors, only `ALREADY_SATISFIED` warnings. Those warnings, and `STANDING_NOT_MET`, now go back to the model for repair (D-024).
6. **One expected list was wrong, not the engine.** Removing CSC 230 (S11) also drops the units before CSC 300GW to 59, so `STANDING_NOT_MET` is correct. I added it to the expected list.

## Known limits

- Gemini output is untested until a key is supplied.
- The deterministic planner schedules major courses first, so lower-division GE lands in terms 7–8 and one term reaches 18 units. The plan is valid but doesn't look like the official roadmap.
- Goal match uses project-defined career directions (`data/career_tags.json`), not SFSU data. With electives picked for the goal, the official roadmap still scores 57 for Software Engineer, below another direction.
- Course offerings by term (`typicalTerms`) are empty, so `TERM_NOT_OFFERED` is never tested.
- Every course is `verified: false` until a human checks it.
