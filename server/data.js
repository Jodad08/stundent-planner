// Loads the contract data files once (architecture.md §8). Read-only.
const fs = require("fs");
const path = require("path");
const Planner = require("../web/planner.js");

const ROOT = path.join(__dirname, "..");
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

const catalog = read("data/catalog.json");
const catalogById = Planner.indexCatalog(catalog);
const programs = { "bs-cs": read("data/programs/bs-computer-science.json") };
const dags = { "bs-cs": read("data/sfsu/dags/bs-computer-science.json") };
const policies = read("data/policies.json");
const careerTags = read("data/career_tags.json");

/** Courses a plan for this program can use: requirement-group courses and placeholders. */
function programCourseIds(programId) {
  const prog = programs[programId];
  const ids = new Set(prog.requirementGroups.flatMap(g => g.courseIds));
  // prerequisites outside the groups that a plan may need (e.g. MATH 199 without calculus placement)
  Object.keys(dags[programId].nodes).forEach(c => ids.add(c));
  return [...ids].filter(c => catalogById.has(c));
}

module.exports = { catalog, catalogById, programs, dags, policies, careerTags, programCourseIds, ROOT };
