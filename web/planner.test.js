// Engine tests: node --test web/
// Pins today's planner outputs and covers plan.md §9.3 (prereq order, OR/AND groups, unit boundaries,
// requirement groups) plus concurrency, coreqs, GE-area prerequisites and standing.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const P = require("./planner.js");

const root = path.join(__dirname, "..");
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const dag = read("data/sfsu/dags/bs-computer-science.json");
const catalog = read("data/catalog.json");
const program = read("data/programs/bs-computer-science.json");
const policies = read("data/policies.json");
const career = read("data/career_tags.json");
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "data.js"), "utf8"), ctx);
const sample = ctx.window.SAMPLE_TRANSCRIPT;
const sampleProfile = () => ({
  courses: JSON.parse(JSON.stringify(sample.courses)), placement: sample.placement,
  unitsEarned: sample.courses.filter(r => r.grade !== "IP").reduce((t, r) => t + r.units, 0),
});
const POL = k => policies[k].value;

// a plan with given courses per semester, all prerequisites of the listed starting set already done
function planWith(semesters, completed, extra) {
  return Object.assign({
    id: "t", name: "t", programId: "bs-cs", goalText: "", createdAt: "2026-10-02T00:00:00Z",
    startTerm: { season: "Spring", year: 2027 },
    semesters: Array.from({ length: 8 }, (_, i) => ({
      index: i + 1, label: `Term ${i + 1}`, season: i % 2 ? "fall" : "spring", courseIds: semesters[i] || [] })),
    completedCourseIds: completed || [], placement: { calculus: true }, source: "manual",
  }, extra || {});
}
const codes = r => r.issues.map(x => x.code);
const issuesFor = (r, code, course) => r.issues.filter(x => x.code === code && (!course || x.courseIds[0] === course));

test("pinned: sample student plan and bottlenecks (systems track)", () => {
  const prof = sampleProfile();
  const electives = P.pickElectives(dag, prof, "systems");
  assert.deepEqual(electives, ["CSC 645", "CSC 652", "CSC 653", "CSC 651", "CSC 615"]);
  const { base, flags } = P.bottlenecks(dag, prof, { start: { season: "Spring", year: 2027 }, maxUnits: 15, electives });
  assert.equal(base.gradTerm.label, "Spring 2028");
  assert.deepEqual(base.terms.map(t => t.courses.slice().sort()), [
    ["CSC 300GW", "CSC 340", "CSC 413"], ["CSC 415", "CSC 510", "CSC 648"],
    ["CSC 615", "CSC 645", "CSC 651", "CSC 652", "CSC 653"]]);
  assert.deepEqual(flags.map(f => [f.code, f.term.label, f.delay]), [
    ["CSC 340", "Spring 2027", 1], ["CSC 413", "Spring 2027", 1], ["CSC 415", "Fall 2027", 1]]);
});

test("pinned: a spring-only CSC 415 costs two semesters", () => {
  const prof = sampleProfile();
  const electives = P.pickElectives(dag, prof, "systems");
  const { base, flags } = P.bottlenecks(dag, prof, { start: { season: "Spring", year: 2027 }, maxUnits: 15, electives,
    offerings: { "CSC 415": ["Spring"] } });
  assert.equal(base.gradTerm.label, "Fall 2028");
  assert.equal(flags.find(f => f.code === "CSC 415").delay, 2);
});

test("prerequisite earlier passes; same term, later, and absent fail", () => {
  const done = ["CSC 101", "CSC 215", "MATH 226", "MATH 227"];
  assert.equal(issuesFor(P.evaluatePlan(planWith([["CSC 230"], ["CSC 256"]], done), catalog, program, policies), "PREREQ_ORDER").length, 0);
  assert.equal(issuesFor(P.evaluatePlan(planWith([["CSC 230", "CSC 256"]], done), catalog, program, policies), "PREREQ_ORDER", "CSC 256").length, 1);
  assert.equal(issuesFor(P.evaluatePlan(planWith([["CSC 256"], ["CSC 230"]], done), catalog, program, policies), "PREREQ_ORDER", "CSC 256").length, 1);
  assert.equal(issuesFor(P.evaluatePlan(planWith([["CSC 256"]], done), catalog, program, policies), "PREREQ_MISSING", "CSC 256").length, 1);
});

test("OR group: either option passes", () => {
  // CSC 220 needs CSC 210 or CSC 215; CSC 210 is an external alternative counted when completed
  for (const opt of ["CSC 215", "CSC 210"]) {
    const r = P.evaluatePlan(planWith([["CSC 220"]], [opt]), catalog, program, policies);
    assert.equal(issuesFor(r, "PREREQ_MISSING", "CSC 220").length + issuesFor(r, "PREREQ_ORDER", "CSC 220").length, 0, opt);
    assert.equal(issuesFor(r, "UNKNOWN_COURSE").length, 0, "a completed retired course is not an unknown-course error");
  }
});

