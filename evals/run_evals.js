// Evals (prompt.md B.6): seeded-error suite, official-roadmap check, planner comparison, anti-vacuity.
// Run: npm run evals. Writes evals/results.json and evals/report.md; exits 1 if a hard check fails.
// No network unless GEMINI_API_KEY and GEMINI_MODEL are set (then the Gemini variant also runs).
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RUNS_TMP = fs.mkdtempSync(path.join(require("os").tmpdir(), "gg-eval-runs-"));
process.env.RUNS_DIR = process.env.RUNS_DIR || RUNS_TMP;  // eval runs never mix into runs/
const P = require("../web/planner.js");
const D = require("../server/data.js");
const { aiPlan, matchDirection } = require("../server/aiPlan.js");
const { completeMock } = require("../server/mockModel.js");
const { scorePlan } = require("../server/runs.js");
const R = require("./roadmaps.js");

const catalog = D.catalog, policies = D.policies, career = D.careerTags;
const program = D.programs["bs-cs"], dag = D.dags["bs-cs"];
const dir = id => career.directions.find(d => d.id === id);
const evaluate = plan => P.evaluatePlan(plan, catalog, program, policies);
const clone = x => JSON.parse(JSON.stringify(x));
const errorsOf = r => r.issues.filter(x => x.severity === "error");
const failures = [];
const check = (ok, what) => { if (!ok) failures.push(what); return ok; };

// ------------------------------------------------------------------ fixtures
const roadmaps = R.load();
const officialFreshman = roadmaps.find(r => /roadmap-i-ii/.test(r.id));
const valid = R.roadmapToPlan(officialFreshman, { catalog, program, policies, dag, direction: dir("software-engineer") }).plan;

const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "web", "data.js"), "utf8"), ctx);
const sample = ctx.window.SAMPLE_TRANSCRIPT;  // made-up student (web/make_data.py)

// ------------------------------------------------------------------ 1. seeded-error suite
// Each mutation breaks the valid fixture (the official 4-year roadmap, Fall 2026 start) in one way.
// Expected issues are written by hand from the Bulletin prerequisites, not computed by the engine.
const where = (plan, c) => plan.semesters.find(s => s.courseIds.includes(c));
const remove = (plan, c) => { const s = where(plan, c); s.courseIds.splice(s.courseIds.indexOf(c), 1); return s.index; };
const put = (plan, c, idx) => plan.semesters[idx - 1].courseIds.push(c);
const swap = (plan, a, b) => { const ia = remove(plan, a), ib = remove(plan, b); put(plan, a, ib); put(plan, b, ia); };
const fakeId = ["CSC", "999"].join(" ");  // intentionally not a catalog course

