import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { dag, policies } from "./data"
import { bottlenecks, criticalCourses, evaluatePlan, placeholderId, plan, semesterStatus, suggestSemester, uniqueCourses, nextCourses, emptySemesters, type Profile } from "./engine"
import { buildFallbackPlan } from "./fallbackPlanner"
import type { Plan } from "./types"
import transcript from "./fixtures/midDegreeTranscript.json"

// web/planner.js is UMD; package.json "type": "module" makes Node treat it as ESM, so load it as CommonJS by hand.
const legacyMod = { exports: {} as Record<string, Function> }
new Function("module", "exports", readFileSync(new URL("../web/planner.js", import.meta.url), "utf8"))(legacyMod, legacyMod.exports)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const legacy = legacyMod.exports as any
const fresh: Profile = { courses: [], placement: { calculus: true } }
const mid = transcript as Profile
const opts = { start: { season: "Fall" as const, year: 2026 }, maxUnits: 15 }
const norm = (r: ReturnType<typeof plan>) => JSON.parse(JSON.stringify({ ...r, have: [...r.have], passed: [...r.passed], inProgress: [...r.inProgress] },
  (_k, v) => (v === Infinity ? "inf" : v)))

const codes = (p: Plan, id: string) => evaluatePlan(p, dag, policies).issues.filter(i => i.code === id)
const clone = (p: Plan): Plan => JSON.parse(JSON.stringify(p))
const move = (p: Plan, id: string, to: number) => {
  const q = clone(p); q.semesters.forEach(s => { s.courseIds = s.courseIds.filter(c => c !== id) })
  q.semesters[to - 1].courseIds.push(id); return q
}
const valid = buildFallbackPlan(dag, { trackId: "ai", unitsPerSemester: 15, profile: { placement: { calculus: true } } })

describe("port pins web/planner.js behavior", () => {
  for (const [name, prof] of [["fresh", fresh], ["mid-degree", mid]] as const) {
    it(`plan() matches for ${name}`, () => {
      const electives = legacy.pickElectives(dag, prof, "ai")
      expect(electives).toEqual((legacy.pickElectives as typeof import("./engine").pickElectives)(dag, prof, "ai"))
      const a = norm(legacy.plan(dag, prof, { ...opts, electives }))
      const b = norm(plan(dag, prof, { ...opts, electives }))
      expect(b).toEqual(a)
    })
  }
  it("bottlenecks() matches", () => {
    const electives = legacy.pickElectives(dag, fresh, "systems")
    const a = legacy.bottlenecks(dag, fresh, { ...opts, electives }).flags
    const b = bottlenecks(dag, fresh, { ...opts, electives }).flags
    expect(JSON.parse(JSON.stringify(b))).toEqual(JSON.parse(JSON.stringify(a)))
  })
})

