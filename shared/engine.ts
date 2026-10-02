/*
 * GatorGraph rules engine. The ONLY place prerequisite, unit and requirement rules live.
 * Part 1 is a behavior-preserving TypeScript port of web/planner.js (pinned by engine.test.ts).
 * Part 2 is evaluatePlan: checks any 8-semester plan (hand-made, AI-made, or an official roadmap).
 * Pure functions: no network, no clock, no randomness.
 */
import type {
  CourseId, Dag, EngineReport, Issue, IssueCode, Plan, Policies, PrereqExpr, SemesterStatus, StudentProfile,
} from "./types"

// =====================================================================================
// Part 1: port of web/planner.js
// =====================================================================================

export const GRADE_POINTS: Record<string, number> = {
  "A": 4, "A-": 3.7, "B+": 3.3, "B": 3, "B-": 2.7, "C+": 2.3, "C": 2, "C-": 1.7,
  "D+": 1.3, "D": 1, "D-": 0.7, "F": 0, "WU": 0, "IC": 0,
}
const UD = /upper-division standing/i
const SENIOR = /senior standing/i

export type Term = { season: "Fall" | "Spring"; year: number; label: string }
export type TranscriptRow = { code: CourseId; grade: string; units?: number; include?: boolean }
export type Profile = {
  courses: TranscriptRow[]
  placement?: Record<string, boolean>
  unitsEarned?: number
  inProgressUnits?: number
}
export type Leaf = { code: CourseId; soft: boolean; coreq?: boolean }
type Ctx = { before: Set<CourseId>; now: Set<CourseId>; placement?: Record<string, boolean> }

export function termAt(start: { season: "Fall" | "Spring"; year: number }, i: number): Term {
  let season = start.season, year = start.year
  for (let k = 0; k < i; k++) {
    if (season === "Fall") { season = "Spring"; year += 1 } else { season = "Fall" }
  }
  return { season, year, label: season + " " + year }
}

export function passes(grade: string, min: string | null): boolean {
  if (grade === "IP") return true
  if (grade === "CR") return !min
  if (!(grade in GRADE_POINTS)) return false
  if (!min) return GRADE_POINTS[grade] > 0
  return GRADE_POINTS[grade] >= GRADE_POINTS[min]
}

export function leaves(expr: PrereqExpr, out: Leaf[] = [], soft = false): Leaf[] {
  if (!expr) return out
  if (typeof expr === "string") out.push({ code: expr, soft: !!soft })
  else if ("and" in expr) expr.and.forEach(x => leaves(x, out, soft))
  else if ("or" in expr) expr.or.forEach(x => leaves(x, out, soft))
  else if ("course" in expr) out.push({ code: expr.course, soft: !!expr.concurrent })
  else if ("coreq" in expr) out.push({ code: expr.coreq, soft: true, coreq: true })
  return out
}

export function evaluate(expr: PrereqExpr, ctx: Ctx): boolean {
  if (!expr) return true
  if (typeof expr === "string") return ctx.before.has(expr)
  if ("and" in expr) return expr.and.every(x => evaluate(x, ctx))
  if ("or" in expr) return expr.or.some(x => evaluate(x, ctx))
  if ("course" in expr) return ctx.before.has(expr.course) || (!!expr.concurrent && ctx.now.has(expr.course))
  if ("coreq" in expr) return ctx.before.has(expr.coreq) || ctx.now.has(expr.coreq)
  if ("placement" in expr) return !!(ctx.placement && ctx.placement[expr.placement])
  return false
}

/** Readable prerequisite text: "CSC 220 and (CSC 210 or CSC 215)". */
export function describe(expr: PrereqExpr, top = true): string {
  if (!expr) return "none"
  if (typeof expr === "string") return expr
  if ("and" in expr) { const s = expr.and.map(x => describe(x, false)).join(" and "); return top ? s : `(${s})` }
  if ("or" in expr) { const s = expr.or.map(x => describe(x, false)).join(" or "); return top ? s : `(${s})` }
  if ("course" in expr) return expr.concurrent ? `${expr.course} (may be same term)` : expr.course
  if ("coreq" in expr) return `${expr.coreq} (same term or earlier)`
  if ("placement" in expr) return `${expr.placement} placement`
  return "?"
}

