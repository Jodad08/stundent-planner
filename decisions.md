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

## Build session 2026-10-02 (build agent, branch `claude/optimistic-babbage-loeauu`)

Human instruction for this session: skip the TypeScript port unless it is fully needed; do reconciliation (step 1), the contract data files (step 3), then the build-order items after them; ask before needing API access or changing the plan.

## D-005: Merge `planning-docs` into the build branch
- Step: 1 (reconcile)
- Decision: Merged `origin/planning-docs` into `claude/optimistic-babbage-loeauu` (merge commit `fa211ab`). The docs branch was cut before the verification-fix commit `ed8c591`; the merge brings both together. No conflicts.
- Alternatives: rebase the docs onto the build branch; keep two branches.
- Why: One branch with current data and the planning docs; `prompt.md` Part 0 describes the build branch.
- Evidence: `git merge-tree` clean; commit `fa211ab`
- Risk / undo: none beyond a normal merge; revert `fa211ab`.
- Critic: PASS (0002-check) [critic: mock]
- Status: active

## D-006: "Select N" instructions written above a requirement table become choose groups
- Step: 1 (reconcile, data fix)
- Decision: When the paragraph (or heading) right above a course table is a choice instruction ("Select Two:", "Select three courses from..."), `scraper/parse.py` wraps that table's courses in a `choose` group, one group per area header if the table has headers. Every choose group now also carries `select_count`, `select_units` and `select_qualifier` parsed from the instruction.
- Alternatives: leave it (elective lists read as required); hand-fix the programs that matter.
- Why: 357 requirement blocks in 197 programs put the instruction outside the table, so their elective lists looked required (e.g. BSBA-ISYS "Select Two" of 10 ISYS electives). A requirement checker would report students missing courses they don't need.
- Evidence: `data/sfsu/programs.json` before: 357 blocks with an unapplied choice instruction; after: 0. 749 choose groups, 688 with a parsed count, 53 with units, 17 with neither (vague text such as "Selected from the following:"). BSBA-ISYS check: https://bulletin.sfsu.edu/colleges/business/information-systems/bs-business-administration-concentration-information-systems/
- Risk / undo: an instruction that applies to only part of a table now covers the whole table. 17 groups have no parsed count; consumers must fall back to the block's units. Revert the `wrap_choice` call in `requirement_blocks`.
- Critic: PASS (0003-check) [critic: mock]
- Status: active

## D-007: Declare CSC 308 as external in the CS DAG
- Step: 1 (reconcile)
- Decision: `scraper/build_cs_dag.py` adds recommended-only codes that are missing from the catalog to `external` with a note. CSC 308 is the only one.
- Alternatives: drop it from `recommended`; leave it undeclared.
- Why: CSC 308 is not in the 2026-27 catalog (`data/sfsu/courses.json` has no record). It appears only in CSC 647's prerequisite text as "CSC 308, CSC 309, and CSC 656 recommended", so it was never a prerequisite edge.
- Evidence: `data/sfsu/courses.json` (no CSC 308; CSC 309 present); CSC 647 `bulletin_prerequisite_text` in `data/sfsu/dags/bs-computer-science.json`; `harness.py scan` now clean
- Risk / undo: none for planning (no edge). Remove the external entry if a later catalog adds CSC 308.
- Critic: PASS (0004-check) [critic: mock]
- Status: active

## D-008: Unambiguous university fields in the DAG; planner and UI read them
- Step: 1 (reconcile)
- Decision: `university` in the CS DAG now has `upper_division_units_required: 30`, `sophomore_standing_units: 30`, `upper_division_standing_units: 60`, `senior_standing_units: 90`, `normal_load_units: [12, 15]`, `max_units_priority_registration: 19`, and `rule_ids` naming the source rule for each. `web/planner.js` and `web/index.html` read these instead of literals; the unit selector labels 19 as "registration maximum".
- Alternatives: keep `upper_division_units: 60` and `max_units_per_term: 19` with comments.
- Why: `upper_division_units: 60` read as "60 upper-division units required" (the rule is 30); 19 is the registration maximum, not an absolute cap (`prompt.md` 0.2).
- Evidence: `academic_rules.json#ug_upper_division_units`, `#class_levels`, `#normal_load`, `#ug_max_units_priority_registration`
- Risk / undo: anything reading the old field names breaks (only `web/` did; updated). Revert in `build_cs_dag.py`.
- Critic: PASS (0005-check) [critic: mock]
- Status: active

