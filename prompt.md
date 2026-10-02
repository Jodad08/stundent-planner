# PROMPT: Build GatorGraph (read this first, every session)

You are the coding agent for **GatorGraph**, a visual, rules-checked degree planner for San Francisco State University (SFSU), built for the SF Hacks x GDG AI Hackathon.

This file does three things:
1. Tells you what is **actually happening at SFSU today**, based on two real screenshots of the SFSU Student Center (Part A).
2. Gives you a **direction**: thesis, demo moment, build order, and the conflicts between the planning files that you must resolve (Part B).
3. Defines the two **control loops** you must run: `decisions.md` (Part C) and the critic `harness.py` (Part D).

Read order, before writing any code:
1. `prompt.md` (this file)
2. `architecture.md` (technical contracts, wins on names/types/paths/APIs)
3. `plan.md` (scope, UI behavior, schedule, pitch)
4. `ai-hackathon-builder-skill.md` (how to run an AI hackathon project without slop)
5. `Degree planner.pdf` and `Student Center.pdf` (the real SFSU system; summarized in Part A)

Precedence when files disagree: `architecture.md` > `plan.md` > `ai-hackathon-builder-skill.md` > this file's suggestions. **Exception:** the facts in Part A come from the real SFSU screens. Where `plan.md` or `architecture.md` contradicts a Part A fact, the Part A fact wins. Fix the planning file and log the fix in `decisions.md`.

---

## PART A: What is happening at SFSU (ground truth from the PDFs)

Both PDFs are browser printouts from SFSU's Student Center (`cmsweb.sfsu.edu`), dated 10/02/2026. They show one real undergraduate in **B.S. Business Administration, Concentration in Information Systems** (catalog year Fall 2026).

> **PRIVACY: hard rule.** `Student Center.pdf` contains a real student's name, student ID, and GPA. Never copy any of these into code, data, fixtures, prompts, docs, commits, or screenshots. If you use the PDFs as pitch evidence, blur that data first. Fixtures must use made-up students. `harness.py` scans for 9-digit student-ID patterns.

### A.1 The system students use today

- The Student Center is a tabbed portal with these tabs: Search, Degree Planner, Degree Progress Report, Enroll, My Academics, My Test Scores. (The `/psp/...GBL` URL pattern suggests Oracle PeopleSoft Campus Solutions. This is an inference from the URL. Do not state it as fact in the pitch unless you find a source.)
- Students see two separate tools that do not talk to each other visually:
  - **Degree Progress Report (DPR):** the audit, meaning what is done and what is missing.
  - **Degree Planner:** a term-by-term list of suggested courses.

### A.2 Degree Progress Report (`Student Center.pdf`, 12 pages)

What the student sees:
- One long, collapsible tree of requirements, 12 printed pages for one student.
- Status icons for requirements: Complete (green check), Currently in Progress (yellow diamond), Planned for Future (blue star), Not Complete (red square), Exception or Override (triangle).
- Course icons: Complete, In Progress, Planned, Transfer/Test/Other Credit (green arrow), What-If Course (`?`).
- Internal requirement codes are shown to students, for example `[R12828 / L0030]`.
- Units appear with quarter-unit conversions, for example "3 Units (2.68 converted quarter units)" and "Units: 6.03 required, 6.00 taken, 0.03 needed".
- Course tables are paginated ("View All | First 1-10 of 20 Last"), so the student cannot see everything at once.
- **One course can satisfy several requirements at once.** In the PDF, a single ethnic studies course counts toward GE Area 3B, SF State Studies "American Ethnic and Racial Minorities", "Global Perspectives", and "Social Justice". The DPR does not make this overlap visible in one place. This is real pain and a real opportunity.
- **No prerequisite information appears anywhere in the DPR.** It lists what is required, not what order it must be taken in.

Degree structure visible in the DPR (these numbers come from the screen; use them as ground truth for this catalog year):