export function expand(expr: PrereqExpr, dag: Dag, have: Set<CourseId>, needed: Set<CourseId>,
  placement?: Record<string, boolean>): boolean {
  if (!expr) return true
  if (typeof expr === "string" || "course" in expr || "coreq" in expr) {
    const code = typeof expr === "string" ? expr : ("course" in expr ? expr.course : expr.coreq)
    if (have.has(code) || needed.has(code)) return true
    const node = dag.nodes[code]
    if (!node) return false
    needed.add(code)
    return expand(node.prereq, dag, have, needed, placement)
  }
  if ("placement" in expr) return !!(placement && placement[expr.placement])
  if ("and" in expr) return expr.and.map(x => expand(x, dag, have, needed, placement)).every(Boolean)
  if ("or" in expr) {
    let best: { cost: number; added: CourseId[] } | null = null
    for (const opt of expr.or) {
      const trial = new Set(needed)
      if (!expand(opt, dag, have, trial, placement)) continue
      const added = [...trial].filter(c => !needed.has(c))
      const cost = added.reduce((s, c) => s + (dag.nodes[c] ? dag.nodes[c].units : 0), 0)
      if (!best || cost < best.cost) best = { cost, added }
      if (cost === 0) break
    }
    if (!best) return false
    best.added.forEach(c => needed.add(c))
    return true
  }
  return false
}

export function profileSets(dag: Dag, profile: Profile) {
  const passed = new Set<CourseId>(), retake: { code: CourseId; grade: string; min: string | null }[] = []
  for (const row of profile.courses) {
    if (row.include === false) continue
    const node = dag.nodes[row.code]
    if (row.grade === "IP") continue
    if (passes(row.grade, node ? node.min_grade : null)) passed.add(row.code)
    else if (node) retake.push({ code: row.code, grade: row.grade, min: node.min_grade })
  }
  const inProgress = new Set(profile.courses.filter(r => r.grade === "IP" && r.include !== false).map(r => r.code))
  return { passed, inProgress, retake }
}

function electiveReq(dag: Dag) {
  const req = dag.requirements.find(r => r.type === "choose_units")
  if (!req) throw new Error("program has no elective requirement")
  return req
}

export function electivePool(dag: Dag): CourseId[] {
  const req = electiveReq(dag)
  const skip = new Set([...(req.excluded || []), ...(req.auto_plan_excludes || [])])
  return req.courses.filter(c => !skip.has(c))
}

export function pickElectives(dag: Dag, profile: Profile, track: string, keep?: CourseId[]): CourseId[] {
  const { passed, inProgress } = profileSets(dag, profile)
  const have = new Set([...passed, ...inProgress])
  const req = electiveReq(dag)
  const minUnits = req.min_units ?? 0, minCsc = req.min_csc_units ?? 0
  const pool = electivePool(dag)
  const order = [...(dag.tracks[track] ? dag.tracks[track].courses : []),
    ...Object.values(dag.tracks).flatMap(t => t.courses), ...pool]
  const chosen: CourseId[] = []
  const doneElectives = pool.filter(c => have.has(c))
  let units = doneElectives.reduce((s, c) => s + dag.nodes[c].units, 0)
  let nonCsc = doneElectives.filter(c => !c.startsWith("CSC ")).reduce((s, c) => s + dag.nodes[c].units, 0)
  for (const c of (keep || [])) {
    if (units >= minUnits) break
    if (have.has(c) || chosen.includes(c) || !dag.nodes[c]) continue
    chosen.push(c); units += dag.nodes[c].units
    if (!c.startsWith("CSC ")) nonCsc += dag.nodes[c].units
  }
  for (const c of order) {
    if (units >= minUnits) break
    if (have.has(c) || chosen.includes(c) || !pool.includes(c)) continue
    const isCsc = c.startsWith("CSC ")
    if (!isCsc && nonCsc + dag.nodes[c].units > minUnits - minCsc) continue
    chosen.push(c); units += dag.nodes[c].units
    if (!isCsc) nonCsc += dag.nodes[c].units
  }
  return chosen
}

