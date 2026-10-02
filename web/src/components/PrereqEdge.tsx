import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react"
import type { EdgeData } from "../lib/derive"

export function PrereqEdge(p: EdgeProps<Edge<EdgeData>>) {
  const [path, lx, ly] = getBezierPath(p)
  const d = p.data!
  const violated = d.state === "violated"
  const color = d.kind === "coreq" ? "#60a5fa" : "#ef4444"
  const style = {
    stroke: color,
    strokeWidth: violated ? 3 : 1.5,
    strokeDasharray: violated ? undefined : d.kind === "prereqOr" ? "6 4" : d.kind === "coreq" ? "2 3" : undefined,
    opacity: d.dim ? 0.08 : violated ? 1 : 0.55,
  }
  return (
    <>
      <BaseEdge id={p.id} path={path} style={style} markerEnd={p.markerEnd} className={violated ? "edge-violated" : ""} />
      {(violated || d.kind === "prereqOr") && !d.dim && (
        <EdgeLabelRenderer>
          <div style={{ transform: `translate(-50%,-50%) translate(${lx}px,${ly}px)` }}
            className={`pointer-events-none absolute rounded px-1 text-[10px] font-bold ${violated ? "bg-red-600 text-white" : "bg-slate-800 text-red-300"}`}>
            {violated ? "⚠ order" : "or"}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
