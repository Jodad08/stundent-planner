// POST /api/plan: Gemini proposes, the engine decides (plan.md §11.1).
// trusted state -> prompt -> adapter -> parse -> sanitize -> engine -> repair (max 2) -> fallback -> saved run
import { Router } from "express"
import { careers, dag, policies } from "../../shared/data"
import { DEFAULT_PROFILE, evaluatePlan, fillPlaceholders, isPlaceholder, pickElectives, sanitizeSemesters } from "../../shared/engine"
import { buildFallbackPlan } from "../../shared/fallbackPlanner"
import { directionScores } from "../../shared/directionScores"
import type { EngineReport, Plan, PlanRequest, PlanResponse } from "../../shared/types"
import { completeJson, providerName } from "../gemini"
import { buildPlanUser, buildRepairUser, PLAN_SCHEMA, PLAN_SYSTEM } from "../prompts"
import { cacheGet, cacheKey, cacheSet } from "../cache"
import { newRun } from "../runs"

const MAX_REPAIRS = 2

type RawPlan = { trackId?: unknown; semesters?: unknown; rationale?: unknown; electiveChoices?: unknown }

/** Problems that send a plan back for repair: engine errors, incomplete groups, standing. */
export function blockingProblems(report: EngineReport): string[] {
  return report.issues.filter(i => i.severity === "error" || i.code === "REQ_GROUP_INCOMPLETE" || i.code === "STANDING_TOO_LOW")
    .map(i => i.message)
}

/** Keyword guess of the closest DAG track. Used only by the mock and when the model gave no answer at all. */
export function guessTrack(goalText: string): string {
  const g = goalText.toLowerCase()
  return /secur|system|network|\bos\b|cloud|infra/.test(g) ? "systems" : /web|mobile|app|front|full-stack|fullstack|product/.test(g) ? "web"
    : /theor|graphic|quantum|math|game/.test(g) ? "theory" : "ai"
}

/** Deterministic mock: first answer has one seeded prerequisite error so the repair loop runs without a key. */
function mockPlan(goalText: string, units: number, attempt: number): RawPlan {
  const trackId = guessTrack(goalText)
  const p = buildFallbackPlan(dag, { trackId, unitsPerSemester: units, profile: DEFAULT_PROFILE })
  const semesters = p.semesters.map(s => ({ index: s.index, courseIds: s.courseIds.filter(c => !isPlaceholder(c)) }))
  if (attempt === 0) { // seeded mistake: CSC 340 one semester too early
    const from = semesters.find(s => s.courseIds.includes("CSC 340"))
    if (from && from.index > 1) { from.courseIds = from.courseIds.filter(c => c !== "CSC 340"); semesters[from.index - 2].courseIds.push("CSC 340") }
  }
  return { trackId, semesters, rationale: `MOCK (no model call): electives taken from the ${dag.tracks[trackId].label} track.`,
    electiveChoices: pickElectives(dag, { courses: [] }, trackId).map(c => ({ courseId: c, reason: `Listed in the ${dag.tracks[trackId].label} track.` })) }
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
  return { goalText: b.goalText.trim(), programId: "bs-cs", unitsPerSemester: u, lockedPlacements: locked }
}

export async function generatePlan(req: PlanRequest): Promise<PlanResponse> {
  const key = cacheKey(["plan", providerName(), req])
  const hit = cacheGet<PlanResponse>(key)
  if (hit) return hit

  const run = newRun("gemini_plan", req, { provider: providerName(), model: process.env.GEMINI_MODEL ?? "mock", maxRepairs: MAX_REPAIRS })
  const user = buildPlanUser(dag, policies, req.goalText, req.unitsPerSemester, req.lockedPlacements)
  let prompt = user
  let attempts = 0
  let last: { raw: RawPlan; plan: Plan; report: EngineReport } | null = null
  let accepted = false

  for (let i = 0; i <= MAX_REPAIRS; i++) {
    attempts++
    let raw: RawPlan
    try {
      const out = await completeJson(PLAN_SYSTEM, prompt, { purpose: i === 0 ? "plan" : "repair", schema: PLAN_SCHEMA,
        mock: () => mockPlan(req.goalText, req.unitsPerSemester, i) })
      raw = (out.json ?? {}) as RawPlan
      run.step(i === 0 ? "model_plan" : `model_repair_${i}`, { provider: out.provider, model: out.model, ms: out.ms, raw })
    } catch (e) {
      run.rec.errors.push(`model call ${attempts} failed: ${String(e).slice(0, 300)}`)
      run.step("model_error", { attempt: attempts, error: String(e).slice(0, 300) })
      break
    }
    const { semesters, dropped } = sanitizeSemesters(raw.semesters, dag)
    for (const l of req.lockedPlacements) {
      semesters.forEach(s => { s.courseIds = s.courseIds.filter(c => c !== l.courseId) })
      semesters[l.semester - 1].courseIds.push(l.courseId)
    }
    const draft: Plan = { id: `plan_ai_${run.rec.run_id}`, name: req.goalText.slice(0, 40), programId: "bs-cs", goalText: req.goalText,
      createdAt: new Date().toISOString(), semesters, source: "ai" }
    const plan = fillPlaceholders(draft, dag, req.unitsPerSemester)
    const report = evaluatePlan(plan, dag, policies, DEFAULT_PROFILE)
    const problems = [...dropped.map(d => `${d} is not in the course list. Use only listed IDs.`), ...blockingProblems(report)]
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
    const trackId = typeof last?.raw.trackId === "string" && dag.tracks[last.raw.trackId] ? last.raw.trackId : guessTrack(req.goalText)
    const keep = last ? last.plan.semesters.flatMap(s => s.courseIds).filter(c => dag.requirements.some(r => r.type === "choose_units" && r.courses.includes(c))) : []
    const electives = pickElectives(dag, { courses: [] }, trackId, keep)
    const plan = { ...buildFallbackPlan(dag, { trackId, unitsPerSemester: req.unitsPerSemester, profile: DEFAULT_PROFILE, electives,
      goalText: req.goalText, name: `${req.goalText.slice(0, 32)} (engine fallback)` }), id: `plan_fb_${run.rec.run_id}`, createdAt: new Date().toISOString() }
    const report = evaluatePlan(plan, dag, policies, DEFAULT_PROFILE)
    run.step("fallback", { trackId, electives, reason: last ? "model plan still invalid after repairs" : "model call failed" })
    resp = { plan, report, rationale: last ? `The AI plan did not pass the rules engine after ${attempts} attempt(s), so this plan comes from the deterministic planner.`
      : "The model was unavailable (busy or timed out), so this plan comes from the deterministic planner.",
      electiveChoices: [], attempts, runId: run.rec.run_id }
  }
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
