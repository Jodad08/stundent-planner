# Decisions

Append-only log of every project decision. Format and rules: `prompt.md` Part C.
Newest entries go at the bottom. To change a decision, add a new one and mark the old one superseded.

---

## Setup (2026-10-02, before the build agent starts)

These were made while setting up the brief and harness. They were not run through `harness.py check` because the harness did not exist yet.

## D-001: Keep the human's planning files as written
- Step: setup
- Decision: `plan.md`, `architecture.md` and `ai-hackathon-builder-skill.md` are committed exactly as the human wrote them. Out-of-date statements are corrected in `prompt.md` (B.4, A.5) and here, not by rewriting those files.
- Alternatives: rewrite `plan.md`/`architecture.md` to match the existing repo.
- Why: The human asked for their versions to be kept. Verified facts still override them through the precedence rule in `prompt.md`.
- Evidence: human instruction, 2026-10-02 ("I want mine there"); `prompt.md` Precedence
- Risk / undo: The agent may follow a stale line in `plan.md`. Mitigated by `prompt.md` B.4 listing every known stale item.
- Critic: not run (setup)
- Status: active

## D-002: Do not commit the Student Center PDFs
- Step: setup
- Decision: `Degree planner.pdf` and `Student Center.pdf` are gitignored. Their facts are summarized in `prompt.md` Part A without personal data.
- Alternatives: commit them; commit blurred copies.
- Why: `Student Center.pdf` contains a real student's name, ID and GPA. Git history is permanent.
- Evidence: `Student Center.pdf` p.2; `.gitignore`
- Risk / undo: Teammates without the PDFs rely on the Part A summary. Blurred copies can be added later.
- Critic: not run (setup)
- Status: active

## D-003: Record the Bulletin scrape as the data source
- Step: setup
- Decision: Created `data/sources.md` listing `https://bulletin.sfsu.edu/` as the source for all of `data/sfsu/`, with the scrape commit as evidence. Links quoted inside Bulletin text are explicitly not counted as sources.
- Alternatives: list every page URL; leave sources undocumented.
- Why: Every scraped record already carries its page URL. A prefix row is accurate and keeps the harness check meaningful.
- Evidence: `data/sfsu/README.md`; `scraper/fetch.py` (BASE, sitemap, robots.txt); commit `cad249b` (2026-10-02)
- Risk / undo: If hand-built data adds a non-Bulletin URL, it must get its own row, or the harness blocks.
- Critic: not run (setup)
- Status: active

## D-004: Tune the harness scan for the existing repo
- Step: setup
- Decision: The scan (a) uses `data/sfsu/courses.json` as the catalog when `data/catalog.json` is absent, (b) accepts course IDs that a DAG declares in `external` with a note, (c) skips URL and course-ID checks inside scraped dumps (`data/sfsu/*`, but not `dags/`), (d) no longer pattern-matches GPA values, (e) allows the existing `scraper/` folder.
- Alternatives: keep the original checks (about 14,000 false positives on Bulletin URLs, and GPA rules flagged as PII).
- Why: A critic that flags everything gets ignored. Hand-built files (DAGs, fixtures, code) are still fully checked, and `selftest` still passes.
- Evidence: `harness.py scan` before/after on 2026-10-02; `harness.py selftest`
- Risk / undo: A real error inside a scraped dump is no longer caught by the scan; `scraper/build_rules.py` and the LLM critic remain.
- Critic: not run (setup)
- Status: active

---

## Open decisions for the build agent

Resolve each one as a `D-0NN` entry (with `harness.py check`) before building on it. Recommendations are in `prompt.md`.

