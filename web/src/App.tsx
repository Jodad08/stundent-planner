import { useEffect, useState } from "react"
import { ReactFlowProvider } from "@xyflow/react"
import { api } from "./api"
import { useStore } from "./store"
import { Board } from "./components/Board"
import { Columns } from "./components/Columns"
import { Pet } from "./components/Pet"
import { Sidebar } from "./components/Sidebar"
import { Toolbar } from "./components/Toolbar"
import { PlanModal } from "./components/PlanModal"
import { EvaluatePanel } from "./components/EvaluatePanel"
import { ProofPanel } from "./components/ProofPanel"
import { RunsPanel } from "./components/RunsPanel"
import { Tour } from "./components/Tour"
import { Onboarding } from "./components/Onboarding"
import { buildFallbackPlan } from "../../shared/fallbackPlanner"

export function App() {
  const ready = useStore(s => !!s.dag && !!s.policies)
  const panel = useStore(s => s.panel)
  const view = useStore(s => s.view)
  const modal = useStore(s => s.modalOpen)
  const [err, setErr] = useState<string | null>(null)
  const hasStudent = useStore(s => !!s.student)
  const [onboard, setOnboard] = useState(true) // questions on every load; prefilled for returning students (D-032)
  const [tour, setTour] = useState(true) // shown on every load after onboarding (D-022, D-024)
  useEffect(() => {
    Promise.all([api.program(), api.policies(), api.careers(), api.health(), api.descriptions()])
      .then(([dag, policies, careers, health, descriptions]) => {
        const st = useStore.getState()
        st.setData({ dag, policies, careers, health, descriptions })
        // nothing planned yet: open a sample plan from the deterministic planner so the board isn't empty
        if (st.student && st.plans.every(p => p.semesters.every(s => !s.courseIds.length))) {
          const p = buildFallbackPlan(dag, { trackId: "ai", unitsPerSemester: dag.university.typical_units_per_term, profile: { placement: { calculus: true } } })
          useStore.setState({ plans: [{ ...p, id: "plan_sample", name: "Sample plan", createdAt: new Date().toISOString() }], activePlanId: "plan_sample" })
        }
      })
      .catch(e => setErr(`Could not reach the PlanEd server: ${e.message}. Is "npm run dev" running?`))
  }, [])
  if (err) return <div className="p-8 text-red-300">{err}</div>
  if (!ready) return <div className="p-8 text-slate-400">Loading the 2026-27 Bulletin data…</div>
  return (
    <ReactFlowProvider>
      <div className="flex h-full flex-col">
        <Toolbar onTour={() => setTour(true)} />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <main data-tour="board" className="relative min-w-0 flex-1">{view === "cards" ? <Columns /> : <Board />}<Pet /></main>
          {panel === "evaluate" && <EvaluatePanel />}
          {panel === "proof" && <ProofPanel />}
          {panel === "runs" && <RunsPanel />}
        </div>
      </div>
      {modal && <PlanModal />}
      {(onboard || !hasStudent) && <Onboarding onDone={() => { setOnboard(false); setTour(true) }}
        onSkip={hasStudent ? () => { setOnboard(false); setTour(false) } : undefined} />}
      {hasStudent && !onboard && tour && <Tour onDone={() => setTour(false)} />}
    </ReactFlowProvider>
  )
}
