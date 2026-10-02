"""Build the B.S. Computer Science prerequisite DAG with explicit AND/OR logic.

Prerequisite expressions are hand-encoded from the 2026-2027 bulletin text and then
validated against data/sfsu/courses.json: every course code used in an expression must
appear in that course's bulletin prerequisite text, and every code in the bulletin text
must either be used or be listed in `ignored` with a reason. The build fails otherwise.

Expression grammar (JSON):
  "CSC 220"                              course must be completed before the term
  {"and": [expr, ...]}                   all of
  {"or": [expr, ...]}                    any of
  {"course": "MATH 227", "concurrent": true}   completed earlier OR taken the same term
  {"coreq": "PHYS 222"}                  must be taken in the same term (or earlier)
  {"placement": "calculus"}              satisfied by a placement/HS credit flag on the student profile

Usage: python3 scraper/build_cs_dag.py [data_dir]
"""
import json
import os
import re
import sys

DATA = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "data", "sfsu")
PROGRAM_ID = "science-engineering/computer-science/bs-computer-science"

UD = "upper-division standing (60+ units)"
SENIOR = "senior standing (90+ units)"
GPA3 = "GPA 3.0+ (or instructor permission)"


def C(code, concurrent=False):
    return {"course": code, "concurrent": True} if concurrent else code


def AND(*xs):
    return {"and": list(xs)}


def OR(*xs):
    return {"or": list(xs)}


MATH_LA = OR("MATH 225", "MATH 325")

# code: (prereq expression or None, conditions, min_grade, ignored-codes-with-reason)
COURSES = {
    # ---- lower-division math/physics and their on-ramps
    "MATH 197": (None, ["Category III/IV QR placement"], None, {}),
    "MATH 198": ("MATH 197", [], "C", {}),
    "MATH 199": (None, ["First-Year Math Advising Module"], None, {}),
    "MATH 226": (OR("MATH 198", "MATH 199", {"placement": "calculus"}), [], "C",
                 {"MATH 226": "retake rule for a prior attempt, not a prerequisite"}),
    "MATH 227": ("MATH 226", [], "C", {}),
    "MATH 228": ("MATH 227", [], "C", {}),
    "MATH 225": (OR("MATH 198", "MATH 199", "MATH 226"), [], "C", {}),
    "MATH 325": ("MATH 226", [], "C", {"MATH 301GW": "recommended only"}),
    "MATH 324": ("MATH 227", ["computer experience approved by instructor"], "C", {}),
    "MATH 209": ("MATH 226", [], "C", {}),
    "MATH 440": (C("MATH 228", concurrent=True), [], "C", {}),
    "PHYS 220": (AND("MATH 226", {"coreq": "PHYS 222"}), [], "C",
                 {"MATH 227": "concurrent enrollment recommended only"}),
    "PHYS 222": ({"coreq": "PHYS 220"}, [], None, {}),
    "PHYS 230": (AND("PHYS 220", "MATH 227", {"coreq": "PHYS 232"}), [], "C",
                 {"MATH 228": "concurrent enrollment recommended only"}),
    "PHYS 232": ({"coreq": "PHYS 230"}, [], None, {}),
    # ---- core
    "CSC 101": (None, [], None, {}),
    "CSC 215": ("CSC 101", [], "C", {}),
    "CSC 220": (OR("CSC 210", "CSC 215"), [], "C", {}),
    "CSC 230": (AND(OR("CSC 210", "CSC 215", "ENGR 213"), C("MATH 227", concurrent=True)), [], "C", {}),
    "CSC 256": ("CSC 230", [], "C", {}),
    "CSC 300GW": (OR("CSC 210", "CSC 215"), [UD, "GE Area 1A (English Composition)", "CS major or minor"], None, {}),
    "CSC 317": ("CSC 220", ["or instructor permission"], None, {}),
    "CSC 340": (AND("CSC 220", "CSC 230"), [], "C", {}),
    "CSC 413": (AND("CSC 220", "CSC 317"), [], "C", {}),
    "CSC 415": (AND("CSC 256", "CSC 340", "MATH 324", "PHYS 230"), [], "C", {}),
    "CSC 510": (AND("CSC 340", "MATH 324"), [], "C", {}),
    "CSC 648": (AND("CSC 317", "CSC 413"), [UD, GPA3], "C", {}),
    # ---- electives
    "CSC 520": (AND("CSC 220", "CSC 230", MATH_LA), [], "C", {}),
    "CSC 600": (AND("CSC 413", "CSC 510"), [], "C", {}),
    "CSC 603": ("CSC 413", [GPA3], "C", {}),
    "CSC 615": ("CSC 415", ["or instructor permission"], "C", {}),
    "CSC 620": ("CSC 413", [UD, GPA3], "C", {}),
    "CSC 621": (AND("CSC 510", MATH_LA), [UD, GPA3], "C", {}),
    "CSC 630": (AND("CSC 413", MATH_LA), [GPA3], "C", {}),
    "CSC 631": ("CSC 413", [UD, GPA3], None, {}),
    "CSC 641": ("CSC 415", [UD, GPA3], None, {}),
    "CSC 642": ("CSC 413", [UD], "C", {}),
    "CSC 645": ("CSC 415", [UD, GPA3], "C", {}),
    "CSC 647": (AND("CSC 415", MATH_LA), [UD, GPA3], "C",
                {"CSC 308": "recommended only", "CSC 309": "recommended only", "CSC 656": "recommended only"}),
    "CSC 651": (AND("CSC 413", "CSC 415"), [], "C", {}),
    "CSC 652": ("CSC 415", ["or instructor permission"], "C", {}),
    "CSC 653": ("CSC 415", [UD, GPA3], "C", {}),
    "CSC 656": (C("CSC 415", concurrent=True), ["or instructor permission"], None, {}),
    "CSC 659": ("CSC 413", [UD, GPA3], "C", {}),
    "CSC 664": ("CSC 413", [UD, GPA3], "C", {}),
    "CSC 665": ("CSC 413", [UD], "C", {}),
    "CSC 667": ("CSC 413", [UD, GPA3], "C", {}),
    "CSC 668": ("CSC 413", [SENIOR, GPA3], "C", {}),
    "CSC 671": (AND("CSC 510", MATH_LA), [UD, GPA3], "C", {}),
    "CSC 675": ("CSC 413", [UD, GPA3], "C", {}),
    "CSC 676": (None, [UD, GPA3], None, {}),
    "CSC 680": ("CSC 415", [SENIOR, "senior CS major", GPA3], "C", {}),
    "CSC 685": ("CSC 215", [], "C", {}),
    "CSC 686": ("CSC 215", [], "C", {}),
    "CSC 698": (None, [UD], None, {}),
    "CSC 699": (None, ["department and instructor permission; approved proposal"], None, {}),
    "MATH 400": (AND("MATH 228", MATH_LA, OR("CSC 210", "CSC 215", "MATH 209", "MATH 309")), [], "C", {}),
    "MATH 425": (AND(MATH_LA, OR("MATH 209", "MATH 309", "CSC 210", "CSC 215")), [], "C", {}),
    "MATH 448": (AND("MATH 228", "MATH 325", "MATH 440"), [], "C", {}),
}