export function electiveRuleCheck(dag: Dag, codes: CourseId[]) {
  const req = electiveReq(dag)
  const units = codes.reduce((s, c) => s + dag.nodes[c].units, 0)
  const csc = codes.filter(c => c.startsWith("CSC ")).reduce((s, c) => s + dag.nodes[c].units, 0)
  const minUnits = req.min_units ?? 0, minCsc = req.min_csc_units ?? 0
  return { units, cscUnits: csc, ok: units >= minUnits && csc >= minCsc, minUnits, minCsc }
}

export type PlanOpts = {
  start: { season: "Fall" | "Spring"; year: number }
  maxUnits?: number
  electives?: CourseId[]
  blocked?: Record<CourseId, number>
  offerings?: Record<CourseId, string[]>
  maxTerms?: number
}

export type PlannedTerm = {
  index: number; term: Term; courses: CourseId[]
  majorUnits: number; generalUnits: number; totalUnits: number; unitsAfter: number
}

export function plan(dag: Dag, profile: Profile, optsIn: PlanOpts) {
  const opts = Object.assign({ maxUnits: 15, electives: [] as CourseId[], blocked: {} as Record<CourseId, number>,
    offerings: {} as Record<CourseId, string[]>, maxTerms: 14 }, optsIn)
  const nodes = dag.nodes
  const placement = profile.placement || {}
  const { passed, inProgress, retake } = profileSets(dag, profile)
  const have = new Set([...passed, ...inProgress])

  const targets: CourseId[] = []
  dag.requirements.filter(r => r.type === "all").forEach(r => targets.push(...r.courses))
  targets.push(...opts.electives)
  const needed = new Set<CourseId>()
  const unreachable: CourseId[] = []
  // all targets first, so an OR branch that names another target costs nothing (D-017)
  targets.forEach(c => { if (!have.has(c)) needed.add(c) })
  for (const c of targets) {
    if (have.has(c)) continue
    if (!expand(nodes[c].prereq, dag, have, needed, placement)) unreachable.push(c)
  }
  const extra = [...needed].filter(c => !targets.includes(c))

  const dependents: Record<CourseId, { code: CourseId; soft: boolean }[]> = {}
  needed.forEach(c => { dependents[c] = [] })
  needed.forEach(c => {
    leaves(nodes[c].prereq).forEach(l => {
      if (needed.has(l.code)) dependents[l.code].push({ code: c, soft: l.soft })
    })
  })
  const height: Record<CourseId, number> = {}
  const h = (c: CourseId, seen: Set<CourseId>): number => {
    if (height[c] != null) return height[c]
    if (seen.has(c)) return 1
    seen.add(c)
    let best = 1
    for (const d of dependents[c]) best = Math.max(best, h(d.code, seen) + (d.soft ? 0 : 1))
    seen.delete(c)
    height[c] = best
    return best
  }
  needed.forEach(c => h(c, new Set()))

  const uni = dag.university
  const coreqs = (c: CourseId) => leaves(nodes[c].prereq).filter(l => l.coreq).map(l => l.code)
  const offered = (c: CourseId, season: string) => !opts.offerings[c] || opts.offerings[c].includes(season)
  const standingOK = (c: CourseId, units: number) => nodes[c].conditions.every(cond =>
    !(UD.test(cond) && units < uni.upper_division_standing_units) && !(SENIOR.test(cond) && units < uni.senior_standing_units))

  const inProgressUnits = profile.inProgressUnits != null ? profile.inProgressUnits
    : profile.courses.filter(r => r.grade === "IP" && r.include !== false).reduce((s, r) => s + (r.units || 0), 0)
  let cum = (profile.unitsEarned || 0) + inProgressUnits
  const majorLeft = [...needed].reduce((s, c) => s + nodes[c].units, 0)
  const degreeUnits = (uni && uni.min_units) || 120
  let generalLeft = Math.max(0, degreeUnits - cum - majorLeft)

  const remaining = new Set(needed)
  const placedTerm: Record<CourseId, number> = {}
  const terms: PlannedTerm[] = []
  const before = new Set(have)
  for (let t = 0; t < opts.maxTerms && (remaining.size || generalLeft > 0); t++) {
    const term = termAt(opts.start, t)
    const now = new Set<CourseId>()
    let units = 0
    const startUnits = cum
    for (;;) {
      let best: { code: CourseId; bundle: CourseId[]; units: number; score: number; req: number } | null = null
      for (const c of remaining) {
        const bundle = [c, ...coreqs(c).filter(p => remaining.has(p) && !now.has(p))]
        if (bundle.some(b => opts.blocked[b] === t || !offered(b, term.season) || !standingOK(b, startUnits))) continue
        const bu = bundle.reduce((s, b) => s + nodes[b].units, 0)
        if (units + bu > opts.maxUnits) continue
        const nowPlus = new Set([...now, ...bundle])
        if (!bundle.every(b => evaluate(nodes[b].prereq, { before, now: nowPlus, placement }))) continue
        const score = Math.max(...bundle.map(b => height[b]))
        const req = bundle.some(b => !opts.electives.includes(b)) ? 1 : 0
        if (!best || score > best.score || (score === best.score && (req > best.req ||
          (req === best.req && c < best.code)))) best = { code: c, bundle, units: bu, score, req }
      }
      if (!best) break
      const chosen = best
      chosen.bundle.forEach(b => { now.add(b); remaining.delete(b); placedTerm[b] = t })
      units += chosen.units
    }
    const general = Math.min(Math.max(0, opts.maxUnits - units), generalLeft)
    generalLeft -= general
    cum += units + general
    now.forEach(c => before.add(c))
    terms.push({ index: t, term, courses: [...now].sort((a, b) => height[b] - height[a] || (a < b ? -1 : 1)),
      majorUnits: units, generalUnits: general, totalUnits: units + general, unitsAfter: cum })
  }
  while (terms.length && !terms[terms.length - 1].totalUnits) terms.pop()
  const ipWarnings: { code: CourseId; missing: CourseId[] }[] = []
  inProgress.forEach(c => {
    const node = nodes[c]
    if (node && !evaluate(node.prereq, { before: passed, now: inProgress, placement })) {
      const missing = leaves(node.prereq).filter(l => !l.coreq && !passed.has(l.code) && !inProgress.has(l.code))
        .map(l => l.code)
      ipWarnings.push({ code: c, missing })
    }
  })
  const gradIndex = remaining.size ? Infinity : terms.length - 1
  return {
    terms, placedTerm, height, needed: [...needed], extra, targets, retake, unreachable,
    unscheduled: [...remaining], have, passed, inProgress,
    gradIndex, gradTerm: Number.isFinite(gradIndex) ? termAt(opts.start, gradIndex) : null, ipWarnings,
    maxUnits: opts.maxUnits,
    startUnits: (profile.unitsEarned || 0) + inProgressUnits, finalUnits: cum, dependents,
  }
}

