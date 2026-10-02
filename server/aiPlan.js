// POST /api/plan pipeline: model proposes -> schema check -> unknown-ID rejection -> rules engine ->
// repair (max 2) -> deterministic fallback. The engine decides; the model only proposes (architecture.md §9).
const Planner = require("../web/planner.js");
const D = require("./data.js");
const prompts = require("./prompts.js");
const { validate } = require("./schema.js");

const MAX_REPAIRS = 2;
// warnings the model must also fix: a plan that retakes finished requirements or breaks standing is not acceptable (D-024)
const REPAIR_WARNINGS = new Set(["ALREADY_SATISFIED", "STANDING_NOT_MET"]);

function httpError(status, code, message) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  return e;
}

function termLabels(start, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = Planner.termAt(start, i);
    out.push({ index: i + 1, label: t.label, season: t.season.toLowerCase() });
  }
  return out;
}

function normalizeProfile(p) {
  const courses = Array.isArray(p && p.courses) ? p.courses.filter(r => r && typeof r.code === "string" && r.grade) : [];
  return {
    courses: courses.map(r => Object.assign({ units: D.catalogById.has(r.code) ? D.catalogById.get(r.code).units : 0 }, r)),
    placement: (p && p.placement) || {},
    unitsEarned: courses.filter(r => r.grade !== "IP" && Planner.passes(r.grade, null)).reduce((t, r) => t + Number(r.units || 0), 0),
  };
}

function validateRequest(req) {
  const P = k => D.policies[k].value;
  if (typeof req.goalText !== "string" || !req.goalText.trim() || req.goalText.length > 500) {
    throw httpError(400, "BAD_GOAL", "goalText must be 1 to 500 characters.");
  }
  if (!D.programs[req.programId]) throw httpError(400, "UNKNOWN_PROGRAM", `Unknown program "${req.programId}".`);
  if (!Number.isInteger(req.unitsPerSemester) || req.unitsPerSemester < P("minUnitsFullTime") ||
      req.unitsPerSemester > P("maxUnitsWithoutPermission")) {
    throw httpError(400, "BAD_UNITS", `unitsPerSemester must be a whole number from ${P("minUnitsFullTime")} to ${P("maxUnitsWithoutPermission")}.`);
  }
  const st = req.startTerm;
  if (!st || !["Fall", "Spring"].includes(st.season) || !Number.isInteger(st.year)) {
    throw httpError(400, "BAD_TERM", "startTerm must be {season: \"Fall\"|\"Spring\", year}.");
  }
  for (const l of req.lockedPlacements || []) {
    if (!D.catalogById.has(l.courseId)) throw httpError(400, "UNKNOWN_COURSE", `Unknown course "${l.courseId}".`);
    if (!Number.isInteger(l.semester) || l.semester < 1 || l.semester > 8) throw httpError(400, "BAD_SEMESTER", "Locked semester must be 1 to 8.");
  }
}

function buildContext(req) {
  const program = D.programs[req.programId];
  const dag = D.dags[req.programId];
  const profile = normalizeProfile(req.profile);
  const { passed, inProgress } = Planner.profileSets(dag, profile);
  const done = new Set([...passed, ...inProgress]);
  profile.courses.forEach(r => { if (r.include !== false && (r.grade === "IP" || Planner.passes(r.grade, null))) done.add(r.code); });
  const completed = [...done].filter(c => D.catalogById.has(c));
  const completedUnits = profile.courses.filter(r => r.include !== false && (r.grade === "IP" || Planner.passes(r.grade, null)))
    .reduce((t, r) => t + Number(r.units || 0), 0);
  const courses = D.programCourseIds(req.programId).filter(c => !done.has(c)).map(c => D.catalogById.get(c));
  return {
    program, dag, profile, startTerm: req.startTerm, semesters: termLabels(req.startTerm, 8), completed, completedUnits,
    courses, groups: program.requirementGroups, unitsPerSemester: req.unitsPerSemester,
    lockedPlacements: req.lockedPlacements || [], goalText: req.goalText.trim(),
  };
}

/** Match a free-text goal to a career direction by word overlap (code, not AI). */
function matchDirection(goalText) {
  const words = new Set(goalText.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 1));
  const synonyms = { ai: "ml", machine: "ml", learning: "ml", data: "data", security: "security", cyber: "security",
    hacker: "security", cybersecurity: "security", infosec: "security", penetration: "security", pentest: "security",
    pentesting: "security", game: "games", games: "games", graphics: "graphics", quant: "math", trading: "math",
    finance: "math", web: "web", frontend: "web", backend: "software-eng", software: "software-eng",
    research: "research", phd: "research", network: "networks", networking: "networks", systems: "systems",
    embedded: "systems", professor: "research" };
  const tokens = new Set([...words, ...[...words].map(w => synonyms[w]).filter(Boolean)]);
  let best = null;
  for (const d of D.careerTags.directions) {
    const vocab = new Set([...d.signalTags, ...(d.label + " " + d.description).toLowerCase().split(/[^a-z0-9]+/)]);
    const score = [...tokens].filter(t => vocab.has(t)).length;
    if (!best || score > best.score) best = { d, score };
  }
  return best && best.score > 0 ? best.d : D.careerTags.directions.find(d => d.id === "software-engineer");
}