## D-009: Correct stale facts in `prompt.md`
- Step: 1 (reconcile)
- Decision: Minimal edits to `prompt.md`: counts (423 programs, 113 rules, 11,457 chunks), the three 0.2 known issues marked resolved, the BSBA-ISYS electives line, and A.5's full-time citation. Added rule `enrollment_status_levels` (undergraduate full time = 12-19 units, enrollment verification incl. financial aid). `fa_enrollment_status` was renamed `pell_enrollment_status` earlier because its 12/9-11/6-8 thresholds are the Pell Grant rule.
- Alternatives: leave the stale lines and rely on this log.
- Why: `prompt.md` is read first every session; stale counts and a wrong citation would mislead the next agent.
- Evidence: `academic_rules.json#enrollment_status_levels` (quote "Undergraduates | Full Time | 12–19 units", https://bulletin.sfsu.edu/policies-procedures/ > Enrollment Verification); `#pell_enrollment_status` (https://bulletin.sfsu.edu/fees-financial-aid/student-financial-aid/); ISYS page above
- Risk / undo: none; revert the `prompt.md` hunks.
- Critic: PASS (0006-check) [critic: mock]
- Status: active

## D-010: P0 major stays B.S. Computer Science
- Step: 1 (open decision 1)
- Decision: P0 is `bs-cs`. BSBA-ISYS (the program in the PDFs) is P1 and starts only after P0 passes the acceptance checklist.
- Alternatives: switch P0 to BSBA-ISYS to match the screenshots.
- Why: `plan.md` §4 and `architecture.md` §2 lock `bs-cs`; it already has a validated AND/OR DAG, career tracks and three official roadmaps (`prompt.md` B.3).
- Evidence: `plan.md` §4; `architecture.md` §2; `data/sfsu/dags/bs-computer-science.json`
- Risk / undo: the side-by-side with the real planner is cross-program until P1.
- Critic: PASS (0007-check) [critic: mock]
- Status: active

### Step 1 summary
- What changed: merged the planning docs; fixed choice instructions above tables (D-006); declared CSC 308 (D-007); renamed DAG university fields and removed literals from the planner/UI (D-008); corrected `prompt.md` (D-009); added rule `enrollment_status_levels`.
- How to run: `python3 scraper/parse.py <cache> data/sfsu && python3 scraper/build_rules.py && python3 scraper/build_rag.py && python3 scraper/build_cs_dag.py && python3 web/make_data.py && python3 web/bundle.py`
- What proves it works: 0 blocks with an unapplied choice instruction (was 357); `harness.py scan` clean; planner output on the sample student unchanged (Spring 2028, CSC 340/413/415 flags); search eval 50/50; rule build finds all 113 quotes.
- What can still fail: 17 choose groups without a parsed count; programs whose "Select" text sits in prose far from the table.

## D-011: One engine, kept in `web/planner.js` (plain JavaScript)
- Step: 3 (open decision 2)
- Decision: The existing UMD engine `web/planner.js` stays the single rules engine for the browser and a Node server. No TypeScript port. `evaluatePlan` will be added to it. `architecture.md` §4/§5 updated, change log line added.
- Alternatives: port to `shared/engine.ts` (the architecture default); keep JS with JSDoc types.
- Why: Human instruction this session: skip the TypeScript port unless it is fully needed. The engine already runs in browser and Node, so a port isn't needed for one engine.
- Evidence: human instruction 2026-10-02; `web/planner.js` (UMD export); `prompt.md` B.4 #1
- Risk / undo: no compile-time types; mitigated by tests that pin outputs. Port later behind the same function names.
- Critic: PASS (0001-check) [critic: mock]
- Status: active

## D-012: Prerequisite contract type is the DAG expression grammar
- Step: 3 (open decision 3)
- Decision: `Course.prereq: PrereqExpr | null` replaces `prereqs: CourseId[][]`. Grammar: course id, `and`, `or`, `{course, concurrent}`, `{coreq}`, `{placement}`, plus a new `{ge_area}` leaf (any earlier course in that GE area), used by the upper-division GE placeholders. Added fields: `prereqEncoded`, `minGrade`, `conditions`, `geAreas`, `unitsRange`. `architecture.md` §6 updated.
- Alternatives: convert to `CourseId[][]` (lossy: drops concurrency, coreqs, placement, so MATH 227 with CSC 230 would become a false error).
- Why: The Bulletin needs these cases; `prompt.md` B.4 #2.
- Evidence: `data/sfsu/dags/bs-computer-science.json` (CSC 230: MATH 227 "may be taken concurrently"); `academic_rules.json#ug_ge_ud_prereqs` (upper-division GE requires 1A, 1B, 1C and 2)
- Risk / undo: the engine must understand `ge_area` (to be added with `evaluatePlan`).
- Critic: PASS (0008-check) [critic: mock]
- Status: active

## D-013: Course IDs keep the Bulletin format (`CSC 413`)
- Step: 3 (open decision 4)
- Decision: IDs use the Bulletin's spacing everywhere. Placeholders use `GE-<area>` and `ELECTIVE-<n>` (no 3-digit number, so they can't collide with real codes). `architecture.md` §3 updated.
- Alternatives: `CSC413` per the original glossary.
- Why: All 4,995 records, roadmaps, the DAG and the transcript format already use it; converting adds a lossy step (`AA S 106` vs `AAS106`).
- Evidence: `data/sfsu/courses.json`; `web/README.md` transcript format
- Risk / undo: none known; a slug function can produce `CSC413` where an ID can't contain spaces.
- Critic: PASS (0009-check) [critic: mock]
- Status: active