type PlanResult = ReturnType<typeof plan>

function chainFrom(base: PlanResult, c: CourseId): CourseId[] {
  const out = [c]
  let cur = c
  for (;;) {
    const next = (base.dependents[cur] || []).filter(d => !d.soft)
      .sort((a, b) => base.height[b.code] - base.height[a.code])[0]
    if (!next) return out
    out.push(next.code)
    cur = next.code
  }
}

export function bottlenecks(dag: Dag, profile: Profile, opts: PlanOpts) {
  const base = plan(dag, profile, opts)
  const flags: { code: CourseId; termIndex: number; term: Term; delay: number; altGrad: Term | null; chain: CourseId[] }[] = []
  for (const [code, t] of Object.entries(base.placedTerm)) {
    if ((base.height[code] || 1) < 2) continue
    const alt = plan(dag, profile, Object.assign({}, opts, { blocked: Object.assign({}, opts.blocked, { [code]: t }) }))
    const delay = alt.gradIndex - base.gradIndex
    if (delay > 0) {
      flags.push({ code, termIndex: t, term: base.terms[t].term, delay, altGrad: alt.gradTerm, chain: chainFrom(base, code) })
    }
  }
  flags.sort((a, b) => b.delay - a.delay || a.termIndex - b.termIndex || (a.code < b.code ? -1 : 1))
  return { base, flags }
}

