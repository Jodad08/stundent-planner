# PROMPT: Build GatorGraph (read this first, every session)

You are the coding agent for **GatorGraph**, a visual, rules-checked degree planner for San Francisco State University (SFSU), built for the SF Hacks x GDG AI Hackathon.

This file does four things:
1. Tells you what **already exists in this repo** (Part 0). A lot of the hard work is done. Do not redo it.
2. Tells you what is **actually happening at SFSU today**, from two real screenshots of the SFSU Student Center (Part A).
3. Gives you a **direction**: thesis, demo moment, build order, and the open conflicts you must resolve (Part B).
4. Defines the two **control loops** you must run: `decisions.md` (Part C) and the critic `harness.py` (Part D).

Read order, before writing any code:
1. `prompt.md` (this file)
2. `decisions.md` (what has already been decided, and the open questions)
3. `architecture.md` (technical contracts: names, types, paths, APIs)
4. `plan.md` (scope, UI behavior, schedule, pitch)
5. `ai-hackathon-builder-skill.md` (how to run an AI hackathon project without slop)
6. `data/sfsu/README.md` and `web/README.md` (the existing data pipeline and planner)
7. `Degree planner.pdf` and `Student Center.pdf`, if present locally. They are gitignored on purpose and summarized in Part A.

**Precedence.** `architecture.md` and `plan.md` are the human's own planning files. **Do not rewrite them wholesale and do not edit them silently.** They were written before the human saw the existing repo, so some of their statements are now out of date (listed in B.4). Rules:
- A **verified fact** (Part 0 data with a Bulletin source, or Part A screen facts) beats a planning-file statement.
- A **contract change** (types, paths, stack) needs a logged decision in `decisions.md`. Then make the smallest edit to `architecture.md` that records it, plus a line in its §16 change log.
- Otherwise `architecture.md` wins on contracts, `plan.md` wins on scope and UI, and the skill wins on process.

---

## PART 0: What already exists in this repo (do not rebuild it)

Branch history (newest first): `planning-docs` (these docs + harness) ← `claude/optimistic-babbage-loeauu` (scrape, DAG, planner).

### 0.1 Data: the SFSU 2026-27 Bulletin, already scraped (`data/sfsu/`)

Scraped from all 1,109 sitemap pages of https://bulletin.sfsu.edu by `scraper/` (polite, honors robots.txt). Every record keeps its Bulletin source URL. Provenance is recorded in `data/sources.md`.

| File | Contents |
|---|---|
| `courses.json` | 4,995 courses: code, title, units, level, description, structured prerequisite segments (`*` = enforced at registration), GE areas, SF State Studies, GWAR, grading, `is_prerequisite_for`, `used_in_programs` |
| `programs.json` | 416 programs with requirement blocks ("one of", "select N", notes). **Includes B.S. Business Administration: Concentration in Information Systems**, the program in the PDFs |
| `roadmaps.json` | 367 official semester-by-semester roadmaps. CS has three: QR Category 1/2, QR Category 3/4, and the COMP ADT transfer roadmap |
| `academic_rules.json` | 83 curated rules, each with values, a verbatim `quote`, and a `source_url`. `scraper/build_rules.py` fails if a quote is not on the source page |
| `policies.json`, `departments.json`, `colleges.json`, `lookup.json`, `program_index.json`, `course_index.json` | Policy pages, org pages, fast lookups |
| `rag/chunks.jsonl` + `scraper/search.py` | 12k RAG chunks and a dependency-free BM25 search |
| `dags/bs-computer-science.json` | **Hand-checked prerequisite DAG for B.S. CS**, described in 0.2 |

**The data step from `plan.md` §8 (scraping) is done.** Do not re-scrape unless a decision says why. Do not hand-type a second catalog. If the architecture's `Course` shape is needed, *derive* it from `data/sfsu/` with a build script (the way `web/make_data.py` already does), and record the decision.

