# SFSU Bulletin 2026-2027 — structured data

Scraped from https://bulletin.sfsu.edu (all 1,109 sitemap pages) by `scraper/`.
Every record has a source URL back to the bulletin.

| File | What it holds |
|---|---|
| `courses.json` | 4,995 courses: code, title, units (+min/max), level, description, structured prerequisites (per-course segments with required / recommended / may-be-concurrent codes; `*` = enforced at registration), GE areas, SF State Studies, American Institutions, GWAR, grading, repeatability, paired and cross-listed courses, `former_codes` (old numbers seen on older transcripts), reverse `is_prerequisite_for`, `used_in_programs` |
| `course_index.json` | 119 subjects → their courses (code, title, units, level) |
| `programs.json` | 423 programs (bachelor's, concentrations, minors, master's, doctorates, certificates, credentials): degree, level, status (395 Active, 19 Suspended, 9 Discontinued), total units, structured requirement blocks (courses, "one of" alternatives, "select N" groups that own exactly the bulletin's indented options, notes before and after each table, cross-listed aliases), roadmap links, full page text per tab |
| `program_index.json` | The bulletin's A–Z program list with labels and suspension status |
| `roadmaps.json` | 367 semester-by-semester roadmaps (4-year, ADT transfer, Scholars, RN-to-BSN), each linked to its program: terms → courses, what each satisfies, units, footnotes |
| `departments.json` / `colleges.json` | Department and college pages (contacts, overview, faculty, program lists) |
| `policies.json` | 103 policy and info pages (academic policies, grading, standing, graduation, GE, SF State Studies, American Institutions, admissions, fees, financial aid, graduate policies, resources), split into heading sections. Whole-page copies carry `duplicate_of`; empty stubs carry `empty` |
| `academic_rules.json` | 112 curated rules (unit limits, graduation units, GPA, repeats, withdrawals, CR/NC, standing, honors, catalog rights, transfer caps, double majors, graduate rules). Each has a student-phrased `topic`, structured `values`, the full source sentence as `quote`, the section text as `source_excerpt`, and `conflicts` where the bulletin contradicts itself (5 cases, e.g. readmission after 2 vs 3 semesters away) |
| `lookup.json` | Fast key→summary maps for courses, programs, subjects, policies, rules |
| `rag/chunks.jsonl` | 11,456 self-contained chunks for embedding/RAG: `{id, type, title, text, url, metadata}`. Each text starts with a context header naming its course/program/policy; suspended and discontinued programs say so in every chunk |
| `dags/bs-computer-science.json` | B.S. Computer Science prerequisite graph with AND/OR logic (see `web/README.md`) |

## Rebuild

```
pip install beautifulsoup4 lxml
python3 scraper/fetch.py            # download pages into scraper/.cache (polite, respects robots.txt)
python3 scraper/parse.py scraper/.cache data/sfsu
python3 scraper/build_rules.py      # fails if any rule quote is not found in the source text
python3 scraper/build_rag.py
python3 scraper/search.py "max units per semester"   # BM25 search, no dependencies
```

## Verification

Three independent verifier agents compared the JSON against the live bulletin:

- Courses: all 4,995 compared field by field; after fixes, titles, units, descriptions, prerequisite text, attributes and topics match.
- Programs and roadmaps: all 423 programs and 367 roadmaps compared; fixed select-group structure, misfiled minors, Discontinued status, unit totals, cross-listed link codes, roadmap footnotes and program links.
- Policies and rules: all 103 pages diffed (≥0.996 word similarity); every rule re-read against its full source section; rules that omitted conditions were corrected and missing rules added.
- Search (`scraper/search.py`): 50/50 student questions find the right chunk in the top 5; 297/300 random "<CODE> prerequisites" queries rank the course first.

## Known limits

- The bulletin has no term-offering data (which semester a course runs). That comes from the class schedule, not the bulletin.
- `prerequisite_courses` is a flat list of required codes named in the prerequisite text (recommended ones are split out). AND/OR logic and "permission of instructor" are only in `prerequisites[].text`, except for B.S. Computer Science, which has a hand-built AND/OR graph in `dags/`.
- Some prerequisites name courses no longer in the catalog (e.g. CSC 210, MATH 70); they appear as codes without a course record.
- `/resources/special-enrollment-programs/` (cross-registration, concurrent enrollment) is disallowed by robots.txt and was not scraped.
