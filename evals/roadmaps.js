// Convert the official CS roadmaps (data/sfsu/roadmaps.json) into the Plan contract (architecture.md §6)
// so evaluatePlan can check them. Roadmap rows without a course code become placeholders; the
// mapping is by the row title and is listed here so every choice is visible.
const fs = require("fs");
const path = require("path");
const P = require("../web/planner.js");

const ROOT = path.join(__dirname, "..");
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

// title pattern -> placeholder pool (taken in order); "take" rows expand to one id per pool entry
const GE_ROWS = [
  [/^GE Area 1: English Communication - Take Two/, ["GE-1B", "GE-1C"], 2],
  [/^GE Area 1A\b/, ["GE-1A"], 1],
  [/^GE Area 1: English Communication/, ["GE-1B", "GE-1C"], 1],
  [/^GE Area 2UD|^GE Area 5UD or 2UD/, ["GE-2UD-5UD"], 1],
  [/^GE Area 3UD/, ["GE-3UD"], 1],
  [/^GE Area 4UD/, ["GE-4UD"], 1],
  [/^GE Area 2\b/, ["GE-2"], 1],
  [/^GE Area 3:/, ["GE-3A", "GE-3B"], 1],
  [/^GE Area 4:/, ["GE-4-1", "GE-4-2"], 1],
  [/^GE Area 5A/, ["GE-5A"], 1],
  [/^GE Area 5B/, ["GE-5B"], 1],
  [/^GE Area 6/, ["GE-6"], 1],
];
// American Institutions and SF State Studies are not tracked by the engine (program.notTracked);
// their units count as free electives.
const FREE_ROW = /^(US History|US and California Government|University Elective|SF State Studies or University Elective)/;
const ELECTIVE_ROW = /^Major Electives? \(15 Units Total\)/;

// Transfer (ADT) students arrive with these done (roadmap intro text); lower-division GE is "all satisfied".
const ADT_DONE = ["MATH 225", "MATH 226", "MATH 227", "PHYS 220", "PHYS 222", "PHYS 230", "PHYS 232",
  "CSC 101", "CSC 215", "CSC 220", "CSC 230", "CSC 256",
  "GE-1A", "GE-1B", "GE-1C", "GE-3A", "GE-3B", "GE-4-1", "GE-4-2", "GE-5B", "GE-6"];
const ADT_TRANSFER_UNITS = 60;

function load() {
  const program = read("data/programs/bs-computer-science.json");
  const ids = new Set(program.officialRoadmaps.map(r => r.id));
  return read("data/sfsu/roadmaps.json").filter(r => ids.has(r.id));
}

/**
 * roadmapToPlan(roadmap, {catalog, program, policies, dag, direction, startTerm})
 * -> {plan, mapping: [{term, row, ids}], electiveSlots}
 * Major-elective slots are filled with the direction's electives, each in the first slot whose
 * prerequisites the roadmap already meets (checked by evaluatePlan), so the elective choice
 * cannot be what breaks the roadmap.
 */
function roadmapToPlan(roadmap, opts) {
  const { catalog, program, policies, dag, direction } = opts;
  const startTerm = opts.startTerm || { season: "Fall", year: 2026 };
  const cat = P.indexCatalog(catalog);
  const adt = /adt/i.test(roadmap.roadmap_type);
  const used = new Set(adt ? ADT_DONE : []);
  const freePool3 = program.requirementGroups.find(g => g.id === "free_electives").courseIds.filter(c => cat.get(c).units === 3);
  const freePool1 = program.requirementGroups.find(g => g.id === "free_electives").courseIds.filter(c => cat.get(c).units === 1);
  const takeFree = units => {
    const out = [];
    let left = units;
    while (left >= 3 && freePool3.length) { out.push(freePool3.shift()); left -= 3; }
    while (left >= 1 && freePool1.length) { out.push(freePool1.shift()); left -= 1; }
    return { ids: out, short: left };
  };
  const mapping = [];
  const slots = [];  // [{semIndex, count}]
  const terms = roadmap.plans[0].terms;
  const semesters = terms.map((t, i) => {
    const term = P.termAt(startTerm, i);
    const courseIds = [];
    t.items.forEach(item => {
      const units = Number(item.units);
      if (item.codes && item.codes.length) {
        if (!item.units) return;  // an option line under "Select One"; none in the CS roadmaps
        item.codes.forEach(c => { courseIds.push(c); used.add(c); });
        mapping.push({ term: t.term, row: item.codes.join(" & "), ids: item.codes });
        return;
      }
      if (!item.units) return;  // "or University Elective if ... met in transfer": an alternative, no units
      if (ELECTIVE_ROW.test(item.title)) {
        const n = Math.round(units / 3);
        slots.push({ semIndex: i, count: n });
        mapping.push({ term: t.term, row: item.title, ids: [`<${n} major electives>`] });
        return;
      }
      const ge = GE_ROWS.find(([re]) => re.test(item.title));
      if (ge) {
        const [, pool, take] = ge;
        const ids = pool.filter(p => !used.has(p)).slice(0, take);
        ids.forEach(p => { courseIds.push(p); used.add(p); });
        mapping.push({ term: t.term, row: item.title, ids });
        return;
      }
      if (FREE_ROW.test(item.title)) {
        const { ids, short } = takeFree(units);
        ids.forEach(p => { courseIds.push(p); used.add(p); });
        mapping.push({ term: t.term, row: item.title, ids, short: short || undefined });
        return;
      }
      mapping.push({ term: t.term, row: item.title, ids: [], unmapped: true });
    });
    return { index: i + 1, label: term.label, season: term.season.toLowerCase(), courseIds };
  });
  while (semesters.length < 8) {
    const term = P.termAt(startTerm, semesters.length);
    semesters.push({ index: semesters.length + 1, label: term.label, season: term.season.toLowerCase(), courseIds: [] });
  }
  const plan = {
    id: "roadmap_" + roadmap.id.split("/").pop(), name: roadmap.title, programId: program.id, goalText: "",
    createdAt: "2026-10-02T00:00:00Z", startTerm, semesters,
    completedCourseIds: adt ? ADT_DONE.slice() : [], completedUnits: adt ? ADT_TRANSFER_UNITS : 0,
    placement: /i-ii/.test(roadmap.id) ? { calculus: true } : {}, source: "manual", electiveChoices: [],
  };
  // fill elective slots
  const group = program.requirementGroups.find(g => g.id === "electives");
  const ranked = [...new Set([...P.directionElectives(dag, catalog, direction), ...group.courseIds])]
    .filter(c => !(group.excludedCourseIds || []).includes(c) && !used.has(c) && cat.has(c));
  for (const slot of slots) {
    for (let k = 0; k < slot.count; k++) {
      const pick = ranked.find(c => {
        if (used.has(c)) return false;
        const sem = plan.semesters[slot.semIndex].courseIds;
        sem.push(c);
        const r = P.evaluatePlan(plan, catalog, program, policies);
        sem.pop();
        return !r.issues.some(x => x.courseIds[0] === c && /^(PREREQ|COREQ|STANDING)/.test(x.code));
      });
      if (!pick) continue;
      plan.semesters[slot.semIndex].courseIds.push(pick);
      used.add(pick);
      plan.electiveChoices.push({ courseId: pick, reason: `Roadmap major-elective slot; fits ${direction.label}` });
    }
  }
  return { plan, mapping };
}

module.exports = { load, roadmapToPlan, ADT_DONE, ADT_TRANSFER_UNITS };
