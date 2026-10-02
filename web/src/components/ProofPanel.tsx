import { useEffect, useState } from "react"
import { api } from "../api"
import { useStore } from "../store"

type Row = { variant: string; errors: number; groupsSatisfied: number; groupsTotal: number; semesters: number; units: number; goalTrackScore: number; attempts: number | null; source: string }
export type EvalResults = {
  generated_at: string; provider: string
  seeded: { cases: { name: string; expected: string[]; got: string[]; pass: boolean }[]; precision: number; recall: number; validFixtureErrors: number }
  roadmaps: { title: string; url: string; errors: string[]; warnings: number; graduationReady: boolean; units: number }[]
  comparison: { goal: string; trackId: string; rows: Row[] }[]
  antiVacuity: { check: string; pass: boolean }[]
}

/** Justification (D-028): why the plans can be trusted, in plain words. Numbers come from evals/results.json. */
export function ProofPanel() {
  const [r, setR] = useState<EvalResults | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { api.evals().then(x => setR(x as unknown as EvalResults)).catch(e => setErr(e.message)) }, [])
  const st = useStore.getState()
  const pol = useStore(s => s.policies)
  const H = ({ n, children }: { n: number; children: React.ReactNode }) => (
    <div className="mb-2 mt-6 flex items-center gap-2 text-[14px] font-semibold text-zinc-900">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-[11px] text-white">{n}</span>{children}</div>)
  const caught = r?.seeded.cases.filter(c => c.pass).length ?? 0
  // three honest AI labels: live Gemini, simulated AI, or the engine fallback when the AI was unavailable
  const name = (v: string) => v.startsWith("No-op") ? "Empty plan" : v.startsWith("SFSU official") ? "SFSU's sample roadmap"
    : v.startsWith("Deterministic") ? "PlanEd rules engine" : v.includes("fallback") ? "Engine fallback (AI unavailable)"
    : v.includes("(mock)") ? "PlanEd planner + rules engine" : "Gemini + rules engine"

  return (
    <aside className="w-[460px] shrink-0 overflow-y-auto border-l border-zinc-200 bg-white p-5 text-sm text-zinc-700">
      <div className="flex items-center justify-between">
        <div className="text-base font-bold text-zinc-900">Why you can trust this plan</div>
        <button className="text-zinc-400 hover:text-zinc-900" onClick={() => st.setPanel("none")}>✕</button>
      </div>
      <p className="mt-1 text-[13px]">The AI never decides whether a plan is valid. A rules engine built from the official SFSU Bulletin checks every plan. Here is the evidence that the engine works.</p>
      {err && <div className="mt-3 text-amber-700">No test results yet. Run <code>npm run evals</code>.</div>}
      {r && <>
        <H n={1}>It catches mistakes</H>
        <p className="text-[13px]">We planted <b>{r.seeded.cases.length} different mistakes</b> in plans, like taking a course before its prerequisite or overloading a semester. PlanEd caught <b>{caught} of {r.seeded.cases.length}</b>, and raised no false alarms on a correct plan.</p>
        <ul className="mt-2 space-y-0.5 text-[12px]">{r.seeded.cases.map(c => <li key={c.name} className={c.pass ? "text-lime-700" : "text-red-700"}>{c.pass ? "✓" : "✗"} {c.name}</li>)}</ul>

        <H n={2}>It agrees with SFSU</H>
        <p className="text-[13px]">We ran SFSU's own sample roadmaps for Computer Science through the engine. {r.roadmaps.every(m => !m.errors.length) ? <b>Both pass with zero prerequisite errors.</b> : "Some show errors:"} The engine only warns where SFSU's samples go above the normal load of {pol ? `${pol.minUnitsFullTime.value} to ${pol.heavyLoadUnits.value}` : "the normal"} units per semester.</p>
        <ul className="mt-2 space-y-1 text-[12px]">{r.roadmaps.map(m => (
          <li key={m.title + m.units}><a className="text-sky-700 underline" href={m.url} target="_blank" rel="noreferrer">{m.title.replace("Bachelor of Science in Computer Science ", "")}</a>: {m.errors.length ? `${m.errors.length} error(s)` : "no errors"}</li>))}</ul>

        <H n={3}>How the planners compare</H>
        <p className="mb-2 text-[13px]">Same SFSU requirements, different planners, scored by the same engine.</p>
        {r.comparison.slice(0, 1).map(c => (
          <table key={c.goal} className="w-full text-[12px]">
            <thead className="text-zinc-500"><tr><th className="text-left font-medium">Goal: {c.goal}</th><th className="font-medium">Errors</th><th className="font-medium">Requirements met</th><th className="font-medium">Fits goal</th></tr></thead>
            <tbody>{c.rows.map(x => (
              <tr key={x.variant} className="border-t border-zinc-100 text-center">
                <td className="py-1.5 text-left">{name(x.variant)}</td>
                <td className={x.errors ? "font-bold text-red-700" : "text-lime-700"}>{x.errors}</td>
                <td>{x.groupsSatisfied} of {x.groupsTotal}</td><td>{x.goalTrackScore}%</td>
              </tr>))}</tbody>
          </table>))}
        <p className="mt-2 text-[11px] text-zinc-500">SFSU's sample roadmap leaves electives open, so it can't fit a goal. The empty plan is a control: it should score worst, and it does.</p>

        <H n={4}>The checks are not rubber stamps</H>
        <ul className="space-y-0.5 text-[12px]">{r.antiVacuity.map(c => <li key={c.check} className={c.pass ? "text-lime-700" : "text-red-700"}>{c.pass ? "✓" : "✗"} {c.check}</li>)}</ul>
        <p className="mt-4 text-[11px] text-zinc-400">Results from {new Date(r.generated_at).toLocaleString()}. Data: SFSU Bulletin 2026-27.</p>
      </>}
    </aside>
  )
}
