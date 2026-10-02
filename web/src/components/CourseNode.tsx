import { useState, useRef } from "react"
import { Handle, NodeToolbar, Position, type Node, type NodeProps } from "@xyflow/react"
import type { CourseData } from "../lib/derive"
import { useStore } from "../store"
import { HoverCard } from "./HoverCard"

export const STRIPE: Record<string, string> = {
  core: "bg-violet-500", math: "bg-sky-400", elective: "bg-sf-gold", ge: "bg-slate-500", other: "bg-slate-400",
}

export function CourseNode({ data }: NodeProps<Node<CourseData>>) {
  const [hover, setHover] = useState(false)
  const t = useRef<ReturnType<typeof setTimeout>>(undefined)
  const dag = useStore(s => s.dag)
  const unplace = useStore(s => s.unplaceCourse)
  return (
    <div onMouseEnter={() => { t.current = setTimeout(() => setHover(true), 150) }}
      onMouseLeave={() => { clearTimeout(t.current); setHover(false) }}
      className={`group relative flex h-[62px] w-[220px] overflow-hidden rounded-lg border bg-slate-900 shadow-md
        ${data.highlight ? "border-sf-gold ring-2 ring-sf-gold/60" : data.placeholder ? "border-slate-700 border-dashed" : "border-slate-600"}
        ${data.dim ? "dimmed" : ""}`}>
      <div className={`w-1.5 shrink-0 ${STRIPE[data.category]}`} />
      <div className="min-w-0 flex-1 px-2 py-1.5">
        <div className="flex items-center justify-between">
          <span className={`font-mono text-[13px] font-bold ${data.placeholder ? "text-slate-400" : "text-slate-50"}`}>{data.placeholder ? "GE" : data.id}</span>
          <span className="rounded bg-slate-700/80 px-1.5 text-[10px] text-slate-200">{data.units} cr</span>
        </div>
        <div className="truncate text-[11px] text-slate-400">{data.title}</div>
        {data.critical && (
          <div className={`mt-0.5 truncate text-[10px] font-semibold ${data.critical.slack < 0 ? "text-red-300" : "text-amber-300"}`}>
            {data.critical.slack < 0 ? `⚠ chain runs ${-data.critical.slack} sem past Year 4` : "⏱ Critical: delaying it costs a semester"}
          </div>
        )}
      </div>
      {data.hasError && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-slate-900" title="Rule error" />}
      <button onClick={e => { e.stopPropagation(); unplace(data.id) }} title="Remove from plan"
        className="absolute bottom-1 right-1 hidden h-4 w-4 items-center justify-center rounded bg-slate-700 text-[10px] text-slate-200 hover:bg-red-600 group-hover:flex">×</button>
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-slate-500" />
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !border-0 !bg-slate-500" />
      {dag && !data.placeholder && <NodeToolbar isVisible={hover} position={Position.Right}><HoverCard dag={dag} id={data.id} /></NodeToolbar>}
    </div>
  )
}
