"""Generate the architecture.md contract files from the scraped Bulletin data (no new facts).

Outputs (architecture.md §5/§8, adjusted by decisions D-012..D-015):
  data/catalog.json                      every 2026-27 course + GE / free-elective placeholder cards
  data/programs/bs-computer-science.json B.S. CS requirement groups (from programs.json + the CS DAG)
  data/policies.json                     load policies, each tied to a rule in academic_rules.json
  data/career_tags.json                  career directions (project-defined groupings over real courses)

Usage: python3 scraper/build_contracts.py
"""
import json
import math
import os
import re

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SFSU = os.path.join(ROOT, "data", "sfsu")
OUT = os.path.join(ROOT, "data")
ACCESSED = "2026-10-02"  # date of the Bulletin scrape (data/sources.md)
GE_URL = "https://bulletin.sfsu.edu/undergraduate-education/general-education/"
GE_LD_URL = GE_URL + "lower-division/"
GE_UD_URL = GE_URL + "upper-division/"
CS_ID = "science-engineering/computer-science/bs-computer-science"

# GE placeholder cards: area -> (title, units, page). Units come from the ug_ge_table rule.
GE_AREAS = [
    ("1A", "English Composition", GE_LD_URL), ("1B", "Critical Thinking", GE_LD_URL),
    ("1C", "Oral Communication", GE_LD_URL), ("2", "Mathematical Concepts and Quantitative Reasoning", GE_LD_URL),
    ("3A", "Arts", GE_LD_URL), ("3B", "Humanities", GE_LD_URL),
    ("4", "Social and Behavioral Sciences", GE_LD_URL), ("5A", "Physical Science", GE_LD_URL),
    ("5B", "Biological Science", GE_LD_URL), ("5C", "Laboratory", GE_LD_URL),
    ("6", "Ethnic Studies", GE_URL + "areasix/"),
    ("2UD_or_5UD", "Upper-Division Science or Quantitative Reasoning", GE_UD_URL),
    ("3UD", "Upper-Division Arts or Humanities", GE_UD_URL),
    ("4UD", "Upper-Division Social and Behavioral Sciences", GE_UD_URL),
]

# Career directions: this project's own groupings over real catalog courses (not Bulletin categories).
DIRECTIONS = [
    ("software-engineer", "Software Engineer", ["software-eng", "web"],
     ["CSC 648", "CSC 413", "CSC 667", "CSC 668", "CSC 642", "CSC 675", "CSC 600"],
     "Building and shipping software in teams: design, testing, web and data back ends."),
    ("quant", "Quantitative Developer", ["math", "algorithms", "probability", "numerical"],
     ["MATH 324", "MATH 400", "MATH 425", "MATH 448", "CSC 510", "CSC 520"],
     "Math-heavy programming: probability, numerical methods and fast algorithms."),
    ("ml-engineer", "Data / ML Engineer", ["ml", "data"],
     ["CSC 665", "CSC 671", "CSC 620", "CSC 603", "CSC 659", "MATH 448", "CSC 675"],
     "Machine learning, language models and the data systems behind them."),
    ("cybersecurity", "Cybersecurity", ["security", "networks"],
     ["CSC 652", "CSC 653", "CSC 645", "CSC 651"],
     "Securing systems and networks: privacy, network security and administration."),
    ("systems", "Systems / Networking", ["systems", "networks"],
     ["CSC 415", "CSC 615", "CSC 645", "CSC 651", "CSC 656", "CSC 641"],
     "Operating systems, embedded Linux, networks and performance."),
    ("games-graphics", "Game / Graphics Developer", ["graphics", "games"],
     ["CSC 630", "CSC 631", "CSC 664", "CSC 642"],
     "Computer graphics, multiplayer games, multimedia and interaction design."),
    ("research", "Academia / Research", ["theory", "research"],
     ["CSC 520", "CSC 600", "CSC 647", "CSC 621", "CSC 510", "CSC 671"],
     "Theory of computation, programming languages and research-oriented electives."),
]


