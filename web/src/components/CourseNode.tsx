import { useState, useRef } from "react"
import { Handle, NodeToolbar, Position, type Node, type NodeProps } from "@xyflow/react"
import type { CourseData } from "../lib/derive"
import { useStore } from "../store"
import { HoverCard } from "./HoverCard"

/** Category colors (dot ring + glow), Graphify-style. */
export const COLOR: Record<string, string> = {
  core: "#a78bfa", math: "#2dd4bf", elective: "#f5a524", ge: "#52525b", other: "#a1a1aa",
}

export function CourseNode({ data }: NodeProps<Node<CourseData>>) {
  const [hover, setHover] = useState(false)
  const t = useRef<ReturnType<typeof setTimeout>>(undefined)
  const dag = useStore(s => s.dag)
  const unplace = useStore(s => s.unplaceCourse)
  const c = data.hasError ? "#ff3b3b" : COLOR[data.category]
  const size = data.placeholder ? 12 : 22
  return (
    <div onMouseEnter={() => { t.current = setTimeout(() => setHover(true), 150) }}
      onMouseLeave={() => { clearTimeout(t.current); setHover(false) }}
      className={`group relative flex h-[32px] w-[124px] items-center gap-3 ${data.dim ? "dimmed" : ""}`}>
      <span className={`dot shrink-0 rounded-full ${data.hasError ? "dot-error" : ""}`}
        style={{ width: size, height: size, border: `2px solid ${c}`, background: data.placeholder ? "transparent" : `${c}33`,
          ["--glow" as string]: data.highlight || data.hasError ? c : `${c}55` }} />
      <span className={`truncate font-mono text-[11px] ${data.placeholder ? "text-zinc-600" : data.highlight ? "text-white" : "text-zinc-300"}`}
        style={data.hasError ? { color: "#ff6b6b" } : undefined}>
        {data.placeholder ? `GE ${data.units}u` : data.id}
      </span>
      <button onClick={e => { e.stopPropagation(); unplace(data.geIds ? data.geIds[data.geIds.length - 1] : data.id) }} title={data.geIds ? "Remove 3 GE units" : "Remove"}
        className="ml-auto hidden text-[11px] text-zinc-600 hover:text-red-400 group-hover:block">×</button>
      <Handle type="target" position={Position.Left} style={{ left: size / 2 }} />
      <Handle type="source" position={Position.Right} style={{ left: size / 2, right: "auto" }} />
      {dag && !data.placeholder && <NodeToolbar isVisible={hover} position={Position.Right}><HoverCard dag={dag} id={data.id} critical={data.critical} error={data.hasError} /></NodeToolbar>}
    </div>
  )
}
