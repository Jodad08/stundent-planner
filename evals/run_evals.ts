// npm run evals -> evals/results.json (EVALS.md). Every score comes from the rules engine.
import { readFileSync, writeFileSync } from "node:fs"
try { process.loadEnvFile() } catch { /* mock mode */ }
const { careers, dag, policies, repoRoot } = await import("../shared/data")
const E = await import("../shared/engine")
const { buildFallbackPlan } = await import("../shared/fallbackPlanner")
const { directionScores } = await import("../shared/directionScores")
const { generatePlan } = await import("../server/routes/plan")
const { providerName } = await import("../server/gemini")
const P = await import("../server/prompts")
import type { CourseId, IssueCode, Plan, StudentProfile } from "../shared/types"

const CALC: StudentProfile = { placement: { calculus: true } }
const clone = (p: Plan): Plan => JSON.parse(JSON.stringify(p))
const move = (p: Plan, id: CourseId, to: number) => { const q = clone(p); q.semesters.forEach(s => { s.courseIds = s.courseIds.filter(c => c !== id) }); q.semesters[to - 1].courseIds.push(id); return q }
const drop = (p: Plan, id: CourseId) => { const q = clone(p); q.semesters.forEach(s => { s.courseIds = s.courseIds.filter(c => c !== id) }); return q }
const add = (p: Plan, id: CourseId, to: number) => { const q = clone(p); q.semesters[to - 1].courseIds.push(id); return q }
const codesOf = (p: Plan, prof = CALC) => [...new Set(E.evaluatePlan(p, dag, policies, prof).issues.filter(i => i.severity !== "info").map(i => i.code))].sort()

// ---------------------------------------------------------------- fixtures
const valid = buildFallbackPlan(dag, { trackId: "ai", unitsPerSemester: 15, profile: CALC, name: "Valid fixture (engine plan, AI & Data)" })
const broken = move(valid, "CSC 340", 3)
writeFileSync(repoRoot + "shared/fixtures/validPlan.json", JSON.stringify(valid, null, 1))
writeFileSync(repoRoot + "shared/fixtures/brokenPlan.json", JSON.stringify({ ...broken, name: "Broken fixture: CSC 340 beside its prerequisites",
  expectedIssueCodes: ["PREREQ_ORDER", "UNITS_HEAVY"] }, null, 1))

// ---------------------------------------------------------------- seeded-error suite
const seeded: { name: string; plan: Plan; expected: IssueCode[] }[] = [
  { name: "CSC 340 in the same semester as CSC 220/230", plan: broken, expected: ["PREREQ_ORDER", "UNITS_HEAVY"] },
  // 3 fewer units also leaves a senior-standing course below 90 cumulative units
  { name: "CSC 220 removed", plan: drop(valid, "CSC 220"), expected: ["PREREQ_MISSING", "REQ_GROUP_INCOMPLETE", "STANDING_TOO_LOW", "TOTAL_UNITS_SHORT"] },
  { name: "PHYS 222 (coreq) a semester after PHYS 220", plan: move(valid, "PHYS 222", 3), expected: ["COREQ_ORDER", "UNITS_HEAVY"] },
  { name: "CSC 648 in Fall Year 2", plan: move(valid, "CSC 648", 3), expected: ["PREREQ_ORDER", "STANDING_TOO_LOW", "UNITS_HEAVY"] },
  { name: "CSC 101 planned twice", plan: add(valid, "CSC 101", 2), expected: ["DUPLICATE_COURSE", "UNITS_HEAVY"] },
  { name: "Invented course ID", plan: add(valid, "FAKE-101", 1), expected: ["UNKNOWN_COURSE"] },
  { name: "21 units in Fall Year 1", plan: add(add(valid, E.placeholderId(3, 98), 1), E.placeholderId(3, 99), 1), expected: ["UNITS_OVER"] },
  { name: "Last semester emptied", plan: (() => { const q = clone(valid); q.semesters[7].courseIds = []; return q })(), expected: ["TOTAL_UNITS_SHORT"] },
  { name: "One elective removed (CSC 665)", plan: drop(valid, "CSC 665"), expected: ["REQ_GROUP_INCOMPLETE", "TOTAL_UNITS_SHORT"] },
]
let tp = 0, fp = 0, fn = 0
const cases = seeded.map(c => {
  const got = codesOf(c.plan)
  tp += c.expected.filter(x => got.includes(x)).length
  fp += got.filter(x => !c.expected.includes(x as IssueCode)).length
  fn += c.expected.filter(x => !got.includes(x)).length
  return { name: c.name, expected: c.expected, got, pass: got.join() === [...c.expected].sort().join() }
})
const validFixtureErrors = E.evaluatePlan(valid, dag, policies, CALC).issues.filter(i => i.severity === "error").length

