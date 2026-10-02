"""Build RAG-ready chunks (rag/chunks.jsonl) and lookup indexes from data/sfsu/*.json.

Each chunk is self-contained: its text starts with a context header (what entity it
belongs to), so it can be embedded and retrieved on its own.
Usage: python3 scraper/build_rag.py [data_dir]
"""
import collections
import json
import os
import re
import sys

DATA = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "data", "sfsu")
RAG = os.path.join(DATA, "rag")
SRC = "SFSU Bulletin 2026-2027"
MAX_CHARS = 3500


def load(name):
    with open(os.path.join(DATA, name)) as f:
        return json.load(f)


def split_text(text, limit=MAX_CHARS):
    """Split on paragraph boundaries (then lines) so each piece stays under `limit` chars."""
    if len(text) <= limit:
        return [text]
    parts, cur = [], ""
    for para in re.split(r"\n\n+", text):
        pieces = [para] if len(para) <= limit else para.split("\n")
        for piece in pieces:
            while len(piece) > limit:  # pathological single line
                cut = piece.rfind(" ", 0, limit)
                cut = cut if cut > 0 else limit
                if cur:
                    parts.append(cur)
                    cur = ""
                parts.append(piece[:cut])
                piece = piece[cut:].lstrip()
            sep = "\n\n" if para is piece else "\n"
            if len(cur) + len(piece) + 2 > limit and cur:
                parts.append(cur)
                cur = piece
            else:
                cur = f"{cur}{sep}{piece}" if cur else piece
    if cur:
        parts.append(cur)
    return parts


class Chunks:
    def __init__(self):
        self.items = []
        self.ids = collections.Counter()
        self.seen_bodies = set()

    def add(self, cid, ctype, title, header, body, url, meta):
        body = (body or "").strip()
        if not body:
            return
        # drop stubs ("Roadmap > Roadmap / This roadmap opens in a new tab.") unless the type is inherently short
        payload = re.sub(r"^[^\n]*\n", "", body) if "\n" in body else body
        if len(payload.strip()) < 60 and ctype not in ("course", "academic_rule", "program_summary", "subject_index"):
            return
        key = re.sub(r"\s+", " ", body)
        if key in self.seen_bodies:
            return
        self.seen_bodies.add(key)
        pieces = split_text(body)
        for i, piece in enumerate(pieces):
            uid = cid if len(pieces) == 1 else f"{cid}#part{i + 1}"
            self.ids[uid] += 1
            if self.ids[uid] > 1:
                uid = f"{uid}~{self.ids[uid]}"
            part = f" (part {i + 1}/{len(pieces)})" if len(pieces) > 1 else ""
            self.items.append({
                "id": uid,
                "type": ctype,
                "title": title + part,
                "text": f"{header}\n\n{piece}",
                "url": url,
                "metadata": {k: v for k, v in meta.items() if v not in (None, [], "", {})},
            })


RULE_KEYWORDS = {
    "unit_load": "maximum units per semester, max units, unit cap, course load, full-time, part-time, how many classes",
    "graduation_units": "units to graduate, credits needed, total units, degree requirements, how many units",
    "gpa": "GPA needed to graduate, minimum GPA, grade point average",
    "withdrawal": "withdraw from a class, drop a class late, W grade, withdrawal limit",
    "registration": "enrollment, add a class, drop a class, audit, readmission, leave of absence",
    "grading": "grades, CR/NC, credit/no credit, pass/fail, incomplete, grade points",
    "repeat": "retake a class, repeat a course, grade forgiveness, replace a grade",
    "academic_standing": "probation, academic notice, disqualification, dismissed, kicked out, GPA below 2.0",
    "honors": "dean's list, honors, cum laude, latin honors",
    "transfer_credit": "transfer units, community college credit, AP, IB, CLEP, credit by exam",
    "general_education": "GE requirements, general education areas, breadth",
    "major": "major requirements, double major, declare a major, change major",
    "minor": "minor requirements, minor units",
    "catalog_rights": "catalog year, which bulletin applies, catalog rights, graduation requirements year",
    "time_limit": "how long to finish, time limit, seven years, deadline to complete degree",
    "graduation": "apply to graduate, graduation application, diploma, second bachelor's",
}


