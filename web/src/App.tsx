import { useEffect, useState } from "react"
import { ReactFlowProvider } from "@xyflow/react"
import { api } from "./api"
import { useStore } from "./store"
import { Board } from "./components/Board"
import { Sidebar } from "./components/Sidebar"
import { Toolbar } from "./components/Toolbar"
import { PlanModal } from "./components/PlanModal"
import { EvaluatePanel } from "./components/EvaluatePanel"
import { ProofPanel } from "./components/ProofPanel"
import { RunsPanel } from "./components/RunsPanel"
import { Tour } from "./components/Tour"
import { buildFallbackPlan } from "../../shared/fallbackPlanner"

export function App() {
  const ready = useStore(s => !!s.dag && !!s.policies)
  const panel = useStore(s => s.panel)
  const modal = useStore(s => s.modalOpen)
  const [err, setErr] = useState<string | null>(null)
  const [tour, setTour] = useState(true) // shown on every load (D-022)
  useEffect(() => {
    Promise.all([api.program(), api.policies(), api.careers(), api.health(), api.descriptions()])
      .then(([dag, policies, careers, health, descriptions]) => {
        const st = useStore.getState()
        st.setData({ dag, policies, careers, health, descriptions })
        // nothing planned yet: open a sample plan from the deterministic planner so the board isn't empty
        if (st.plans.every(p => p.semesters.every(s => !s.courseIds.length))) {
          const p = buildFallbackPlan(dag, { trackId: "ai", unitsPerSemester: dag.university.typical_units_per_term, profile: { placement: { calculus: true } } })
          useStore.setState({ plans: [{ ...p, id: "plan_sample", name: "Sample plan", createdAt: new Date().toISOString() }], activePlanId: "plan_sample" })
        }
      })
      .catch(e => setErr(`Could not reach the GatorGraph server: ${e.message}. Is "npm run dev" running?`))
  }, [])
  if (err) return <div className="p-8 text-red-300">{err}</div>
  if (!ready) return <div className="p-8 text-slate-400">Loading the 2026-27 Bulletin data…</div>
  return (
    <ReactFlowProvider>
      <div className="flex h-full flex-col">
        <Toolbar onTour={() => setTour(true)} />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <main className="relative min-w-0 flex-1"><Board /></main>
          {panel === "evaluate" && <EvaluatePanel />}
          {panel === "proof" && <ProofPanel />}
          {panel === "runs" && <RunsPanel />}
        </div>
      </div>
      {modal && <PlanModal />}
      {tour && <Tour onDone={() => setTour(false)} />}
    </ReactFlowProvider>
  )
}
