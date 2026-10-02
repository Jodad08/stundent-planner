import { useState } from "react"
import { api } from "../api"
import { useActivePlan, useStore } from "../store"
import { useReport } from "./Board"

export function Toolbar() {
  const plans = useStore(s => s.plans)
  const activeId = useStore(s => s.activePlanId)
  const health = useStore(s => s.health)
  const panel = useStore(s => s.panel)
  const st = useStore.getState()
  const plan = useActivePlan()
  const report = useReport()
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const errors = report?.issues.filter(i => i.severity === "error").length ?? 0

  async function evaluate() {
    st.setPanel("evaluate"); setBusy(true)
    try { st.setEvaluation(await api.evaluate(plan, plan.goalText || undefined)) } catch (e) { st.setFlash(String((e as Error).message)) }
    setBusy(false)
  }
  const btn = "rounded-md px-3 py-1.5 text-sm font-medium"
  return (
    <header className="flex items-center gap-3 border-b border-slate-800 bg-sf-purple px-4 py-2">
      <div className="mr-2 flex items-baseline gap-2">
        <span className="text-lg font-bold text-white">Gator<span className="text-sf-gold">Graph</span></span>
        <span className="text-xs text-violet-200">B.S. Computer Science · 2026-27 Bulletin</span>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {plans.map(p => (
          <div key={p.id} onClick={() => st.setActivePlan(p.id)} onDoubleClick={() => setEditing(p.id)}
            className={`group flex shrink-0 cursor-pointer items-center gap-1 rounded-t-md px-3 py-1 text-sm ${p.id === activeId ? "bg-canvas text-white" : "bg-violet-950/60 text-violet-200 hover:bg-violet-900"}`}>
            {editing === p.id
              ? <input autoFocus defaultValue={p.name} className="w-32 bg-transparent outline-none" onBlur={e => { st.renamePlan(p.id, e.target.value || p.name); setEditing(null) }}
                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }} />
              : <span className="max-w-40 truncate" title="Double-click to rename">{p.source === "ai" ? "✦ " : p.source === "fallback" ? "⚙ " : ""}{p.name}</span>}
            <button className="hidden text-xs text-violet-300 hover:text-red-300 group-hover:inline" onClick={e => { e.stopPropagation(); st.deletePlan(p.id) }}>×</button>
          </div>
        ))}
        <button className="shrink-0 px-2 text-sm text-violet-200 hover:text-white" onClick={st.newPlan}>+ New plan</button>
        <button className="shrink-0 px-2 text-sm text-violet-200 hover:text-white" onClick={() => st.duplicatePlan(plan.id)}>Duplicate</button>
      </div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${errors ? "bg-red-600 text-white" : "bg-emerald-700 text-white"}`}>
        {errors ? `${errors} rule error${errors > 1 ? "s" : ""}` : report?.graduationReady ? "Graduation-ready" : "No rule errors"}
      </span>
      <button className={`${btn} bg-sf-gold text-slate-900 hover:brightness-110`} onClick={() => st.setModal(true)}>✦ AI Plan</button>
      <button className={`${btn} bg-white/10 text-white hover:bg-white/20`} onClick={evaluate} disabled={busy}>{busy ? "Evaluating…" : "Evaluate"}</button>
      <button className={`${btn} ${panel === "proof" ? "bg-white/25" : "bg-white/10"} text-white hover:bg-white/20`} onClick={() => st.setPanel(panel === "proof" ? "none" : "proof")}>Proof</button>
      <button className={`${btn} ${panel === "runs" ? "bg-white/25" : "bg-white/10"} text-white hover:bg-white/20`} onClick={() => st.setPanel(panel === "runs" ? "none" : "runs")}>Runs</button>
      <button className="text-xs text-violet-300 hover:text-white" onClick={() => { if (window.confirm("Delete all plans and start over?")) st.reset() }}>Reset</button>
      <span className="text-[10px] text-violet-300" title="Model provider">{health ? (health.aiProvider === "mock" ? "AI: mock" : `AI: ${health.model}`) : ""}</span>
    </header>
  )
}
