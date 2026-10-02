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
