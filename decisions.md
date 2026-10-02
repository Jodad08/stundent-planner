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
