import { useState, useRef } from "react"
import { Handle, NodeToolbar, Position, type Node, type NodeProps } from "@xyflow/react"
import type { CourseData } from "../lib/derive"
import { useStore } from "../store"
import { HoverCard } from "./HoverCard"

/** Category colors (dot ring + glow), Graphify-style. */
export const COLOR: Record<string, string> = {
  core: "#a78bfa", math: "#2dd4bf", elective: "#f5a524", ge: "#52525b", other: "#a1a1aa",
}

/** A course is a "level bubble" (D-055): code inside the circle so arrows meet its edge, never the text. */
export function CourseNode({ data }: NodeProps<Node<CourseData>>) {
  const [hover, setHover] = useState(false)
  const t = useRef<ReturnType<typeof setTimeout>>(undefined)
  const dag = useStore(s => s.dag)
  const unplace = useStore(s => s.unplaceCourse)
  const c = data.hasError ? "#ff3b3b" : COLOR[data.category]
  const [subj, num] = data.placeholder ? ["GE", `${data.units}u`] : [data.id.split(" ").slice(0, -1).join(" "), data.id.split(" ").pop()]
  return (
    <div onMouseEnter={() => { t.current = setTimeout(() => setHover(true), 150) }}
      onMouseLeave={() => { clearTimeout(t.current); setHover(false) }}
      className={`bubble-in group relative h-[64px] w-[64px] ${data.dim ? "dimmed" : ""}`}>
      <div className={`dot flex h-full w-full flex-col items-center justify-center rounded-full font-mono leading-none transition-transform duration-200 group-hover:scale-110 ${data.hasError ? "dot-error" : ""} ${data.current && !data.placeholder ? "bubble-current" : ""}`}
        style={{ border: `${data.placeholder ? "2px dashed" : "3px solid"} ${c}`, background: data.placeholder ? "transparent" : data.done ? `${c}66` : `${c}26`,
          ["--glow" as string]: data.highlight || data.hasError ? c : `${c}55` }}>
        <span className="text-[9px] text-zinc-400">{subj}</span>
        <span className={`text-[15px] font-bold ${data.placeholder ? "text-zinc-500" : data.highlight || data.done ? "text-white" : "text-zinc-200"}`}
          style={data.hasError ? { color: "#ff6b6b" } : undefined}>{num}</span>
      </div>
      {/* badges: ✓ taken, units */}
      {data.done && !data.placeholder && <span className="absolute -left-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-teal-300 text-[11px] font-bold text-zinc-900">✓</span>}
      {!data.placeholder && <span className="absolute -bottom-1 -right-1 rounded-full bg-zinc-800 px-1.5 text-[10px] font-semibold text-zinc-200 ring-1 ring-white/10">{data.units}</span>}
      <button onClick={e => { e.stopPropagation(); unplace(data.geIds ? data.geIds[data.geIds.length - 1] : data.id) }} title={data.geIds ? "Remove 3 GE units" : "Remove"}
        className="absolute -right-1 -top-1 hidden h-5 w-5 rounded-full bg-zinc-800 text-[11px] text-zinc-300 hover:bg-red-500 hover:text-white group-hover:block">×</button>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      {dag && !data.placeholder && <NodeToolbar isVisible={hover} position={Position.Right}><HoverCard dag={dag} id={data.id} critical={data.critical} error={data.hasError} /></NodeToolbar>}
    </div>
  )
}