const SEEDED = [
  { id: "S01", what: "CSC 340 moved into the term of its prerequisites CSC 220 and CSC 230",
    mutate: p => swap(p, "CSC 340", "GE-3A"), expect: [{ code: "PREREQ_ORDER", course: "CSC 340" }] },
  { id: "S02", what: "CSC 413 moved before CSC 317 (prereq: CSC 220 and CSC 317)",
    mutate: p => swap(p, "CSC 413", "CSC 317"), expect: [{ code: "PREREQ_ORDER", course: "CSC 413" }] },
  { id: "S03", what: "CSC 648 moved before CSC 413 (prereq: CSC 317 and CSC 413)",
    mutate: p => swap(p, "CSC 648", "GE-3B"), expect: [{ code: "PREREQ_ORDER", course: "CSC 648" }] },
  { id: "S04", what: "PHYS 222 lab split from PHYS 220 (corequisites of each other)",
    mutate: p => swap(p, "PHYS 222", "ELECTIVE-4"),
    expect: [{ code: "COREQ_ORDER", course: "PHYS 220" }, { code: "COREQ_ORDER", course: "PHYS 222" }] },
  { id: "S05", what: "CSC 101 placed twice",
    mutate: p => put(p, "CSC 101", 8),
    expect: [{ code: "DUPLICATE_COURSE", course: "CSC 101" }, { code: "UNITS_HEAVY", sem: 8 }] },
  { id: "S06", what: "a course already completed is planned again",
    mutate: p => { p.completedCourseIds.push("CSC 101"); }, expect: [{ code: "DUPLICATE_COURSE", course: "CSC 101" }] },
  { id: "S07", what: "an invented course ID",
    mutate: p => put(p, fakeId, 8), expect: [{ code: "UNKNOWN_COURSE", course: fakeId }] },
  { id: "S08", what: "term 8 merged into term 7 (28 units)",
    mutate: p => { p.semesters[6].courseIds.push(...p.semesters[7].courseIds); p.semesters[7].courseIds = []; },
    expect: [{ code: "UNITS_OVER", sem: 7 }] },
  { id: "S09", what: "two GE courses moved from term 6 to term 8 (9 and 19 units)",
    mutate: p => { remove(p, "GE-3UD"); remove(p, "GE-4UD"); put(p, "GE-3UD", 8); put(p, "GE-4UD", 8); },
    expect: [{ code: "UNITS_UNDER", sem: 6 }, { code: "UNITS_HEAVY", sem: 8 }] },
  { id: "S10", what: "required CSC 415 removed (CSC 615 and CSC 651 need it)",
    mutate: p => remove(p, "CSC 415"),
    expect: [{ code: "REQ_GROUP_INCOMPLETE", group: "advanced_computer_science_requirements" },
      { code: "PREREQ_MISSING", course: "CSC 615" }, { code: "PREREQ_MISSING", course: "CSC 651" },
      { code: "TOTAL_UNITS_SHORT" }] },
  { id: "S11", what: "required CSC 230 removed (CSC 256, CSC 340 and CSC 520 need it; 3 fewer units before CSC 300GW)",
    mutate: p => remove(p, "CSC 230"),
    expect: [{ code: "REQ_GROUP_INCOMPLETE", group: "core_computer_science_requirements" },
      { code: "PREREQ_MISSING", course: "CSC 256" }, { code: "PREREQ_MISSING", course: "CSC 340" },
      { code: "PREREQ_MISSING", course: "CSC 520" }, { code: "TOTAL_UNITS_SHORT" },
      // term 3 drops to 13 units, so only 59 units are done before CSC 300GW in term 5
      { code: "STANDING_NOT_MET", course: "CSC 300GW" }] },
  { id: "S12", what: "only 9 CSC elective units (CSC 520 -> MATH 425, CSC 600 -> free elective)",
    mutate: p => { const a = remove(p, "CSC 520"); put(p, "MATH 425", a); const b = remove(p, "CSC 600"); put(p, "ELECTIVE-5", b); },
    expect: [{ code: "REQ_GROUP_INCOMPLETE", group: "electives" }] },
  { id: "S13", what: "CSC 300GW in term 3 (31 units done; needs upper-division standing)",
    mutate: p => swap(p, "CSC 300GW", "GE-4-2"), expect: [{ code: "STANDING_NOT_MET", course: "CSC 300GW" }] },
  { id: "S14", what: "upper-division GE in term 1 (needs GE 1A, 1B, 1C and 2 first)",
    mutate: p => swap(p, "GE-3UD", "GE-4-1"), expect: [{ code: "PREREQ_ORDER", course: "GE-3UD" }] },
  { id: "S15", what: "MATH 226 without calculus placement or MATH 198/199",
    mutate: p => { p.placement = { calculus: false }; }, expect: [{ code: "PREREQ_MISSING", course: "MATH 226" }] },
];

const NOISE = new Set(["UNVERIFIED_DATA", "PREREQ_NOTE"]);  // info-level, present on every plan
const key = i => [i.code, i.courseIds[0] || "", i.semesterIndex || "", i.groupId || ""].join("|");
const matches = (e, i) => e.code === i.code && (!e.course || i.courseIds[0] === e.course) &&
  (!e.sem || i.semesterIndex === e.sem) && (!e.group || i.groupId === e.group);

function seededSuite(evaluator) {
  const base = evaluator(valid);
  const baseKeys = new Set(base.issues.map(key));
  const rows = SEEDED.map(s => {
    const plan = clone(valid);
    s.mutate(plan);
    const fresh = evaluator(plan).issues.filter(i => !NOISE.has(i.code) && !baseKeys.has(key(i)));
    const found = s.expect.filter(e => fresh.some(i => matches(e, i)));
    const extra = fresh.filter(i => !s.expect.some(e => matches(e, i)));
    return { id: s.id, what: s.what, expected: s.expect.length, found: found.length,
      missed: s.expect.filter(e => !found.includes(e)), extra: extra.map(i => `${i.code} ${i.courseIds[0] || "term " + (i.semesterIndex || "")}`.trim()) };
  });
  const tp = rows.reduce((t, r) => t + r.found, 0);
  const fn = rows.reduce((t, r) => t + r.missed.length, 0);
  const fp = rows.reduce((t, r) => t + r.extra.length, 0);
  return { baseErrors: errorsOf(base).length, baseWarnings: base.issues.filter(i => i.severity === "warning").map(i => `${i.code} term ${i.semesterIndex || "-"}`),
    rows, tp, fn, fp, precision: tp + fp ? tp / (tp + fp) : 0, recall: tp + fn ? tp / (tp + fn) : 0 };
}

