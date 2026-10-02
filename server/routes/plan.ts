// POST /api/plan: Gemini proposes, the engine decides (plan.md §11.1).
// trusted state -> prompt -> adapter -> parse -> sanitize -> engine -> repair (max 2) -> fallback -> saved run
import { Router } from "express"
import { careers, dag, policies } from "../../shared/data"
import { connections, uniqueCourses, DEFAULT_PROFILE, evaluatePlan, fillPlaceholders, isPlaceholder, leaves, pickElectives, sanitizeSemesters } from "../../shared/engine"
import { buildFallbackPlan } from "../../shared/fallbackPlanner"
import { directionScores, guessTrack } from "../../shared/directionScores"
import type { EngineReport, Plan, PlanRequest, PlanResponse } from "../../shared/types"
import { completeJson, providerName } from "../gemini"
import { buildPlanUser, buildRepairUser, PLAN_SCHEMA, PLAN_SYSTEM } from "../prompts"
import { cacheGet, cacheKey, cacheSet } from "../cache"
import { newRun } from "../runs"

const MAX_REPAIRS = 2

type RawPlan = { trackId?: unknown; semesters?: unknown; rationale?: unknown; electiveChoices?: unknown; thoughts?: unknown }

/** Problems that send a plan back for repair: engine errors, incomplete groups, standing. */
export function blockingProblems(report: EngineReport): string[] {
  return report.issues.filter(i => i.severity === "error" || i.code === "REQ_GROUP_INCOMPLETE" || i.code === "STANDING_TOO_LOW")
    .map(i => i.message)
}

/**
 * Simulated AI (provider "mock", D-026): no model call. It narrates the planning it actually does with the
 * deterministic engine, in a model-like voice, and seeds one prerequisite mistake on the first answer so the
 * engine's catch-and-repair loop is visible. Every fact in the text is computed from the data.
 */