// =====================================================================================
// Part 2: plans, placeholders and evaluatePlan
// =====================================================================================

export const SEMESTER_COUNT = 8

/** GE / free-elective placeholder cards encode their units in the ID: "GE-3u-1" (D-016). */
export function placeholderId(units: number, n: number): CourseId { return `GE-${units}u-${n}` }
export function isPlaceholder(id: CourseId): boolean { return /^(GE|EL)-\d+u-\d+$/.test(id) }
/** "Elective, choose later" slot (D-031): counts its units, never satisfies the elective requirement. */
export function electiveSlotId(n: number): CourseId { return `EL-3u-${n}` }
export function isElectiveSlot(id: CourseId): boolean { return id.startsWith("EL-") }
export function placeholderUnits(id: CourseId): number { return Number(id.split("-")[1].slice(0, -1)) }

export function unitsOf(dag: Dag, id: CourseId): number {
  if (isPlaceholder(id)) return placeholderUnits(id)
  return dag.nodes[id] ? dag.nodes[id].units : 0
}

export function emptySemesters() {
  return Array.from({ length: SEMESTER_COUNT }, (_, i) => ({
    index: i + 1,
    label: `${i % 2 === 0 ? "Fall" : "Spring"} Year ${Math.floor(i / 2) + 1}`,
    season: (i % 2 === 0 ? "fall" : "spring") as "fall" | "spring",
    courseIds: [] as CourseId[],
  }))
}

/** Default profile: calculus-ready, matching the official "QR Category 1/2" CS roadmap (D-016). */
export const DEFAULT_PROFILE: StudentProfile = { placement: { calculus: true } }

/** Leaves that make `expr` fail under ctx (all options of a failed OR). */
function failingLeaves(expr: PrereqExpr, ctx: Ctx): (Leaf | { placement: string })[] {
  if (!expr || evaluate(expr, ctx)) return []
  if (typeof expr === "string") return [{ code: expr, soft: false }]
  if ("and" in expr || "or" in expr) return ("and" in expr ? expr.and : expr.or).flatMap(x => failingLeaves(x, ctx))
  if ("course" in expr) return [{ code: expr.course, soft: !!expr.concurrent }]
  if ("coreq" in expr) return [{ code: expr.coreq, soft: true, coreq: true }]
  return [{ placement: expr.placement }]
}

export function semesterStatus(units: number, p: Policies): SemesterStatus {
  if (units === 0) return "empty"
  if (units < p.minUnitsFullTime.value) return "under"
  if (units <= p.heavyLoadUnits.value) return "ok"
  if (units <= p.maxUnitsWithoutPermission.value) return "heavy"
  return "over"
}

