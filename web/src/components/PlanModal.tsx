import { useState } from "react"
import { isPlaceholder } from "../../../shared/engine"
import type { PlanResponse, RunRecord } from "../../../shared/types"
import { api } from "../api"
import { buildFallbackPlan } from "../../../shared/fallbackPlanner"
import { useActivePlan, useStore } from "../store"

type Stage = { label: string; state: "wait" | "run" | "done" | "fail" }

/** Turns a saved run record into the real stages it went through. */
export function traceOf(run: RunRecord): Stage[] {
  return run.steps.map(s => {
    const d = s.detail as { problems?: string[]; dropped?: string[]; provider?: string; model?: string; ms?: number; reason?: string }
    if (s.name === "engine_check") {
      const n = d.problems?.length ?? 0
      return { label: n ? `Rules engine: ${n} problem${n > 1 ? "s" : ""} found${d.dropped?.length ? ` (incl. ${d.dropped.length} invented ID${d.dropped.length > 1 ? "s" : ""})` : ""}` : "Rules engine: no problems, plan accepted", state: n ? "fail" : "done" }
    }
    if (s.name === "model_plan") return { label: `${d.provider === "mock" ? "Mock model" : `Gemini (${d.model})`} proposed a plan · ${((d.ms ?? 0) / 1000).toFixed(1)}s`, state: "done" }
    if (s.name.startsWith("model_repair")) return { label: `${d.provider === "mock" ? "Mock model" : "Gemini"} repaired the plan from the engine's messages · ${((d.ms ?? 0) / 1000).toFixed(1)}s`, state: "done" }
    if (s.name === "model_error") return { label: "Model call failed", state: "fail" }
    if (s.name === "fallback") return { label: `Deterministic planner used (${d.reason})`, state: "done" }
    return { label: s.name, state: "done" }
  })
}

export function PlanModal() {
  const careers = useStore(s => s.careers)
  const dag = useStore(s => s.dag)!
  const current = useActivePlan()
  const st = useStore.getState()
  const [goal, setGoal] = useState("")
  const [units, setUnits] = useState(dag.university.typical_units_per_term)
  const [keep, setKeep] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<{ resp: PlanResponse; trace: Stage[] } | null>(null)

  async function submit() {
    setBusy(true); setErr(null); setResult(null)
    try {
      const locked = keep ? current.semesters.flatMap(s => s.courseIds.filter(c => !isPlaceholder(c)).map(courseId => ({ courseId, semester: s.index }))) : []
      const resp = await api.plan({ goalText: goal, programId: "bs-cs", unitsPerSemester: units, lockedPlacements: locked })
      const run = await api.run(resp.runId).catch(() => null)
      setResult({ resp, trace: run ? traceOf(run) : [] })
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }
  function open() {
    if (!result) return
    st.addPlan({ ...result.resp.plan, name: result.resp.plan.name || goal.slice(0, 30) })
    st.setModal(false)
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => !busy && st.setModal(false)}>
      <div className="w-[640px] rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="mb-1 text-xl font-semibold text-white">What do you want to do in life?</div>
        <div className="mb-3 text-sm text-slate-400">Gemini proposes a plan. The rules engine checks it, sends problems back for repair (up to 2 times), and falls back to the deterministic planner if it still fails.</div>
        <textarea value={goal} onChange={e => setGoal(e.target.value)} rows={3} maxLength={500} placeholder="e.g. Machine learning engineer at a health-tech startup"
          className="w-full rounded-md border border-slate-700 bg-slate-950 p-2 text-sm outline-none focus:border-sf-gold" />
        <div className="mt-2 flex flex-wrap gap-2">
          {careers.map(c => <button key={c.id} onClick={() => setGoal(c.label)} className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-200 hover:bg-sf-gold hover:text-slate-900">{c.label}</button>)}
        </div>
        <div className="mt-3 flex items-center gap-4 text-sm text-slate-300">
          <label>Units per semester <input type="number" value={units} min={1} onChange={e => setUnits(Number(e.target.value))} className="ml-1 w-14 rounded border border-slate-700 bg-slate-950 px-1" /></label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={keep} onChange={e => setKeep(e.target.checked)} /> Keep my current courses</label>
        </div>
        {busy && <div className="mt-4 animate-pulse text-sm text-sf-gold">Asking the model, then checking every prerequisite with the rules engine…</div>}
        {err && <div className="mt-4 rounded bg-red-900/50 p-2 text-sm text-red-200">{err}</div>}
        {result && (
          <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">What happened (saved run {result.resp.runId.slice(-6)})</div>
            <ol className="space-y-1">
              {result.trace.map((t, i) => <li key={i} className={t.state === "fail" ? "text-red-300" : "text-emerald-300"}>{t.state === "fail" ? "✗" : "✓"} {t.label}</li>)}
            </ol>
            <div className="mt-2 text-slate-300"><b>{result.resp.plan.source === "ai" ? "Gemini plan accepted" : "Engine fallback plan"}</b> after {result.resp.attempts} model call{result.resp.attempts > 1 ? "s" : ""} · {result.resp.report.issues.filter(i => i.severity === "error").length} rule errors · {result.resp.report.graduationReady ? "graduation-ready" : "incomplete"}</div>
            {result.resp.rationale && <div className="mt-2 text-slate-300"><span className="text-[10px] uppercase text-violet-300">Generated by Gemini</span><br />{result.resp.rationale}</div>}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded-md px-3 py-1.5 text-sm text-slate-300" onClick={() => st.setModal(false)} disabled={busy}>Cancel</button>
          <select id="det-track" className="rounded-md border border-slate-700 bg-slate-950 px-2 text-sm text-slate-300" defaultValue="ai">
            {careers.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <button className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800" disabled={busy} title="No AI: the rules engine's own planner"
            onClick={() => {
              const trackId = (document.getElementById("det-track") as HTMLSelectElement).value
              const p = buildFallbackPlan(dag, { trackId, unitsPerSemester: units, profile: { placement: { calculus: true } }, goalText: goal })
              st.addPlan({ ...p, id: "plan_det_" + Date.now().toString(36), createdAt: new Date().toISOString(), name: `Engine: ${careers.find(c => c.id === trackId)?.label}` })
              st.setModal(false)
            }}>⚙ Deterministic plan (no AI)</button>
          {result ? <button className="rounded-md bg-sf-gold px-4 py-1.5 text-sm font-semibold text-slate-900" onClick={open}>Open as new plan tab</button>
            : <button className="rounded-md bg-sf-gold px-4 py-1.5 text-sm font-semibold text-slate-900 disabled:opacity-50" disabled={busy || !goal.trim()} onClick={submit}>Build plan</button>}
        </div>
      </div>
    </div>
  )
}
