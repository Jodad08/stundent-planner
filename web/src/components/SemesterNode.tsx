import type { NodeProps, Node } from "@xyflow/react"
import type { SemesterData } from "../lib/derive"

const STYLE: Record<string, { box: string; chip: string; text: (d: SemesterData) => string }> = {
  empty: { box: "border-slate-600/70 bg-slate-800/20", chip: "bg-slate-700 text-slate-300", text: () => "Empty" },
  ok: { box: "border-emerald-500/70 bg-emerald-500/5", chip: "bg-emerald-600/30 text-emerald-200", text: () => "OK" },
  under: { box: "border-red-500/80 bg-red-500/10", chip: "bg-red-600/40 text-red-100", text: d => `Below ${d.policyMin}` },
  heavy: { box: "border-amber-400/80 bg-amber-400/10", chip: "bg-amber-500/30 text-amber-100", text: () => "Heavy" },
  over: { box: "border-red-500 bg-red-600/25 border-[3px]", chip: "bg-red-600 text-white", text: () => "Over limit" },
}

export function SemesterNode({ data }: NodeProps<Node<SemesterData>>) {
  const st = STYLE[data.status] ?? STYLE.empty
  return (
    <div className={`semester-box h-full w-full rounded-xl border-2 border-dashed ${st.box}`}>
      {data.index % 2 === 1 && <div className="absolute -top-7 left-0 text-xs font-semibold uppercase tracking-widest text-sf-gold/80">Year {data.year}</div>}
      <div className="flex items-center justify-between px-3 pt-3">
        <div className="text-sm font-semibold text-slate-100">{data.label}</div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-slate-300">{data.units} units</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.chip}`}>{st.text(data)}</span>
        </div>
      </div>
    </div>
  )
}