def load(path):
    with open(path) as f:
        return json.load(f)


def one_liner(desc):
    """First sentence of the official description, cut at a word boundary under 90 characters."""
    if not desc:
        return ""
    first = re.split(r"(?<=[.!?])\s+(?=[A-Z])", desc.strip(), maxsplit=1)[0]
    if len(first) <= 90:
        return first
    cut = first[:88].rsplit(" ", 1)[0].rstrip(",;:")
    return cut + "…"


def leaves(expr):
    if expr is None:
        return []
    if isinstance(expr, str):
        return [expr]
    if "and" in expr or "or" in expr:
        return [x for e in expr.get("and", expr.get("or")) for x in leaves(e)]
    if "course" in expr:
        return [expr["course"]]
    if "coreq" in expr:
        return [expr["coreq"]]
    return []


def coreqs_of(expr):
    if not isinstance(expr, dict):
        return []
    if "coreq" in expr:
        return [expr["coreq"]]
    out = []
    for e in expr.get("and", []) + expr.get("or", []):
        out += coreqs_of(e)
    return out


def main():
    courses = load(os.path.join(SFSU, "courses.json"))
    rules = {r["id"]: r for r in load(os.path.join(SFSU, "academic_rules.json"))["rules"]}
    dag = load(os.path.join(SFSU, "dags", "bs-computer-science.json"))
    program_src = next(p for p in load(os.path.join(SFSU, "programs.json")) if p["id"] == CS_ID)
    roadmaps = [r for r in load(os.path.join(SFSU, "roadmaps.json")) if r.get("program_id") == CS_ID]
    nodes = dag["nodes"]
    ge_units = rules["ug_ge_table"]["values"]["areas"]

    # ---------------------------------------------------------------- tags (project-defined)
    tags = {}
    for gid, label, sig_tags, sig_courses, _ in DIRECTIONS:
        for c in sig_courses:
            tags.setdefault(c, set()).update(sig_tags)
    for tid, t in dag["tracks"].items():
        for c in t["courses"]:
            tags.setdefault(c, set()).add("track:" + tid)
    group_tag = {}
    for r in dag["requirements"]:
        for c in r["courses"]:
            group_tag[c] = r["id"]

    # ---------------------------------------------------------------- catalog
    catalog = []
    for c in courses:
        node = nodes.get(c["code"])
        t = set(tags.get(c["code"], set()))
        t.add(c["level"])
        t.update("ge:" + a.split(":")[0] for a in c["ge_areas"])
        if c["code"] in group_tag:
            t.add("req:" + group_tag[c["code"]])
        if c["subject"] == "MATH":
            t.add("math")
        notes_parts = []
        if node and node["conditions"]:
            notes_parts.append("Also required: " + "; ".join(node["conditions"]))
        catalog.append({
            "id": c["code"],
            "dept": c["subject"],
            "number": c["number"],
            "name": c["title"],
            "units": c["units_max"],
            "unitsRange": c["units"] if c["units_min"] != c["units_max"] else None,
            "oneLiner": one_liner(c["description"]),
            "oneLinerSource": "official",
            "description": c["description"],
            "prereq": node["prereq"] if node else None,
            "prereqEncoded": bool(node),
            "prereqNotes": (c["prerequisite_text"] or "") + ((" " + " ".join(notes_parts)) if notes_parts else ""),
            "minGrade": node["min_grade"] if node else None,
            "conditions": node["conditions"] if node else [],
            "coreqs": coreqs_of(node["prereq"]) if node else [],
            "geAreas": [a.split(":")[0] for a in c["ge_areas"]],
            "tags": sorted(t),
            "typicalTerms": [],
            "sourceUrl": c["source_url"],
            "sourceAccessed": ACCESSED,
            "verified": False,
            "isPlaceholder": False,
            "notes": "",
        })
    # GE placeholders (one card per 3 units; Area 4 is 6 units -> two cards)
    ud_prereq = {"and": [{"ge_area": "1A"}, {"ge_area": "1B"}, {"ge_area": "1C"}, {"ge_area": "2"}]}
    placeholders = []
    for area, title, url in GE_AREAS:
        units = ge_units[area]
        n = max(1, math.ceil(units / 3)) if units >= 3 else 1
        for k in range(n):
            pid = f"GE-{area.replace('_or_', '-')}" + (f"-{k + 1}" if n > 1 else "")
            per = units // n if units >= 3 else units
            placeholders.append({
                "id": pid, "dept": "GE", "number": "", "name": f"GE Area {area.replace('_or_', ' or ')}: {title}",
                "units": per, "unitsRange": None,
                "oneLiner": f"Any approved course in GE Area {area.replace('_or_', ' or ')}.",
                "oneLinerSource": "manual", "description": "",
                "prereq": ud_prereq if "UD" in area else None, "prereqEncoded": True,
                "prereqNotes": ("Upper-division GE requires 1A, 1B, 1C and Area 2 first; recommended after 60 units."
                                if "UD" in area else ""),
                "minGrade": "C-" if area in ("1A", "1B", "1C", "2") else None,
                "conditions": [], "coreqs": [],
                "geAreas": area.split("_or_") if "_or_" in area else [area],
                "tags": ["ge", "placeholder"], "typicalTerms": [], "sourceUrl": url,
                "sourceAccessed": ACCESSED, "verified": False, "isPlaceholder": True,
                "notes": "Placeholder for any course approved for this GE area. Not a specific course.",
            })
    catalog += placeholders

    # ---------------------------------------------------------------- program
    groups = []
    met_by_major = {}
    major_courses = [c for r in dag["requirements"] if r["type"] == "all" for c in r["courses"]]
    for c in major_courses:
        for a in nodes[c]["ge_areas"]:
            area = a.split(":")[0]
            if area in ge_units and area not in met_by_major:
                met_by_major[area] = c
    for r in dag["requirements"]:
        if r["type"] == "all":
            groups.append({"id": r["id"], "title": r["label"], "type": "all", "courseIds": r["courses"],
                           "units": r["units"]})
        else:
            groups.append({"id": r["id"], "title": r["label"], "type": "units", "unitsRequired": r["min_units"],
                           "courseIds": [c for c in r["courses"] if c not in r["excluded"]],
                           "minUnitsInSubject": {"CSC": r["min_csc_units"]},
                           "excludedCourseIds": r["excluded"],
                           "notAutoPlanned": r["auto_plan_excludes"],
                           "note": " ".join(r["rules"])})
    ge_ids, ge_need = [], 0
    for p in placeholders:
        area = p["geAreas"][0] if len(p["geAreas"]) == 1 else None
        if area and area in met_by_major:
            continue
        ge_ids.append(p["id"])
        ge_need += p["units"]
    groups.append({"id": "general_education", "title": "General Education", "type": "units",
                   "unitsRequired": ge_need, "courseIds": ge_ids,
                   "metByMajorCourse": met_by_major,
                   "note": f"GE is {rules['ug_ge_units']['values']['min_units']} units "
                           f"(rule ug_ge_units). Areas covered by GE-approved courses in the major are not repeated "
                           f"(rule ug_major_ge_double_count); placeholders stand for any approved course in that area."})
    major_units = int(dag["program"]["major_units"])
    degree_units = rules["ug_units_to_graduate"]["values"]["min_units"]
    free = degree_units - major_units - ge_need
    free_ids = []
    k = 0
    remaining = free
    while remaining > 0:
        k += 1
        u = 3 if remaining >= 3 else remaining
        pid = f"ELECTIVE-{k}"
        free_ids.append(pid)
        catalog.append({
            "id": pid, "dept": "ELECTIVE", "number": "", "name": "Free elective", "units": u, "unitsRange": None,
            "oneLiner": "Any course that counts toward the 120 units.", "oneLinerSource": "manual",
            "description": "", "prereq": None, "prereqEncoded": True, "prereqNotes": "", "minGrade": None,
            "conditions": [], "coreqs": [], "geAreas": [], "tags": ["elective", "placeholder"], "typicalTerms": [],
            "sourceUrl": rules["ug_units_to_graduate"]["source_url"], "sourceAccessed": ACCESSED,
            "verified": False, "isPlaceholder": True,
            "notes": "Placeholder: units needed to reach the degree total after the major and GE.",
        })
        remaining -= u
    groups.append({"id": "free_electives", "title": "Free electives", "type": "units", "unitsRequired": free,
                   "courseIds": free_ids,
                   "note": f"{degree_units} degree units − {major_units} major − {ge_need} GE placeholders."})
    program = {
        "id": "bs-cs",
        "name": program_src["name"],
        "totalUnitsRequired": degree_units,
        "majorUnits": major_units,
        "sourceUrl": program_src["url"],
        "sourceAccessed": ACCESSED,
        "requirementGroups": groups,
        "notTracked": ["SF State Studies (AERM, ESCA, GP, SJ)", "American Institutions (U.S. History, U.S. and "
                       "California Government)", "Residence units (30 at SF State)", "Upper-division units (30)"],
        "officialRoadmaps": [{"id": r["id"], "title": r["title"], "url": r["url"], "type": r["roadmap_type"]}
                             for r in roadmaps],
        "prereqGraph": "data/sfsu/dags/bs-computer-science.json",
        "verified": False,
    }

    # ---------------------------------------------------------------- policies
    def pol(value, rule_id, label):
        r = rules[rule_id]
        return {"value": value, "label": label, "ruleId": rule_id, "quote": r["quote"],
                "sourceUrl": r["source_url"], "verified": False}

    nl = rules["normal_load"]["values"]["undergraduate"]["fall_spring"]
    policies = {
        "minUnitsFullTime": pol(rules["enrollment_status_levels"]["values"]["undergraduate"]["full_time"][0],
                                "enrollment_status_levels", "Full-time minimum"),
        "heavyLoadUnits": pol(nl[1], "normal_load", "Top of the normal load"),
        "maxUnitsWithoutPermission": pol(rules["ug_max_units_priority_registration"]["values"]["max_units"],
                                         "ug_max_units_priority_registration", "Registration maximum"),
        "_note": "verified stays false until a person compares each quote with the Bulletin page "
                 "(architecture.md §8). The quote itself is machine-checked by scraper/build_rules.py.",
    }

    # ---------------------------------------------------------------- career directions
    catalog_ids = {c["id"] for c in catalog}
    directions = []
    for gid, label, sig_tags, sig_courses, desc in DIRECTIONS:
        missing = [c for c in sig_courses if c not in catalog_ids]
        assert not missing, f"{gid}: {missing} not in catalog"
        directions.append({"id": gid, "label": label, "signalTags": sig_tags, "signalCourseIds": sig_courses,
                           "description": desc})
    career = {"source": "Project-defined groupings over real 2026-27 catalog courses; not SFSU categories.",
              "directions": directions}

    os.makedirs(os.path.join(OUT, "programs"), exist_ok=True)
    with open(os.path.join(OUT, "catalog.json"), "w") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=1)
    with open(os.path.join(OUT, "programs", "bs-computer-science.json"), "w") as f:
        json.dump(program, f, ensure_ascii=False, indent=1)
    with open(os.path.join(OUT, "policies.json"), "w") as f:
        json.dump(policies, f, ensure_ascii=False, indent=1)
    with open(os.path.join(OUT, "career_tags.json"), "w") as f:
        json.dump(career, f, ensure_ascii=False, indent=1)
    print(f"catalog {len(catalog)} ({len(placeholders)} GE + {len(free_ids)} free-elective placeholders); "
          f"program groups {[g['id'] for g in groups]}; GE met by major {met_by_major}; "
          f"GE placeholders {ge_need} units; free electives {free} units; directions {len(directions)}")


if __name__ == "__main__":
    main()