def course_text(c, prog_names):
    lines = [f"{c['code']} — {c['title']} ({c['units']} unit{'s' if c['units'] != '1' else ''})",
             f"Subject: {c.get('subject_name') or ''} ({c['subject']}) | Level: {c['level']}"]
    if c["prerequisites"]:
        for p in c["prerequisites"]:
            who = f" for {p['applies_to']}" if p["applies_to"] else ""
            lines.append(f"{p['kind'].title()}{who}: {p['text']}")
    else:
        lines.append("Prerequisites: none listed")
    if c.get("prerequisites_may_be_taken_concurrently"):
        lines.append("May be taken concurrently (co-enrollment allowed): " +
                     ", ".join(c["prerequisites_may_be_taken_concurrently"]))
    if c.get("recommended_courses"):
        lines.append("Recommended (not required) preparation: " + ", ".join(c["recommended_courses"]))
    if c["prerequisites_enforced_at_registration"]:
        lines.append("Prerequisites enforced at registration (*): " +
                     ", ".join(c["prerequisites_enforced_at_registration"]))
    lines.append(f"Description: {c['description']}")
    if c["topics"]:
        lines.append("Topics: " + "; ".join(c["topics"]))
    if c["ge_areas"]:
        lines.append("General Education areas: " + "; ".join(c["ge_areas"]))
    if c["sf_state_studies"]:
        lines.append("SF State Studies: " + "; ".join(c["sf_state_studies"]))
    if c.get("american_institutions"):
        lines.append("American Institutions: " + "; ".join(c["american_institutions"]))
    if c.get("satisfies_gwar"):
        lines.append("Satisfies the Graduation Writing Assessment Requirement (GWAR).")
    other = [a for a in c["attributes"] if a not in c["ge_areas"] + c["sf_state_studies"] +
             c.get("american_institutions", [])]
    if other:
        lines.append("Other attributes: " + "; ".join(other))
    if c["grading"]:
        lines.append(f"Grading: {c['grading']}")
    if c["repeatable"]:
        lines.append(f"Repeatable: {c['repeatable']}")
    if c["paired_with"]:
        lines.append("Paired (undergrad/grad) with: " + ", ".join(c["paired_with"]))
    if c["cross_listed_with"]:
        lines.append("Cross-listed with: " + ", ".join(c["cross_listed_with"]))
    if c.get("former_codes"):
        lines.append("Former course numbers (may appear on older transcripts): " + ", ".join(c["former_codes"]))
    if c["extra_fee"]:
        lines.append("Extra fee required.")
    if c["is_prerequisite_for"]:
        lines.append("Is a prerequisite for: " + ", ".join(c["is_prerequisite_for"]))
    if c["used_in_programs"]:
        names = [prog_names.get(p, p) for p in c["used_in_programs"]]
        lines.append("Listed in program requirements of: " + "; ".join(names))
    return "\n".join(lines)


def item_lines(items):
    out = []
    for it in items:
        t = it.get("type")
        if t == "course":
            u = f" ({it['units']} units)" if it.get("units") else ""
            aka = f" [also listed as {', '.join(it['also_listed_as'])}]" if it.get("also_listed_as") else ""
            nt = f" — {'; '.join(it['notes'])}" if it.get("notes") else ""
            out.append(f"- {it['code']}: {it['title']}{u}{aka}{nt}")
        elif t == "one_of":
            opts = " OR ".join(f"{o['code']} {o['title']}" for o in it["options"])
            u = f" ({it['units']} units)" if it.get("units") else ""
            out.append(f"- One of: {opts}{u}")
        elif t == "choose":
            u = f" [{it['units']} units]" if it.get("units") else ""
            out.append(f"- {it['instruction']}{u}")
            for c in it["courses"]:
                if c.get("type") == "one_of":
                    out.append("    - One of: " + " OR ".join(f"{o['code']} {o['title']}" for o in c["options"]))
                else:
                    cu = f" ({c['units']} units)" if c.get("units") else ""
                    out.append(f"    - {c['code']}: {c['title']}{cu}")
        elif t == "header":
            out.append(f"{it['text']}" + (f" [{it['units']} units]" if it.get("units") else ""))
        elif t == "note":
            out.append(f"Note: {it['text']}" + (f" [{it['units']} units]" if it.get("units") else ""))
        elif t == "total":
            out.append(f"{it['text']}: {it['units']}")
    return "\n".join(out)