// ------------------------------------------------------------------ 2. official roadmaps
function roadmapCheck() {
  return roadmaps.map(r => {
    const { plan, mapping } = R.roadmapToPlan(r, { catalog, program, policies, dag, direction: dir("software-engineer") });
    const rep = evaluate(plan);
    const byCode = {};
    rep.issues.filter(i => !NOISE.has(i.code)).forEach(i => { byCode[i.code] = (byCode[i.code] || 0) + 1; });
    return { id: r.id.split("/").pop(), title: r.title, url: r.url, type: r.roadmap_type,
      errors: errorsOf(rep).map(i => i.message), issueCounts: byCode,
      warnings: rep.issues.filter(i => i.severity === "warning").map(i => i.message),
      graduationReady: rep.graduationReady, totalUnits: plan.completedUnits + rep.totalUnitsPlanned,
      unmapped: mapping.filter(m => m.unmapped || m.short).map(m => m.row), electives: plan.electiveChoices.map(e => e.courseId) };
  });
}

// ------------------------------------------------------------------ 3. planner comparison
const GOALS = [
  { text: "I want to be a backend software engineer at a startup", direction: "software-engineer" },
  { text: "Machine learning engineer working on AI models", direction: "ml-engineer" },
  { text: "Cybersecurity analyst, maybe penetration testing", direction: "cybersecurity" },
  { text: "Quant trading developer at a finance firm", direction: "quant" },
];
const PROFILES = [
  { id: "freshman", label: "New freshman, Fall 2026, calculus placement",
    start: { season: "Fall", year: 2026 }, profile: { courses: [], placement: { calculus: true } } },
  { id: "mid-degree", label: "Sample mid-degree student (made-up), Spring 2027",
    start: { season: "Spring", year: 2027 }, profile: { courses: sample.courses, placement: sample.placement } },
];

function emptyPlan(pr) {
  return { id: "empty", name: "No-op", programId: program.id, goalText: "", createdAt: "2026-10-02T00:00:00Z",
    startTerm: pr.start, source: "manual", placement: pr.profile.placement,
    completedCourseIds: pr.profile.courses.filter(r => r.grade === "IP" || P.passes(r.grade, null)).map(r => r.code).filter(c => D.catalogById.has(c)),
    completedUnits: pr.profile.courses.filter(r => r.grade === "IP" || P.passes(r.grade, null)).reduce((t, r) => t + (Number(r.units) || 0), 0),
    semesters: Array.from({ length: 8 }, (_, i) => { const t = P.termAt(pr.start, i); return { index: i + 1, label: t.label, season: t.season.toLowerCase(), courseIds: [] }; }) };
}

function score(plan, attempts, goal) {
  const rep = evaluate(plan);
  const ds = P.directionScores(plan, catalog, career);
  const s = scorePlan(plan, rep, ds, attempts);
  const goalScore = (ds.find(d => d.directionId === goal.direction) || {}).score;
  return Object.assign(s, { goalMatch: s.topDirection === goal.direction, goalScore });
}

async function viaModel(complete, goal, pr) {
  const out = await aiPlan({ goalText: goal.text, programId: "bs-cs", unitsPerSemester: policies.heavyLoadUnits.value,
    lockedPlacements: [], startTerm: pr.start, profile: pr.profile }, { completeJson: complete });
  return { plan: out.plan, attempts: out.attempts, source: out.source };
}

