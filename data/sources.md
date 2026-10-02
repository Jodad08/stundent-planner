# Sources

Every URL that data in `data/` relies on, what it is used for, and when it was accessed.
`harness.py` treats a data URL as sourced when one of the URLs below is a prefix of it.
Add a row only after opening the page. Never add a URL from memory.

| URL (or prefix) | Used for | Accessed | How |
|---|---|---|---|
| https://bulletin.sfsu.edu/ | All of `data/sfsu/`: courses, programs, roadmaps, departments, colleges, policies, academic rules, RAG chunks, and the CS DAG in `data/sfsu/dags/` | 2026-10-02 | `scraper/fetch.py` downloaded every page in `https://bulletin.sfsu.edu/sitemap.xml` that robots.txt allows (scrape committed in `cad249b`, 2026-10-02) |

## Notes

- Scraped records keep the URL of the Bulletin page they came from. Other links inside `data/sfsu/*.json`
  (for example `assist.org`, `registrar.sfsu.edu`, department sites) are **links quoted in Bulletin page text**.
  Nobody opened them for this project, so they are not sources. Before relying on one, open it and add a row above.
- `data/sfsu/academic_rules.json` stores a verbatim `quote` per rule. `scraper/build_rules.py` fails if a quote
  is not found in the source page text.
- The Bulletin has **no term-offering data**. `term_offerings` stays empty until a public class-schedule page is
  opened and listed here.

## Evidence that is NOT a citable source

| Item | What it shows | Why it is not a source |
|---|---|---|
| `Degree planner.pdf` (local only, not committed) | The SFSU Student Center Degree Planner for one real student, printed 2026-10-02 | Private student record (`cmsweb.sfsu.edu` behind login). Use for UX evidence only, after blurring personal data |
| `Student Center.pdf` (local only, not committed) | That student's Degree Progress Report, printed 2026-10-02 | Same. Contains the student's name, ID and GPA. Never copy into the repo |
