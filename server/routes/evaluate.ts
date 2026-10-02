// POST /api/evaluate: engine first (truth), direction scores in code, then Gemini explains (plan.md §11.3).
import { Router } from "express"
import { careers, dag, policies } from "../../shared/data"
import { connections, DEFAULT_PROFILE, evaluatePlan, isPlaceholder, sanitizeSemesters } from "../../shared/engine"
import { directionScores, guessTrack } from "../../shared/directionScores"
import type { EvaluateResponse, Plan, Suggestion } from "../../shared/types"
import { completeJson, providerName } from "../gemini"
import { buildEvaluateUser, EVALUATE_SCHEMA, EVALUATE_SYSTEM } from "../prompts"
import { cacheGet, cacheKey, cacheSet } from "../cache"
import { newRun } from "../runs"

const errorsOf = (p: Plan) => evaluatePlan(p, dag, policies, DEFAULT_PROFILE).issues.filter(i => i.severity === "error").length

/** Apply a swap to a copy of the plan; null if the swap is malformed. */
/** Career titles per DAG track for the simulated evaluator (AI-style suggestions, not SFSU data; D-028). */
const CAREERS: Record<string, string[]> = {
  ai: ["Machine learning engineer", "Data scientist", "AI research engineer"],
  systems: ["Security engineer", "Systems / infrastructure engineer", "Cloud and DevOps engineer"],
  web: ["Full-stack developer", "Mobile app developer", "Front-end engineer"],
  theory: ["Graphics / game engine developer", "Quantum computing researcher", "Algorithms-focused grad school path"],
}

export function applySuggestion(p: Plan, s: Suggestion): Plan | null {
  if (!dag.nodes[s.add] || !Number.isInteger(s.semester) || s.semester < 1 || s.semester > 8) return null
  const ids = new Set(p.semesters.flatMap(x => x.courseIds))
  if (s.remove !== null && !ids.has(s.remove)) return null
  const q: Plan = { ...p, semesters: p.semesters.map(x => ({ ...x, courseIds: x.courseIds.filter(c => c !== s.remove && c !== s.add) })) }
  q.semesters[s.semester - 1].courseIds.push(s.add)
  return q
}