// ---------------------------------------------------------------- official roadmaps
type RoadmapItem = { codes: string[]; units: string; title: string }
const all = JSON.parse(readFileSync(repoRoot + "data/sfsu/roadmaps.json", "utf8"))
const roadmapList = (Array.isArray(all) ? all : all.roadmaps) as { id: string; title: string; url: string; plans: { terms: { items: RoadmapItem[] }[] }[] }[]
const csRoadmaps = roadmapList.filter(r => r.id.startsWith("science-engineering/computer-science/bs-computer-science/"))
function roadmapPlan(r: (typeof csRoadmaps)[number]): Plan {
  const semesters = E.emptySemesters()
  let n = 0
  r.plans[0].terms.slice(0, 8).forEach((t, i) => {
    for (const it of t.items) {
      const units = parseInt(it.units, 10)
      const known = it.codes.filter(c => dag.nodes[c])
      if (known.length && known.length === it.codes.length) semesters[i].courseIds.push(...known)
      else if (units > 0) semesters[i].courseIds.push(E.placeholderId(units, ++n)) // GE, "Major Electives", US History...
    }
  })
  return { id: "roadmap_" + r.id.split("/").pop(), name: r.title, programId: "bs-cs", goalText: "", createdAt: new Date(0).toISOString(), semesters, source: "roadmap" }
}
const roadmaps = csRoadmaps.filter(r => r.plans[0].terms.length >= 8).map(r => {
  const qr34 = /Category 3\/4/.test(r.title)
  const plan = roadmapPlan(r)
  const rep = E.evaluatePlan(plan, dag, policies, qr34 ? { placement: {} } : CALC)
  return { title: r.title, url: r.url, profile: qr34 ? "no calculus placement" : "calculus placement",
    errors: rep.issues.filter(i => i.severity === "error").map(i => i.message),
    warnings: rep.issues.filter(i => i.severity === "warning").length, warningMessages: rep.issues.filter(i => i.severity === "warning").map(i => i.message),
    graduationReady: rep.graduationReady, units: rep.totalUnitsPlanned, plan }
})
const skippedRoadmaps = csRoadmaps.filter(r => r.plans[0].terms.length < 8).map(r => ({ title: r.title,
  reason: "Transfer (ADT) roadmap: assumes 35 units already transferred; the engine's fresh-plan check does not model transfer credit (D-015)." }))

