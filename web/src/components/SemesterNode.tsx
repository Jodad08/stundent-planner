import type { NodeProps, Node } from "@xyflow/react"
import type { SemesterData } from "../lib/derive"

// Status shows as the label color only; the column itself stays almost invisible (D-022).
const TONE: Record<string, { text: string; line: string; note: (d: SemesterData) => string }> = {
  empty: { text: "text-zinc-600", line: "border-white/5", note: () => "" },
  ok: { text: "text-zinc-400", line: "border-white/8", note: () => "" },
  under: { text: "text-red-400", line: "border-red-500/30", note: d => `below ${d.policyMin}` },
  heavy: { text: "text-amber-300", line: "border-amber-400/30", note: () => "heavy" },
  over: { text: "text-red-400", line: "border-red-500/60", note: () => "over limit" },
}

export function SemesterNode({ data }: NodeProps<Node<SemesterData>>) {
  const t = TONE[data.status] ?? TONE.empty
  return (
    <div className={`h-full w-full rounded-2xl border border-dashed ${t.line} bg-white/[0.015]`}>
      <div className={`px-3 pt-3 font-mono text-[11px] tracking-wide ${t.text}`}>
        {data.label.replace("Year ", "y").replace("Spring", "spr").toLowerCase()} <span className="text-zinc-600">·</span> {data.units}u
        {t.note(data) && <span className="ml-1">· {t.note(data)}</span>}
      </div>
    </div>
  )
}