export async function evaluate(planIn: Plan, goalText?: string): Promise<EvaluateResponse> {
  const report = evaluatePlan(planIn, dag, policies, DEFAULT_PROFILE)
  const scores = directionScores(planIn, careers)
  const conn = connections(planIn, dag)
  const key = cacheKey(["evaluate", providerName(), planIn.semesters, goalText ?? ""])
  const hit = cacheGet<EvaluateResponse>(key)
  if (hit) return hit
  const run = newRun("evaluate", { plan: planIn, goalText }, { provider: providerName(), model: process.env.GEMINI_MODEL ?? "mock" })
  run.step("engine", { errors: report.issues.filter(i => i.severity === "error").length, graduationReady: report.graduationReady })
  let ai: EvaluateResponse["ai"] = null
  let aiStatus: EvaluateResponse["aiStatus"] = "failed"
  let dropped = 0
  try {
    const out = await completeJson(EVALUATE_SYSTEM, buildEvaluateUser(dag, planIn, report, scores, goalText, conn), {
      purpose: "evaluate", schema: EVALUATE_SCHEMA,
      mock: () => {
        const errs = report.issues.filter(i => i.severity === "error")
        const top = scores[0], second = scores[1]
        const fits = careers.find(c => c.id === top.directionId)!.signalCourseIds.filter(c => planIn.semesters.some(s => s.courseIds.includes(c)))
        const ch = conn.longestChain
        return {
          summary: `${ch.length > 1 ? `Your plan's backbone is a ${ch.length}-course chain, ${ch.join(" → ")}, ` : "Your plan "}with ${conn.links} prerequisite links between courses. `
            + (errs.length ? `The rules engine found ${errs.length} problem${errs.length > 1 ? "s" : ""} to fix first, starting with: ${errs[0].message}`
              : conn.critical.length ? `No rule errors. Watch ${conn.critical.slice(0, 3).join(", ")}: they have no slack, so delaying one delays graduation.` : "No rule errors, and every course has some slack."),
          directionExplanation: top.score > 0
            ? `It points most toward ${top.label} (${top.score}/100) because of ${fits.slice(0, 3).join(", ")}.${second && second.score > 0 ? ` ${second.label} is next at ${second.score}.` : ""}${goalText ? ` That ${top.label === careers.find(c => c.id === guessTrack(goalText))?.label ? "matches" : "differs from"} your goal, "${goalText}".` : ""}`
            : "No electives are planned yet, so the plan doesn't point toward a direction. Add electives from your goal's track.",
          suggestions: [],
          careerPaths: (CAREERS[top.directionId] ?? []).map(title => ({ title,
            why: fits.length ? `Your ${fits.slice(0, 2).join(" and ")} ${fits.length > 1 ? "are" : "is"} the kind of coursework this role uses every day.` : "Add electives from this track to build toward it." })),
          thoughts: [
            `Reading your ${planIn.semesters.flatMap(x => x.courseIds).filter(c => !isPlaceholder(c)).length} planned courses across ${planIn.semesters.filter(x => x.courseIds.length).length} semesters.`,
            `Tracing prerequisites: ${conn.links} links between your courses${ch.length > 1 ? `; the longest path runs ${ch[0]} → ${ch[ch.length - 1]} (${ch.length} courses).` : "."}`,
            `Scoring your electives against the department's tracks: ${scores.map(x => `${x.label} ${x.score}`).join(", ")}.`,
            errs.length ? `The rules engine reports ${errs.length} error${errs.length > 1 ? "s" : ""}; flagging them first.` : "The rules engine reports no errors.",
            `Matching ${top.label} to career paths.`,
          ] }
      },
    })
    const raw = (out.json ?? {}) as { summary?: unknown; directionExplanation?: unknown; suggestions?: unknown }
    run.step("model_evaluate", { provider: out.provider, model: out.model, ms: out.ms, raw })
    const before = errorsOf(planIn)
    const suggestions: Suggestion[] = []
    for (const s of (Array.isArray(raw.suggestions) ? raw.suggestions : []).slice(0, 3) as Suggestion[]) {
      const after = s && typeof s.add === "string" && !isPlaceholder(s.add) ? applySuggestion(planIn, s) : null
      if (!after || errorsOf(after) > before || typeof s.reason !== "string") { dropped++; continue }
      suggestions.push({ remove: s.remove, add: s.add, semester: s.semester, reason: s.reason })
    }
    const careerPaths = (Array.isArray((raw as { careerPaths?: unknown }).careerPaths) ? (raw as { careerPaths: unknown[] }).careerPaths : [])
      .filter((c): c is { title: string; why: string } => !!c && typeof (c as { title?: unknown }).title === "string" && typeof (c as { why?: unknown }).why === "string").slice(0, 3)
    const thoughts = Array.isArray((raw as { thoughts?: unknown }).thoughts) ? ((raw as { thoughts: unknown[] }).thoughts.filter(t => typeof t === "string") as string[]) : undefined
    ai = { summary: String(raw.summary ?? ""), directionExplanation: String(raw.directionExplanation ?? ""), suggestions, careerPaths, ...(thoughts ? { thoughts } : {}) }
    aiStatus = "ok"
  } catch (e) {
    run.rec.errors.push(String(e).slice(0, 300))
  }
  const resp: EvaluateResponse = { report, connections: conn, directionScores: scores, ai, aiStatus, droppedSuggestions: dropped, runId: run.rec.run_id }
  run.rec.final_state = resp
  run.rec.scores = { errors: report.issues.filter(i => i.severity === "error").length, graduationReady: report.graduationReady, droppedSuggestions: dropped }
  run.save()
  if (aiStatus === "ok") cacheSet(key, resp)
  return resp
}

export const evaluateRoute = Router()
evaluateRoute.post("/evaluate", async (req, res) => {
  const body = (req.body ?? {}) as { plan?: Plan; goalText?: unknown }
  const p = body.plan
  if (!p || !Array.isArray(p.semesters) || p.semesters.length !== 8) { res.status(400).json({ error: "plan must have 8 semesters", code: "BAD_REQUEST" }); return }
  const { dropped } = sanitizeSemesters(p.semesters, dag)
  if (dropped.length) { res.status(400).json({ error: `Unknown course ${dropped[0]}`, code: "UNKNOWN_COURSE" }); return }
  try { res.json(await evaluate(p, typeof body.goalText === "string" ? body.goalText.slice(0, 500) : undefined)) } catch (e) {
    console.error(e); res.status(500).json({ error: "Evaluation failed", code: "EVALUATE_FAILED" })
  }
})
