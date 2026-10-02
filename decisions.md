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