export function evaluatePlan(planIn: Plan, dag: Dag, policies: Policies, profile: StudentProfile = DEFAULT_PROFILE): EngineReport {
  const issues: Issue[] = []
  const add = (severity: Issue["severity"], code: IssueCode, message: string, courseIds: CourseId[], extra: Partial<Issue> = {}) =>
    issues.push({ id: `${code}-${issues.length}`, severity, code, message, courseIds, ...extra })
  const uni = dag.university
  const lab = (i: number) => planIn.semesters.find(s => s.index === i)?.label ?? `semester ${i}`

  // where each course sits
  const semOf = new Map<CourseId, number>()
  for (const s of planIn.semesters) {
    for (const id of s.courseIds) {
      if (!isPlaceholder(id) && !dag.nodes[id]) {
        add("error", "UNKNOWN_COURSE", `${id} is not a course in the B.S. CS program data.`, [id], { semesterIndex: s.index })
        continue
      }
      if (semOf.has(id)) {
        add("error", "DUPLICATE_COURSE", `${id} is planned twice (${lab(semOf.get(id)!)} and ${s.label}).`, [id], { semesterIndex: s.index })
        continue
      }
      semOf.set(id, s.index)
    }
  }

  const semesterStats = planIn.semesters.map(s => {
    const units = s.courseIds.reduce((sum, id) => sum + unitsOf(dag, id), 0)
    return { index: s.index, units, status: semesterStatus(units, policies) }
  })
  for (const st of semesterStats) {
    const pol = st.status === "under" ? policies.minUnitsFullTime : st.status === "heavy" ? policies.heavyLoadUnits
      : st.status === "over" ? policies.maxUnitsWithoutPermission : null
    if (!pol) continue
    const code: IssueCode = st.status === "under" ? "UNITS_UNDER" : st.status === "heavy" ? "UNITS_HEAVY" : "UNITS_OVER"
    const msg = st.status === "under" ? `${lab(st.index)} has ${st.units} units, below ${pol.value} (${pol.label}).`
      : st.status === "heavy" ? `${lab(st.index)} has ${st.units} units, above ${pol.value} (${pol.label}).`
        : `${lab(st.index)} has ${st.units} units, above ${pol.value} (${pol.label}). Needs a 3.0 GPA and a petition.`
    add(st.status === "over" ? "error" : "warning", code, msg, [], { semesterIndex: st.index, sourceUrl: pol.sourceUrl, quote: pol.quote })
  }

  // prerequisites, coreqs, standing, notes
  const noteCourses: CourseId[] = []
  for (const s of planIn.semesters) {
    const before = new Set<CourseId>()
    const now = new Set<CourseId>()
    let cumBefore = 0
    for (const t of planIn.semesters) {
      if (t.index < s.index) {
        t.courseIds.forEach(id => before.add(id))
        cumBefore += semesterStats.find(x => x.index === t.index)!.units
      }
      if (t.index === s.index) t.courseIds.forEach(id => now.add(id))
    }
    const ctx: Ctx = { before, now, placement: profile.placement }
    for (const id of s.courseIds) {
      const node = dag.nodes[id]
      if (!node || semOf.get(id) !== s.index) continue
      const bad = failingLeaves(node.prereq, ctx)
      if (bad.length) {
        const courseLeaves = bad.filter((l): l is Leaf => "code" in l)
        const inPlan = courseLeaves.filter(l => semOf.has(l.code)).map(l => l.code)
        const onlyCoreq = courseLeaves.length > 0 && courseLeaves.every(l => l.coreq)
        const code: IssueCode = inPlan.length ? (onlyCoreq ? "COREQ_ORDER" : "PREREQ_ORDER") : "PREREQ_MISSING"
        const msg = code === "PREREQ_MISSING"
          ? `${id} needs ${describe(node.prereq)}. Missing from the plan: ${courseLeaves.map(l => l.code).join(", ") || "placement"}.`
          : `${id} is in ${s.label}, but ${inPlan.map(c => `${c} (${lab(semOf.get(c)!)})`).join(", ")} must come ${onlyCoreq ? "in the same semester or earlier" : "earlier"}. Rule: ${describe(node.prereq)}.`
        add("error", code, msg, [id, ...courseLeaves.map(l => l.code).filter(c => semOf.has(c))],
          { semesterIndex: s.index, sourceUrl: node.url, quote: node.bulletin_prerequisite_text ?? undefined })
      }
      for (const cond of node.conditions) {
        const need = UD.test(cond) ? uni.upper_division_standing_units : SENIOR.test(cond) ? uni.senior_standing_units : null
        if (need == null) continue
        if (cumBefore < need) {
          add("warning", "STANDING_TOO_LOW",
            `${id} needs ${UD.test(cond) ? "upper-division" : "senior"} standing (${need}+ units). Only ${cumBefore} units are planned before ${s.label}.`,
            [id], { semesterIndex: s.index, sourceUrl: node.url, quote: node.bulletin_prerequisite_text ?? undefined })
        }
      }
      if (node.conditions.some(c => !UD.test(c) && !SENIOR.test(c) && !/placement/i.test(c))) noteCourses.push(id)
    }
  }

  // requirement groups
  const requirementStatus = dag.requirements.map(r => {
    if (r.type === "all") {
      const missing = r.courses.filter(c => !semOf.has(c))
      return { groupId: r.id, title: r.label, satisfied: missing.length === 0, missingCourseIds: missing }
    }
    const pool = r.courses.filter(c => !(r.excluded || []).includes(c))
    const chosen = pool.filter(c => semOf.has(c))
    const chk = electiveRuleCheck(dag, chosen)
    return { groupId: r.id, title: r.label, satisfied: chk.ok, missingCourseIds: [],
      unitsHave: chk.units, unitsNeed: chk.minUnits }
  })
  for (const r of requirementStatus) {
    if (r.satisfied) continue
    const detail = r.unitsNeed != null ? `${r.unitsHave} of ${r.unitsNeed} elective units (at least ${electiveRuleCheck(dag, []).minCsc} must be CSC).`
      : `Missing: ${r.missingCourseIds.join(", ")}.`
    add("warning", "REQ_GROUP_INCOMPLETE", `${r.title} is not complete. ${detail}`, r.missingCourseIds, { sourceUrl: dag.program.url })
  }

  const totalUnitsPlanned = semesterStats.reduce((s, x) => s + x.units, 0)
  if (totalUnitsPlanned < uni.min_units) {
    add("warning", "TOTAL_UNITS_SHORT", `${totalUnitsPlanned} units planned. A bachelor's degree needs ${uni.min_units}.`, [],
      { sourceUrl: dag.program.url })
  }
  for (const [id, sem] of semOf) {
    const off = dag.term_offerings[id]
    const season = sem % 2 === 1 ? "Fall" : "Spring"
    if (off && off.length && !off.includes(season)) add("info", "TERM_NOT_OFFERED", `${id} may not be offered in ${season}.`, [id], { semesterIndex: sem })
  }
  if (noteCourses.length) {
    add("info", "PREREQ_NOTE", `Not checked by the engine (GPA or instructor-permission conditions): ${noteCourses.join(", ")}.`, noteCourses)
  }
  if ([...semOf.keys()].some(id => !isPlaceholder(id))) {
    add("info", "UNVERIFIED_DATA", "Course data is scraped from the 2026-27 Bulletin and machine-checked, not yet checked by a person. Confirm with an advisor.", [])
  }

  const graduationReady = !issues.some(i => i.severity === "error") && requirementStatus.every(r => r.satisfied)
    && totalUnitsPlanned >= uni.min_units
  return { issues, semesterStats, requirementStatus, totalUnitsPlanned, graduationReady }
}

