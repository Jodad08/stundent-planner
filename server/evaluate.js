// POST /api/evaluate pipeline: engine first (the truth), direction scores in code, then the model explains
// and suggests swaps; every suggestion is re-checked by the engine (architecture.md §9).
const Planner = require("../web/planner.js");
const D = require("./data.js");
const prompts = require("./prompts.js");
const { validate } = require("./schema.js");
const { httpError } = require("./aiPlan.js");

function validatePlan(plan) {
  if (!plan || !Array.isArray(plan.semesters) || plan.semesters.length !== 8) throw httpError(400, "BAD_PLAN", "plan must have 8 semesters.");
  if (!D.programs[plan.programId]) throw httpError(400, "UNKNOWN_PROGRAM", `Unknown program "${plan.programId}".`);
  plan.semesters.forEach((s, i) => {
    if (s.index !== i + 1 || !Array.isArray(s.courseIds)) throw httpError(400, "BAD_PLAN", "Semester indexes must be 1 to 8 with courseIds arrays.");
  });
}

async function evaluate(req, deps = {}) {
  const complete = deps.completeJson || require("./gemini.js").completeJson;
  const plan = req.plan;
  validatePlan(plan);
  const program = D.programs[plan.programId];
  const report = Planner.evaluatePlan(plan, D.catalog, program, D.policies);
  const directionScores = Planner.directionScores(plan, D.catalog, D.careerTags);
  const placed = new Set([...(plan.completedCourseIds || []), ...plan.semesters.flatMap(s => s.courseIds)]);
  const electiveGroup = program.requirementGroups.find(g => g.id === "electives");
  const alternatives = electiveGroup ? electiveGroup.courseIds.filter(c => !placed.has(c)) : [];
  const steps = [{ step: "engine", ok: !report.issues.some(x => x.severity === "error"),
    errors: report.issues.filter(x => x.severity === "error").length }];
  let ai = null, aiStatus = "skipped";
  try {
    const user = prompts.evaluateUser({
      goalText: req.goalText || plan.goalText, semesters: plan.semesters,
      problems: report.issues.filter(x => x.severity !== "info"),
      missing: report.requirementStatus.filter(r => !r.satisfied).map(r => `${r.title}: ${r.missingCourseIds.join(", ") || `${r.unitsHave}/${r.unitsNeed} units`}`),
      scores: directionScores.slice(0, 3), alternatives, graduationReady: report.graduationReady,
    });
    const res = await complete(prompts.EVALUATE_SYSTEM, user, { purpose: "evaluate", schema: prompts.EVALUATE_SCHEMA });
    const errs = validate(res.json, prompts.EVALUATE_SCHEMA);
    if (errs.length) throw new Error("model output failed the schema: " + errs.slice(0, 3).join("; "));
    const baseErrors = report.issues.filter(x => x.severity === "error").map(x => x.message);
    const kept = [], dropped = [];
    for (const sug of res.json.suggestions) {
      const known = D.catalogById.has(sug.add) && (sug.remove === null || placed.has(sug.remove));
      if (!known || sug.semester < 1 || sug.semester > 8) { dropped.push({ suggestion: sug, why: "unknown course or semester" }); continue; }
      const trial = JSON.parse(JSON.stringify(plan));
      trial.semesters.forEach(s => { s.courseIds = s.courseIds.filter(c => c !== sug.remove); });
      trial.semesters[sug.semester - 1].courseIds.push(sug.add);
      const r2 = Planner.evaluatePlan(trial, D.catalog, program, D.policies);
      const newErrors = r2.issues.filter(x => x.severity === "error" && !baseErrors.includes(x.message));
      if (newErrors.length) dropped.push({ suggestion: sug, why: newErrors.map(x => x.message).join(" ") });
      else kept.push(sug);
    }
    ai = { summary: res.json.summary, directionExplanation: res.json.directionExplanation, suggestions: kept };
    aiStatus = "ok";
    steps.push({ step: "evaluate", ok: true, provider: res.provider, model: res.model, ms: res.ms,
      suggestionsKept: kept.length, suggestionsDropped: dropped });
  } catch (e) {
    aiStatus = "failed";
    steps.push({ step: "evaluate", ok: false, error: e.message });
  }
  return { report, directionScores, ai, aiStatus, steps };
}

module.exports = { evaluate, validatePlan };