function toPlan(json, ctx, source) {
  return {
    id: "plan_" + Math.abs(hash(JSON.stringify(json) + ctx.goalText)).toString(36),
    name: ctx.goalText.slice(0, 40),
    programId: ctx.program.id,
    goalText: ctx.goalText,
    createdAt: new Date().toISOString(),
    startTerm: ctx.startTerm,
    semesters: ctx.semesters.map(s => {
      const m = json.semesters.find(x => x.index === s.index);
      return Object.assign({}, s, { courseIds: m ? [...m.courseIds] : [] });
    }),
    completedCourseIds: ctx.completed,
    completedUnits: ctx.completedUnits,
    placement: ctx.profile.placement,
    source,
  };
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

async function aiPlan(req, deps = {}) {
  const complete = deps.completeJson || require("./gemini.js").completeJson;
  validateRequest(req);
  const ctx = buildContext(req);
  const P = k => D.policies[k].value;
  const vars = { min: P("minUnitsFullTime"), target: req.unitsPerSemester, max: P("maxUnitsWithoutPermission"),
    udStanding: P("upperDivisionStandingUnits") };
  const steps = [];
  let attempts = 0;
  let system = prompts.fill(prompts.PLAN_SYSTEM, vars);
  let user = prompts.planUser(ctx);
  let purpose = "plan";
  for (let round = 0; round <= MAX_REPAIRS; round++) {
    let res;
    try {
      res = await complete(system, user, { purpose, schema: prompts.PLAN_SCHEMA });
      attempts += 1;
    } catch (e) {
      steps.push({ step: purpose, ok: false, error: e.message });
      break;
    }
    const problems = validate(res.json, prompts.PLAN_SCHEMA).slice(0, 10).map(m => ({ code: "SCHEMA", message: m, courseIds: [] }));
    let plan = null, report = null;
    if (!problems.length) {
      const ids = res.json.semesters.flatMap(s => s.courseIds);
      const unknown = [...new Set(ids.filter(c => !D.catalogById.has(c)))];
      const badIndex = res.json.semesters.filter(s => s.index < 1 || s.index > 8).map(s => s.index);
      if (unknown.length) problems.push({ code: "UNKNOWN_COURSE", message: `Not in the catalog: ${unknown.join(", ")}. Use only listed IDs.`, courseIds: unknown });
      if (badIndex.length) problems.push({ code: "SCHEMA", message: `Semester index must be 1 to 8, got ${badIndex.join(", ")}.`, courseIds: [] });
      if (!problems.length) {
        plan = toPlan(res.json, ctx, "ai");
        ctx.lockedPlacements.forEach(l => {
          if (!plan.semesters[l.semester - 1].courseIds.includes(l.courseId)) {
            problems.push({ code: "LOCK_BROKEN", message: `${l.courseId} must stay in semester ${l.semester}.`, courseIds: [l.courseId], semesterIndex: l.semester });
          }
        });
        report = Planner.evaluatePlan(plan, D.catalog, ctx.program, D.policies);
        problems.push(...report.issues.filter(x => x.severity === "error" || REPAIR_WARNINGS.has(x.code)));
        report.requirementStatus.filter(r => !r.satisfied).forEach(r => problems.push({ code: "REQ_GROUP_INCOMPLETE",
          message: `${r.title}: ${r.missingCourseIds.length ? "missing " + r.missingCourseIds.join(", ") : `${r.unitsHave} of ${r.unitsNeed} units`}.`,
          courseIds: r.missingCourseIds }));
      }
    }
    steps.push({ step: purpose, ok: !problems.length, provider: res.provider, model: res.model, ms: res.ms,
      problems: problems.slice(0, 40).map(p => ({ code: p.code, message: p.message })),
      semesters: plan ? plan.semesters.map(s => s.courseIds) : null });
    if (!problems.length) {
      const placed = new Set(plan.semesters.flatMap(s => s.courseIds));
      return { plan, report, rationale: res.json.rationale, attempts, steps, source: "ai",
        electiveChoices: res.json.electiveChoices.filter(e => placed.has(e.courseId)) };
    }
    if (round === MAX_REPAIRS) break;
    system = prompts.REPAIR_SYSTEM;
    user = prompts.repairUser(ctx, res.json, problems.map(p => ({ code: p.code, message: p.message,
      courseIds: p.courseIds || [], semesterIndex: p.semesterIndex })));
    purpose = "repair";
  }
  const direction = matchDirection(ctx.goalText);
  const plan = Planner.buildFallbackPlan({ dag: ctx.dag, catalog: D.catalog, program: ctx.program, policies: D.policies,
    profile: ctx.profile, startTerm: ctx.startTerm, direction, maxUnits: req.unitsPerSemester, goalText: ctx.goalText,
    name: ctx.goalText.slice(0, 40), id: "plan_fallback_" + Math.abs(hash(ctx.goalText)).toString(36) });
  const report = Planner.evaluatePlan(plan, D.catalog, ctx.program, D.policies);
  steps.push({ step: "fallback", ok: !report.issues.some(x => x.severity === "error"), direction: direction.id,
    note: ctx.lockedPlacements.length ? "The deterministic planner does not apply locked placements." : undefined });
  return { plan, report, attempts, steps, source: "fallback", electiveChoices: plan.electiveChoices,
    rationale: `The model's plan still broke the rules after ${MAX_REPAIRS} repairs, so this plan comes from the deterministic planner, using the ${direction.label} direction.` };
}

module.exports = { aiPlan, matchDirection, validateRequest, buildContext, termLabels, normalizeProfile, httpError, MAX_REPAIRS };