/**
 * Critical courses in a user's plan: a course is critical when its longest chain of hard
 * prerequisites (within the plan) already ends in the last semester, so delaying it by one
 * semester pushes graduation past semester 8.
 */
export function criticalCourses(p: Plan, dag: Dag): Record<CourseId, { chain: CourseId[]; slack: number }> {
  const semOf = new Map<CourseId, number>()
  p.semesters.forEach(s => s.courseIds.forEach(id => { if (dag.nodes[id]) semOf.set(id, s.index) }))
  const deps: Record<CourseId, CourseId[]> = {}
  for (const id of semOf.keys()) {
    for (const l of leaves(dag.nodes[id].prereq)) {
      if (!l.soft && semOf.has(l.code)) (deps[l.code] ||= []).push(id)
    }
  }
  const memo: Record<CourseId, CourseId[]> = {}
  const longest = (c: CourseId, seen: Set<CourseId>): CourseId[] => {
    if (memo[c]) return memo[c]
    if (seen.has(c)) return [c]
    seen.add(c)
    let best: CourseId[] = []
    for (const d of deps[c] || []) { const ch = longest(d, seen); if (ch.length > best.length) best = ch }
    seen.delete(c)
    return (memo[c] = [c, ...best])
  }
  const out: Record<CourseId, { chain: CourseId[]; slack: number }> = {}
  for (const [id, sem] of semOf) {
    const chain = longest(id, new Set())
    if (chain.length < 2) continue
    const slack = SEMESTER_COUNT - (sem + chain.length - 1)
    out[id] = { chain, slack }
  }
  return out
}