1. P0 major: keep `bs-cs` (recommended, `prompt.md` B.3) or switch.
2. Stack and the single engine: port `web/planner.js` into `shared/` TS vs. the alternatives (`prompt.md` B.4 #1).
3. Prerequisite contract type: adopt the DAG expression grammar (B.4 #2).
4. Course ID format: Bulletin format `CSC 413` vs. `CSC413` (B.4 #3).
5. Data layout: point contracts at `data/sfsu/` vs. generate contract files (B.4 #4).
6. `policies.json` values from `academic_rules.json`: 12 / 15 / 19 (`prompt.md` A.5).
7. DAG issues: CSC 308 in `recommended` but not in the catalog; `university.upper_division_units: 60` naming; the 19-unit label (`prompt.md` 0.2).
8. Mid-degree "Already done" column in P0 (`prompt.md` A.6).

---

## Build session 1 (2026-10-02, from 13:35 PDT; submission 16:45)

Critic note: no `ANTHROPIC_API_KEY` on this machine, so every `harness.py` run below is **mock (deterministic scan only)**. Mock PASS is not approval.

## D-005: Keep B.S. Computer Science as P0
- Step: 1
- Decision: P0 program is `bs-cs`. BSBA-ISYS stays P1 and is not started.
- Alternatives: switch P0 to BSBA-ISYS to match the PDFs.
- Why: CS already has a hand-checked DAG, career tracks, three official roadmaps and a working engine. ISYS has none of those.
- Evidence: `prompt.md` B.3; `data/sfsu/dags/bs-computer-science.json`
- Risk / undo: The side-by-side with the real SFSU planner is cross-program (business student's screen). Say so in the pitch.
- Critic: PASS (scan) [critic: mock]
- Status: active

## D-006: One engine, TypeScript, in `shared/engine.ts`; full planned stack
- Step: 1
- Decision: Port `web/planner.js` to `shared/engine.ts` (behavior-preserving) and add `evaluatePlan` there. Stack per `architecture.md` §4: Vite + React + TS + React Flow + Zustand + Tailwind, Express + TS server. The old `web/index.html` + `planner.js` stay runnable until the board replaces them. Single root `package.json` (no workspaces).
- Alternatives: keep JS + JSDoc; keep the static UI and add a graph to it. Both faster; the human rejected the cut plan ("follow the md files").
- Why: one engine shared by board and server; matches the locked architecture.
- Evidence: `prompt.md` B.4 #1; `architecture.md` §4; human instruction 2026-10-02 13:35
- Risk / undo: Time. A pin test (`shared/engine.test.ts`) compares the port to `web/planner.js` outputs so drift is caught.
- Critic: PASS (scan) [critic: mock]
- Status: active

## D-007: Prerequisites use the DAG expression grammar
- Step: 1
- Decision: `Course.prereq` is the DAG grammar (string / and / or / course+concurrent / coreq / placement), not `CourseId[][]`.
- Alternatives: lossy conversion to `CourseId[][]`.
- Why: `CourseId[][]` cannot express "MATH 227 may be taken concurrently with CSC 230" or the PHYS 220 + 222 coreq; converting would create false `PREREQ_ORDER` errors.
- Evidence: `prompt.md` B.4 #2; DAG nodes `CSC 230`, `PHYS 220`
- Risk / undo: Prompt lines must render the grammar readably (done in `server/prompts.ts`).
- Critic: PASS (scan) [critic: mock]
- Status: active

## D-008: Course IDs use the Bulletin format `CSC 413`
- Step: 1
- Decision: IDs keep the space everywhere. React Flow IDs slug them (`course-CSC-413`).
- Alternatives: `CSC413` per `architecture.md` §3.
- Why: all 4,995 scraped records, the roadmaps and the transcript format use the space.
- Evidence: `prompt.md` B.4 #3; `data/sfsu/courses.json`
- Risk / undo: none material.
- Critic: PASS (scan) [critic: mock]
- Status: active

## D-009: Keep the `data/sfsu/` layout; derive contract files with a script
- Step: 1
- Decision: The engine reads `data/sfsu/dags/bs-computer-science.json` directly as the program + catalog. `data/policies.json` and `data/career_tags.json` are generated by `scripts/build_contract_data.py`. No `data/catalog.json` copy.
- Alternatives: generate `catalog.json` + `programs/bs-computer-science.json` in the `architecture.md` §7 shape.
- Why: one source of truth; a second catalog would drift.
- Evidence: `prompt.md` 0.1, B.4 #4
- Risk / undo: none; a generator can be added later.
- Critic: PASS (scan) [critic: mock]
- Status: active

## D-010: Unit-load policies = 12 / 15 / 19 from academic_rules.json
- Step: 2
- Decision: `minUnitsFullTime` 12 (`fa_enrollment_status`), `heavyLoadUnits` 15 (top of `normal_load` 12-15), `maxUnitsWithoutPermission` 19 (`ug_max_units_priority_registration`). Each carries ruleId, verbatim quote, sourceUrl, `verified: true` (quote machine-checked by `scraper/build_rules.py`). UI labels 19 "priority-registration maximum".
- Alternatives: 12/18/18 from the `plan.md` draft (18 has no source).
- Why: sourced values beat placeholders.
- Evidence: `academic_rules.json#fa_enrollment_status`, `#normal_load`, `#ug_max_units_priority_registration`; `prompt.md` A.5
- Risk / undo: `verified: true` means machine-checked quote, not a human read. Re-run the script to change.
- Critic: PASS (scan) [critic: mock]
- Status: active

## D-011: Career directions = the 4 DAG tracks only
- Step: 2
- Decision: `career_tags.json` has 4 directions (Systems & Security, Web & Mobile, AI & Data, Theory & Graphics) derived from the DAG `tracks`. Free-text goals go to Gemini, which maps them onto these.
- Alternatives: 6-8 directions from `plan.md` §7.6 (Quant, Game dev...).
- Why: the extra directions would need invented course-signal lists. No source for them.
- Evidence: DAG `tracks`; `plan.md` §7.6 ("signals only use courses that exist")
- Risk / undo: Fewer quick-pick chips. Add directions only with a sourced course list.
- Critic: PASS (scan) [critic: mock]
- Status: active

## D-012: DAG reconciliation (CSC 308, standing and unit-cap field names)
- Step: 2
- Decision: (a) CSC 308 is the **former number of CSC 411** (`courses.json` CSC 411 `former_codes`); it appears only in CSC 647's `recommended` list. Declared in DAG `external` with that note. (b) `upper_division_units: 60` renamed `upper_division_standing_units` (junior = 60+ earned units, rule `class_levels`); `senior_units` → `senior_standing_units` (90, `class_levels`); added `min_upper_division_units_for_degree: 30` (`ug_upper_division_units`). (c) `max_units_per_term` renamed `priority_registration_max_units_per_term`. All in `scraper/build_cs_dag.py`, DAG regenerated.
- Alternatives: delete CSC 308 from `recommended`.
- Why: keeps the Bulletin text intact and names numbers by what they mean.
- Evidence: `data/sfsu/courses.json` CSC 411 `former_codes`; `academic_rules.json#class_levels`; `prompt.md` 0.2
- Risk / undo: anything reading the old field names breaks (grep found none).
- Critic: PASS (scan) [critic: mock]
- Status: active

## D-013: Run locally; no Firebase / cloud deploy
- Step: 1
- Decision: The demo runs on the laptop (`npm run dev`, or `npm run build && npm start` serving the built board from Express). No hosting deploy. Google tools: Gemini API with a key from Google AI Studio.
- Alternatives: Firebase Hosting / Cloud Run backup link.
- Why: human instruction ("dont use firebase ... host locally"); `plan.md` §5 already makes local the primary demo.
- Evidence: human instruction 2026-10-02 ~13:50; `plan.md` §5 Hosting
- Risk / undo: No public backup link. Backup = screen recording + saved-run replay. GDG "must use GCP credits" is unconfirmed (human doesn't know which project the key bills to).
- Critic: PASS (scan) [critic: mock]
- Status: active

## D-014: Root-level additions to the folder lock
- Step: 1
- Decision: `vite.config.ts` lives at the root (Vite root = `web/`). `CLAUDE.local.md` and `KICKOFF.md` are gitignored local notes. Added to `ALLOWED_TOP_LEVEL` and `architecture.md` §5.
- Alternatives: config inside `web/`.
- Why: one root `package.json` drives web, server and tests.
- Evidence: `harness.py scan` 2026-10-02
- Risk / undo: none.
- Critic: PASS (scan) [critic: mock]
- Status: active

## D-015: Mid-degree "Already done" column deferred
- Step: 1
- Decision: P0 board plans a fresh 8 semesters. The engine keeps `planner.js`'s transcript-profile support, but the board has no "Already done" column yet.
- Alternatives: build it now (prompt.md A.6 recommends it if under an hour).
- Why: board + AI loop come first in a 3-hour window.
- Evidence: `prompt.md` A.6
- Risk / undo: Pitch must say "fresh plan" honestly. Add after P0 checklist passes.
- Critic: PASS (scan) [critic: mock]
- Status: active

## D-016: Placeholders, default profile and a standing check
- Step: 3
- Decision: (a) GE / free-elective units are placeholder cards whose ID carries the units (`GE-3u-1`), so `Plan` keeps `courseIds` only. (b) `evaluatePlan` takes a `StudentProfile`; default = calculus placement true, matching the official "QR Category 1/2" CS roadmap. (c) New issue code `STANDING_TOO_LOW` (warning) for courses whose Bulletin conditions need upper-division (60+) or senior (90+) standing; thresholds from DAG `university` (rule `class_levels`). (d) GPA / instructor-permission conditions are listed in one `PREREQ_NOTE` info, never errors. (e) `Plan.source` adds `"roadmap"` for official roadmaps in evals.
- Alternatives: fixed 3-unit placeholders (unit totals drift from the engine's plan); no profile (MATH 226's placement branch could never pass).
- Why: lets `evaluatePlan` check the engine's own plans and official roadmaps exactly.
- Evidence: DAG `MATH 226` prereq (placement branch); DAG node conditions ("upper-division standing (60+ units)"); `academic_rules.json#class_levels`
- Risk / undo: The placement default must be visible in the UI ("Assumes calculus-ready").
- Critic: PASS (scan) [critic: mock]
- Status: active

## D-017: Fix: legacy planner added an unneeded MATH 199
- Step: 3
- Decision: `plan()` now marks every target course as needed before expanding prerequisites, in both `web/planner.js` and `shared/engine.ts`. The pin tests still match.
- Alternatives: keep the bug for exact behavior preservation.
- Why: MATH 225's prerequisite is "MATH 198 or MATH 199 or MATH 226". MATH 225 is listed before MATH 226, so the cheapest-OR search picked MATH 199 (4 extra units) even though MATH 226 is required anyway.
- Evidence: DAG `MATH 225` prereq; `requirements[0].courses` order; engine output before/after (Fall Year 1 had both MATH 199 and MATH 226)
- Risk / undo: none found; 15/15 engine tests pass.
- Critic: PASS (scan) [critic: mock]
- Status: active

### Step 3 summary
- Changed: `shared/types.ts`, `shared/engine.ts` (port + `evaluatePlan` + `criticalCourses`), `shared/fallbackPlanner.ts`, `shared/directionScores.ts`, `shared/data.ts`, `shared/engine.test.ts`, made-up mid-degree transcript fixture.
- Run: `npm test`.
- Proof: 15 tests pass, including pins against `web/planner.js` (fresh + mid-degree + bottlenecks), prereq order/missing, concurrency, coreq, placement, 12/15/19 boundaries, unknown/duplicate IDs, reversed-plan control.
- Can still fail: requirement checks ignore GE areas, SF State Studies and the 30 upper-division-unit rule (documented limits).

## D-018: Model adapter details
- Step: 4, 9
- Decision: `server/gemini.ts` `completeJson(system, user, {purpose, schema, mock})`, providers `gemini | mock` (`AI_PROVIDER`, default mock without a key). Structured output via `responseMimeType: application/json` + `responseJsonSchema`. 25 s timeout, one retry; the retry uses `GEMINI_FALLBACK_MODEL` (`gemini-3.7-flash`) when set. Primary `GEMINI_MODEL=gemini-3.8-flash`. The mock plan seeds one prerequisite error (CSC 340 a semester early) so the repair loop runs with no key.
- Alternatives: hardcode the model; retry on the same model only.
- Why: `gemini-3.8-flash` returned 503 "high demand" twice during the build (13:55, 14:05); a different model on retry keeps the demo live.
- Evidence: live `GET /v1beta/models` list 2026-10-02; SDK types `node_modules/@google/genai/dist/genai.d.ts` (`GenerateContentConfig.responseJsonSchema`, `abortSignal`); server log 2026-10-02
- Risk / undo: Both models can be busy; then the deterministic fallback is shown and labeled.
- Critic: PASS (scan) [critic: mock]
- Status: active

## D-019: AI plan harness rules
- Step: 5
- Decision: Gemini plans major courses only; code fills GE/free-elective placeholders (`fillPlaceholders`). Unknown IDs are dropped and reported back, never auto-corrected. A plan is accepted only with zero engine errors, all requirement groups complete and no standing warnings; otherwise up to 2 repair calls with the engine's messages, then the deterministic fallback (keeping any valid electives the model chose). Repair prompts carry engine messages only, never scores. Every call writes `runs/<id>.json`.
- Alternatives: let Gemini place GE placeholders (more tokens, more errors).
- Why: `plan.md` §11.1; skill "The model proposes. Code disposes."
- Evidence: `plan.md` §11.1; `prompt.md` B.5 steps 5-6; run records in `runs/`
- Risk / undo: Placeholder filling is code, so AI plans and fallback plans have identical GE handling.
- Critic: PASS (scan) [critic: mock]
- Status: active

### Steps 4-6 and 9 summary
- Changed: `server/` (adapter, prompts, plan/evaluate/data routes, runs, cache), `.env.example`.
- Run: `npm run server` (mock without key) then `POST /api/plan`.
- Proof: mock run repaired the seeded error on attempt 2; real `gemini-3.8-flash` "cybersecurity analyst" plan accepted on attempt 1 with no engine errors; a 503 run fell back to the labeled engine plan. Runs saved in `runs/`.
- Can still fail: Gemini capacity (503); latency ~14 s per plan call.

## D-020: Board build choices
- Step: 7
- Decision: (a) Vite root is `web/src` (keeps the legacy `web/index.html` planner working); dev proxy is `/api/` (with the slash: `/api` also captured the app's own `api.ts`). (b) Course nodes are NOT `extent: "parent"`: on drag stop the node's x picks the target semester and the store moves it, so drag-between-semesters works (`plan.md` §10.3 asks for both; extent:parent would block it). (c) Engine reports are derived with `useMemo` (`useReport`) instead of stored in Zustand. (d) "Critical" badge = `criticalCourses` (a course whose hard-prerequisite chain inside the plan already ends in Spring Year 4, so delaying it pushes graduation out); this is our own definition, NOT SFSU's undefined "Critical" icon. (e) Added a "Deterministic plan (no AI)" button in the AI Plan modal, a Proof panel (reads `evals/results.json` via `GET /api/evals`) and a Runs panel (saved-run replay, no model call). (f) Hover card uses React Flow `NodeToolbar`.
- Alternatives: extent:parent + sidebar-only moves.
- Why: demo moment needs drag-between-semesters; Proof/Runs panels are the skill's "evidence visible in the UI" and replay requirements.
- Evidence: `plan.md` §10.3, §13; `prompt.md` A.3 ("Critical" unexplained), B.5 step 6; browser test 2026-10-02 14:25 (CSC 340 drag → bold edges, red dot, "1 rule error", Fall Year 2 amber at 18 units)
- Risk / undo: new top-level files none. `web/src/components/ProofPanel.tsx`, `RunsPanel.tsx` added beyond the §5 list (logged here).
- Critic: PASS (scan) [critic: mock]
- Status: active

## D-021: Evals design and findings
- Step: 8
- Decision: `evals/run_evals.ts` writes `evals/results.json`: 9 seeded-error cases (exact expected code sets), both 8-semester official CS roadmaps, a 4-planner comparison on 3 goals, 6 anti-vacuity checks. The ADT transfer roadmap is skipped (assumes 35 transferred units; transfer credit is out of scope, D-015). Roadmap items without a single in-catalog code (GE, "Major Electives 9 units", US History) become placeholders of the stated units.
- Findings: precision 1.00, recall 1.00; valid fixture 0 errors. **Both official roadmaps have 0 prerequisite errors under the engine** (QR 1/2 with calculus placement, QR 3/4 without), so engine and SFSU agree. They show only load warnings (16-17 unit semesters, above the 12-15 normal load) and an open electives group (the roadmap leaves electives unnamed). Seeded case "CSC 220 removed" also yields `STANDING_TOO_LOW` (3 fewer units leaves a senior-standing course under 90), a correct cascade, so it was added to the expected set.
- Why: `prompt.md` B.6 and EVALS.md; an evaluator must fail what should fail.
- Also: `gemini-3.8-flash` and `gemini-3.7-flash` returned 503 on 2 of 3 plan prompts at 14:30; fallback chain should be `gemini-flash-latest,gemini-3.7-flash` (`gemini-2.5-flash` timed out at 25 s on the plan prompt at 14:25; `gemini-flash-latest` returned a valid plan in 11 s). Agent is blocked from editing `.env*`; the human sets `GEMINI_FALLBACK_MODEL`; when the model gives no answer, the fallback picks a track by keywords (`guessTrack`), labeled as the engine fallback.
- Evidence: `evals/results.json`; `data/sfsu/roadmaps.json` (CS roadmaps); server log 2026-10-02
- Risk / undo: Gemini rows vary run to run; the run ids are recorded in results.
- Critic: PASS (scan) [critic: mock]
- Status: active

### Steps 7-8 and 10 summary
- Changed: `web/src/` (board, sidebar, toolbar, AI Plan modal, Evaluate/Proof/Runs panels), `evals/run_evals.ts` + `evals/results.json`, `shared/fixtures/validPlan.json` + `brokenPlan.json`, `README.md`, `THIRD_PARTY.md`, `architecture.md` §12/§13/§15 tables.
- Run: `npm run dev` → http://localhost:5173; `npm run evals`; `npm run build && npm start` → http://localhost:3000.
- Proof: browser test (deterministic plan graduation-ready; CSC 340 drag shows bold animated edges, red dot, "1 rule error", amber 18-unit semester; Evaluate shows Bulletin quote + source link; Proof panel renders results; AI Plan modal shows the saved-run trace and labels the fallback). Evals: precision/recall 1.00, both official roadmaps 0 errors, 6/6 anti-vacuity. Production build serves board + API from one server.
- Can still fail: Gemini 503s under event load (fallback shows instead, labeled); `.env` fallback chain must be set by the human (agent is blocked from `.env*`).

## D-022: Minimal dot-graph UI and first-load tour
- Step: 10 (demo polish)
- Decision: Restyled the board after the human's Graphify reference screenshot: black canvas, courses as small glowing ring dots labeled with the course code only (hover shows title, credits and the official Bulletin description from `courses.json`, served at `GET /api/descriptions`), near-invisible semester columns whose label carries the load status, faint 1px prerequisite lines, teal dashed OR lines, glowing red animated line + pulsing red dot for a broken rule. Removed minimap, zoom controls and the big legend (one-line key instead). Toolbar reduced to plan tabs, status, ai plan, check, proof and a ⋯ menu (duplicate, saved runs, replay tour, reset). A spotlight tour runs on every page load (8 steps: semester, course, prerequisites, course list, rules engine, AI Plan, Check, Proof). When no plan has courses, the board opens a "Sample plan" from the deterministic planner. Viewport is computed from the fixed layout (React Flow's fitView ran before nodes were measured and cut off the right side).
- Alternatives: adopt Graphify itself (would replace React Flow and break drag/drop, derived edges and the engine wiring late in the build).
- Why: human request ("minimalist ... clean ... simple to use ... demo when we reload"); look only, same engine and data flow.
- Evidence: human instruction + reference image 2026-10-02 ~14:40; browser test (tour targets all found; CSC 340 drag → glowing red edge, pulsing node, "fall y2 · 18u · heavy", "1 rule error")
- Risk / undo: Tour shows on every reload by design; "skip" or Esc closes it. Colors no longer use SFSU purple except the wordmark gold.
- Critic: PASS (scan) [critic: mock]
- Status: active

## D-023: Free-flow node layout, semester zoom, full term names
- Step: 10 (demo polish)
- Decision: Semester boxes removed. Semesters are invisible columns (still the engine's unit of time and the drop target) with a clickable label. Course y-positions come from a layered-graph crossing-reduction pass (6 barycenter sweeps, then each course pulled toward its prerequisites' average row). GE placeholders of a semester collapse into one "ge Nu" dot. Clicking a semester label tweens the camera into that semester; "× all semesters" or Esc tweens back. Canvas pans by dragging empty space, zooms by scroll/pinch. The column under a dragged course (from the list or the canvas) glows. Labels show full term names from the Bulletin year: semester 1 = Fall 2026 ... semester 8 = Spring 2030; Check-panel messages are rewritten to the same names. Camera animation is a custom requestAnimationFrame tween; React Flow's animated `setViewport` did not move in testing (cause: the automation tab is `visibilityState: hidden`, which pauses animation frames), so hidden tabs jump instantly.
- Alternatives: keep boxes; auto-layout library (dagre/elk) - new dependency, and semesters must stay fixed columns anyway.
- Why: human request (rigid rectangles made lines overlap; click-to-zoom; canvas feel; easier drag; full semester names).
- Evidence: human instructions 2026-10-02 ~14:45-14:55; browser test (all 8 columns fit; zoom into Fall 2027 → scale 1.40, back → 0.87)
- Risk / undo: Term years assume a Fall 2026 start (Bulletin 2026-27 catalog year); a later start shifts every label.
- Critic: PASS (scan) [critic: mock]
- Status: active

## D-024: Onboarding wizard and mid-degree plans
- Step: 10 (human request)
- Decision: First visit runs a wizard: name, major (B.S. CS only), units completed, semesters completed, expected graduation, courses per semester (→ units, clamped to the 12-19 policy range), then the course codes taken in each completed semester (autocomplete from the DAG; unknown codes rejected), then the career goal with a preview of that track's electives. "Build my plan" calls `/api/plan` with the taken courses as `lockedPlacements` plus new `completedSemesters` and `unitsEarned`; the server strips anything the model puts in a completed semester and reports it back for repair; the fallback planner now takes completed courses (counted as passed with C, since the wizard asks codes, not grades) and plans from the next term. Completed semesters show "✓ taken". The sidebar shows "recommended" (required + goal-track electives) with an "all courses" toggle. Answers stay in localStorage only. Supersedes the deferral in D-015.
- Alternatives: transcript upload; asking grades per course.
- Why: human request; `prompt.md` A.6 (mid-degree students are how the real planner is used).
- Evidence: human instruction 2026-10-02 ~14:58; `web/README.md` transcript format; browser test (csc101 normalized to CSC 101, CSC 999 rejected, plan built with 2 locked semesters)
- Risk / undo: Grades are assumed C or better for courses typed in.
- Critic: PASS (scan) [critic: mock]
- Status: active

## D-025: Auto Plan, Evaluate wording, PlanEd name
- Step: 10 (human request)
- Decision: "ai plan" → "auto plan": one click fills the remaining semesters for the onboarding goal (completed semesters stay locked; same Gemini → engine → repair → fallback harness); without a saved profile it opens the goal modal. "check" → "evaluate": panel opens with where the plan points (code direction scores + Gemini explanation) and how it connects (`connections()`: prerequisite links, longest chain, zero-slack courses; also passed to the evaluate prompt), then the rule check. Product renamed PlanEd in all user-facing text; storage keys keep the old name so saved plans survive; planning docs keep "GatorGraph" (D-001).
- Alternatives: rename storage keys (drops saved plans).
- Why: human requests 2026-10-02 ~15:00-15:05.
- Evidence: human instructions
- Risk / undo: Gemini key now returns 429 (quota) and 503; Auto Plan falls back to the engine planner and says so.
- Critic: PASS (scan) [critic: mock]
- Status: active

## D-026: Simulated AI by default, all SFSU majors listed, manual-plan option
- Step: 10 (human request)
- Decision: (a) `npm run dev` / `npm start` default to `AI_PROVIDER=mock` ("Simulated AI"): no API call; ~1.4 s think delay; the mock plan returns `thoughts` that narrate computed facts (goal → track, completed semesters, longest prerequisite chain, chosen electives with prerequisite-based reasons, unit target vs. the 19-unit cap) and seeds one CSC 340 mistake so the engine's repair loop shows; the mock evaluate writes the summary and direction text from `connections()` and the code scores. The UI shows the reasoning line by line and names the provider: "Simulated AI" vs "Gemini" (from `/api/health`). Live Gemini: `npm run dev:gemini`. (b) The major dropdown lists all 117 active SFSU bachelor's programs from `programs.json`; only B.S. CS (the mapped DAG) is selectable, others say "map coming soon". (c) The last onboarding step offers "I'll plan it myself" (completed semesters filled, rest empty) next to "✦ auto plan it".
- Alternatives: present the simulation as Gemini (rejected: misleading to judges; GDG track requires Gemini as the core); keep calling the free-tier key (429/503 all afternoon).
- Why: human instruction (free-tier key; simulate the AI; list all majors; manual option). Honest labeling keeps the demo defensible: Gemini integration exists and recorded real runs replay in the Runs panel.
- Evidence: Gemini 429/503 at 14:55-15:00 (probe output); `data/sfsu/programs.json` (117 active B.* programs)
- Risk / undo: Judges may discount simulated output; say plainly "simulation mode because of free-tier quota" and show a recorded real run.
- Critic: PASS (scan) [critic: mock]
- Status: active

## D-027: Card-column view (default) after the AcaMapa reference; graph kept as a toggle
- Step: 10 (human request)
- Decision: Default board = light-theme semester columns with course cards (title, code, credits; "Needs" chips per prerequisite that turn green when satisfied where the card sits; card color = engine status: green ok, red error, amber warning, grey taken). Description and Bulletin text open from the card's chevron. "Program" and "Plan Stats" chips on top; credits footer per semester colored by load status. Sidebar = light course cards with "+" (adds to the first open semester after the completed ones) and "✓ Fall 2027" chips for placed courses. The free-flow graph (D-023) stays behind a Cards/Graph toggle (kept dark as a "map mode").
- Alternatives: replace the graph entirely.
- Why: human request (graph looked cluttered); the graph still answers "show me the whole chain".
- Evidence: human instruction + AcaMapa screenshot 2026-10-02 ~15:05; browser audit 15:20
- Risk / undo: Two views to keep in sync; both derive from the same plan JSON and engine report.
- Critic: PASS (scan) [critic: mock]
- Status: active

## D-028: Evaluate as a guided AI read-out; "Proof" renamed "Justification"; UI audit fixes
- Step: 10 (human request)
- Decision: Evaluate opens with "Evaluating your plan with AI…" and the reasoning revealed line by line; results appear only after it finishes: (1) the plan start to end (longest prerequisite chain as a semester timeline), (2) where it's heading (direction scores + explanation), (3) career paths to consider (2-3, labeled as AI suggestions; the simulated evaluator maps the top track to generic job titles), (4) the rule check, then engine-validated swaps. Gemini's evaluate schema gains `careerPaths`. "Proof" → "Justification" with plain-language sections. Audit fixes: tour card never covers its target and uses the light theme; cards compact (Bulletin text on expand), columns 218 px; placed sidebar courses readable; capitalization and grammar across the UI; term names in all engine messages.
- Alternatives: keep the dense evaluate panel.
- Why: human requests 2026-10-02 ~15:10-15:15.
- Evidence: browser checks (results hidden at 2.5 s, shown by 9.5 s; tour card beside Fall 2026)
- Risk / undo: Career titles are generic suggestions, not SFSU data; labeled as such.
- Critic: PASS (scan) [critic: mock]
- Status: active

## D-029 to D-032: Graph hover arrows, type colors, elective slots, onboarding on every load
- Step: 10 (human requests, 15:25-15:32)
- Decision: (D-029) Graph columns are wider (gap 112 px, readable zoom floor 0.9 with panning); prerequisite lines are hidden unless the course is hovered (its prerequisites and the courses it unlocks, with arrowheads; the rest dims), the course is part of a clicked chain, or the line breaks a rule (always visible). (D-030) Cards are colored by course type (violet core CS, teal math/physics, amber elective, grey taken); engine status is a red/amber outline with a "Breaks a rule"/"Warning" banner; a Colors key sits in the top bar. (D-031) "Elective slot · choose later" placeholders (`EL-3u-n`): count 3 credits, never satisfy the elective requirement; dropping a specific elective onto a slot fills it. (D-032) The onboarding questions show on every load, prefilled from saved answers, with "Skip to my plan"; "I'll plan it myself" keeps a returning student's plan and only rewrites completed semesters. Course list rows are draggable even when placed (moves them), and hover shows the full name and credits.
- Why: human requests.
- Evidence: browser checks (CSC 220 hover shows CSC 215 → CSC 220 → CSC 413; slot filled by CSC 645; list drag moved CSC 340 Spring 2028 → Fall 2029)
- Critic: PASS (scan) [critic: mock]
- Status: active

## D-033: Simulated AI interview before Auto Plan
- Step: 10 (human request)
- Decision: "✦ Auto plan it" opens a chat-style Plan advisor (labeled Simulated AI) that asks 5 personalized questions one at a time, with typing delays and a reaction to each answer: goal; a follow-up chosen by the goal's track; where they want to work (free text, e.g. "Pakistan"); industry vs grad school; course load (can change courses per semester). It ends with a summary, then builds the plan. The answers become the goal text; the track chosen in the interview is sent as a new optional `PlanRequest.trackId` so keyword matching can't flip it ("Building ML systems" contains "systems"). The toolbar's Auto Plan also sends the saved track. Scripted, no model call; the reasoning's first line restates the answers in plain English.
- Why: human request 2026-10-02 ~15:32.
- Evidence: browser run (Shehryar → Machine learning engineer → Building ML systems → Pakistan → Industry → Keep it → AI & Data plan, 0 rule errors)
- Risk / undo: Location and path answers shape the explanation only; required courses come from the Bulletin regardless.
- Critic: PASS (scan) [critic: mock]
- Status: active

## D-034: Onboarding as a rule-based conversation
- Step: 10 (human request)
- Decision: The onboarding form is now a chat. PlanEd asks one question at a time (name, major, semesters done, courses per completed semester, total units, expected graduation, courses per semester, goal, then "plan it for me" or "I'll plan it myself") and reads the raw reply with rules in `web/src/lib/parse.ts` (names with "my name is…" stripped and capitalized; numbers as digits or words; "1 year" = 2 semesters; freshman/sophomore/junior/senior; course codes in any spacing, checked against the DAG with unknown codes named and skipped; "Spring 2030" or a bare year). No AI is used and the screen says so. "Plan it for me" opens the simulated AI interview, which skips the goal question it already has. Returning students get "Welcome back" with "Go to my plan" or "Update my answers". Parsers have a vitest check.
- Why: human request 2026-10-02 ~15:35 ("read those raw messages and take decision without AI").
- Evidence: `web/src/lib/parse.test.ts` (4 tests); browser run (shehryar → Shehryar; "csc101, math226, CSC 999" → 2 added, CSC 999 named and skipped; plan built with 2 locked semesters)
- Critic: PASS (scan) [critic: mock]
- Status: active

## D-035: No course twice in a plan
- Step: 10 (human request)
- Decision: `uniqueCourses(plan)` (shared/engine.ts) keeps each course's earliest appearance. Applied to: plans loaded from localStorage, `addPlan`, a store subscriber that fixes any direct `setState` write (onboarding, Auto Plan), and every `/api/plan` response. Onboarding de-duplicates codes typed twice in one message. Existing guards stay (placeCourse blocks a placed course; moveCourse removes it everywhere first; the AI harness drops repeated IDs; the engine still reports DUPLICATE_COURSE as a safety net).
- Why: human request 2026-10-02 ~15:42.
- Evidence: `shared/engine.test.ts` "uniqueCourses keeps only the earliest copy"; browser check (CSC 101 in Fall 2026 and twice in Fall 2028 → only Fall 2026 after reload)
- Critic: PASS (scan) [critic: mock]
- Status: active

## D-036: Graph: semester capsules, semester-to-semester arrows, click (not hover) for course arrows
- Step: 10 (human request)
- Decision: Hovering no longer changes the graph (the re-derive on every hover caused the flicker); hover only opens the course's info card. Each semester is a rounded capsule around its courses; default arrows run semester to semester. Clicking a course shows only its direct links (what it needs, what it unlocks) with arrowheads and fades the rest; clicking empty space clears. Broken-rule arrows always show. Removed the unused `chainOf`.
- Supersedes: hover behavior in D-029.
- Why: human request 2026-10-02 ~15:45.
- Evidence: browser check (click CSC 340 → arrows from CSC 220, CSC 230 and to CSC 510 and an upper-division course; others dimmed)
- Critic: PASS (scan) [critic: mock]
- Status: active

## D-037: Card prerequisites as a dropdown
- Step: 10 (human request)
- Decision: Each card shows one line, "Prerequisites (n) · met ✓" (red "not met" when the engine reports a prerequisite/order problem for that course); clicking it expands the chips. Collapsed by default.
- Why: human request 2026-10-02 ~15:47 (every card showed the full "Needs" block).
- Evidence: browser check (CSC 340 beside CSC 220/230 → "not met", expands to CSC 220 AND CSC 230)
- Critic: PASS (scan) [critic: mock]
- Status: active

## D-038 / D-039: Course picker in onboarding; "Simulated AI" label renamed "PlanEd"
- Step: 10 (human requests)
- Decision: (D-038) The onboarding course question is a small form: pick a course (autocomplete), "+" to add more, chips with ×, "Done with <term>". (D-039) In offline mode the provider label reads "PlanEd" (the product) instead of "Simulated AI"; live mode still reads "Gemini". "model call(s)" wording became "attempt(s)". README keeps the plain description of offline mode.
- Why: human requests 2026-10-02 ~15:48-15:52.
- Evidence: browser check (csc 101 → CSC 101 chip, CSC 999 refused, Done advances)
- Risk / undo: The pitch must not describe offline output as live Gemini (GDG rules); DEMO.md has the honest line.
- Critic: PASS (scan) [critic: mock]
- Status: active

## D-040: Broken courses say where to go
- Step: 10 (human request)
- Decision: `suggestSemester(plan, dag, policies, id)` (engine) returns the earliest open semester where moving the course leaves no error for it and fewer errors overall, or null when no single move fixes it (e.g. a missing prerequisite). Red cards and Evaluate's error list show "Move it to <term> →", which applies the move; when null the card says to add the missing prerequisite first.
- Why: human request 2026-10-02 ~15:53.
- Evidence: `shared/engine.test.ts` (CSC 340 beside CSC 220/230 → semester 4; missing CSC 220 → null); browser (button moved CSC 340 to Spring 2028, its error cleared)
- Critic: PASS (scan) [critic: mock]
- Status: active

## D-041: Cleaner main page, short friendly chat, graph shows the next N semesters
- Step: 10 (human requests ~15:57-16:02)
- Decision: Cards view: one slim stats line + small color key replace the Program/Colors/Plan Stats boxes; card × and expand appear on hover; errors show one short line ("Needs CSC 220, CSC 230 first") with the full engine text as a tooltip; met prerequisites are a quiet "✓ Prereqs met (n)" line. Onboarding chat and interview questions are a few words each with emoji ("Semesters done?", "Dream job? 🚀"). Graph view shows only the next N semesters after the completed ones (default 2; "Show next" slider up to the remaining semesters); arrows only between visible courses; drops map back to the real semester.
- Why: human requests ("not too text heavy", "do not ask long questions", "students don't care about the whole degree").
- Evidence: browser checks (2 done → graph shows Fall 2027, Spring 2028; slider 4 → through Spring 2029)
- Critic: PASS (scan) [critic: mock]
- Status: active

## D-042: Next-semester focus: year tabs, gator tips, export for SFSU
- Step: 10 (human request)
- Decision: Card view shows one year (2 semesters) at a time, opening on the year of the next semester (first after the completed ones, marked "· next"). A gator (🐊) shows one tip at a time: fix a broken course in the next semester (with "Move it to…"), otherwise "Take <course>" with "Add it", from `nextCourses()` (engine): not yet planned, prerequisites done before that semester, standing reached; years 1-2 suggest only required courses, later years add the goal track's electives first; ranked by how many courses each unlocks. When the semester is full: "Export for SFSU", which downloads a one-page HTML plan (courses, titles, units, total, rules-engine note, "confirm with your advisor"); also a "⬇ Export <term>" button by the year tabs.
- Why: human request 2026-10-02 ~16:01 (students submit next semester; minimize information).
- Evidence: `shared/engine.test.ts` (year-1 suggestions: CSC 101 yes; CSC 340, CSC 300GW, electives no); browser (Year 2 opens; Add it ×4 → "Fall 2027 looks good: 15 units ✅ Export for SFSU")
- Critic: PASS (scan) [critic: mock]
- Status: active

## D-043: Auto Plan through the gator, with visible reasoning; bigger logo
- Step: 10 (human requests ~16:05-16:10)
- Decision: "✦ Auto Plan" opens the gator's question "What should I plan?" with [next term] or [Whole degree]. Next term fills that semester one course at a time (~1 s apart, cards pop in), from `nextCourses()`, and the bubble shows the reason for each pick ("CSC 220: unlocks 4 later courses", plus the goal-track course it leads to), labeled "✦ <AI name> is planning <term>" (Gemini when live, PlanEd offline). Whole degree runs the existing planner harness. Header logo enlarged.
- Why: human requests (pet-driven Auto Plan, visible swapping, highlight the AI's role, bigger logo).
- Evidence: browser (Fall 2027 filled MATH 225 → CSC 220 → CSC 230 → MATH 324 with reasons; "Fall 2027 looks good ✅ Export for SFSU")
- Risk / undo: Offline reasons are computed from the prerequisite map, not a model; the label names the provider.
- Critic: PASS (scan) [critic: mock]
- Status: active

## D-044: Gator reacts to the semester's current state
- Step: 10 (human request)
- Decision: The gator's tip reads the next semester as it is now: empty ("Fall 2027 is empty 👀 Start with MATH 225?" + Add it / Fill it for me), below full time ("has 3 units, below full time (12). Add CSC 220?"), partly filled ("has 12 units. Add … next?"), broken (fix with "Move it to…"), or full (Export for SFSU). It re-renders on every plan change.
- Why: human request 2026-10-02 ~16:09.
- Evidence: browser (empty → 3 units → 6 units messages update after each Add it)
- Critic: PASS (scan) [critic: mock]
- Status: active

## D-045: Course list split into Core / Math / Electives / GE tabs
- Step: 10 (human request)
- Decision: The sidebar shows one group at a time behind four tabs with progress badges (Core = core + advanced CS "done/total", Math = math & physics, Electives = units placed, GE = units). Search ignores the tabs and looks across every group.
- Why: human request 2026-10-02 ~16:10 (long list was confusing).
- Evidence: browser (Core tab 2/12 lists core and advanced CS only)
- Critic: PASS (scan) [critic: mock]
- Status: active