async function comparison() {
  const variants = [
    { id: "empty", label: "No-op (empty plan)", run: async (g, pr) => ({ plan: emptyPlan(pr), attempts: null }) },
    { id: "official", label: "Official roadmap (electives for the goal)", only: "freshman",
      run: async (g, pr) => ({ plan: R.roadmapToPlan(officialFreshman, { catalog, program, policies, dag, direction: dir(g.direction) }).plan, attempts: null }) },
    { id: "deterministic", label: "Deterministic planner",
      run: async (g, pr) => ({ plan: P.buildFallbackPlan({ dag, catalog, program, policies, profile: require("../server/aiPlan.js").normalizeProfile(pr.profile),
        startTerm: pr.start, direction: matchDirection(g.text), goalText: g.text }), attempts: null }) },
    { id: "mock", label: "Mock model after repair (deterministic stand-in, not AI)",
      run: (g, pr) => viaModel(async (s, u, o) => ({ json: await completeMock(s, u, o), provider: "mock", model: "mock", ms: 0 }), g, pr) },
  ];
  const geminiReady = process.env.GEMINI_API_KEY && process.env.GEMINI_MODEL;
  if (geminiReady) {
    process.env.AI_PROVIDER = "gemini";
    variants.push({ id: "gemini", label: `Gemini (${process.env.GEMINI_MODEL}) after repair`,
      run: (g, pr) => viaModel(require("../server/gemini.js").completeJson, g, pr) });
  }
  const rows = [];
  for (const pr of PROFILES) for (const g of GOALS) for (const v of variants) {
    if (v.only && v.only !== pr.id) continue;
    try {
      const out = await v.run(g, pr);
      rows.push(Object.assign({ profile: pr.id, goal: g.direction, variant: v.id, label: v.label, source: out.source || null },
        score(out.plan, out.attempts, g)));
    } catch (e) {
      rows.push({ profile: pr.id, goal: g.direction, variant: v.id, label: v.label, error: e.message });
    }
  }
  return { rows, gemini: geminiReady ? "ran" : "not run: GEMINI_API_KEY / GEMINI_MODEL not set" };
}

// ------------------------------------------------------------------ 4. anti-vacuity
async function antiVacuity(cmp) {
  const out = [];
  const add = (name, ok, detail) => { out.push({ name, ok, detail }); check(ok, `anti-vacuity: ${name}`); };
  for (const pr of PROFILES) for (const g of GOALS) {
    const rows = cmp.rows.filter(r => r.profile === pr.id && r.goal === g.direction && !r.error);
    const empty = rows.find(r => r.variant === "empty");
    const worst = rows.every(r => r === empty || (r.requirementGroupsSatisfied > empty.requirementGroupsSatisfied));
    add(`empty plan scores worst (${pr.id}, ${g.direction})`, !empty.graduationReady && worst,
      `empty satisfies ${empty.requirementGroupsSatisfied}/${empty.requirementGroups} groups; others ${rows.filter(r => r !== empty).map(r => r.requirementGroupsSatisfied).join(", ")}`);
  }
  const shuffled = clone(valid);
  shuffled.semesters.forEach((s, i) => { s.courseIds = valid.semesters[valid.semesters.length - 1 - i].courseIds.slice(); });
  const sr = evaluate(shuffled);
  const order = sr.issues.filter(i => i.code === "PREREQ_ORDER").length;
  add("reversed-order plan fails PREREQ_ORDER", order > 0 && !sr.graduationReady, `${order} PREREQ_ORDER errors`);

  let calls = 0;
  const inventing = async () => { calls++; return { json: { semesters: [{ index: 1, courseIds: ["CSC 101", fakeId] }], rationale: "x", electiveChoices: [] }, provider: "fake", model: "fake", ms: 0 }; };
  const inv = await viaModel(inventing, GOALS[0], PROFILES[0]);
  const placed = inv.plan.semesters.flatMap(s => s.courseIds);
  add("an invented course ID from the model is rejected", !placed.includes(fakeId) && inv.source === "fallback" && calls === 3,
    `${calls} model calls, final source ${inv.source}, invented ID placed: ${placed.includes(fakeId)}`);

  const passAll = () => ({ issues: [], requirementStatus: [], semesterStats: [], graduationReady: true, totalUnitsPlanned: 0 });
  const vac = seededSuite(passAll);
  add("a pass-everything evaluator scores recall 0 on the seeded suite", vac.recall === 0, `recall ${vac.recall}`);
  return out;
}

// ------------------------------------------------------------------ report
function pct(x) { return (100 * x).toFixed(0) + "%"; }