| Block | What the DPR says |
|---|---|
| Degree total | 120 minimum units |
| General Education | 43 units minimum. Areas: 1A English Composition, 1B Critical Thinking, 1C Oral Communication, 2 Math/Quantitative Reasoning, 3A Arts, 3B Humanities, 4 Social & Behavioral Sciences (two lower-division courses and one upper-division, from at least two disciplines; first-time freshmen need US History in lower-division Area 4), 5A Physical Science, 5B Biological Science, 5C Laboratory, 6 Ethnic Studies |
| Upper-Division GE | 9 units: one course each in 2UD/5UD, 3UD, 4UD. "Designed to be taken after completing 60 semester units." Minimum prerequisites: Areas 1A, 1B, 1C and 2 |
| University requirements | GWAR (1 course; the major names the course), SF State Studies (4 areas: American Ethnic & Racial Minorities, Environmental Sustainability & Climate Action, Global Perspectives, Social Justice), U.S. History, U.S. Government, California State & Local Government |
| GPA | Minimum 2.0: cumulative, SFSU, and major |
| Residence | 30 units at SFSU, 24 of them upper-division. The major needs 12 residence units |
| Upper-division | 30 upper-division units minimum |
| Unit limits | Caps on community college, CR/NC, military, credit-by-exam, experiential, and extension units. Values are not shown expanded, so they are UNKNOWN |

Major requirements visible (B.S. Business Administration, Information Systems concentration, 69 units):

| Group | Contents (as shown) |
|---|---|
| Prerequisites (9-12 units) | DS 110 or MATH 110; ECON 101; ISYS 263 (the ISYS 263 requirement can be met by CLEP) |
| Core (39 units) | ACCT 100, ACCT 101, BUS 300GW or DS 660GW (GWAR), BUS 682, BUS 690, DS/ECON 212 or MATH 124, DS 412, ECON 102, FIN 350, IBUS 330, ISYS 363, MGMT 405, MKTG 431 |
| Concentration (21 units) | ISYS 350, ISYS 463, ISYS 464, ISYS 565, ISYS 663, plus 6 units of electives |
| Concentration electives (6 units, list of 12, only 10 visible in the PDF) | ISYS 412, ISYS 475, ISYS 556, ISYS 567, ISYS 568, ISYS 569, ISYS 573, ISYS 574, ISYS 575, ISYS 650. **The other 2 are UNKNOWN.** Get them from the Bulletin. Do not guess |
| Major rules | No more than 6 core units CR/NC. Concentration courses must be letter grade. 2.0 GPA in core and concentration. At most 2 concentration courses (6 units) from outside departments, with advisor approval |

Term-offering text appears in the "When" column: "Fall, Winter, Spring, Summer", "Fall, Spring, Summer", "Fall, Spring", or "Periodically offered". For example, ISYS 565, ISYS 573, ISYS 574 and DS 660GW show "Periodically offered". This is the only term-offering data you have. It comes from one student's private report, not from a public source. Treat it as a hint and confirm it against public SFSU class schedule or Bulletin pages before it goes into `typicalTerms`.

### A.3 Degree Planner (`Degree planner.pdf`, 3 pages)

What the student sees:
- Header: Program, Plan, Catalog Year, "Planner Available", "Primary Major".
- **Preferences:** a target unit load per future term. In the PDF every term is 16.00, from Spring 2027 to Spring 2029. This is a student preference, **not a university policy.** Do not put 16 into `policies.json`.
- Buttons: Arrange My Plan, Degree Planner Report, What-If Report, Overview, Refresh Suggestions, Clear Locks. Links: Gator Scheduler, Degree Progress Report, DPR w/ Planned Courses, Update Alerts.
- One table per term with these columns: Requirement | Notes | Critical | Units | Course | Info | Select Course | Lock | Advisor Message | Remove.
- The system **auto-suggests** a course for each remaining requirement. Unfilled slots show "Not Selected" in red, for example "GE Area 5A: Physical Science", "Upper Division GE", "Major Concentration Elective".
- Some rows carry a "Critical" icon (for example ISYS 350 and ISYS 363 in Fall 2027). **The page does not explain what "Critical" means.** Do not invent a meaning. If you need it, find SFSU documentation and log the source.
- Every term shows "Planned Units 15.00 / Target Units 16.00". The last term shows 6.00.
- The same generic banner repeats on several terms: "consider taking a course that also fulfills US History, US Government/CA State Government or SF State Studies, if they are not completed". In the DPR, US History, US Government and CA Government are already complete. The planner does not use the student's own audit to suppress the banner. This is a small but real example of the noise students see.
- The planner shows a legal disclaimer twice: use an advisor and the DPR, "does not constitute a contract".