test("AND group: both parts needed", () => {
  const r = P.evaluatePlan(planWith([["CSC 340"]], ["CSC 220"]), catalog, program, policies);
  assert.match(issuesFor(r, "PREREQ_MISSING", "CSC 340")[0].message, /CSC 230/);
  const ok = P.evaluatePlan(planWith([["CSC 340"]], ["CSC 220", "CSC 230"]), catalog, program, policies);
  assert.equal(issuesFor(ok, "PREREQ_MISSING", "CSC 340").length, 0);
});

test("concurrent prerequisite may share the term; coreqs must", () => {
  const r = P.evaluatePlan(planWith([["CSC 230", "MATH 227"]], ["CSC 215", "MATH 226"]), catalog, program, policies);
  assert.equal(issuesFor(r, "PREREQ_ORDER", "CSC 230").length, 0);
  const pair = P.evaluatePlan(planWith([["PHYS 220", "PHYS 222"]], ["MATH 226"]), catalog, program, policies);
  assert.equal(issuesFor(pair, "COREQ_ORDER").length, 0);
  const split = P.evaluatePlan(planWith([["PHYS 220"], ["PHYS 222"]], ["MATH 226"]), catalog, program, policies);
  assert.equal(issuesFor(split, "COREQ_ORDER", "PHYS 220").length, 1);
  // "Concurrent enrollment in PHYS 220": the lab a term later is also wrong (D-025)
  assert.equal(issuesFor(split, "COREQ_ORDER", "PHYS 222").length, 1);
  // a lecture finished before the plan still counts (retaking only the lab)
  const retake = P.evaluatePlan(planWith([["PHYS 222"]], ["MATH 226", "PHYS 220"]), catalog, program, policies);
  assert.equal(issuesFor(retake, "COREQ_ORDER").length, 0);
});

test("placement: unknown is a note, an explicit no is an error", () => {
  const unknown = P.evaluatePlan(planWith([["MATH 226"]], [], { placement: {} }), catalog, program, policies);
  assert.equal(issuesFor(unknown, "PREREQ_MISSING", "MATH 226").length, 0);
  assert.equal(issuesFor(unknown, "PREREQ_NOTE", "MATH 226").length, 1);
  const no = P.evaluatePlan(planWith([["MATH 226"]], [], { placement: { calculus: false } }), catalog, program, policies);
  assert.equal(issuesFor(no, "PREREQ_MISSING", "MATH 226").length, 1);
  const yes = P.evaluatePlan(planWith([["MATH 226"]]), catalog, program, policies);
  assert.equal(issuesFor(yes, "PREREQ_MISSING", "MATH 226").length + issuesFor(yes, "PREREQ_NOTE", "MATH 226").length, 0);
});

test("unit-load boundaries come from policies.json", () => {
  const sizes = { under: POL("minUnitsFullTime") - 1, ok: POL("minUnitsFullTime"), okTop: POL("heavyLoadUnits"),
    heavy: POL("heavyLoadUnits") + 1, max: POL("maxUnitsWithoutPermission"), over: POL("maxUnitsWithoutPermission") + 1 };
  const ones = ["ELECTIVE-4", "PHYS 222", "PHYS 232"];  // 1 unit each
  const threes = ["GE-1A", "GE-1B", "GE-1C", "GE-3A", "GE-3B", "GE-4-1", "GE-5B", "ELECTIVE-1", "ELECTIVE-2", "ELECTIVE-3"];
  const build = n => { const out = threes.slice(0, Math.floor(n / 3)); if (n % 3) out.push(...ones.slice(0, n % 3)); return out; };
  const statusOf = n => {
    const ids = build(n);
    const units = ids.reduce((t, c) => t + catalog.find(x => x.id === c).units, 0);
    if (units !== n) return null;
    return P.evaluatePlan(planWith([ids]), catalog, program, policies).semesterStats[0].status;
  };
  const expect = { under: "under", ok: "ok", okTop: "ok", heavy: "heavy", max: "heavy", over: "over" };
  for (const [k, n] of Object.entries(sizes)) {
    const s = statusOf(n);
    assert.notEqual(s, null, `could not build a ${n}-unit semester`);
    assert.equal(s, expect[k], `${k} = ${n} units`);
  }
  assert.equal(P.evaluatePlan(planWith([[]]), catalog, program, policies).semesterStats[0].status, "empty");
});

test("duplicate and unknown courses are errors", () => {
  const notInCatalog = ["CSC", "999"].join(" ");  // intentionally not a real course: the engine must reject it
  assert.ok(!catalog.some(c => c.id === notInCatalog));
  const r = P.evaluatePlan(planWith([["CSC 101"], ["CSC 101", notInCatalog]]), catalog, program, policies);
  assert.ok(codes(r).includes("DUPLICATE_COURSE"));
  assert.ok(codes(r).includes("UNKNOWN_COURSE"));
});

