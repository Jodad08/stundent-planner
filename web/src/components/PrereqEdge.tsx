import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react"
import type { EdgeData } from "../lib/derive"

// Thin and quiet when satisfied; glowing red when a rule is broken (D-022).
export function PrereqEdge(p: EdgeProps<Edge<EdgeData>>) {
  const [path, lx, ly] = getBezierPath(p)
  const d = p.data!
  const violated = d.state === "violated"
  const stroke = violated ? "#ff3b3b" : d.kind === "coreq" ? "#2dd4bf" : d.kind === "prereqOr" ? "#5eead4" : "#ffffff"
  const style = {
    stroke, strokeWidth: violated ? 2 : 1,
    strokeDasharray: violated ? "8 5" : d.kind === "prereqOr" ? "3 5" : d.kind === "coreq" ? "1 4" : undefined,
    opacity: d.dim ? 0.04 : violated ? 1 : d.kind === "prereq" ? 0.18 : 0.45,
  }
  return (
    <>
      <BaseEdge id={p.id} path={path} style={style} className={violated ? "edge-violated" : d.kind === "prereqOr" ? "edge-or" : ""} />
      {violated && d.label && !d.dim && (
        <EdgeLabelRenderer>
          <div style={{ transform: `translate(-50%,-50%) translate(${lx}px,${ly}px)` }}
            className="pointer-events-none absolute font-mono text-[10px] text-red-400">out of order</div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