### A.4 What the real system does NOT do (this is the gap GatorGraph fills)

Each item below is observed, not assumed:
1. No prerequisite relationships are shown anywhere: no lines, no chains, no "you need X before Y".
2. No explanation of why a course is placed in a given term.
3. No connection between courses and career goals.
4. No single view of the whole degree. The audit is a 12-page tree and the plan is a separate set of tables.
5. Double-counting (one course satisfying several requirements) is hard to see.
6. Plain unit math only: 15 of 16. No warning about heavy or light loads, and no reference to a policy.

What the real system DOES do, so you do not claim otherwise in the pitch:
- It auto-generates suggestions per term.
- It has locks and What-If reports.
- It knows the student's completed, transfer and AP credit.

**Never pitch "SFSU has no planner."** It has one. The honest claim is: "SFSU's planner lists what to take. It does not show how courses connect, why a course is placed where it is, or how a plan fits a career goal."

### A.5 What the real student situation implies

The student in the PDF is mid-degree: 67 of 120 units done, including AP and transfer credit. They have about 5 terms left, not 8. `plan.md` assumes a fresh 8-semester plan and lists transfer/AP credit as out of scope. That is fine for a hackathon P0, but recognize it: most real users of the real planner are mid-degree. Decide (and log in `decisions.md`) whether P0 supports marking courses as "already completed" in a locked column. Recommendation: make it P1. Mention it honestly in the pitch.

---

## PART B: Direction

### B.1 Thesis (one sentence; the skill's gate)

> Same SFSU requirements, two planners: SFSU's table vs. a prerequisite graph checked by a deterministic rules engine. Watch which one catches the ordering and requirement mistakes before registration.

Rewrite it if you can make it sharper. Do not make it vaguer. Log any change.

### B.2 Killer demo moment

Show the real SFSU planner table for the program (blurred). Then show the same requirements in GatorGraph. Drag one course before its prerequisite. The red line goes bold, the semester turns red, and the engine names the exact rule and its Bulletin source. Click a course and its whole prerequisite chain lights up. Then: "AI Plan → Quant / Cybersecurity / Data". Gemini proposes, the engine rejects one bad placement live (or shows the repair count), and the final plan is valid.

### B.3 The first decision you must make: which major is P0

`plan.md` and `architecture.md` lock P0 to **B.S. Computer Science** (`bs-cs`). The only real SFSU evidence in this folder is for **B.S. Business Administration – Information Systems**.

| Option | For | Against |
|---|---|---|
| Keep `bs-cs` | Matches both planning files. CS prerequisite chains are deep and look strong on a graph | No real planner/DPR screenshot for CS, so the "same input" side-by-side demo needs a new screenshot from a CS student |
| Switch to BSBA-ISYS | Real planner + DPR for this exact program exist, so the side-by-side demo is ready. Requirement groups are already visible (Part A.2) | Prerequisite chains may be shallower, so the graph is less dramatic. Both planning files need contract edits |

Default if no human answers: **switch P0 to BSBA-ISYS** (program id `bsba-isys`), because the skill rewards "same input, different system, measurable outcome" and that is the only major where you hold the real input. The PDF only gives requirement *groups*. **Every prerequisite, unit value and course name must still come from the public SFSU Bulletin**, with a URL in `data/sources.md`. The DPR is private and is not a citable source.

This is decision `D-001`. Run `python harness.py check "..."` on it before acting. If you switch, update `architecture.md` §2, §5, §8 and §16 and `plan.md` §4 and §7.2 in the same step. Stop and ask the human if you can't reach the public Bulletin.

### B.4 Known conflicts you must resolve (log each one as a decision)

