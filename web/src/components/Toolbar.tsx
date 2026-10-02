import { useState } from "react"
import { api } from "../api"
import { useActivePlan, useStore } from "../store"
import { useReport } from "./Board"
import { aiName } from "./Thinking"

/** Minimal top bar: plan tabs, status, AI Plan, Check, Proof (D-022). */
export function Toolbar({ onTour }: { onTour: () => void }) {
  const plans = useStore(s => s.plans)
  const activeId = useStore(s => s.activePlanId)
  const panel = useStore(s => s.panel)
  const st = useStore.getState()
  const plan = useActivePlan()
  const report = useReport()
  const [editing, setEditing] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const student = useStore(s => s.student)
  const errors = report?.issues.filter(i => i.severity === "error").length ?? 0

  const [planning, setPlanning] = useState(false)
  /** Auto Plan (D-025): fill the remaining semesters for the student's saved goal; completed semesters stay locked. */
  async function autoPlan() {
    if (!student) { st.setModal(true); return }
    setPlanning(true)
    const done = plan.completedSemesters ?? 0
    const locked = plan.semesters.slice(0, done).flatMap(x => x.courseIds.filter(c => !c.startsWith("GE-")).map(courseId => ({ courseId, semester: x.index })))
    const pol = useStore.getState().policies!
    const units = Math.min(pol.maxUnitsWithoutPermission.value, Math.max(pol.minUnitsFullTime.value, student.coursesPerSemester * 3))
    try {
      const r = await api.plan({ goalText: student.goal, programId: "bs-cs", unitsPerSemester: units, lockedPlacements: locked,
        completedSemesters: done, unitsEarned: student.unitsDone })
      useStore.setState(s => ({ plans: s.plans.map(p => (p.id === plan.id ? { ...r.plan, id: p.id, name: p.name } : p)), evaluation: null }))
      st.setFlash(r.plan.source === "ai" ? `✦ ${aiName(useStore.getState().health?.aiProvider)} planned your remaining semesters for "${student.goal}" · checked by the rules engine (${r.attempts} call${r.attempts > 1 ? "s" : ""})`
        : "The AI was unavailable, so the rules engine's own planner filled your semesters")
    } catch (e) { st.setFlash((e as Error).message) }
    setPlanning(false)
  }
  async function check() {
    st.setPanel("evaluate"); st.setEvaluation(null)
    try { st.setEvaluation(await api.evaluate(plan, plan.goalText || undefined)) } catch (e) { st.setFlash(String((e as Error).message)) }
  }
  const btn = "rounded-full px-3 py-1 font-mono text-xs transition"
  return (
    <header className="flex items-center gap-4 border-b border-white/5 bg-black px-4 py-2.5">
      <span className="font-mono text-sm text-white">Plan<span className="text-sf-gold">Ed</span></span>
      {student && <span className="hidden font-mono text-[11px] text-zinc-500 xl:inline">{student.name} · grad {student.gradTerm}</span>}
      <div data-tour="tabs" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto font-mono text-xs">
        {plans.map(p => (
          <div key={p.id} onClick={() => st.setActivePlan(p.id)} onDoubleClick={() => setEditing(p.id)}
            className={`group flex shrink-0 cursor-pointer items-center gap-1 rounded-full px-3 py-1 ${p.id === activeId ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>
            {editing === p.id
              ? <input autoFocus defaultValue={p.name} className="w-28 bg-transparent outline-none" onBlur={e => { st.renamePlan(p.id, e.target.value || p.name); setEditing(null) }}
                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }} />
              : <span className="max-w-36 truncate" title="Double-click to rename">{p.source === "ai" ? "✦ " : ""}{p.name}</span>}
            <button className="hidden text-zinc-500 hover:text-red-400 group-hover:inline" onClick={e => { e.stopPropagation(); st.deletePlan(p.id) }}>×</button>
          </div>
        ))}
        <button className="shrink-0 px-2 text-zinc-500 hover:text-white" onClick={st.newPlan} title="New empty plan">+</button>
      </div>
      <span data-tour="status" className={`font-mono text-xs ${errors ? "text-red-400" : report?.graduationReady ? "text-teal-300" : "text-zinc-500"}`}>
        {errors ? `● ${errors} rule error${errors > 1 ? "s" : ""}` : report?.graduationReady ? "● graduation-ready" : "● no rule errors"}
      </span>
      <button data-tour="ai" disabled={planning} className={`${btn} bg-sf-gold text-black hover:brightness-110 disabled:animate-pulse`} onClick={autoPlan}
        title={student ? `Fill the remaining semesters for: ${student.goal}` : "Plan from a career goal"}>{planning ? "planning…" : "✦ auto plan"}</button>
      <button data-tour="check" className={`${btn} ${panel === "evaluate" ? "bg-white/15 text-white" : "text-zinc-300 hover:bg-white/10"}`} onClick={check}>evaluate</button>
      <button data-tour="proof" className={`${btn} ${panel === "proof" ? "bg-white/15 text-white" : "text-zinc-300 hover:bg-white/10"}`} onClick={() => st.setPanel(panel === "proof" ? "none" : "proof")}>proof</button>
      <div className="relative">
        <button className="px-1 font-mono text-zinc-500 hover:text-white" onClick={() => setMenu(!menu)}>⋯</button>
        {menu && (
          <div className="absolute right-0 top-7 z-50 w-40 rounded-lg border border-white/10 bg-black p-1 font-mono text-xs text-zinc-300 shadow-2xl" onMouseLeave={() => setMenu(false)}>
            {[["plan for a different goal", () => st.setModal(true)], ["duplicate plan", () => st.duplicatePlan(plan.id)], ["saved runs", () => st.setPanel("runs")], ["replay tour", onTour],
              ["start over", () => { if (window.confirm("Clear your answers and plans and start over?")) { st.reset(); st.setStudent(null) } }]].map(([l, f]) => (
              <button key={l as string} className="block w-full rounded px-2 py-1.5 text-left hover:bg-white/10" onClick={() => { (f as () => void)(); setMenu(false) }}>{l as string}</button>))}
          </div>
        )}
      </div>
    </header>
  )
}