def main():
    os.makedirs(RAG, exist_ok=True)
    courses = load("courses.json")
    programs = load("programs.json")
    roadmaps = load("roadmaps.json")
    departments = load("departments.json")
    colleges = load("colleges.json")
    policies = load("policies.json")
    course_index = load("course_index.json")
    rules = load("academic_rules.json")["rules"]
    prog_names = {p["id"]: p["name"] for p in programs}
    dept_names = {d["id"]: d["name"] for d in departments}
    college_names = {c["id"]: c["name"] for c in colleges}

    ch = Chunks()

    # ------------------------------------------------------------ academic rules (highest-value facts)
    for r in rules:
        conflicts = "".join(f"\nConflicting bulletin text ({c['source_page']}): \"{c['quote']}\" — {c['note']}"
                            for c in r.get("conflicts", []))
        ch.add(f"rule:{r['id']}", "academic_rule", r["topic"],
               f"[{SRC}] Academic rule: {r['topic']} ({r['applies_to']} students)",
               f"{r['rule']}\nBulletin text: \"{r['quote']}\"{conflicts}\nSource: {r['source_page']} > {r['source_section']}",
               r["source_url"], {"category": r["category"], "applies_to": r["applies_to"], "values": r["values"],
                                 "has_conflict": bool(r.get("conflicts"))})

    # ------------------------------------------------------------ courses
    for c in courses:
        ch.add(f"course:{c['code']}", "course", f"{c['code']} {c['title']}",
               f"[{SRC}] Course {c['code']}: {c['title']}", course_text(c, prog_names), c["source_url"],
               {"course_code": c["code"], "subject": c["subject"], "level": c["level"], "units": c["units"],
                "units_min": c["units_min"], "units_max": c["units_max"], "ge_areas": c["ge_areas"],
                "sf_state_studies": c["sf_state_studies"], "satisfies_gwar": c.get("satisfies_gwar"),
                "prerequisite_courses": c["prerequisite_courses"]})

    # ------------------------------------------------------------ course index per subject
    for s in course_index:
        body = f"Subject {s['subject_name']} ({s['subject_code']}) has {s['course_count']} courses:\n" + "\n".join(
            f"- {c['code']}: {c['title']} ({c['units']} units, {c['level']})" for c in s["courses"])
        ch.add(f"subject:{s['subject_code']}", "subject_index", f"{s['subject_name']} ({s['subject_code']}) courses",
               f"[{SRC}] Course index for subject {s['subject_code']}", body, s["url"],
               {"subject": s["subject_code"], "subject_name": s["subject_name"]})

    # ------------------------------------------------------------ programs
    rm_by_url = {r["url"]: r for r in roadmaps}
    for p in programs:
        meta = {"program_id": p["id"], "program_name": p["name"], "degree": p["degree"],
                "award_type": p["award_type"], "level": p["level"], "concentration": p["concentration"],
                "field": p["field"], "college": p["college"], "department": p["department"],
                "status": p["status"], "total_units": p["total_units"]}
        parts = [f"Program: {p['name']}", p["degree"], college_names.get(p["college"], p["college"]),
                 ("Department: " + dept_names.get(p["department"], p["department"])) if p["department"] else None]
        ctx = f"[{SRC}] " + " | ".join(x for x in parts if x)
        if p["status"] != "Active":
            ctx += f"\nSTATUS: {p['status'].upper()}. This program is not accepting new students."
        summary = [f"{p['name']}",
                   f"Award: {p['degree']} ({p['award_type']}, {p['level']})",
                   f"Status: {p['status']}"]
        if p["concentration"]:
            summary.append(f"Concentration: {p['concentration']}")
        if p["total_units"]:
            summary.append(f"Total units in the program/major: {p['total_units']}")
        summary.append(f"College: {college_names.get(p['college'], p['college'])}")
        if p["department"]:
            summary.append(f"Department: {dept_names.get(p['department'], p['department'])}")
        if p["requirements"]:
            summary.append("Requirement areas:")
            for b in p["requirements"]:
                hp = " > ".join(b["heading_path"][1:] or b["heading_path"]) or "Requirements"
                summary.append(f"- {hp}" + (f" ({b['units']} units)" if b["units"] else ""))
        if p["roadmap_urls"]:
            summary.append("Roadmaps (suggested semester-by-semester plans):")
            for u in p["roadmap_urls"]:
                r = rm_by_url.get(u)
                summary.append(f"- {r['title'] if r else u} ({r['roadmap_type'] if r else ''}) {u}")
        if p["required_or_listed_courses"]:
            summary.append("All courses named in the requirements: " + ", ".join(p["required_or_listed_courses"]))
        ch.add(f"program:{p['id']}:summary", "program_summary", p["name"], ctx, "\n".join(summary), p["url"], meta)

        for i, b in enumerate(p["requirements"]):
            hp = " > ".join(b["heading_path"]) or "Requirements"
            body = [f"{p['name']} — requirement: {hp}"]
            if b["units"]:
                body.append(f"Units for this requirement: {b['units']}")
            body += b["notes"]
            body.append(item_lines(b["items"]))
            body += b.get("notes_after", [])
            ch.add(f"program:{p['id']}:req{i + 1}", "program_requirement", f"{p['name']} — {hp}", ctx,
                   "\n".join(x for x in body if x), p["url"], dict(meta, heading_path=b["heading_path"],
                                                                   courses=b["courses"]))
        if not p["requirements"] and p["requirements_text"]:
            ch.add(f"program:{p['id']}:reqtext", "program_requirement", f"{p['name']} — requirements", ctx,
                   p["requirements_text"], p["url"], meta)
        for t in p["tabs"]:
            if t["tab"] in p["requirement_tabs"]:
                # requirement prose that isn't a course list (notes, learning outcomes) still matters
                for j, s in enumerate(t["sections"]):
                    if "- " in s["text"] and "|" in s["text"]:
                        continue  # course-list text already covered by structured chunks
                    hp = " > ".join(s["heading_path"]) or t["tab"]
                    ch.add(f"program:{p['id']}:{t['tab']}:{j}", "program_section", f"{p['name']} — {hp}", ctx,
                           f"{t['tab']} > {hp}\n{s['text']}", p["url"], dict(meta, tab=t["tab"]))
                continue
            for j, s in enumerate(t["sections"]):
                hp = " > ".join(s["heading_path"]) or t["tab"]
                ch.add(f"program:{p['id']}:{t['tab']}:{j}", "program_section", f"{p['name']} — {t['tab']}: {hp}",
                       ctx, f"{t['tab']} > {hp}\n{s['text']}", p["url"], dict(meta, tab=t["tab"]))

    # ------------------------------------------------------------ roadmaps
    for r in roadmaps:
        ctx = (f"[{SRC}] Roadmap (suggested plan of study): {r['title']}"
               f"{' | Program: ' + r['program_name'] if r.get('program_name') else ''} | Type: {r['roadmap_type']}")
        body = []
        if r["intro"]:
            body.append(r["intro"])
        body.append(r["markdown"])
        ch.add(f"roadmap:{r['id']}", "roadmap", r["title"], ctx, "\n\n".join(body), r["url"],
               {"roadmap_id": r["id"], "program_id": r.get("program_id"), "roadmap_type": r["roadmap_type"],
                "courses": r["courses"]})

    # ------------------------------------------------------------ departments & colleges
    for d in departments:
        ctx = f"[{SRC}] Department: {d['name']} | {college_names.get(d['college'], d['college'])}"
        for t in d["tabs"]:
            for j, s in enumerate(t["sections"]):
                hp = " > ".join(s["heading_path"]) or t["tab"]
                ch.add(f"department:{d['id']}:{t['tab']}:{j}", "department", f"{d['name']} — {t['tab']}: {hp}", ctx,
                       f"{t['tab']} > {hp}\n{s['text']}", d["url"],
                       {"department": d["id"], "college": d["college"], "tab": t["tab"], "subjects": d["subjects"]})
        if d["programs"]:
            ch.add(f"department:{d['id']}:programs", "department", f"{d['name']} — programs offered", ctx,
                   "Programs offered:\n" + "\n".join(f"- {prog_names.get(x, x)}" for x in d["programs"]), d["url"],
                   {"department": d["id"], "college": d["college"]})
    for c in colleges:
        ctx = f"[{SRC}] College: {c['name']}"
        for t in c["tabs"]:
            for j, s in enumerate(t["sections"]):
                hp = " > ".join(s["heading_path"]) or t["tab"]
                ch.add(f"college:{c['id']}:{t['tab']}:{j}", "college", f"{c['name']} — {t['tab']}: {hp}", ctx,
                       f"{t['tab']} > {hp}\n{s['text']}", c["url"], {"college": c["id"], "tab": t["tab"]})

    # ------------------------------------------------------------ policies and general university info
    for pg in policies:
        if pg.get("duplicate_of") or pg.get("empty"):
            continue
        kind = "faculty_directory" if pg["category"] == "faculty" else "policy"
        ctx = f"[{SRC}] {pg['title']} ({pg['category'].replace('-', ' ')})"
        for t in pg["tabs"]:
            for j, s in enumerate(t["sections"]):
                hp = " > ".join(s["heading_path"]) or t["tab"]
                label = hp if t["tab"] == "Overview" else f"{t['tab']} > {hp}"
                items = re.split(r"\n(?=- \*\*)", s["text"])
                if len(s["text"]) > 1500 and len(items) >= 4:
                    # long lists of labelled rules (e.g. "**Double Major** ...") become one chunk per label
                    for k, item in enumerate(items):
                        m = re.match(r"- \*\*(.+?)\*\*", item)
                        sub = f"{label} > {m.group(1).strip()}" if m else label
                        ch.add(f"policy:{pg['id']}:{t['tab']}:{j}.{k}", kind, f"{pg['title']} — {sub}", ctx,
                               f"{pg['title']} > {sub}\n{item}", pg["url"],
                               {"page_id": pg["id"], "category": pg["category"], "heading_path": s["heading_path"]})
                    continue
                ch.add(f"policy:{pg['id']}:{t['tab']}:{j}", kind, f"{pg['title']} — {label}", ctx,
                       f"{pg['title']} > {label}\n{s['text']}", pg["url"],
                       {"page_id": pg["id"], "category": pg["category"], "heading_path": s["heading_path"]})

    with open(os.path.join(RAG, "chunks.jsonl"), "w") as f:
        for it in ch.items:
            f.write(json.dumps(it, ensure_ascii=False) + "\n")

    # ------------------------------------------------------------ fast lookup indexes
    lookup = {
        "courses": {c["code"]: {"title": c["title"], "units": c["units"], "level": c["level"],
                                "prerequisite_courses": c["prerequisite_courses"], "ge_areas": c["ge_areas"],
                                "url": c["source_url"]} for c in courses},
        "former_codes": {f: c["code"] for c in courses for f in c.get("former_codes", [])},
        "programs": {p["id"]: {"name": p["name"], "degree": p["degree"], "award_type": p["award_type"],
                               "level": p["level"], "total_units": p["total_units"], "status": p["status"],
                               "concentration": p["concentration"], "url": p["url"],
                               "roadmaps": p["roadmap_urls"]} for p in programs},
        "program_names": {name: sorted(p["id"] for p in programs if p["name"].lower() == name)
                          for name in {p["name"].lower() for p in programs}},
        "subjects": {s["subject_code"]: s["subject_name"] for s in course_index},
        "policies": {pg["id"]: {"title": pg["title"], "url": pg["url"]} for pg in policies},
        "rules": {r["id"]: r["rule"] for r in rules},
    }
    with open(os.path.join(DATA, "lookup.json"), "w") as f:
        json.dump(lookup, f, ensure_ascii=False, indent=1)

    counts = collections.Counter(it["type"] for it in ch.items)
    sizes = [len(it["text"]) for it in ch.items]
    print(json.dumps({"chunks": len(ch.items), "by_type": counts, "max_chars": max(sizes),
                      "avg_chars": sum(sizes) // len(sizes)}, indent=1))


if __name__ == "__main__":
    main()
