import { Handle, Position, type NodeProps, type Node } from "@xyflow/react"
import type { SemesterData } from "../lib/derive"
import { useStore } from "../store"

// A semester is an invisible column: only its label shows (click it to zoom in). It glows while a course is dragged over it (D-023).
const TONE: Record<string, { text: string; note: (d: SemesterData) => string }> = {
  empty: { text: "text-zinc-600", note: () => "" },
  ok: { text: "text-zinc-400", note: () => "" },
  under: { text: "text-red-400", note: d => `Below ${d.policyMin}` },
  heavy: { text: "text-amber-300", note: () => "Heavy" },
  over: { text: "text-red-400", note: () => "Over limit" },
}

export function SemesterNode({ data }: NodeProps<Node<SemesterData>>) {
  const t = TONE[data.status] ?? TONE.empty
  const zoom = useStore(s => s.zoomSem)
  return (
    // each semester's courses sit inside a soft capsule; flow arrows attach at its sides
    <div className={`relative h-full w-full rounded-[64px] border transition-all duration-300 ${data.drop ? "border-teal-300/60 bg-teal-300/[0.07] shadow-[0_0_40px_-10px_#2dd4bf]"
      : data.done ? "border-teal-300/25 bg-teal-300/[0.03]" : "border-white/10 bg-white/[0.025]"}`}>
      <Handle id="in" type="target" position={Position.Left} className="!pointer-events-none !opacity-0" />
      <Handle id="out" type="source" position={Position.Right} className="!pointer-events-none !opacity-0" />
      <button className={`pointer-events-auto w-full whitespace-nowrap px-4 pt-4 text-left font-mono text-[11px] tracking-wide ${t.text} hover:text-white`}
        title="Zoom into this semester" onClick={() => useStore.getState().setZoomSem(zoom === data.index ? null : data.index)}>
        <span className="block text-[12px] text-zinc-200">{data.termName}</span>
        <span>{data.done ? <span className="text-teal-300/80">✓ Taken · {data.units}u</span> : <>{data.units}u{t.note(data) && ` · ${t.note(data)}`}</>}</span>
      </button>
    </div>
  )
}