// ---------------------------------------------------------------- planner comparison
const lastSem = (p: Plan) => Math.max(0, ...p.semesters.filter(s => s.courseIds.some(c => !E.isPlaceholder(c))).map(s => s.index))
function row(variant: string, p: Plan, trackId: string, attempts: number | null, prof = CALC) {
  const rep = E.evaluatePlan(p, dag, policies, prof)
  return { variant, errors: rep.issues.filter(i => i.severity === "error").length,
    groupsSatisfied: rep.requirementStatus.filter(g => g.satisfied).length, groupsTotal: rep.requirementStatus.length,
    semesters: lastSem(p), units: rep.totalUnitsPlanned, graduationReady: rep.graduationReady,
    goalTrackScore: directionScores(p, careers).find(d => d.directionId === trackId)?.score ?? 0, attempts, source: p.source }
}
const empty: Plan = { ...clone(valid), id: "empty", name: "Empty", semesters: E.emptySemesters(), source: "manual" }
const official = roadmaps.find(r => /Category 1\/2/.test(r.title))!
const goals = [
  { goal: "Machine learning engineer", trackId: "ai" },
  { goal: "Cybersecurity analyst", trackId: "systems" },
  { goal: "Full-stack web developer", trackId: "web" },
]
const comparison = []
for (const g of goals) {
  const rows = [row("No-op (empty plan)", empty, g.trackId, null), row("SFSU official roadmap (QR 1/2)", official.plan, g.trackId, null),
    row("Deterministic engine planner", buildFallbackPlan(dag, { trackId: g.trackId, unitsPerSemester: 15, profile: CALC }), g.trackId, null)]
  try {
    const r = await generatePlan({ goalText: g.goal, programId: "bs-cs", unitsPerSemester: 15, lockedPlacements: [] })
    rows.push({ ...row(r.plan.source === "ai" ? `Gemini + engine repair (${providerName()})` : `Gemini failed → engine fallback (${providerName()})`, r.plan, g.trackId, r.attempts), runId: r.runId } as ReturnType<typeof row>)
  } catch (e) { console.warn("gemini row failed", e) }
  comparison.push({ ...g, rows })
  console.log(g.goal, rows.map(r => `${r.variant}: err=${r.errors} groups=${r.groupsSatisfied}/${r.groupsTotal} fit=${r.goalTrackScore} attempts=${r.attempts}`).join(" | "))
}

// ---------------------------------------------------------------- anti-vacuity
const emptyRow = row("empty", empty, "ai", null), detRow = row("det", valid, "ai", null)
const reversed = (() => { const q = clone(valid); const ids = q.semesters.map(s => s.courseIds).reverse(); q.semesters.forEach((s, i) => { s.courseIds = ids[i] }); return q })()
const san = E.sanitizeSemesters([{ index: 1, courseIds: ["CSC 101", "CSC 9999X", "FAKE-101"] }], dag)
const planPrompt = P.PLAN_SYSTEM + P.buildPlanUser(dag, policies, "x", 15, [])
const antiVacuity = [
  { check: "Empty plan scores worst (0 groups, not graduation-ready)", pass: emptyRow.groupsSatisfied === 0 && !emptyRow.graduationReady && detRow.groupsSatisfied > emptyRow.groupsSatisfied },
  { check: "Reversed semester order fails PREREQ_ORDER", pass: codesOf(reversed).includes("PREREQ_ORDER") },
  { check: "Invented course IDs from the model are dropped, not auto-corrected", pass: san.dropped.length === 2 && san.semesters[0].courseIds.join() === "CSC 101" },
  { check: "Valid fixture has zero errors and is graduation-ready", pass: validFixtureErrors === 0 && E.evaluatePlan(valid, dag, policies, CALC).graduationReady },
  { check: "Seeded-error recall is 1.0 (every planted mistake caught)", pass: fn === 0 },
  { check: "Scores and engine verdicts never appear in the plan-generation prompt", pass: !/score|graduationReady|directionScores/i.test(planPrompt) },
]

const results = { generated_at: new Date().toISOString(), provider: providerName(), model: process.env.GEMINI_MODEL ?? "mock",
  seeded: { cases, precision: tp / (tp + fp || 1), recall: tp / (tp + fn || 1), validFixtureErrors },
  roadmaps: roadmaps.map(({ plan: _p, ...r }) => r), skippedRoadmaps, comparison, antiVacuity }
writeFileSync(repoRoot + "evals/results.json", JSON.stringify(results, null, 1))
console.log("\nseeded:", cases.map(c => `${c.pass ? "PASS" : "FAIL"} ${c.name} got=${c.got}`).join("\n  "))
console.log("precision", results.seeded.precision.toFixed(2), "recall", results.seeded.recall.toFixed(2))
console.log("roadmaps:", roadmaps.map(r => `${r.title}: ${r.errors.length} errors ${r.warnings} warnings\n    ${[...r.errors, ...r.warningMessages].join("\n    ")}`).join("\n"))
console.log("anti-vacuity:", antiVacuity.map(a => `${a.pass ? "PASS" : "FAIL"} ${a.check}`).join("\n  "))
