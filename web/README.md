# Degree Path: B.S. Computer Science planner

Semester roadmap + prerequisite bottleneck flags for SF State's B.S. Computer Science,
built on the 2026-27 Bulletin data in `data/sfsu/`.

## Run it

```
cd web && python3 -m http.server 8000     # then open http://localhost:8000
# or open web/dist/degree-path.html directly (single self-contained file)
```

Rebuild after data changes:

```
python3 scraper/build_cs_dag.py    # data/sfsu/dags/bs-computer-science.json (validated against bulletin text)
python3 web/make_data.py           # web/data.js
python3 web/bundle.py              # web/dist/degree-path.html
```

## Pieces

| File | Role |
|---|---|
| `data/sfsu/dags/bs-computer-science.json` | Prerequisite DAG with AND/OR logic, coreqs, "may be taken concurrently", standing/GPA conditions, requirement groups, elective rules, career-track tags, `term_offerings` (empty: fill from the class schedule) |
| `web/planner.js` | Pure planning engine (browser + Node): `plan`, `bottlenecks`, `pickElectives`, `explain` |
| `web/index.html` | UI: summary, bottleneck alerts, semester columns, requirements checklist, transcript check, prerequisite map |

## Transcript input (what the extraction step should return)

```json
{
  "student": "Name",
  "current_term": {"season": "Fall", "year": 2026},
  "placement": {"calculus": true},
  "courses": [
    {"code": "CSC 220", "grade": "B", "units": 3, "term": "Fall 2025", "confidence": 0.98},
    {"code": "CSC 256", "grade": "IP", "units": 3, "term": "Fall 2026", "confidence": 0.99}
  ]
}
```

`grade` is a letter grade, `CR`, `NC`, `W`, or `IP` (in progress). Codes use the bulletin format (`"CSC 300GW"`, `"AA S 106"`).
The UI checks each row against the catalog (code exists, units match, grade meets the C minimum) and flags rows
with `confidence < 0.8`. A plain array of course rows also works.

## How planning works

1. Completed courses with a passing grade (C or better where the major requires it) and in-progress courses are removed.
2. Remaining required courses + 5 chosen electives are expanded with the cheapest prerequisite path through OR branches.
3. Each course gets a height: the longest chain of hard prerequisites it starts. Concurrent/coreq links add no term.
4. Semesters are filled greedily by height under the unit cap, honoring coreqs (PHYS 220 + 222), same-term
   concurrency (MATH 227 with CSC 230), upper-division/senior standing (60/90 units), and offering terms.
   Leftover capacity is GE / free-elective units until 120.
5. Bottlenecks: for each course that unlocks later courses, re-plan with it blocked from its term. If graduation
   moves later, it's on the critical path and the alert states how many semesters it costs.

Limits: "or permission of the instructor" alternatives are not used; GPA 3.0 conditions warn but don't block;
GE, SF State Studies, American Institutions and residence units are not tracked course-by-course.