## D-014: Contract files are generated from `data/sfsu/`
- Step: 3 (open decision 5)
- Decision: `scraper/build_contracts.py` writes `data/catalog.json` (all 4,995 courses + 15 GE + 4 free-elective placeholders), `data/programs/bs-computer-science.json`, `data/policies.json` and `data/career_tags.json`. `scripts/validate_catalog.py` checks them. Nothing is hand-typed.
- Alternatives: hand-write the contract files; point code straight at `data/sfsu/`.
- Why: Keeps one source (the Bulletin scrape) and the architecture's file contracts. The full catalog also serves as the harness's ID list, so transcript courses outside CS aren't flagged.
- Evidence: `python3 scripts/validate_catalog.py` → OK (5,014 records, 59 encoded prerequisites, 0 errors); CS groups sum to 120 = 22 + 28 + 9 + 15 + 36 GE + 10 free (`ug_units_to_graduate`, `ug_ge_units`); GE areas 2/5A/5C are covered by MATH 226, PHYS 220, PHYS 222 (their `ge_areas`; `ug_major_ge_double_count`); no CS entry on https://bulletin.sfsu.edu/undergraduate-education/general-education/met-in-major/
- Risk / undo: `oneLiner` is the description's first sentence, cut at 90 characters (marked `official`). Re-run the builder after any re-scrape.
- Critic: PASS (0010-check) [critic: mock]
- Status: active

## D-015: Load policies 12 / 15 / 19, unverified until a person checks them
- Step: 3 (open decision 6)
- Decision: `data/policies.json`: `minUnitsFullTime` 12 (`enrollment_status_levels`), `heavyLoadUnits` 15 (`normal_load`, top of the normal load), `maxUnitsWithoutPermission` 19 (`ug_max_units_priority_registration`, labeled "Registration maximum"). Each carries the rule id, the quote and the Bulletin URL, with `verified: false`. The CS DAG's thresholds are also read from `academic_rules.json` now, so every number has one source.
- Alternatives: `verified: true` because the quotes are machine-checked (`prompt.md` A.5).
- Why: `architecture.md` §8 says `verified: true` only after a person compares the record with the Bulletin; architecture wins on contracts. The UI can still show the quote instead of the word "assumed".
- Evidence: `academic_rules.json#enrollment_status_levels`, `#normal_load`, `#ug_max_units_priority_registration`
- Risk / undo: the three values show as unverified until the human confirms them; flip `verified` after that check.
- Critic: PASS (0011-check) [critic: mock]
- Status: active

