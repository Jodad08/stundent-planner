import { describe } from "../../../shared/engine"
import type { CourseId, Dag } from "../../../shared/types"

export function HoverCard({ dag, id }: { dag: Dag; id: CourseId }) {
  const n = dag.nodes[id]
  if (!n) return null
  const desc = n.bulletin_prerequisite_text
  return (
    <div className="w-80 rounded-lg border border-slate-600 bg-slate-900/95 p-3 text-xs text-slate-200 shadow-2xl">
      <div className="font-mono text-sm font-bold text-sf-gold">{n.code}</div>
      <div className="mb-2 font-semibold">{n.title}</div>
      <div className="mb-1"><span className="text-slate-400">Credits:</span> {n.units}</div>
      <div className="mb-1"><span className="text-slate-400">Prerequisites (engine):</span> {describe(n.prereq)}</div>
      {desc && <div className="mb-1 italic text-slate-400">Bulletin: "{desc}"</div>}
      {n.conditions.length > 0 && <div className="mb-1 text-amber-200">Conditions: {n.conditions.join("; ")}</div>}
      <div className="mt-2 flex items-center justify-between">
        <a className="text-sky-300 underline" href={n.url} target="_blank" rel="noreferrer">View in Bulletin</a>
        <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300" title="Scraped and machine-checked against the 2026-27 Bulletin; not yet checked by a person">Unverified</span>
      </div>
    </div>
  )
}
