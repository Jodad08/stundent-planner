import { useEffect, useState } from "react"
import type { PlanResponse, RunRecord } from "../../../shared/types"
import { api, type RunSummary } from "../api"
import { useStore } from "../store"
import { traceOf } from "./PlanModal"

/** Saved-run replay: re-opens a recorded plan with no model call. */
export function RunsPanel() {
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [open, setOpen] = useState<RunRecord | null>(null)
  const st = useStore.getState()
  useEffect(() => { api.runs().then(r => setRuns(r.filter(x => x.variant === "gemini_plan"))).catch(() => setRuns([])) }, [])
  return (
    <aside className="w-[400px] shrink-0 overflow-y-auto border-l border-slate-800 bg-slate-950 p-4 text-sm text-slate-200">
      <div className="flex items-center justify-between"><div className="text-base font-semibold">Saved runs (replay, no model call)</div>
        <button className="text-slate-400 hover:text-white" onClick={() => st.setPanel("none")}>✕</button></div>
      <ul className="mt-3 space-y-1">{runs.map(r => (
        <li key={r.run_id} className="cursor-pointer rounded border border-slate-800 bg-slate-900 p-2 hover:border-sf-gold" onClick={() => api.run(r.run_id).then(setOpen)}>
          <div className="truncate">{r.goalText || "(no goal)"}</div>
          <div className="text-[11px] text-slate-500">{new Date(r.created_at).toLocaleTimeString()} · {String(r.provider)}</div>
        </li>))}</ul>
      {open && (() => {
        const resp = open.final_state as PlanResponse
        return (
          <div className="mt-4 rounded-lg border border-slate-700 p-3">
            <ol className="space-y-1 text-xs">{traceOf(open).map((t, i) => <li key={i} className={t.state === "fail" ? "text-red-300" : "text-emerald-300"}>{t.state === "fail" ? "✗" : "✓"} {t.label}</li>)}</ol>
            <button className="mt-2 rounded bg-sf-gold px-3 py-1 text-xs font-semibold text-slate-900"
              onClick={() => st.addPlan({ ...resp.plan, id: resp.plan.id + "_replay_" + Date.now().toString(36), name: "Replay: " + resp.plan.name })}>Open this plan</button>
          </div>
        )
      })()}
    </aside>
  )
}
