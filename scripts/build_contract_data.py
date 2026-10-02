"""Derive the architecture.md contract files from data/sfsu/ (D-010, D-011). Never hand-type values."""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, "data")
rules = {r["id"]: r for r in json.load(open(os.path.join(D, "sfsu", "academic_rules.json")))["rules"]}
dag = json.load(open(os.path.join(D, "sfsu", "dags", "bs-computer-science.json")))


def policy(rule_id, value, label):
    r = rules[rule_id]
    # verified: the rule's verbatim quote is machine-checked against the page by scraper/build_rules.py
    return {"value": value, "label": label, "ruleId": rule_id, "quote": r["quote"],
            "sourceUrl": r["source_url"], "verified": True}


policies = {
    "minUnitsFullTime": policy("fa_enrollment_status", rules["fa_enrollment_status"]["values"]["full_time"],
                               "Full time (financial aid)"),
    "heavyLoadUnits": policy("normal_load", rules["normal_load"]["values"]["undergraduate"]["fall_spring"][1],
                             "Top of the normal load"),
    "maxUnitsWithoutPermission": policy("ug_max_units_priority_registration",
                                        rules["ug_max_units_priority_registration"]["values"]["max_units"],
                                        "Priority-registration maximum"),
}
json.dump(policies, open(os.path.join(D, "policies.json"), "w"), indent=2)

careers = {"source": "data/sfsu/dags/bs-computer-science.json#tracks", "directions": [
    {"id": tid, "label": t["label"], "signalTags": [], "signalCourseIds": t["courses"],
     "description": f"Electives grouped under the '{t['label']}' track in the CS prerequisite DAG."}
    for tid, t in dag["tracks"].items()]}
missing = [c for d in careers["directions"] for c in d["signalCourseIds"] if c not in dag["nodes"]]
assert not missing, f"track courses not in DAG: {missing}"
json.dump(careers, open(os.path.join(D, "career_tags.json"), "w"), indent=2)
print("policies:", {k: v["value"] for k, v in policies.items()}, "| directions:", [d["id"] for d in careers["directions"]])
