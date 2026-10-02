"""Validate the contract data files (architecture.md §8): data/catalog.json, data/programs/*.json,
data/policies.json, data/career_tags.json.

Checks: required fields, unique IDs, prerequisite references exist (or are declared external in the DAG),
no prerequisite cycles, program and career course IDs exist, policies cite a rule and a source.
Prints courses flagged for manual review. Exit 1 on any error.
Usage: python3 scripts/validate_catalog.py
"""
import glob
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")


def load(p):
    with open(os.path.join(ROOT, p)) as f:
        return json.load(f)


def refs(expr):
    """(course ids, ge areas) referenced by a prerequisite expression."""
    if expr is None:
        return [], []
    if isinstance(expr, str):
        return [expr], []
    if "and" in expr or "or" in expr:
        ids, areas = [], []
        for e in expr.get("and", expr.get("or")):
            i, a = refs(e)
            ids += i
            areas += a
        return ids, areas
    if "course" in expr:
        return [expr["course"]], []
    if "coreq" in expr:
        return [expr["coreq"]], []
    if "ge_area" in expr:
        return [], [expr["ge_area"]]
    if "placement" in expr:
        return [], []
    raise ValueError(f"unknown expression node {expr}")


def ordering_refs(expr):
    """Course ids that must come before (or with, if concurrent) a course; same-term coreqs excluded."""
    if expr is None or (isinstance(expr, dict) and ("coreq" in expr or "ge_area" in expr or "placement" in expr)):
        return []
    if isinstance(expr, str):
        return [expr]
    if "course" in expr:
        return [expr["course"]]
    return [x for e in expr.get("and", expr.get("or", [])) for x in ordering_refs(e)]


def main():
    errors, review = [], []
    catalog = load("data/catalog.json")
    ids = [c["id"] for c in catalog]
    by_id = {c["id"]: c for c in catalog}
    if len(ids) != len(set(ids)):
        dup = sorted({i for i in ids if ids.count(i) > 1})
        errors.append(f"duplicate course ids: {dup[:10]}")
    external = set()
    for p in glob.glob(os.path.join(ROOT, "data/sfsu/dags/*.json")):
        with open(p) as f:
            external |= {k for k, v in json.load(f).get("external", {}).items() if v.get("note")}
    all_areas = {a for c in catalog for a in c["geAreas"]}
    for c in catalog:
        for field in ("id", "name", "units", "sourceUrl"):
            if c.get(field) in (None, ""):
                errors.append(f"{c.get('id')}: missing {field}")
        if c["verified"] and not c["sourceUrl"].startswith("https://bulletin.sfsu.edu/"):
            errors.append(f"{c['id']}: verified without a Bulletin source")
        try:
            pids, areas = refs(c["prereq"])
        except ValueError as e:
            errors.append(f"{c['id']}: {e}")
            continue
        for pid in pids:
            if pid not in by_id and pid not in external:
                errors.append(f"{c['id']}: prerequisite {pid} is not in the catalog or a DAG's external list")
        for a in areas:
            if a not in all_areas:
                errors.append(f"{c['id']}: GE area {a} matches no course")
        if c["prereqEncoded"] and not c["isPlaceholder"] and c["prereqNotes"] and "permission" in c["prereqNotes"]:
            review.append(f"{c['id']}: 'permission of instructor' path kept as a note, not an edge")
    # cycles (hard and soft edges both count as ordering here)
    state = {}

    def visit(cid, path):
        if state.get(cid) == 1:
            errors.append("prerequisite cycle: " + " -> ".join(path + [cid]))
            return
        if state.get(cid) == 2 or cid not in by_id:
            return
        state[cid] = 1
        for pid in ordering_refs(by_id[cid]["prereq"]):
            visit(pid, path + [cid])
        state[cid] = 2

    for cid in by_id:
        visit(cid, [])
    for p in glob.glob(os.path.join(ROOT, "data/programs/*.json")):
        prog = json.load(open(p))
        for g in prog["requirementGroups"]:
            for cid in g["courseIds"]:
                if cid not in by_id:
                    errors.append(f"{os.path.basename(p)} {g['id']}: {cid} not in catalog")
        if not prog.get("sourceUrl", "").startswith("https://bulletin.sfsu.edu/"):
            errors.append(f"{os.path.basename(p)}: program sourceUrl is not a Bulletin page")
    pol = load("data/policies.json")
    for k, v in pol.items():
        if k.startswith("_"):
            continue
        if not v.get("ruleId") or not v.get("sourceUrl", "").startswith("https://bulletin.sfsu.edu/"):
            errors.append(f"policies.{k}: needs ruleId and a Bulletin sourceUrl")
        if v.get("verified"):
            review.append(f"policies.{k}: marked verified, confirm a person checked the quote")
    for d in load("data/career_tags.json")["directions"]:
        for cid in d["signalCourseIds"]:
            if cid not in by_id:
                errors.append(f"career {d['id']}: {cid} not in catalog")
    encoded = sum(1 for c in catalog if c["prereqEncoded"] and not c["isPlaceholder"])
    print(f"catalog: {len(catalog)} records, {encoded} with an encoded AND/OR prerequisite, "
          f"{sum(1 for c in catalog if c['isPlaceholder'])} placeholders, "
          f"{sum(1 for c in catalog if c['verified'])} human-verified")
    for r in review[:20]:
        print("REVIEW", r)
    if len(review) > 20:
        print(f"REVIEW ... {len(review) - 20} more")
    for e in errors:
        print("ERROR", e)
    print("OK" if not errors else f"{len(errors)} error(s)")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