## D-016: P0 supports mid-degree students
- Step: 3 (open decision 8)
- Decision: P0 shows an "Already done" view fed by the transcript profile the engine already supports. The `Plan` contract gets `completedCourseIds` and real term labels; that `architecture.md` §6 edit lands with `evaluatePlan`.
- Alternatives: fresh 8-semester plans only.
- Why: The real SFSU planner is used mid-degree (`prompt.md` A.6); the engine already removes completed and in-progress courses.
- Evidence: `prompt.md` A.6; `web/planner.js` `profileSets`
- Risk / undo: a fresh freshman still gets 8 empty terms.
- Critic: PASS (0012-check) [critic: mock]
- Status: active

## D-017: No React Flow; extend the existing page with an SVG prerequisite layer
- Step: 3 (human decision)
- Decision: The board is the existing `web/index.html` semester columns with an SVG layer drawn over them: a line from each prerequisite to its dependent, red where the prerequisite order is broken. No React, React Flow, Zustand or Tailwind.
- Alternatives: React Flow board per `plan.md` §5/§10.
- Why: Human decision, 2026-10-02.
- Evidence: human message 2026-10-02 ("No React Flow: extend the current HTML/JS page instead, with an SVG layer over the semester columns")
- Risk / undo: line routing over HTML columns is hand-written; keep it simple (straight curves, recomputed on resize).
- Critic: PASS (0013-check) [critic: mock]
- Status: active

## D-018: The plan critic runs scan-only
- Step: 3 (human decision)
- Decision: No Anthropic key; `harness.py` runs its deterministic scan only. Every decision records `[critic: mock]`.
- Alternatives: supply `ANTHROPIC_API_KEY` for the LLM critic.
- Why: Human decision, 2026-10-02.
- Evidence: human message 2026-10-02 ("No Anthropic key: the planning-doc checker runs in scan-only mode")
- Risk / undo: reasoning and scope aren't reviewed by an LLM; the scan, the validators and the evals carry the checking.
- Critic: PASS (0014-check) [critic: mock]
- Status: active

## D-019: Courses move by click, not drag and drop
- Step: 3 (human decision)
- Decision: A course moves through a "Move to…" menu, or by selecting it and then clicking a semester. No drag and drop.
- Alternatives: drag and drop (`plan.md` §10 P0).
- Why: Human decision, 2026-10-02; the demo's "move CSC 340 before its prerequisite" still works.
- Evidence: human message 2026-10-02 ("Click-to-move: a 'Move to…' menu, or select a course and then click a semester")
- Risk / undo: none.
- Critic: PASS (0015-check) [critic: mock]
- Status: active

### Step 3 summary
- What changed: `scraper/build_contracts.py` generates `data/catalog.json`, `data/programs/bs-computer-science.json`, `data/policies.json`, `data/career_tags.json`; `scripts/validate_catalog.py` validates them; the CS DAG reads its thresholds from `academic_rules.json`; `architecture.md` §3/§4/§5/§6/§8/§16 minimal edits.
- How to run: `python3 scraper/build_cs_dag.py && python3 scraper/build_contracts.py && python3 scripts/validate_catalog.py`
- What proves it works: validator OK (0 errors); harness scan clean; CS groups add up to 120 units.
- What can still fail: only the 59 CS courses have encoded prerequisites; the other courses carry Bulletin text in `prereqNotes`. Nothing is human-verified yet.

## D-020: Harness file-name rules follow the JavaScript engine (D-011)
- Step: 4
- Decision: `harness.py` treats `web/planner.js` and `*.test.js` like `shared/engine.ts`/`*.test.ts` (exempt from the hardcoded-number check), accepts prompts in `server/prompts.js` and the model SDK in `server/gemini.js`. All other checks unchanged; `harness.py selftest` passes.
- Alternatives: rename the engine and tests to .ts without a TypeScript build; keep the rules and suppress findings by hand.
- Why: D-011 keeps the engine in plain JS, so the TypeScript-only file names would flag the engine's own tests and the server's single prompt file. The unknown-course test now builds its fake ID at runtime so the scan still catches real hallucinated IDs elsewhere.
- Evidence: `python3 harness.py selftest` (passed); `python3 harness.py scan` (clean) after the change
- Risk / undo: a policy number hardcoded in `web/planner.js` would no longer be flagged; the engine reads every threshold from `policies.json` (tests use `POL(...)`). Revert the three lines in `harness.py`.
- Critic: PASS (0016-check) [critic: mock]
- Status: active