function mockPlan(req: PlanRequest, attempt: number): RawPlan {
  const { goalText, unitsPerSemester: units } = req
  const trackId = req.trackId ?? guessTrack(goalText)
  const track = dag.tracks[trackId]
  const done = req.completedSemesters ?? 0
  const taken = req.lockedPlacements.filter(l => l.semester <= done)
  const p = buildFallbackPlan(dag, { trackId, unitsPerSemester: units, profile: DEFAULT_PROFILE,
    completed: taken, completedSemesters: done, unitsEarned: req.unitsEarned })
  const semesters = p.semesters.map(s => ({ index: s.index, courseIds: s.courseIds.filter(c => !isPlaceholder(c)) }))
  const electives = semesters.flatMap(s => s.courseIds).filter(c => dag.requirements.some(r => r.type === "choose_units" && r.courses.includes(c)))
  const conn = connections(p, dag)
  const reasonFor = (c: string) => {
    const n = dag.nodes[c]
    const pre = leaves(n.prereq).map(l => l.code).filter(x => dag.nodes[x])
    return `${n.title}${track.courses.includes(c) ? ` sits in the ${track.label} track` : " rounds out the CSC elective units"}${pre.length ? `, and it builds on ${pre.slice(0, 2).join(" and ")}` : ""}.`
  }
  if (attempt > 0) {
    return { trackId, semesters, thoughts: [
      "The rules engine rejected my draft: CSC 340 needs CSC 220 and CSC 230 completed first, and I had them in the same semester.",
      "Moving CSC 340 one semester later. Nothing that depends on it shifts past the last semester, so graduation stays on time.",
    ], rationale: `Repaired: CSC 340 now follows CSC 220 and CSC 230. Electives stay focused on ${track.label}.`,
    electiveChoices: electives.map(c => ({ courseId: c, reason: reasonFor(c) })) } as RawPlan
  }
  if (attempt === 0) { // seeded mistake: CSC 340 one semester too early, so the engine catches it
    const from = semesters.find(s => s.courseIds.includes("CSC 340"))
    if (from && from.index > done + 1) { from.courseIds = from.courseIds.filter(c => c !== "CSC 340"); semesters[from.index - 2].courseIds.push("CSC 340") }
  }
  const thoughts = [
    (() => { // interview answers read naturally; a plain goal is quoted
      const m = /^[^:]+: (.+?)\. Focus: (.+?)\. Wants to work: (.+?)\. After graduating: (.+?)\.?(?: \(|$)/.exec(goalText)
      if (!m) return `"${goalText}" lines up best with the department's ${track.label} track, so its electives come first.`
      // lowercase a leading capital unless it's an acronym ("ML", "AI"); pick a/an
      const lc = (t: string) => /^[A-Z][a-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t
      const role = lc(m[1].replace(/^an? /i, "")), art = /^[aeiou]|^(AI|ML)\b/i.test(role) ? "an" : "a"
      const after = /grad/i.test(m[4]) ? "grad school" : /industry/i.test(m[4]) ? "industry" : "whatever comes next"
      const focus = /not sure/i.test(m[2]) ? "still exploring within it" : `focused on ${lc(m[2])}`
      const place = /not sure/i.test(m[3]) ? "open to working anywhere" : /back home|abroad/i.test(m[3]) ? "working back home"
        : /bay area|san francisco/i.test(m[3]) ? "working in the Bay Area" : /elsewhere in the us/i.test(m[3]) ? "working elsewhere in the US" : `working in ${m[3]}`
      return `You want to be ${art} ${role}, ${focus}, ${place}, and heading into ${after} after graduating. That lines up with the department's ${track.label} track, so its electives come first.`
    })(),
    done ? `${done} semester${done > 1 ? "s are" : " is"} already done (${taken.map(t => t.courseId).join(", ") || "GE only"}), so I'm planning from semester ${done + 1}.` : "Starting from semester 1 with calculus placement.",
    conn.longestChain.length > 1 ? `The longest prerequisite chain is ${conn.longestChain.join(" → ")}${taken.some(t => t.courseId === conn.longestChain[0])
      ? `; you've already taken ${conn.longestChain[0]}, so the rest has to keep moving every semester.` : `, so ${conn.longestChain[0]} has to start early.`}` : "",
    `Electives (${electives.reduce((u, c) => u + dag.nodes[c].units, 0)} units): ${electives.join(", ")}.`,
    `Keeping each semester near ${units} units, under the ${policies.maxUnitsWithoutPermission.value}-unit priority-registration cap.`,
  ].filter(Boolean)
  return { trackId, semesters, thoughts,
    rationale: `I matched "${goalText}" to ${track.label} and chose ${electives.slice(0, 3).map(c => dag.nodes[c].title).join(", ")} and more, because they build directly on your core courses and point at that career.`,
    electiveChoices: electives.map(c => ({ courseId: c, reason: reasonFor(c) })) } as RawPlan
}

export function validateRequest(body: unknown): PlanRequest | string {
  const b = (body ?? {}) as Partial<PlanRequest>
  if (typeof b.goalText !== "string" || b.goalText.trim().length < 1 || b.goalText.length > 500) return "goalText must be 1 to 500 characters"
  if (b.programId !== "bs-cs") return "Only bs-cs is supported"
  const u = b.unitsPerSemester
  if (typeof u !== "number" || !Number.isInteger(u) || u < policies.minUnitsFullTime.value || u > policies.maxUnitsWithoutPermission.value)
    return `unitsPerSemester must be an integer from ${policies.minUnitsFullTime.value} to ${policies.maxUnitsWithoutPermission.value}`
  const locked = Array.isArray(b.lockedPlacements) ? b.lockedPlacements : []
  for (const l of locked) {
    if (!l || !dag.nodes[l.courseId] || !Number.isInteger(l.semester) || l.semester < 1 || l.semester > 8) return `UNKNOWN_COURSE:${l?.courseId}`
  }
  const done = b.completedSemesters ?? 0
  if (!Number.isInteger(done) || done < 0 || done > 7) return "completedSemesters must be an integer from 0 to 7"
  const earned = b.unitsEarned
  if (earned != null && (typeof earned !== "number" || earned < 0 || earned > 300)) return "unitsEarned must be 0 to 300"
  const trackId = typeof b.trackId === "string" && dag.tracks[b.trackId] ? b.trackId : undefined
  return { goalText: b.goalText.trim(), programId: "bs-cs", unitsPerSemester: u, lockedPlacements: locked, completedSemesters: done, ...(trackId ? { trackId } : {}),
    ...(earned != null ? { unitsEarned: earned } : {}) }
}

export async function generatePlan(req: PlanRequest): Promise<PlanResponse> {
  const key = cacheKey(["plan", providerName(), req])
  const hit = cacheGet<PlanResponse>(key)
  if (hit) return hit

  const run = newRun("gemini_plan", req, { provider: providerName(), model: process.env.GEMINI_MODEL ?? "mock", maxRepairs: MAX_REPAIRS })
  const done = req.completedSemesters ?? 0
  const user = buildPlanUser(dag, policies, req.goalText + (req.trackId ? ` (preferred track: ${req.trackId})` : ""), req.unitsPerSemester, req.lockedPlacements, done)
  let prompt = user
  let attempts = 0
  let last: { raw: RawPlan; plan: Plan; report: EngineReport } | null = null
  let accepted = false

  for (let i = 0; i <= MAX_REPAIRS; i++) {
    attempts++
    let raw: RawPlan
    try {
      const out = await completeJson(PLAN_SYSTEM, prompt, { purpose: i === 0 ? "plan" : "repair", schema: PLAN_SCHEMA,
        mock: () => mockPlan(req, i) })
      raw = (out.json ?? {}) as RawPlan
      run.step(i === 0 ? "model_plan" : `model_repair_${i}`, { provider: out.provider, model: out.model, ms: out.ms, raw })
    } catch (e) {
      run.rec.errors.push(`model call ${attempts} failed: ${String(e).slice(0, 300)}`)
      run.step("model_error", { attempt: attempts, error: String(e).slice(0, 300) })
      break
    }
    const { semesters, dropped } = sanitizeSemesters(raw.semesters, dag)
    // completed semesters hold only the courses the student already took
    const intoDone: string[] = []
    semesters.slice(0, done).forEach(s => { intoDone.push(...s.courseIds); s.courseIds = [] })
    for (const l of req.lockedPlacements) {
      semesters.forEach(s => { s.courseIds = s.courseIds.filter(c => c !== l.courseId) })
      semesters[l.semester - 1].courseIds.push(l.courseId)
    }
    const lockedIds = new Set(req.lockedPlacements.map(l => l.courseId))
    const misplaced = intoDone.filter(c => !lockedIds.has(c))
    const draft: Plan = { id: `plan_ai_${run.rec.run_id}`, name: req.goalText.slice(0, 40), programId: "bs-cs", goalText: req.goalText,
      createdAt: new Date().toISOString(), semesters, source: "ai", ...(done ? { completedSemesters: done } : {}) }
    const plan = fillPlaceholders(draft, dag, req.unitsPerSemester)
    const report = evaluatePlan(plan, dag, policies, DEFAULT_PROFILE)
    const problems = [...dropped.map(d => `${d} is not in the course list. Use only listed IDs.`),
      ...misplaced.map(c => `${c} was put in a completed semester; plan it in semester ${done + 1} or later.`), ...blockingProblems(report)]
    run.step("engine_check", { attempt: attempts, dropped, problems, errors: report.issues.filter(x => x.severity === "error").length })
    last = { raw, plan, report }
    if (!problems.length) { accepted = true; break }
    prompt = buildRepairUser(user, { trackId: raw.trackId, semesters: raw.semesters }, problems)
  }

  let resp: PlanResponse
  if (accepted && last) {
    const choices = Array.isArray(last.raw.electiveChoices) ? last.raw.electiveChoices as { courseId: string; reason: string }[] : []
    const planned = new Set(last.plan.semesters.flatMap(s => s.courseIds))
    resp = { plan: last.plan, report: last.report, rationale: typeof last.raw.rationale === "string" ? last.raw.rationale : "",
      electiveChoices: choices.filter(c => c && typeof c.courseId === "string" && planned.has(c.courseId) && typeof c.reason === "string"),
      attempts, runId: run.rec.run_id }
  } else {
    // deterministic fallback; keeps any valid electives the model chose
    const trackId = typeof last?.raw.trackId === "string" && dag.tracks[last.raw.trackId] ? last.raw.trackId : (req.trackId ?? guessTrack(req.goalText))
    const keep = last ? last.plan.semesters.flatMap(s => s.courseIds).filter(c => dag.requirements.some(r => r.type === "choose_units" && r.courses.includes(c))) : []
    const electives = pickElectives(dag, { courses: req.lockedPlacements.filter(l => l.semester <= done).map(l => ({ code: l.courseId, grade: "C" })) }, trackId, keep)
    const completed = req.lockedPlacements.filter(l => l.semester <= done)
    const plan = { ...buildFallbackPlan(dag, { trackId, unitsPerSemester: req.unitsPerSemester, profile: DEFAULT_PROFILE, electives,
      completed, completedSemesters: done, unitsEarned: req.unitsEarned,
      goalText: req.goalText, name: `${req.goalText.slice(0, 32)} (engine fallback)` }), id: `plan_fb_${run.rec.run_id}`, createdAt: new Date().toISOString() }
    const report = evaluatePlan(plan, dag, policies, DEFAULT_PROFILE)
    run.step("fallback", { trackId, electives, reason: last ? "model plan still invalid after repairs" : "model call failed" })
    resp = { plan, report, rationale: last ? `The AI plan did not pass the rules engine after ${attempts} attempt(s), so this plan comes from the deterministic planner.`
      : "The model was unavailable (busy or timed out), so this plan comes from the deterministic planner.",
      electiveChoices: [], attempts, runId: run.rec.run_id }
  }
  resp = { ...resp, plan: uniqueCourses(resp.plan) } // never return a course twice (D-035)
  run.rec.final_state = resp
  run.rec.scores = { accepted, attempts, source: resp.plan.source, errors: resp.report.issues.filter(i => i.severity === "error").length,
    graduationReady: resp.report.graduationReady, directions: directionScores(resp.plan, careers).slice(0, 2) }
  run.save()
  cacheSet(key, resp)
  return resp
}

export const planRoute = Router()
planRoute.post("/plan", async (req, res) => {
  const v = validateRequest(req.body)
  if (typeof v === "string") {
    res.status(400).json({ error: v.startsWith("UNKNOWN_COURSE") ? `Unknown course ${v.split(":")[1]}` : v, code: v.startsWith("UNKNOWN_COURSE") ? "UNKNOWN_COURSE" : "BAD_REQUEST" })
    return
  }
  try { res.json(await generatePlan(v)) } catch (e) {
    console.error(e); res.status(500).json({ error: "Planning failed", code: "PLAN_FAILED" })
  }
})