test("upper-division GE needs Areas 1A, 1B, 1C and 2 first", () => {
  const bad = P.evaluatePlan(planWith([["GE-3UD"]]), catalog, program, policies);
  assert.ok(issuesFor(bad, "PREREQ_MISSING", "GE-3UD").length >= 1);
  const good = P.evaluatePlan(planWith([["GE-1A", "GE-1B", "GE-1C", "MATH 226"], ["GE-3UD"]]), catalog, program, policies);
  assert.equal(issuesFor(good, "PREREQ_MISSING", "GE-3UD").length + issuesFor(good, "PREREQ_ORDER", "GE-3UD").length, 0);
});

test("upper-division standing is checked against units before the term", () => {
  const r = P.evaluatePlan(planWith([["CSC 648"]], ["CSC 317", "CSC 413"], { completedUnits: 30 }), catalog, program, policies);
  assert.equal(issuesFor(r, "STANDING_NOT_MET", "CSC 648").length, 1);
  const ok = P.evaluatePlan(planWith([["CSC 648"]], ["CSC 317", "CSC 413"], { completedUnits: POL("upperDivisionStandingUnits") }), catalog, program, policies);
  assert.equal(issuesFor(ok, "STANDING_NOT_MET", "CSC 648").length, 0);
});

test("elective group needs 15 units with at least 12 in CSC", () => {
  const r = P.evaluatePlan(planWith([["MATH 400", "MATH 425", "CSC 665"]]), catalog, program, policies);
  const g = r.requirementStatus.find(x => x.groupId === "electives");
  assert.equal(g.satisfied, false);
});

test("goal electives keep the CSC-unit minimum and prefer no extra prerequisites", () => {
  const fresh = { courses: [], placement: { calculus: true }, unitsEarned: 0 };
  for (const d of career.directions) {
    const picked = P.pickElectives(dag, fresh, null, P.directionElectives(dag, catalog, d));
    assert.ok(P.electiveRuleCheck(dag, picked).ok, `${d.id}: ${picked.join(", ")}`);
  }
});

test("fallback plans are graduation-ready with no errors", () => {
  const fresh = P.buildFallbackPlan({ dag, catalog, program, policies, profile: { courses: [], placement: { calculus: true }, unitsEarned: 0 },
    startTerm: { season: "Fall", year: 2026 }, direction: career.directions.find(d => d.id === "ml-engineer") });
  const rf = P.evaluatePlan(fresh, catalog, program, policies);
  assert.equal(rf.issues.filter(x => x.severity === "error").length, 0, JSON.stringify(rf.issues.filter(x => x.severity === "error")));
  assert.equal(rf.graduationReady, true);
  assert.ok(!fresh.semesters.flatMap(s => s.courseIds).includes("MATH 199"), "calculus placement means no pre-calculus");
  for (const d of career.directions) {
    const p = P.buildFallbackPlan({ dag, catalog, program, policies, profile: { courses: [], placement: { calculus: true }, unitsEarned: 0 },
      startTerm: { season: "Fall", year: 2026 }, direction: d });
    const r = P.evaluatePlan(p, catalog, program, policies);
    assert.equal(r.graduationReady, true, `${d.id}: ${r.issues.filter(x => x.severity !== "info").map(x => x.message).join(" | ")}`);
  }
  const mid = P.buildFallbackPlan({ dag, catalog, program, policies, profile: sampleProfile(), startTerm: { season: "Spring", year: 2027 },
    direction: career.directions.find(d => d.id === "cybersecurity") });
  const rm = P.evaluatePlan(mid, catalog, program, policies);
  assert.equal(rm.graduationReady, true);
  assert.equal(mid.semesters.filter(s => s.courseIds.length).length, 3, "mid-degree student finishes in 3 terms");
});

test("direction scores rank the goal's direction first", () => {
  const plan = P.buildFallbackPlan({ dag, catalog, program, policies, profile: { courses: [], placement: { calculus: true }, unitsEarned: 0 },
    startTerm: { season: "Fall", year: 2026 }, direction: career.directions.find(d => d.id === "cybersecurity") });
  assert.equal(P.directionScores(plan, catalog, career)[0].directionId, "cybersecurity");
});

test("an empty plan is not graduation-ready (anti-vacuity)", () => {
  const r = P.evaluatePlan(planWith([]), catalog, program, policies);
  assert.equal(r.graduationReady, false);
  assert.ok(codes(r).includes("REQ_GROUP_INCOMPLETE") && codes(r).includes("TOTAL_UNITS_SHORT"));
});
