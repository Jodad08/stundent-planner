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

export function ProofPanel() {
  const [r, setR] = useState<EvalResults | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { api.evals().then(x => setR(x as unknown as EvalResults)).catch(e => setErr(e.message)) }, [])
  const st = useStore.getState()
  return (
    <aside className="w-[560px] shrink-0 overflow-y-auto border-l border-white/10 bg-black p-4 text-sm text-slate-200">
      <div className="flex items-center justify-between"><div className="text-base font-semibold">Proof: same requirements, different planners</div>
        <button className="text-slate-400 hover:text-white" onClick={() => st.setPanel("none")}>✕</button></div>
      {err && <div className="mt-3 text-amber-300">No eval results yet. Run <code>npm run evals</code>. ({err})</div>}
      {r && <>
        <div className="mt-1 text-xs text-slate-500">Generated {new Date(r.generated_at).toLocaleString()} · model provider: {r.provider} · every number below is computed by the rules engine</div>
        {r.comparison.map(c => (
          <div key={c.goal} className="mt-4">
            <div className="mb-1 font-semibold">Goal: "{c.goal}" <span className="text-xs font-normal text-slate-500">(track: {c.trackId})</span></div>
            <table className="w-full text-xs">
              <thead className="text-slate-400"><tr><th className="text-left">Planner</th><th>Rule errors</th><th>Groups done</th><th>Semesters</th><th>Units</th><th>Goal fit</th><th>Model calls</th></tr></thead>
              <tbody>{c.rows.map(x => (
                <tr key={x.variant} className="border-t border-white/10 text-center">
                  <td className="py-1 text-left">{x.variant}</td>
                  <td className={x.errors ? "font-bold text-red-300" : "text-emerald-300"}>{x.errors}</td>
                  <td>{x.groupsSatisfied}/{x.groupsTotal}</td><td>{x.semesters}</td><td>{x.units}</td><td>{x.goalTrackScore}</td><td>{x.attempts ?? "–"}</td>
                </tr>))}</tbody>
            </table>
          </div>))}
        <div className="mt-5 font-semibold">Official SFSU roadmaps, checked by the engine</div>
        <ul className="mt-1 space-y-1 text-xs">{r.roadmaps.map(m => (
          <li key={m.title + m.units} className="rounded border border-white/10 bg-white/[0.03] p-2">
            <a className="text-sky-300 underline" href={m.url} target="_blank" rel="noreferrer">{m.title}</a> · {m.units} units · {m.errors.length ? <span className="text-red-300">{m.errors.length} rule error(s)</span> : <span className="text-emerald-300">no rule errors</span>}
            {m.errors.slice(0, 4).map((e, i) => <div key={i} className="mt-1 text-slate-400">• {e}</div>)}
          </li>))}</ul>
        <div className="mt-5 font-semibold">Seeded-error suite</div>
        <div className="text-xs text-slate-400">Precision {r.seeded.precision.toFixed(2)} · Recall {r.seeded.recall.toFixed(2)} · errors on the valid plan: {r.seeded.validFixtureErrors}</div>
        <ul className="mt-1 space-y-0.5 text-xs">{r.seeded.cases.map(c => <li key={c.name} className={c.pass ? "text-emerald-300" : "text-red-300"}>{c.pass ? "✓" : "✗"} {c.name}: expected {c.expected.join(", ")}</li>)}</ul>
        <div className="mt-4 font-semibold">Anti-vacuity checks</div>
        <ul className="mt-1 space-y-0.5 text-xs">{r.antiVacuity.map(c => <li key={c.check} className={c.pass ? "text-emerald-300" : "text-red-300"}>{c.pass ? "✓" : "✗"} {c.check}</li>)}</ul>
      </>}
    </aside>
  )
}
