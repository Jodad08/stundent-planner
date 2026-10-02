import type { CareerDirection, Dag, EvaluateResponse, Plan, PlanRequest, PlanResponse, Policies, RunRecord } from "../../shared/types"

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch("/api" + path, { headers: { "content-type": "application/json" }, ...init })
  const body = await res.json().catch(() => ({ error: "Server returned no JSON", code: "NO_JSON" }))
  if (!res.ok) throw new Error(friendly(body.code, body.error))
  return body as T
}

function friendly(code: string, msg: string): string {
  const m: Record<string, string> = {
    UNKNOWN_COURSE: `That course is not in the B.S. CS data (${msg}).`,
    BAD_REQUEST: `The request was not valid: ${msg}`,
    PLAN_FAILED: "Planning failed on the server. Try again, or use the engine plan.",
    EVALUATE_FAILED: "Evaluation failed on the server. The rules engine result is still shown.",
    RUN_NOT_FOUND: "That saved run no longer exists.",
  }
  return m[code] ?? msg ?? "Something went wrong."
}

export type Health = { ok: boolean; aiProvider: "gemini" | "mock"; model: string }
export type RunSummary = { run_id: string; variant: string; created_at: string; goalText: string; provider: string }
export type EvalResults = Record<string, unknown>

export const api = {
  health: () => call<Health>("/health"),
  program: () => call<Dag>("/programs/bs-cs"),
  policies: () => call<Policies>("/policies"),
  careers: () => call<CareerDirection[]>("/career-directions"),
  plan: (req: PlanRequest) => call<PlanResponse>("/plan", { method: "POST", body: JSON.stringify(req) }),
  evaluate: (plan: Plan, goalText?: string) => call<EvaluateResponse>("/evaluate", { method: "POST", body: JSON.stringify({ plan, goalText }) }),
  runs: () => call<RunSummary[]>("/runs"),
  run: (id: string) => call<RunRecord>("/runs/" + id),
  evals: () => call<EvalResults>("/evals"),
}