## D-021: Server in plain Node + Express with one model adapter and a repair loop
- Step: 4 (prompt.md B.5 steps 4–7)
- Decision: `server/` is plain Node + Express 5. One model adapter, `server/gemini.js`, with providers `gemini|mock` (`AI_PROVIDER`; mock is the default when `GEMINI_API_KEY` is unset; `GEMINI_MODEL` is required for gemini, never hardcoded). All prompts and response schemas live in `server/prompts.js`. `POST /api/plan` checks the schema, rejects unknown IDs (never auto-corrects), runs `evaluatePlan`, allows at most 2 repairs, then falls back to `buildFallbackPlan`. Every plan/evaluate call is saved to `runs/` and replays without a model call. `PlanRequest` adds `startTerm` and `profile`.
- Alternatives: TypeScript server (D-011 ditched the TS port); call the model from the browser (puts the key in the frontend).
- Why: Keeps the key on the server, keeps validity in the engine, and lets every step run and be tested without an API key.
- Evidence: `npm test` (`server/server.test.js` 6/6: mock pipeline + replay, invented IDs rejected after 3 calls, schema-invalid → fallback, model exception → fallback, suggestion filtering, bad-request codes)
- Risk / undo: the mock is deterministic code, not AI; the UI must label it "Mock model". The real Gemini call is untested until a key is supplied.
- Critic: PASS (0017-check) [critic: mock]
- Status: active

## D-022: Engine adds STANDING_NOT_MET and ALREADY_SATISFIED
- Step: 4
- Decision: `evaluatePlan` reports `STANDING_NOT_MET` (a course needing upper-division standing placed before the student has the units) and `ALREADY_SATISFIED` (a GE placeholder whose area a completed or planned real course already covers). Both are warnings. Real courses cover GE areas before placeholders do.
- Alternatives: leave standing to the scheduler only; silently ignore redundant placeholders.
- Why: The mock run for the sample student re-took GE areas already done and still looked valid; standing violations only showed in the scheduler, not in a checked plan.
- Evidence: `web/planner.test.js` ("upper-division standing is checked against units before the term"); mock smoke run for the sample cybersecurity student
- Risk / undo: remove the two codes from `evaluatePlan` and `architecture.md` §6 IssueCode.
- Critic: PASS (0018-check) [critic: mock]
- Status: active

### Step 4 summary (engine + server)
- What changed: `web/planner.js` exports `evaluatePlan`, `buildFallbackPlan`, `repairPlan`, `directionScores`; `web/planner.test.js` (14 tests); `server/` (data, schema, prompts, mock model, Gemini adapter, plan pipeline, evaluate, runs, API) with `server/server.test.js` (6 tests); `package.json`; `architecture.md` §6/§9/§12/§13/§16.
- How to run: `npm install && npm test && npm start` (mock provider without a key).
- What proves it works: 20/20 tests; harness scan clean.
- What can still fail: real Gemini output (no key yet); board UI not yet wired to the server.

## D-023: Two spare free-elective placeholders
- Step: 4 (evals)
- Decision: `data/catalog.json` gains `ELECTIVE-5` and `ELECTIVE-6` (3 units each, marked spare). The free-elective group still requires 10 units; the deterministic planner still uses `ELECTIVE-1..4` first.
- Alternatives: leave the ADT roadmap 3 units short in the eval; map an American Institutions row to a real course (made up).
- Why: The official ADT transfer roadmap lists 12 units of university electives and American Institutions; with only 3+3+3+1 placeholders it could not be written as a Plan.
- Evidence: `data/sfsu/roadmaps.json#…/adt-roadmap` (Third and Fourth Semester rows); `scraper/build_contracts.py`
- Risk / undo: a model could pad a plan with spare placeholders; `TOTAL_UNITS_SHORT` doesn't catch excess, but the comparison eval reports total units. Remove the `spare` loop in `build_contracts.py`.
- Critic: PASS (0019-check) [critic: mock]
- Status: active