### 0.2 The B.S. CS DAG (`data/sfsu/dags/bs-computer-science.json`)

- Program: B.S. Computer Science, 74 major units, 120 degree units, bulletin 2026-2027, with its Bulletin URL.
- 59 course nodes. Prerequisites use an expression grammar that is **richer than `architecture.md`'s `CourseId[][]`**:
  - `"CSC 220"`: completed before the term
  - `{"and": [...]}` / `{"or": [...]}`
  - `{"course": "MATH 227", "concurrent": true}`: earlier OR the same term
  - `{"coreq": "PHYS 222"}`: same term or earlier
  - `{"placement": "calculus"}`: satisfied by a student profile flag
- Nodes also carry: `min_grade`, `conditions` (standing, GPA, "permission of instructor" kept as text, not edges), `enforced_at_registration`, `recommended`, the verbatim `bulletin_prerequisite_text`, `ge_areas`, and `url`.
- Requirement groups: Mathematics and Physics (22 units, all), Core CS (28, all), Advanced CS (9, all), Electives (15 units, with elective rules).
- Career tracks already defined: `systems` (Systems & Security), `web` (Web & Mobile), `ai` (AI & Data), `theory` (Theory & Graphics). This is a ready-made source for `career_tags.json`.
- `external`: CSC 210 and MATH 309 are declared as not in the 2026-27 catalog (alternative paths that count only if already completed). ENGR 213 is in the catalog.
- `term_offerings`: **empty**. The Bulletin has no term data. Missing entries mean "assume every fall and spring" in the planner.
- Notes: C or better is required in Math/Physics, Core and Advanced. CR/NC is not accepted in the major.

Known issues you must look at (the critic will keep flagging them until resolved):
1. **CSC 308** is listed in a node's `recommended` list but is not in `courses.json` or `external`. Find out whether it was dropped from the 2026-27 catalog or is a parse error. Fix it or declare it, with evidence.
2. `university.upper_division_units: 60` is ambiguous. The Bulletin rule `ug_upper_division_units` says a degree needs **30 upper-division units**. The 60 is most likely the *upper-division standing* threshold that `web/README.md` mentions ("upper-division/senior standing (60/90 units)"). Rename or document it so nobody reads it as "60 UD units required".
3. `university.max_units_per_term: 19` comes from the **priority-registration** cap (rule `ug_max_units_priority_registration`), not an absolute maximum. Label it that way in the UI.

### 0.3 Existing planner (`web/`)

- `web/planner.js`: a pure planning engine (UMD, runs in the browser and in Node). Functions: `plan`, `bottlenecks`, `pickElectives`, `explain`, `evaluate`, `electiveRuleCheck`, and more.
  - It removes completed and in-progress courses from a **transcript profile**, so mid-degree students are already supported.
  - It expands remaining requirements through the cheapest OR path, ranks courses by prerequisite-chain height, and fills semesters greedily under the unit cap. It honors coreqs, same-term concurrency, 60/90-unit standing, and offering terms.
  - **Bottleneck analysis:** it re-plans with each course blocked, and flags the course as critical-path if graduation slips.
- `web/index.html`: a plain HTML/JS UI with summary, bottleneck alerts, semester columns, requirements checklist, transcript check, and prerequisite map. `web/dist/degree-path.html` is a single-file bundle.
- Documented limits: "permission of instructor" paths are not used. GPA conditions warn but don't block. GE, SF State Studies, American Institutions and residence units are **not tracked course-by-course**.

### 0.4 What this means

