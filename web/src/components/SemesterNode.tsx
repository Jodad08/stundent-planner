import type { NodeProps, Node } from "@xyflow/react"
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
    <div className={`h-full w-full rounded-3xl transition-all duration-300 ${data.drop ? "bg-teal-300/[0.06] shadow-[0_0_40px_-10px_#2dd4bf] ring-1 ring-teal-300/40" : ""}`}>
      <button className={`pointer-events-auto w-full px-3 pt-2 text-left font-mono text-[11px] tracking-wide ${t.text} hover:text-white`}
        title="Zoom into this semester" onClick={() => useStore.getState().setZoomSem(zoom === data.index ? null : data.index)}>
        <span className="block text-[12px] text-zinc-200">{data.termName}</span>
        <span>{data.done ? <span className="text-teal-300/80">✓ Taken · {data.units}u</span> : <>{data.units}u{t.note(data) && ` · ${t.note(data)}`}</>}</span>
      </button>
    </div>
  )
}