describe("evaluatePlan", () => {
  it("the deterministic plan is graduation-ready with no errors", () => {
    const r = evaluatePlan(valid, dag, policies)
    expect(r.issues.filter(i => i.severity === "error")).toEqual([])
    expect(r.graduationReady).toBe(true)
  })
  it("prereq in an earlier semester passes, same semester fails, later fails, absent fails", () => {
    // CSC 340 needs CSC 220 and CSC 230 (both semester 3 in the fixture)
    const base = move(valid, "CSC 340", 4)
    expect(codes(base, "PREREQ_ORDER").filter(i => i.courseIds[0] === "CSC 340")).toHaveLength(0)
    expect(codes(move(base, "CSC 340", 3), "PREREQ_ORDER").some(i => i.courseIds[0] === "CSC 340")).toBe(true)
    expect(codes(move(base, "CSC 340", 2), "PREREQ_ORDER").some(i => i.courseIds[0] === "CSC 340")).toBe(true)
    const absent = clone(base); absent.semesters.forEach(s => { s.courseIds = s.courseIds.filter(c => c !== "CSC 220") })
    expect(codes(absent, "PREREQ_MISSING").some(i => i.courseIds[0] === "CSC 340")).toBe(true)
  })
  it("concurrent prereq may share the semester (MATH 227 with CSC 230)", () => {
    const p = move(move(valid, "MATH 227", 3), "CSC 230", 3)
    expect(codes(p, "PREREQ_ORDER").some(i => i.courseIds[0] === "CSC 230")).toBe(false)
  })
  it("coreq: PHYS 222 may be same term, not later", () => {
    const same = move(move(valid, "PHYS 220", 3), "PHYS 222", 3)
    expect(codes(same, "COREQ_ORDER")).toHaveLength(0)
    const later = move(move(valid, "PHYS 220", 3), "PHYS 222", 4)
    expect(codes(later, "COREQ_ORDER").some(i => i.courseIds[0] === "PHYS 220")).toBe(true)
  })
  it("OR group: either option passes; placement satisfies MATH 226", () => {
    expect(codes(valid, "PREREQ_MISSING").some(i => i.courseIds[0] === "MATH 226")).toBe(false)
    const r = evaluatePlan(valid, dag, policies, { placement: {} })
    // without placement, MATH 199 (same semester in the fixture) no longer satisfies it
    expect(r.issues.some(i => ["PREREQ_MISSING", "PREREQ_ORDER"].includes(i.code) && i.courseIds[0] === "MATH 226")).toBe(true)
  })
  it("unit boundaries come from policies (12 / 15 / 19)", () => {
    const { minUnitsFullTime: lo, heavyLoadUnits: hi, maxUnitsWithoutPermission: mx } = policies
    expect(semesterStatus(0, policies)).toBe("empty")
    expect(semesterStatus(lo.value - 1, policies)).toBe("under")
    expect(semesterStatus(lo.value, policies)).toBe("ok")
    expect(semesterStatus(hi.value, policies)).toBe("ok")
    expect(semesterStatus(hi.value + 1, policies)).toBe("heavy")
    expect(semesterStatus(mx.value, policies)).toBe("heavy")
    expect(semesterStatus(mx.value + 1, policies)).toBe("over")
  })
  it("UNITS_OVER is an error", () => {
    const p = clone(valid); p.semesters[0].courseIds.push(placeholderId(3, 90), placeholderId(3, 91))
    expect(codes(p, "UNITS_OVER")).toHaveLength(1)
  })
  it("electives: fewer than 15 units fails the group", () => {
    const p = clone(valid); p.semesters.forEach(s => { s.courseIds = s.courseIds.filter(c => !/^CSC 6(0|2|5|6|7)/.test(c)) })
    expect(codes(p, "REQ_GROUP_INCOMPLETE").length).toBeGreaterThan(0)
  })
  it("unknown and duplicate IDs are errors", () => {
    const p = clone(valid); p.semesters[0].courseIds.push("FAKE-101"); p.semesters[1].courseIds.push(p.semesters[0].courseIds[0])
    expect(codes(p, "UNKNOWN_COURSE")).toHaveLength(1)
    expect(codes(p, "DUPLICATE_COURSE")).toHaveLength(1)
  })
  it("uniqueCourses keeps only the earliest copy of a course", () => {
    const p = clone(valid); p.semesters[5].courseIds.push("CSC 101", "CSC 101")
    const u = uniqueCourses(p)
    expect(u.semesters.flatMap(s => s.courseIds).filter(c => c === "CSC 101")).toHaveLength(1)
    expect(u.semesters[0].courseIds).toContain("CSC 101")
    expect(codes(u, "DUPLICATE_COURSE")).toHaveLength(0)
  })
  it("suggestSemester finds the earliest semester that fixes a broken course", () => {
    const broken = move(valid, "CSC 340", 3) // same semester as CSC 220 / CSC 230
    expect(suggestSemester(broken, dag, policies, "CSC 340")).toBe(4)
    const missing = clone(valid); missing.semesters.forEach(s => { s.courseIds = s.courseIds.filter(c => c !== "CSC 220") })
    expect(suggestSemester(missing, dag, policies, "CSC 340")).toBeNull() // no move can fix a missing prerequisite
  })
  it("nextCourses: year 1 suggests only required courses whose prerequisites are done", () => {
    const fresh: Plan = { ...clone(valid), semesters: emptySemesters() }
    const s1 = nextCourses(fresh, dag, 1, "ai")
    expect(s1).toContain("CSC 101")
    expect(s1).not.toContain("CSC 340") // needs CSC 220 + 230 first
    expect(s1).not.toContain("CSC 300GW") // needs upper-division standing
    expect(s1.some(c => dag.requirements.some(r => r.type === "choose_units" && r.courses.includes(c)))).toBe(false) // no electives in year 1
  })
  it("empty plan is not graduation-ready", () => {
    const p = clone(valid); p.semesters.forEach(s => { s.courseIds = [] })
    const r = evaluatePlan(p, dag, policies)
    expect(r.graduationReady).toBe(false)
    expect(r.requirementStatus.every(g => !g.satisfied)).toBe(true)
  })
  it("reversed semester order fails PREREQ_ORDER (shuffle control)", () => {
    const p = clone(valid); const ids = p.semesters.map(s => s.courseIds).reverse()
    p.semesters.forEach((s, i) => { s.courseIds = ids[i] })
    expect(codes(p, "PREREQ_ORDER").length).toBeGreaterThan(5)
  })
  it("critical courses: pushing CSC 220 late leaves its chain no room", () => {
    expect(criticalCourses(valid, dag)["CSC 220"].slack).toBeGreaterThanOrEqual(0)
    expect(criticalCourses(move(valid, "CSC 220", 7), dag)["CSC 220"].slack).toBeLessThan(0)
  })
})