# Career-track tags for the elective slot. These are this project's own groupings,
# not bulletin categories.
TRACKS = {
    "systems": {"label": "Systems & Security",
                "courses": ["CSC 645", "CSC 652", "CSC 653", "CSC 651", "CSC 615", "CSC 656", "CSC 641"]},
    "web": {"label": "Web & Mobile",
            "courses": ["CSC 667", "CSC 675", "CSC 642", "CSC 680", "CSC 668", "CSC 631"]},
    "ai": {"label": "AI & Data",
           "courses": ["CSC 665", "CSC 671", "CSC 620", "CSC 603", "CSC 659", "CSC 675", "MATH 448"]},
    "theory": {"label": "Theory & Graphics",
               "courses": ["CSC 520", "CSC 600", "CSC 630", "CSC 647", "CSC 621", "MATH 425", "MATH 400"]},
}


def codes(expr):
    if expr is None:
        return []
    if isinstance(expr, str):
        return [expr]
    if "and" in expr or "or" in expr:
        return [c for x in expr.get("and", expr.get("or")) for c in codes(x)]
    if "course" in expr:
        return [expr["course"]]
    if "coreq" in expr:
        return [expr["coreq"]]
    return []


def main():
    courses = {c["code"]: c for c in json.load(open(os.path.join(DATA, "courses.json")))}
    program = next(p for p in json.load(open(os.path.join(DATA, "programs.json"))) if p["id"] == PROGRAM_ID)
    errors = []
    nodes = {}
    for code, (expr, conds, grade, ignored) in COURSES.items():
        c = courses.get(code)
        if not c:
            errors.append(f"{code}: not in catalog")
            continue
        text = c["prerequisite_text"] or ""
        in_text = {m for m in re.findall(r"\b[A-Z]{2,4} \d{3}[A-Z]{0,3}\b", text)}
        in_text |= set(c["prerequisite_courses"]) | set(c.get("recommended_courses", []))
        used = set(codes(expr))
        for u in used - in_text:
            errors.append(f"{code}: expression uses {u} which is not in the bulletin text: {text!r}")
        for t in in_text - used - set(ignored) - {code}:
            errors.append(f"{code}: bulletin text names {t} but the expression doesn't use it: {text!r}")
        nodes[code] = {
            "code": code,
            "title": c["title"],
            "units": c["units_max"],
            "prereq": expr,
            "min_grade": grade,
            "conditions": conds,
            "enforced_at_registration": c["prerequisites_enforced_at_registration"],
            "recommended": c.get("recommended_courses", []),
            "bulletin_prerequisite_text": text or None,
            "ge_areas": c["ge_areas"],
            "url": c["source_url"],
        }
    # codes referenced but not themselves encoded (external alternatives)
    external = {}
    for n in nodes.values():
        for u in codes(n["prereq"]):
            if u not in nodes:
                cat = courses.get(u)
                external[u] = {"code": u, "title": cat["title"] if cat else None,
                               "in_catalog": bool(cat),
                               "note": "alternative path; counts if already completed (e.g. transfer credit)"}
    # recommended-only codes not in the catalog: resolve through current courses' former_codes (D-012)
    former = {fc: c["code"] for c in courses.values() for fc in (c.get("former_codes") or [])}
    for n in nodes.values():
        for u in n["recommended"]:
            if u not in nodes and u not in courses and u not in external:
                external[u] = {"code": u, "title": None, "in_catalog": False, "recommended_only": True,
                               "note": (f"former course number of {former[u]} (courses.json {former[u]} former_codes); "
                                        "appears only in a 'recommended' list, never as a prerequisite")
                                       if u in former else "UNKNOWN: recommended-only code not found in the 2026-27 catalog"}
    # requirements, straight from programs.json
    reqs = []
    for b in program["requirements"]:
        label = b["heading_path"][-1]
        rid = re.sub(r"[^a-z]+", "_", re.sub(r"\(.*?\)", "", label).lower()).strip("_")
        entry = {"id": rid, "label": re.sub(r"\s*\(.*?\)", "", label).strip(), "units": int(b["units"]),
                 "courses": b["courses"]}
        if "Electives" in label:
            entry.update(type="choose_units", rules=b["notes"],
                         min_units=15, min_csc_units=12,
                         excluded=["CSC 601", "CSC 602", "CSC 648", "CSC 694"],
                         auto_plan_excludes=["CSC 685", "CSC 686", "CSC 698", "CSC 699"])
        else:
            entry["type"] = "all"
        reqs.append(entry)
    for r in reqs:
        for code in r["courses"]:
            if code not in nodes:
                errors.append(f"requirement course {code} has no DAG node")
    for t in TRACKS.values():
        for code in t["courses"]:
            if code not in nodes:
                errors.append(f"track course {code} has no DAG node")
    # cycle check
    state = {}

    def visit(code, path):
        if state.get(code) == 1:
            errors.append("cycle: " + " -> ".join(path + [code]))
            return
        if state.get(code) == 2 or code not in nodes:
            return
        state[code] = 1
        for u in codes(nodes[code]["prereq"]):
            if not (isinstance(nodes[code]["prereq"], dict) and "coreq" in nodes[code]["prereq"]):
                visit(u, path + [code])
        state[code] = 2

    for code in nodes:
        if not (isinstance(nodes[code]["prereq"], dict) and "coreq" in nodes[code]["prereq"]):
            visit(code, [])
    if errors:
        print("\n".join(errors))
        sys.exit(1)
    doc = {
        "program": {"id": PROGRAM_ID, "name": program["name"], "url": program["url"],
                    "major_units": int(program["total_units"]), "degree_units": 120,
                    "bulletin": "2026-2027"},
        "grammar": __doc__.split("Expression grammar (JSON):")[1].split("Usage:")[0].strip(),
        "notes": [
            "Grades of C or better are required for Mathematics and Physics, Core, and Advanced CS courses; "
            "CR/NC is not accepted in the major (program page).",
            "'or permission of the instructor' alternatives are recorded in conditions, not as graph edges.",
            "The bulletin has no term-offering data. term_offerings is empty: fill it from the class schedule "
            "(e.g. {\"CSC 340\": [\"Fall\", \"Spring\"]}). Missing entries mean 'assume every fall and spring'.",
        ],
        "requirements": reqs,
        "nodes": nodes,
        "external": external,
        "tracks": TRACKS,
        "term_offerings": {},
        # D-012: field names say what the numbers are; each cites its academic_rules.json id
        "university": {"min_units": 120, "min_gpa": 2.0,
                       "priority_registration_max_units_per_term": 19,  # ug_max_units_priority_registration (not an absolute max)
                       "typical_units_per_term": 15,                     # ug_average_load
                       "upper_division_standing_units": 60,              # class_levels: junior = 60+ earned units
                       "senior_standing_units": 90,                      # class_levels: senior = 90+ earned units
                       "min_upper_division_units_for_degree": 30,        # ug_upper_division_units
                       "gwar_course": "CSC 300GW"},
    }
    out_dir = os.path.join(DATA, "dags")
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "bs-computer-science.json"), "w") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    print(f"{len(nodes)} nodes, {sum(len(codes(n['prereq'])) for n in nodes.values())} edges, "
          f"{len(external)} external alternatives: {sorted(external)}")


if __name__ == "__main__":
    main()
