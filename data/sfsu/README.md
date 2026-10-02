# SFSU Bulletin 2026-2027 — structured data

Scraped from https://bulletin.sfsu.edu (all 1,109 sitemap pages) by `scraper/`.
Every record has a source URL back to the bulletin.

| File | What it holds |
|---|---|
| `courses.json` | 4,995 courses: code, title, units (+min/max), level, description, structured prerequisites (per-course segments, `*` = enforced at registration), GE areas, SF State Studies, American Institutions, GWAR, grading, repeatability, paired/cross-listed courses, reverse `is_prerequisite_for`, `used_in_programs` |
| `course_index.json` | 119 subjects → their courses (code, title, units, level) |
| `programs.json` | 416 programs (bachelor's, concentrations, minors, master's, doctorates, certificates, credentials): degree, level, status, total units, structured requirement blocks (courses, "one of" alternatives, "select N" groups, notes), roadmap links, full page text per tab |
| `program_index.json` | The bulletin's A–Z program list with labels and suspension status |
| `roadmaps.json` | 367 semester-by-semester roadmaps (4-year, ADT transfer, Scholars): terms → courses, what each satisfies, units, footnotes |
| `departments.json` / `colleges.json` | Department and college pages (contacts, overview, faculty, program lists) |
| `policies.json` | 103 policy and info pages (academic policies, grading, standing, graduation, GE, SF State Studies, American Institutions, admissions, fees, financial aid, graduate policies, resources), split into heading sections |
| `academic_rules.json` | 83 curated rules (unit limits, graduation units, GPA, repeats, withdrawals, CR/NC, standing, honors, graduate rules). Each has structured values plus a verbatim quote that the build checks against the source page |
| `lookup.json` | Fast key→summary maps for courses, programs, subjects, policies, rules |
| `rag/chunks.jsonl` | 12k self-contained chunks for embedding/RAG: `{id, type, title, text, url, metadata}`. Each text starts with a context header |

## Rebuild

```
pip install beautifulsoup4 lxml
python3 scraper/fetch.py            # download pages into scraper/.cache (polite, respects robots.txt)
python3 scraper/parse.py scraper/.cache data/sfsu
python3 scraper/build_rules.py      # fails if any rule quote is not found in the source text
python3 scraper/build_rag.py
python3 scraper/search.py "max units per semester"   # BM25 search, no dependencies
```

## Known limits

- The bulletin has no term-offering data (which semester a course runs). That comes from the class schedule, not the bulletin.
- `prerequisite_courses` is a flat list of the codes named in the prerequisite text. AND/OR logic, grade minimums, concurrency, and "permission of instructor" are only in `prerequisites[].text`.
