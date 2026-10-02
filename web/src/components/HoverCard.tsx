import type { CourseId, Dag } from "../../../shared/types"
import { useStore } from "../store"

/** Hover: title, credits, official description (D-022). */
export function HoverCard({ dag, id, critical, error }: { dag: Dag; id: CourseId; critical: { slack: number } | null; error: boolean }) {
  const desc = useStore(s => s.descriptions[id])
  const n = dag.nodes[id]
  if (!n) return null
  return (
    <div className="w-72 rounded-lg border border-white/10 bg-black/95 p-3 text-[12px] text-zinc-300 shadow-2xl">
      <div className="flex items-baseline justify-between font-mono">
        <span className="text-white">{n.code}</span><span className="text-zinc-400">{n.units} credits</span>
      </div>
      <div className="mb-1.5 text-zinc-200">{n.title}</div>
      {desc && <div className="text-[11px] leading-relaxed text-zinc-400">{desc}</div>}
      {error && <div className="mt-1.5 text-[11px] text-red-400">Breaks a rule. Click Check for details.</div>}
      {critical && <div className="mt-1.5 text-[11px] text-amber-300/90">{critical.slack < 0 ? "Its prerequisite chain runs past Year 4." : "Critical: delaying it pushes graduation back."}</div>}
    </div>
  )
}