- The deterministic core the skill demands (step 2 of its build order) **largely exists**: a validated DAG plus a working engine with a deterministic planner, which is a ready-made fallback planner and baseline.
- What is missing: the visual graph board (React Flow, the plan's "wow"), an engine `evaluatePlan` that reports *issues* for an arbitrary user-edited plan (`planner.js` builds plans; check whether it also validates hand-made ones), the Gemini layer (plan from goal, explain, suggest), saved runs, evals, and the honest side-by-side with SFSU's real tool.

---

## PART A: What is happening at SFSU (ground truth from the PDFs)

Both PDFs are browser printouts from SFSU's Student Center (`cmsweb.sfsu.edu`), dated 10/02/2026. They show one real undergraduate in **B.S. Business Administration, Concentration in Information Systems** (catalog year Fall 2026).

> **PRIVACY: hard rule.** `Student Center.pdf` contains a real student's name, student ID, and GPA. The PDFs are gitignored. Never copy any personal detail into code, data, fixtures, prompts, docs, commits, or screenshots. If you use the PDFs as pitch evidence, blur that data first. Fixtures must use made-up students. `harness.py` scans for 9-digit student-ID patterns.

### A.1 The system students use today

- The Student Center is a tabbed portal: Search, Degree Planner, Degree Progress Report, Enroll, My Academics, My Test Scores. (The `/psp/...GBL` URL pattern suggests Oracle PeopleSoft Campus Solutions. That is an inference from the URL. Do not state it as fact in the pitch without a source.)
- Students use two separate tools that do not connect visually:
  - **Degree Progress Report (DPR):** the audit, meaning what is done and what is missing.
  - **Degree Planner:** a term-by-term list of suggested courses.

### A.2 Degree Progress Report (`Student Center.pdf`, 12 pages)

- One long collapsible requirement tree, 12 printed pages for one student.
- Status icons for requirements: Complete (green check), Currently in Progress (yellow diamond), Planned for Future (blue star), Not Complete (red square), Exception or Override (triangle). Course icons add Transfer/Test/Other Credit (green arrow) and What-If (`?`).
- Internal requirement codes are shown to students, for example `[R12828 / L0030]`.
- Units come with quarter-unit conversions, for example "3 Units (2.68 converted quarter units)" and "6.03 required, 6.00 taken, 0.03 needed".
- Course tables are paginated ("1-10 of 20"), so the student cannot see everything at once.
- **One course can satisfy several requirements.** In the PDF, one ethnic studies course counts toward GE Area 3B and three SF State Studies areas. The DPR never shows this overlap in one place. (Bulletin rule `ug_major_ge_double_count` confirms that GE courses may also count for the major.)
- **No prerequisite information appears anywhere in the DPR.**

The degree structure shown in the DPR matches the Bulletin rules in `academic_rules.json`: 120 units (`ug_units_to_graduate`), GE 43 units (`ug_ge_units`), Upper-Division GE 9 units in 2UD/5UD, 3UD and 4UD after 60 units with prerequisites 1A, 1B, 1C and 2 (`ug_ge_upper_division`, `ug_ge_ud_prereqs`), residence 30/24/12 (`ug_residence_units`), 30 upper-division units (`ug_upper_division_units`). The DPR also lists GWAR, SF State Studies (4 areas), U.S. History, U.S. Government, CA State & Local Government, and a 2.0 GPA minimum.

Major requirements shown for BSBA-ISYS (69 units):

| Group | Contents (as shown) |
|---|---|
| Prerequisites (9-12 units) | DS 110 or MATH 110; ECON 101; ISYS 263 (can be met by CLEP) |
| Core (39 units) | ACCT 100, ACCT 101, BUS 300GW or DS 660GW (GWAR), BUS 682, BUS 690, DS/ECON 212 or MATH 124, DS 412, ECON 102, FIN 350, IBUS 330, ISYS 363, MGMT 405, MKTG 431 |
| Concentration (21 units) | ISYS 350, 463, 464, 565, 663 + 6 units of electives from a list of 12. The PDF shows only 10 (ISYS 412, 475, 556, 567, 568, 569, 573, 574, 575, 650). `programs.json` names the same 10 ISYS electives. The other 2 are **UNKNOWN** (possibly non-ISYS courses). Read the program's requirement blocks in `programs.json` / the Bulletin page before listing them. Do not guess |
| Rules | At most 6 core units CR/NC. Concentration courses must be letter grade. 2.0 GPA in core and concentration. At most 2 concentration courses from outside departments, with advisor approval |

The DPR's "When" column shows term text such as "Fall, Spring, Summer" or "Periodically offered" (for example ISYS 565, ISYS 573, ISYS 574, DS 660GW). It is the only term-offering hint you have, and it comes from a private report. Do not put it in `term_offerings` without a public class-schedule source.

### A.3 Degree Planner (`Degree planner.pdf`, 3 pages)

- **Preferences:** a target unit load per future term (16.00 for every term, Spring 2027 to Spring 2029). This is a student preference, not a policy.
- Buttons: Arrange My Plan, Degree Planner Report, What-If Report, Overview, Refresh Suggestions, Clear Locks. Links: Gator Scheduler, Degree Progress Report, DPR w/ Planned Courses.
- One table per term: Requirement | Notes | Critical | Units | Course | Info | Select Course | Lock | Advisor Message | Remove.
- The system auto-suggests a course per remaining requirement. Open slots show "Not Selected" in red (GE Area 5A, Upper Division GE, Major Concentration Elective).
- Some rows have a "Critical" icon (ISYS 350 and ISYS 363 in Fall 2027). **The page does not explain "Critical".** Do not invent a meaning.
- Every term shows "Planned Units 15.00 / Target Units 16.00". The last term shows 6.00.
- A generic banner repeats on several terms ("consider taking a course that also fulfills US History, US Government/CA State Government or SF State Studies, if they are not completed"), although the student's DPR shows US History and Government complete.
- A legal disclaimer appears twice: see an advisor and the DPR; "does not constitute a contract".

### A.4 The gap GatorGraph fills (observed, not assumed)

1. No prerequisite relationships are shown anywhere.
2. No explanation of why a course sits in a term.
3. No link from courses to career goals.
4. No single view of the whole degree.
5. Double-counting is hard to see.
6. Plain unit math only (15 of 16), with no policy-based load warning.

What the real system DOES do, so never claim otherwise: it auto-suggests courses per term, has locks and What-If reports, and knows completed/transfer/AP credit. **Never pitch "SFSU has no planner."** Honest claim: *"SFSU's planner lists what to take. It doesn't show how courses connect, why a course is placed where it is, or how a plan fits a career goal."*

### A.5 Unit-load policy, now resolved from the Bulletin

`architecture.md` §15 lists the load rules as UNKNOWN, and `plan.md` uses 12/18 as placeholders. They are now known, with quotes, in `academic_rules.json`:

| Rule id | Value | Meaning |
|---|---|---|
| `normal_load` | 12-15 (fall/spring), 8 (summer) | "normal academic load for undergraduates" |
| `ug_average_load` | 15 | average full-time load |
| `fa_enrollment_status` | 12 | full time for financial aid |
| `ug_max_units_priority_registration` | 19 (incl. 8 waitlisted) | maximum at priority registration |
| `ug_exceed_max_units` | GPA 3.0 + petition | needed to go above the maximum |
| `ug_25_units` | 25 | advisor + dean approval required |

**18 is wrong as a maximum.** Recommended mapping for `policies.json` (log it as a decision): `minUnitsFullTime = 12`, `heavyLoadUnits = 15` (above the normal load), `maxUnitsWithoutPermission = 19`, each with its rule id, `source_url` and `verified: true` (the quote is machine-checked). The UI must say "19 = priority-registration maximum", not "university maximum".

### A.6 Mid-degree students

The student in the PDF is mid-degree: 67 of 120 units done, including AP and transfer credit, with about 5 terms left. `plan.md` assumes a fresh 8-semester plan. `web/planner.js` **already** accepts a transcript profile of completed and in-progress courses. Decide (and log) whether the P0 board shows a locked "Already done" column fed by that profile. Recommendation: yes, if it costs under an hour, since the engine already supports it and it matches how the real planner is used.

---

## PART B: Direction

### B.1 Thesis

> Same SFSU degree requirements, three planners: SFSU's official roadmap, a deterministic prerequisite engine, and Gemini constrained by that engine. Watch which plans break prerequisite rules, which reach graduation soonest, and which fit the student's career goal, with every rule traced to a Bulletin quote.

Sharper is welcome. Vaguer is not. Log any change.

### B.2 Killer demo moment

1. Show SFSU's real planner table (blurred; it's a business student's, so say so) and the 12-page DPR. "This is what students see."
2. Open GatorGraph on B.S. CS. The whole degree is one map; prerequisite lines run left to right.
3. Drag CSC 340 before its prerequisite. The line goes bold, the semester turns red, and the engine names the rule and links the Bulletin text.
4. Click a course. Its whole chain lights up, and the bottleneck badge says "delaying this costs 1 semester" (the existing `bottlenecks()`).
5. AI Plan → "Machine learning engineer". Gemini proposes. The engine rejects or repairs bad placements (show the count). The final plan is valid, and the explanation cites real course IDs.
6. Proof panel: Gemini plan vs. the deterministic planner vs. the official SFSU roadmap, scored on the same metrics.

### B.3 Which major is P0

**Default: keep B.S. Computer Science (`bs-cs`) as P0.** It is what `plan.md` and `architecture.md` lock. It also already has a hand-checked DAG, career tracks, three official roadmaps, and a working engine.

BSBA-ISYS (the PDFs' program) is the natural **P1**: `programs.json` already holds it. Building its DAG lets you show a true same-program side-by-side against the real planner screenshot. Do not start it before P0 passes the acceptance checklist.

Ask the human only if a CS student's real planner screenshot becomes available. Then the side-by-side can be same-program in P0.

### B.4 Open conflicts (each one gets a decision in `decisions.md`)

1. **Stack and engine.** `architecture.md` plans Vite + React + TS + React Flow + Express, with the engine in `shared/engine.ts`. The repo has a plain-JS engine (`web/planner.js`) and a static HTML UI. **There must be one engine.** Recommended: port `planner.js` to `shared/` in TypeScript (behavior-preserving, with tests that pin the current outputs), add `evaluatePlan` there, build the React Flow board per `plan.md` §10, and keep the old `web/` UI running until the new board replaces it. Alternatives: keep JS with JSDoc types, or keep the static UI and add the graph to it. Pick one, log it, and update `architecture.md` §4/§5.
2. **Prerequisite type.** `architecture.md` uses `prereqs: CourseId[][]` (AND of OR). The DAG grammar also expresses concurrency, coreqs and placement, and the Bulletin needs them (e.g. MATH 227 concurrent with CSC 230). Recommended: adopt the DAG grammar as the contract type and update `architecture.md` §6. A lossy conversion to `CourseId[][]` would create false errors.
3. **Course ID format.** `architecture.md` says `CSC413` (no space). All 4,995 records, the roadmaps and the transcript format use `CSC 413`. Recommended: use the Bulletin format everywhere and update the glossary. React Flow node IDs can slug it (`course-CSC-413`).
4. **Data layout.** `architecture.md` §5 expects `data/catalog.json`, `data/programs/`, `scripts/`. The repo has `data/sfsu/...` and `scraper/`. Recommended: keep the existing layout, and point the contracts at it (or generate the contract files from it).
5. **GE units.** The `plan.md` §7.2 example says 48. The Bulletin (`ug_ge_units`) and the DPR say **43**.
6. **Policy numbers.** Resolved in A.5. Fill `policies.json` from `academic_rules.json` and drop the "assumed" label for rules with machine-checked quotes.
7. **Skill artifacts vs. the folder lock.** Add `VISION.md`, `EVALS.md`, `DEMO.md`, `runs/`, `evals/`, `prompt.md`, `decisions.md`, `harness.py`, `.harness/` and `scraper/` to `architecture.md` §5. If you add a new top-level entry, update `ALLOWED_TOP_LEVEL` in `harness.py` in the same commit.
8. **Model adapter.** One adapter, `server/gemini.ts`, exposing `completeJson(system, user, { purpose, schema })` with providers `gemini | mock`, selected by `AI_PROVIDER` (default `mock` when `GEMINI_API_KEY` is missing). The whole pipeline must run with no API key.
9. **Real planner columns.** Lock, Critical and Advisor Message: do not copy them unless they serve the thesis. "Critical" has no known meaning.
10. **Retrieval for explanations (optional, P1).** `scraper/search.py` (BM25 over the RAG chunks) can give Gemini real Bulletin quotes to cite in explanations. That fits the skill's `retrieved_facts` memory policy. Only cite chunks that were actually retrieved, and show the URL.

### B.5 Build order (the skill's order, adjusted for what exists)

1. `VISION.md`, `EVALS.md`, `DEMO.md` (short). Decisions for every B.4 item. Run `harness.py check` on each.
2. **Data reconciliation, not scraping:** resolve the 0.2 issues (CSC 308, the 60-unit field, the 19 label), write `policies.json` from the rules, and derive `career_tags.json` from the DAG tracks. `data/sources.md` already exists; keep it true.
3. **One engine** in its final home (B.4 item 1), with tests that pin today's `planner.js` behavior, plus `evaluatePlan` with the issue codes from `plan.md` §9.2. Fixtures: one valid plan, one broken plan with a *listed* expected issue set, and a made-up mid-degree transcript.
4. Model adapter with mock provider. Prompts only in `server/prompts.ts`.
5. AI harness: schema validation, unknown-ID rejection, repair loop (max 2), and fallback to the deterministic planner.
6. Saved runs: every `/api/plan` and `/api/evaluate` call writes a run record to `runs/` (run_id, variant, input, config, steps, final_state, scores, errors, created_at). The UI can replay one with no model call.
7. The React Flow board from plan JSON, with derived edges, chain highlight and bottleneck badges.
8. Evals (B.6).
9. Real Gemini call (model ID from env, checked against current docs).
10. Demo polish, backup video, README.

Commit after every step on a feature branch. Never commit the PDFs (gitignored).

### B.6 Evaluation (the claim needs a test)

- **Seeded-error suite:** N broken plans, each with a listed expected issue set. The engine must catch all of them and flag nothing on the valid fixture. Report precision and recall.
- **Official-roadmap check:** run `evaluatePlan` on each official CS roadmap in `roadmaps.json`. An official roadmap should pass. If the engine flags it, either the engine is wrong or the roadmap breaks a rule. Investigate and log which. Either way it is a strong demo/eval finding.
- **Planner comparison** on at least 3 career goals: no-op (empty plan), official roadmap, deterministic planner, and Gemini (after repair). Metrics: engine errors, requirement groups satisfied, semesters to graduate, total units, track/goal match, and repair attempts.
- **Anti-vacuity:** the empty plan scores worst. A shuffled-order plan fails `PREREQ_ORDER`. An invented course ID from Gemini is rejected. An evaluator that passes everything is broken.
- Engine reports and scores are never fed into the plan-generation prompt as a reward. The evaluate prompt may receive them (`plan.md` §11.3).

### B.7 Pushback rules

Refuse or defer (and log the deferral) when a step would:
- add UI polish before the engine tests pass and a saved run exists
- add a second major before P0 passes its acceptance checklist
- re-scrape or hand-type data that already exists in `data/sfsu/`
- let Gemini write to `data/` or decide whether a plan is valid
- show any course, prerequisite, unit value or URL without a source
- claim anything about SFSU that is not in Part 0/A or a linked source

---

## PART C: `decisions.md` (mandatory)

`decisions.md` already exists with the setup decisions and the open questions. **Every** project decision goes in it: scope, data, library, naming, UI, AI, cuts, deferrals, and every conflict resolution. It is how the human finds out what you built and why. A choice that isn't in `decisions.md` is a bug.

Rules:
- Append-only. To change a decision, add a new one and mark the old one `superseded by D-0xx`.
- One decision per entry. Keep it short.
- `Evidence` must be checkable: a file and section (`plan.md §9.2`), a data record (`academic_rules.json#normal_load`), a PDF page (`Student Center.pdf p.8`), or a URL. If there is none, write `none: assumption: ...`. **Never fabricate a citation.**
- Record the critic verdict from `harness.py check` in each entry.
- After each build step add `### Step N summary`: what changed, how to run it, what proves it works, what can still fail.

Template:

```markdown
## D-0NN: <short title>
- Step: <build step>
- Decision: <what you chose>
- Alternatives: <what you rejected>
- Why: <tied to thesis / demo / evidence / risk>
- Evidence: <file §section | data record | PDF page | URL | "none: assumption: ...">
- Risk / undo: <what breaks if wrong, how to reverse>
- Critic: <PASS | REVISE | BLOCK> (<critique id>)
- Status: active
```

---

## PART D: The critic harness (`harness.py`), mandatory checkpoints

`harness.py` runs a separate critic subagent. Its only job is to kill hallucinations, invented facts, gap-filling guesses, scope creep and slop, then hand you one direction. It is deliberately brutal. Fix what it finds, or record in `decisions.md` why it is wrong, with evidence.

```bash
python harness.py scan                               # deterministic checks only, no API
python harness.py check "<proposed decision>"        # BEFORE acting on a non-trivial decision
python harness.py review --note "<what I just did>"  # AFTER each step (files changed since last PASS)
python harness.py review --all --note "..."          # full review
python harness.py selftest                           # proves the checks catch planted mistakes
```

When to run it:
1. **Before** every decision touching scope, data, contracts or AI design: `check`.
2. **Midway** through any step over ~30 minutes, and right after writing any data record or SFSU claim: `review`.
3. **After** every build step: `review`.
4. Before the demo: `review --all`.

Exit codes: `0` PASS, `1` REVISE, `2` BLOCK, `3` harness error.
- **PASS:** continue.
- **REVISE:** fix every `high` finding and re-run. Lower ones may be logged as deferred.
- **BLOCK:** stop. Fix or revert, then re-run. A BLOCK from the deterministic scan cannot be overridden by the AI critic.

The critic uses Claude through the Anthropic API (`pip install anthropic`, `ANTHROPIC_API_KEY`, model `CRITIC_MODEL`, default `claude-opus-5`). Without a key it runs in mock mode (scan only) and says so. Mock PASS is not approval; note `critic: mock` in the decision.

What the scan checks today: student-ID patterns, API keys, data URLs not covered by `data/sources.md` (scraped `data/sfsu/` dumps excepted; their provenance is the page each record came from), `verified: true` without a real source, course IDs missing from the catalog (IDs declared in a DAG's `external` block with a note are accepted), hardcoded unit numbers in `web/`/`server/`, prompts outside `server/prompts.ts`, the provider SDK outside the adapter, the model key in the frontend, top-level entries not in `architecture.md` §5, and `decisions.md` format.

The critic never edits files. **The critic proposes. You fix. The engine and tests decide.**

---

## Final checklist before you hand anything back

- [ ] `decisions.md` has an entry for every choice this session, each with evidence and a critic verdict
- [ ] `python harness.py review` passed after the last step, or every high finding is fixed
- [ ] No student PII from the PDFs anywhere in the repo; PDFs not committed
- [ ] No course, prerequisite, unit value, policy number or URL without a source
- [ ] Exactly one rules engine
- [ ] Mock mode runs the whole pipeline with no API keys
- [ ] At least one saved run replays in the UI without a model call
- [ ] Engine tests, the seeded-error eval and the official-roadmap check pass, and anti-vacuity checks fail what they should
- [ ] `architecture.md` matches what exists on disk (minimal edits, each logged)