1. **GE units:** `plan.md` §7.2 example says GE `unitsRequired: 48`. The DPR says **43**. Use 43 for the Fall 2026 catalog and cite the Bulletin page that says so.
2. **Policy numbers 12 / 18:** still UNKNOWN. The PDFs do not state full-time or maximum-load rules. Target 16 is a preference. Keep `verified: false` and the "assumed" label until you find a registrar or Bulletin page.
3. **Folder lock vs. skill artifacts:** `architecture.md` §5 says only listed folders may exist. The skill requires `VISION.md`, `EVALS.md`, `DEMO.md`, saved runs, evals, and a mock provider. Add these to `architecture.md` §5 before you create them: `runs/` (saved replayable AI runs), `evals/` (or `shared/evals/`), the root docs, plus this harness: `prompt.md`, `decisions.md`, `harness.py`, `.harness/`.
4. **Model adapter:** the skill wants one `complete_json(system, user, purpose)` adapter with a mock provider. Map this to `server/gemini.ts`, exposing `completeJson(system, user, { purpose, schema })` with providers `gemini | mock`, selected by env `AI_PROVIDER` (default `mock` when `GEMINI_API_KEY` is missing). Add `AI_PROVIDER` to `architecture.md` §12. The whole pipeline, including `/api/plan` and `/api/evaluate`, must run with no API key.
5. **Repo root:** `architecture.md` shows a `gatorgraph/` root. You are in `student-planner/`. Build in this folder (this folder is the repo root) unless the human says otherwise. Run `git init` first if it is not a repo. Commit after every build step so the hackathon history is visible.
6. **Real planner columns you might be tempted to copy:** Lock, Critical, Advisor Message. Do not add them unless they serve the thesis. "Critical" has no known meaning, so it is a guaranteed hallucination risk.

### B.5 Build order (the skill's order mapped to `plan.md` §14)

1. Thesis, demo moment, `VISION.md`, `EVALS.md`, `DEMO.md` (short). Decisions D-001 to D-00N for the conflicts above.
2. Data: `data/sources.md`, `catalog.json`, program file, `policies.json`. Real Bulletin URLs only. Run `validate_catalog.py`. **Data is the bottleneck. Protect this time.**
3. Engine + tests (`shared/engine.ts`), including fixtures: one valid plan and one broken plan with *known, listed* errors.
4. Model adapter with mock provider. Prompts only in `server/prompts.ts`.
5. AI harness: schema validation, unknown-ID rejection, repair loop (max 2), deterministic fallback planner.
6. Saved runs: every `/api/plan` and `/api/evaluate` call writes a JSON run record to `runs/` (skill schema: run_id, variant, input, config, steps, final_state, scores, errors, created_at). The UI can replay a saved run with no model call.
7. Board UI from plan JSON (React Flow), derived edges, chain highlight.
8. Evals (see B.6).
9. Real Gemini call (model ID from env, checked against current docs).
10. Demo polish, backup video, README.

### B.6 Evaluation (the claim needs a test)

At minimum:
- **Seeded-error suite:** N hand-built broken plans, each with a listed expected issue set (code + course IDs). The engine must catch 100% of them and must not flag the valid fixture. Report precision and recall.
- **Planner comparison** on the same goals (at least 3): no-op baseline (empty plan), deterministic fallback, Gemini plan (after repair). Metrics: engine errors, requirement groups satisfied, total units, goal-tag match score, and repair attempts used.
- **Anti-vacuity:** the empty plan must score worst. A plan with a random course order must fail `PREREQ_ORDER`. A Gemini output with an invented course ID must be rejected. If an evaluator passes everything, it is broken.
- Direction scores and engine reports must **not** be fed back into the plan-generation prompt as a "reward". The evaluate prompt may receive them, as `plan.md` §11.3 specifies.

### B.7 Pushback rules (from the skill, applied here)

Refuse or defer, and log the deferral, when a step would:
- add UI polish before the engine tests pass and a saved run exists
- add a second major before P0 passes its acceptance checklist
- let Gemini write to `data/` or decide whether a plan is valid
- show any course, prerequisite, unit value or URL that has no source
- claim anything about SFSU in the pitch that is not in Part A or a linked source