function report(res) {
  const L = [];
  L.push("# Eval results (generated by `npm run evals`; do not edit)", "");
  L.push(`Generated ${res.generatedAt}. Engine: \`web/planner.js\` \`evaluatePlan\`. Data: \`data/catalog.json\`, \`data/programs/bs-computer-science.json\`, \`data/policies.json\`.`, "");
  const s = res.seeded;
  L.push("## 1. Seeded-error suite", "");
  L.push(`Valid fixture: official roadmap "${officialFreshman.title}" with software-engineer electives. Errors on the valid fixture: **${s.baseErrors}**. Its warnings: ${s.baseWarnings.join("; ") || "none"}.`, "");
  L.push(`**Precision ${pct(s.precision)}, recall ${pct(s.recall)}** (${s.tp} expected issues found, ${s.fn} missed, ${s.fp} unexpected).`, "");
  L.push("| # | Seeded error | Expected | Found | Missed | Unexpected |", "|---|---|---|---|---|---|");
  s.rows.forEach(r => L.push(`| ${r.id} | ${r.what} | ${r.expected} | ${r.found} | ${r.missed.map(m => m.code + " " + (m.course || m.group || (m.sem ? "term " + m.sem : ""))).join(", ") || "-"} | ${r.extra.join(", ") || "-"} |`));
  L.push("", "## 2. Official CS roadmaps", "");
  L.push("| Roadmap | Type | Errors | Warnings | Graduation-ready | Units |", "|---|---|---|---|---|---|");
  res.roadmaps.forEach(r => L.push(`| [${r.id}](${r.url}) | ${r.type} | ${r.errors.length} | ${Object.entries(r.issueCounts).filter(([c]) => c !== "UNKNOWN_COURSE").map(([c, n]) => `${c} ×${n}`).join(", ") || "none"} | ${r.graduationReady ? "yes" : "no"} | ${r.totalUnits} |`));
  L.push("", "## 3. Planner comparison", "");
  L.push(`Gemini variant: ${res.comparison.gemini}.`, "");
  L.push("| Student | Goal | Planner | Errors | Warnings | Groups met | Semesters | Units | Goal match (score) | Repairs |", "|---|---|---|---|---|---|---|---|---|---|");
  res.comparison.rows.forEach(r => L.push(r.error ? `| ${r.profile} | ${r.goal} | ${r.label} | failed: ${r.error} |||||||` :
    `| ${r.profile} | ${r.goal} | ${r.label}${r.source ? ` → ${r.source}` : ""} | ${r.errors} | ${r.warnings} | ${r.requirementGroupsSatisfied}/${r.requirementGroups} | ${r.semestersToGraduate ?? "not ready"} | ${r.totalUnits} | ${r.goalMatch ? "yes" : "no"} (${r.goalScore}) | ${r.repairAttempts ?? "-"} |`));
  L.push("", "## 4. Anti-vacuity", "");
  res.antiVacuity.forEach(a => L.push(`- ${a.ok ? "PASS" : "FAIL"}: ${a.name} (${a.detail})`));
  L.push("", `## Verdict: ${res.failures.length ? "FAIL" : "PASS"}`, "");
  res.failures.forEach(f => L.push(`- ${f}`));
  return L.join("\n") + "\n";
}

async function main() {
  const seeded = seededSuite(evaluate);
  check(seeded.baseErrors === 0, "valid fixture has engine errors");
  check(seeded.recall === 1, `seeded recall ${seeded.recall}`);
  check(seeded.precision === 1, `seeded precision ${seeded.precision}`);
  const rm = roadmapCheck();
  rm.forEach(r => check(r.errors.length === 0 && r.graduationReady, `official roadmap ${r.id}: ${r.errors.length} errors`));
  const cmp = await comparison();
  cmp.rows.filter(r => r.variant === "deterministic").forEach(r => check(r.errors === 0 && r.graduationReady, `deterministic plan not valid (${r.profile}, ${r.goal})`));
  cmp.rows.filter(r => ["mock", "gemini"].includes(r.variant) && !r.error).forEach(r => check(r.errors === 0, `${r.variant} final plan has errors (${r.profile}, ${r.goal})`));
  const av = await antiVacuity(cmp);
  const res = { generatedAt: new Date().toISOString().slice(0, 10), seeded, roadmaps: rm, comparison: cmp, antiVacuity: av, failures };
  fs.writeFileSync(path.join(__dirname, "results.json"), JSON.stringify(res, null, 1) + "\n");
  const md = report(res);
  fs.writeFileSync(path.join(__dirname, "report.md"), md);
  process.stdout.write(md);
  fs.rmSync(RUNS_TMP, { recursive: true, force: true });
  process.exit(failures.length ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
