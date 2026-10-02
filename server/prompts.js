// ALL model prompts and response schemas live in this file (architecture.md §10, D-020).
// The engine decides validity; these prompts only ask the model to propose and explain.

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    semesters: {
      type: "array",
      items: {
        type: "object",
        properties: { index: { type: "integer" }, courseIds: { type: "array", items: { type: "string" } } },
        required: ["index", "courseIds"],
      },
    },
    rationale: { type: "string" },
    electiveChoices: {
      type: "array",
      items: {
        type: "object",
        properties: { courseId: { type: "string" }, reason: { type: "string" } },
        required: ["courseId", "reason"],
      },
    },
  },
  required: ["semesters", "rationale", "electiveChoices"],
};

const EVALUATE_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    directionExplanation: { type: "string" },
    suggestions: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          remove: { type: ["string", "null"] },
          add: { type: "string" },
          semester: { type: "integer" },
          reason: { type: "string" },
        },
        required: ["remove", "add", "semester", "reason"],
      },
    },
  },
  required: ["summary", "directionExplanation", "suggestions"],
};

const PLAN_SYSTEM = `You are a degree planning assistant for San Francisco State University.
You receive the courses of one program with their prerequisites, the student's completed courses, unit rules, and a career goal.
Fill the student's remaining semesters.

Hard rules:
1. Use ONLY course IDs from the provided list. Never invent a course. Copy IDs exactly, including spaces.
2. A course may appear only once. Never place a course the student already completed.
3. Every prerequisite must be completed or placed in an EARLIER semester. A prerequisite marked "same term ok" may share the semester. A corequisite must be in the same semester.
4. Courses marked "upper-division standing" need {udStanding} or more units completed before that semester.
5. Each non-empty semester should have between {min} and {target} units; never more than {max}.
6. Every course in an "all" requirement group must appear unless already completed.
7. For unit groups, choose courses until the units are met. Prefer electives that match the goal.
8. Use the GE and ELECTIVE placeholder IDs to fill General Education and free-elective units.

Return ONLY JSON matching the schema. No extra text.`;

const REPAIR_SYSTEM = `You are fixing a degree plan that a rules engine rejected.
Keep everything that is valid. Change only what the listed problems require.
Use ONLY course IDs from the provided list. Never invent a course. Return ONLY JSON matching the schema.`;

const EVALUATE_SYSTEM = `You are an academic advisor assistant for San Francisco State University.
You receive a student's plan, the problems a rules engine already found, and career direction scores computed by code.

Do not recompute or contradict the rules engine. Treat it as correct.
Do not invent courses. Use only course IDs from the plan or the provided course list.

Write:
1. "summary": 2 to 3 plain sentences on the overall state of the plan.
2. "directionExplanation": 2 to 3 sentences on which career direction this plan points to and why, using the provided scores.
3. "suggestions": up to 3 swaps. Each has "remove" (course id or null), "add" (course id), "semester" (index), and "reason" (one sentence).

Use simple words. Be direct. If the plan is fine, say so.
Return ONLY JSON.`;

function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

function readablePrereq(expr) {
  if (!expr) return "none";
  if (typeof expr === "string") return expr;
  if (expr.and) return expr.and.map(readablePrereq).map(x => (x.includes(" or ") ? `(${x})` : x)).join(" and ");
  if (expr.or) return expr.or.map(readablePrereq).join(" or ");
  if (expr.course) return expr.course + (expr.concurrent ? " (same term ok)" : "");
  if (expr.coreq) return `${expr.coreq} (corequisite: same term)`;
  if (expr.placement) return `${expr.placement} placement`;
  if (expr.ge_area) return `a GE Area ${expr.ge_area} course`;
  return "?";
}

/** One compact line per course: id | name | units | prereqs | conditions | tags */
function courseLines(courses) {
  return courses.map(c => [c.id, c.name, `${c.units}u`, `prereq: ${readablePrereq(c.prereq)}`,
    c.conditions && c.conditions.length ? c.conditions.join("; ") : "", (c.tags || []).filter(t => !t.startsWith("ge:")).join(",")]
    .filter(Boolean).join(" | ")).join("\n");
}

/** ctx: {goalText, courses, groups, completed, semesters:[{index,label}], policies, lockedPlacements, unitsPerSemester} */
function planUser(ctx) {
  const groups = ctx.groups.map(g => g.type === "all"
    ? `- ${g.title} (all): ${g.courseIds.join(", ")}`
    : `- ${g.title} (${g.unitsRequired} units): choose from ${g.courseIds.join(", ")}${g.note ? `. ${g.note}` : ""}`).join("\n");
  return [
    `Career goal: ${ctx.goalText}`,
    `Semesters to fill (index: term): ${ctx.semesters.map(s => `${s.index}: ${s.label}`).join(", ")}`,
    `Target units per semester: ${ctx.unitsPerSemester}`,
    `Completed or in progress (do not place again): ${ctx.completed.join(", ") || "none"} (${ctx.completedUnits} units)`,
    ctx.lockedPlacements.length ? `Keep these placements: ${ctx.lockedPlacements.map(l => `${l.courseId} in ${l.semester}`).join(", ")}` : "",
    `Requirement groups:\n${groups}`,
    `Courses (id | name | units | prereq | conditions | tags):\n${courseLines(ctx.courses)}`,
    `CONTEXT_JSON ${JSON.stringify({ goalText: ctx.goalText, semesters: ctx.semesters, completed: ctx.completed, unitsPerSemester: ctx.unitsPerSemester })}`,
  ].filter(Boolean).join("\n\n");
}

function repairUser(ctx, previous, problems) {
  return [
    planUser(ctx),
    `Previous plan:\n${JSON.stringify(previous)}`,
    `Problems found by the rules engine (fix all of them):\n${problems.map(p => `- ${p.code}: ${p.message}`).join("\n")}`,
    `REPAIR_JSON ${JSON.stringify({ previous, problems })}`,
  ].join("\n\n");
}

function evaluateUser(e) {
  return [
    e.goalText ? `Student goal: ${e.goalText}` : "",
    `Plan by semester:\n${e.semesters.map(s => `${s.index} ${s.label}: ${s.courseIds.join(", ") || "(empty)"}`).join("\n")}`,
    `Rules engine problems:\n${e.problems.map(p => `- ${p.severity} ${p.code}: ${p.message}`).join("\n") || "none"}`,
    `Missing requirements:\n${e.missing.map(m => `- ${m}`).join("\n") || "none"}`,
    `Career direction scores (0-100, computed by code): ${e.scores.map(s => `${s.label} ${s.score}`).join(", ")}`,
    `Electives that could be swapped in: ${e.alternatives.join(", ")}`,
    `CONTEXT_JSON ${JSON.stringify({ scores: e.scores, problems: e.problems.length, graduationReady: e.graduationReady })}`,
  ].filter(Boolean).join("\n\n");
}

module.exports = {
  PLAN_SCHEMA, EVALUATE_SCHEMA, PLAN_SYSTEM, REPAIR_SYSTEM, EVALUATE_SYSTEM,
  fill, planUser, repairUser, evaluateUser, readablePrereq,
};