---

## PART C: `decisions.md` (mandatory)

Create `decisions.md` at the repo root before your first code change. **Every** project decision goes in it: scope, data, library, naming, UI, AI, cuts, deferrals, and every conflict resolution. It is how the human finds out what you built and why. If you made a choice and it is not in `decisions.md`, the choice is a bug.

Rules:
- Append-only. Never rewrite history. To change a decision, add a new one and mark the old one `superseded by D-0xx`.
- One decision per entry. Keep each entry short: the human reads these, not essays.
- `Evidence` must point to something checkable: a file and section (`plan.md §9.2`), a PDF page (`Student Center.pdf p.8`), or a URL. If there is no evidence, write `none: assumption` and give the assumption. **Never fabricate a citation.**
- Each entry records the critic verdict from `python harness.py check` (Part D).
- At the end of each build step, add a `### Step N summary` with: what changed, how to run it, what proves it works, and what can still fail. These are the skill's four report questions.

Template:

```markdown
## D-001: <short title>
- Step: <build step number / name>
- Decision: <what you chose, one or two sentences>
- Alternatives: <what you rejected>
- Why: <reason, tied to thesis/demo/evidence/risk>
- Evidence: <file §section | PDF page | URL | "none: assumption: ...">
- Risk / undo: <what breaks if wrong, how to reverse>
- Critic: <PASS | REVISE | BLOCK> (<.harness/critiques/... id>)
- Status: active
```

---

## PART D: The critic harness (`harness.py`), mandatory checkpoints

`harness.py` runs a separate critic subagent that reviews your work. Its only job is to kill hallucinations, invented facts, gap-filling guesses, scope creep and slop, then hand you a direction. It is deliberately brutal. Do not argue with it in code. Fix the problem, or record in `decisions.md` why it is wrong, with evidence.

Commands:

```bash
python harness.py scan                       # deterministic checks only, no API, fast
python harness.py check "<proposed decision>" # BEFORE acting on a non-trivial decision
python harness.py review --note "<what I just did>"  # AFTER each build step (reviews changed files)
python harness.py review --all --note "..."  # full review of all project files
python harness.py selftest                   # proves the critic catches planted mistakes
```

When you must run it:
1. **Before** every decision that touches scope, data, contracts, or the AI design: run `check`. Record the verdict in the decision entry.
2. **Midway** through any step that takes more than ~30 minutes, or right after you write any data record or any SFSU claim: run `review`.
3. **After** every build step in B.5: run `review` before you move on.
4. Before the demo: run `review --all`.

Exit codes: `0` PASS, `1` REVISE, `2` BLOCK, `3` harness error.
- **PASS:** continue.
- **REVISE:** fix every finding marked `high`, re-run, then continue. Lower findings can be logged as deferred in `decisions.md`.
- **BLOCK:** stop. Do not build on top of it. Fix it, or revert it, then re-run.

The critic uses Claude through the Anthropic API (`ANTHROPIC_API_KEY`, model from `CRITIC_MODEL`, default `claude-opus-5`). Without a key it runs in mock mode: deterministic checks only, and it says so. Mock PASS is not real approval. Note `critic: mock` in the decision entry when that happens.

The critic never edits files. It reads, judges, and directs. **The critic proposes. You fix. The engine and tests decide.**

---

## Final checklist before you hand anything back

- [ ] `decisions.md` has an entry for every choice in this session, each with evidence and a critic verdict
- [ ] `python harness.py review` was run after the last step; the verdict is PASS or every high finding is fixed
- [ ] No student PII from the PDFs anywhere in the repo
- [ ] No course, prerequisite, unit value, policy number or URL without a source
- [ ] Mock mode runs the whole pipeline with no API keys
- [ ] At least one saved run replays in the UI without a model call
- [ ] Engine tests and the seeded-error eval pass, and the anti-vacuity checks fail what they should
- [ ] `architecture.md` matches what exists on disk