/**
 * Fill GE / free-elective units with placeholder cards up to `target` units per semester until the
 * plan reaches the degree minimum. Major courses are never moved. Deterministic.
 */
export function fillPlaceholders(p: Plan, dag: Dag, target: number): Plan {
  const q: Plan = { ...p, semesters: p.semesters.map(s => ({ ...s, courseIds: s.courseIds.filter(c => !isPlaceholder(c)) })) }
  let total = q.semesters.reduce((sum, s) => sum + s.courseIds.reduce((a, c) => a + unitsOf(dag, c), 0), 0)
  let n = 0
  for (const s of q.semesters) {
    let units = s.courseIds.reduce((a, c) => a + unitsOf(dag, c), 0)
    while (units < target && total < dag.university.min_units) {
      const u = Math.min(3, target - units, dag.university.min_units - total)
      s.courseIds.push(placeholderId(u, ++n)); units += u; total += u
    }
  }
  return q
}

/** Coerce untrusted model output into an 8-semester plan. Unknown IDs are dropped (and reported), never auto-corrected. */
export function sanitizeSemesters(raw: unknown, dag: Dag): { semesters: ReturnType<typeof emptySemesters>; dropped: string[] } {
  const semesters = emptySemesters()
  const dropped: string[] = []
  const seen = new Set<CourseId>()
  const list = Array.isArray(raw) ? raw : []
  for (const item of list) {
    if (!item || typeof item !== "object") continue
    const { index, courseIds } = item as { index?: unknown; courseIds?: unknown }
    if (typeof index !== "number" || index < 1 || index > SEMESTER_COUNT || !Array.isArray(courseIds)) continue
    for (const c of courseIds) {
      if (typeof c !== "string") continue
      if (!dag.nodes[c]) { if (!isPlaceholder(c)) dropped.push(c); continue }
      if (seen.has(c)) continue
      seen.add(c)
      semesters[index - 1].courseIds.push(c)
    }
  }
  return { semesters, dropped }
}

/** How a plan hangs together (Evaluate, D-025): prerequisite links, the longest chain, and zero-slack courses. */
export function connections(p: Plan, dag: Dag) {
  const planned = new Set(p.semesters.flatMap(s => s.courseIds))
  let links = 0
  planned.forEach(id => { if (dag.nodes[id]) links += leaves(dag.nodes[id].prereq).filter(l => planned.has(l.code)).length })
  const crit = criticalCourses(p, dag)
  const longestChain = Object.values(crit).reduce<CourseId[]>((best, c) => (c.chain.length > best.length ? c.chain : best), [])
  const critical = Object.entries(crit).filter(([, c]) => c.slack <= 0).map(([id]) => id)
  return { links, longestChain, critical }
}