## D-024: The repair loop also fixes ALREADY_SATISFIED and STANDING_NOT_MET
- Step: 4 (evals)
- Decision: In `/api/plan`, these two warnings count as problems the model must fix, like engine errors. Other warnings (heavy terms, unverified data) don't trigger a repair.
- Alternatives: repair on errors only (before); repair on every warning (official roadmaps carry heavy-term warnings, so nothing would pass).
- Why: The planner-comparison eval accepted a mock plan for the mid-degree student with 156 units and 6 terms: it retook GE areas the student had finished. A plan that wastes a year isn't a good plan, even with zero errors.
- Evidence: `evals/report.md` §3 (before: mid-degree mock "→ ai", 156 units; after: fallback, 122 units, 3 terms); `server/server.test.js` ("a plan that retakes finished requirements goes back for repair")
- Risk / undo: more model plans end in fallback; the eval reports how often. Remove the two codes from `REPAIR_WARNINGS` in `server/aiPlan.js`.
- Critic: PASS (0020-check) [critic: mock]
- Status: active

## D-025: A corequisite means the same term
- Step: 4 (evals)
- Decision: `COREQ_ORDER` also fires when the corequisite is placed in an earlier plan term. A corequisite completed before the plan still counts (retaking only the lab). An explicit `placement: {calculus: false}` makes a placement-only path `PREREQ_MISSING`; an unknown placement stays a `PREREQ_NOTE`. `plan.md` §9 COREQ_ORDER row edited to match.
- Alternatives: `plan.md` §9 "same semester or earlier" (lets PHYS 222 sit six terms after PHYS 220).
- Why: The Bulletin text is "Concurrent enrollment in PHYS 220"; prompt.md precedence says a sourced fact beats a planning-file statement. The seeded-error eval missed the lab-later case.
- Evidence: `data/sfsu/courses.json#PHYS 222` ("Concurrent enrollment in PHYS 220."); `evals/report.md` S04, S15
- Risk / undo: none known for the 59 CS courses; `coreqs` come only from DAG-encoded `coreq` leaves. Remove the `course.coreqs` loop in `evaluatePlan`.
- Critic: PASS (0021-check) [critic: mock]
- Status: active

## D-026: Eval design
- Step: 4 (prompt.md B.6)
- Decision: The seeded suite's valid fixture is the official 4-year CS roadmap (QR Category 1/2) converted to a Plan by `evals/roadmaps.js`. Roadmap rows without a code map by title: GE rows to GE placeholders, American Institutions and SF State Studies rows to free-elective placeholders (the engine doesn't track them), major-elective slots to goal electives whose prerequisites the roadmap already meets. Expected issues for each seeded error are written by hand from the Bulletin prerequisites. Eval runs write to a temp folder, not `runs/`.
- Alternatives: use the deterministic plan as the fixture (would test the engine against its own output).
- Why: An official SFSU roadmap is independent of our code, so "0 errors on the valid fixture" means something.
- Evidence: `evals/run_evals.js`, `evals/roadmaps.js`, `evals/report.md`
- Risk / undo: the title mapping is ours; `evals/roadmaps.js` lists it so a reviewer can check it row by row.
- Critic: PASS (0022-check) [critic: mock]
- Status: active

### Step 4 summary (evals)
- What changed: `evals/run_evals.js` + `evals/roadmaps.js` (seeded errors, official roadmaps, planner comparison, anti-vacuity) → `evals/results.json`, `evals/report.md`; `EVALS.md`. Engine and planner fixes the evals found: coreq order (D-025), explicit placement, elective picker ignored the 12-CSC-unit minimum for goal electives and picked electives with extra prerequisite chains (quant plans were not graduation-ready), clearer subject-minimum message, `Issue.groupId`; goal matching missed "cybersecurity"/"penetration"; repair loop (D-024); spare placeholders (D-023).
- How to run: `npm run evals` (exit 1 on a failed check); `npm test` (24 tests).
- What proves it works: seeded precision 100% / recall 100% (26 issues, 15 seeded errors); 3/3 official CS roadmaps 0 errors and graduation-ready; deterministic plans valid for 4 goals × 2 students; all anti-vacuity checks pass, including a pass-everything evaluator scoring recall 0.
- What can still fail: the Gemini variant has not run (no key). The deterministic planner packs major courses early and leaves lower-division GE for terms 7–8, with one 18-unit term: valid, but unlike the official roadmap.
