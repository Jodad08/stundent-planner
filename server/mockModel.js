// MOCK model provider: a deterministic stand-in used when no GEMINI_API_KEY is set (AI_PROVIDER=mock).
// It is NOT AI. It imitates a careless planner so the engine checks, repair loop and fallback get exercised:
// it ignores prerequisite order on the first try and only nudges flagged courses on repair.

function parseTag(user, tag) {
  const i = user.lastIndexOf(tag + " ");
  return i < 0 ? null : JSON.parse(user.slice(i + tag.length + 1).split("\n")[0]);
}

function coursesFromPrompt(user) {
  const block = user.split("Courses (id | name | units | prereq | conditions | tags):\n")[1] || "";
  return block.split("\n\n")[0].split("\n").filter(Boolean).map(line => {
    const parts = line.split(" | ");
    return { id: parts[0], name: parts[1], units: parseInt(parts[2], 10) || 0, tags: (parts[parts.length - 1] || "").split(",") };
  });
}

function groupsFromPrompt(user) {
  const block = (user.split("Requirement groups:\n")[1] || "").split("\n\n")[0];
  return block.split("\n").filter(Boolean).map(line => {
    const all = / \(all\): /.test(line);
    const units = (line.match(/\((\d+) units\)/) || [])[1];
    const ids = (line.split(all ? "(all): " : "choose from ")[1] || "").split(/\.\s/)[0].split(", ").map(x => x.trim()).filter(Boolean);
    return { all, units: units ? Number(units) : null, ids };
  });
}

function mockPlan(user) {
  const ctx = parseTag(user, "CONTEXT_JSON");
  const courses = coursesFromPrompt(user);
  const units = Object.fromEntries(courses.map(c => [c.id, c.units]));
  const words = (ctx.goalText || "").toLowerCase().split(/\W+/).filter(w => w.length > 2);
  const done = new Set(ctx.completed);
  const chosen = [];
  for (const g of groupsFromPrompt(user)) {
    const ids = g.ids.filter(id => !done.has(id));
    if (g.all) { chosen.push(...ids); continue; }
    // pick by crude keyword overlap with the goal, then by list order
    const score = id => { const c = courses.find(x => x.id === id); return c ? words.filter(w => (c.name + " " + c.tags.join(" ")).toLowerCase().includes(w)).length : 0; };
    let have = 0;
    for (const id of [...ids].sort((a, b) => score(b) - score(a))) {
      if (have >= g.units) break;
      chosen.push(id);
      have += units[id] || 0;
    }
  }
  // careless placement: course-number order, ignoring prerequisites
  const num = id => parseInt((id.match(/\d+/) || ["999"])[0], 10);
  chosen.sort((a, b) => num(a) - num(b));
  const semesters = ctx.semesters.map(s => ({ index: s.index, courseIds: [] }));
  let k = 0, load = 0;
  for (const id of chosen) {
    if (load + (units[id] || 0) > ctx.unitsPerSemester && k < semesters.length - 1) { k += 1; load = 0; }
    semesters[k].courseIds.push(id);
    load += units[id] || 0;
  }
  return { semesters, rationale: "MOCK: electives picked by keyword overlap with the goal; no real reasoning.",
    electiveChoices: [] };
}

function mockRepair(user) {
  const { previous, problems } = parseTag(user, "REPAIR_JSON");
  const plan = JSON.parse(JSON.stringify(previous));
  const n = plan.semesters.length;
  for (const p of problems) {
    if (!["PREREQ_ORDER", "COREQ_ORDER", "STANDING_NOT_MET"].includes(p.code) || !p.courseIds.length || !p.semesterIndex) continue;
    const c = p.courseIds[0];
    const from = plan.semesters.find(s => s.index === p.semesterIndex);
    if (!from || p.semesterIndex >= n || !from.courseIds.includes(c)) continue;
    from.courseIds = from.courseIds.filter(x => x !== c);
    plan.semesters.find(s => s.index === p.semesterIndex + 1).courseIds.push(c);
  }
  plan.rationale = "MOCK repair: moved each flagged course one semester later.";
  return plan;
}

function mockEvaluate(user) {
  const ctx = parseTag(user, "CONTEXT_JSON");
  const top = ctx.scores[0];
  return {
    summary: ctx.graduationReady ? "MOCK: The rules engine found no blocking problems." : `MOCK: The rules engine found ${ctx.problems} problem(s) to fix.`,
    directionExplanation: top ? `MOCK: The plan scores highest for ${top.label} (${top.score}/100).` : "MOCK: No direction scores.",
    suggestions: [],
  };
}

async function completeMock(system, user, { purpose }) {
  if (purpose === "plan") return mockPlan(user);
  if (purpose === "repair") return mockRepair(user);
  if (purpose === "evaluate") return mockEvaluate(user);
  throw new Error(`mock: unknown purpose ${purpose}`);
}

module.exports = { completeMock };
