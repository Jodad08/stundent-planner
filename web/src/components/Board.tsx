import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Background, BackgroundVariant, Panel, ReactFlow, useNodesState, useReactFlow, type Node } from "@xyflow/react"
import { evaluatePlan } from "../../../shared/engine"
import { derive } from "../lib/derive"
import { semesterAt, semX, COURSE_W, SEM_W, SEM_X0 } from "../lib/layout"
import { useActivePlan, useStore } from "../store"
import { CourseNode } from "./CourseNode"
import { Legend } from "./Legend"
import { PrereqEdge } from "./PrereqEdge"
import { SemesterNode } from "./SemesterNode"

const nodeTypes = { semester: SemesterNode, course: CourseNode }
const edgeTypes = { prereq: PrereqEdge }

export function useReport() {
  const plan = useActivePlan()
  const dag = useStore(s => s.dag)
  const policies = useStore(s => s.policies)
  return useMemo(() => (dag && policies ? evaluatePlan(plan, dag, policies) : null), [plan, dag, policies])
}

export function Board() {
  const plan = useActivePlan()
  const dag = useStore(s => s.dag)!
  const policies = useStore(s => s.policies)!
  const selected = useStore(s => s.selectedCourseId)
  const { selectCourse, placeCourse, moveCourse, setFlash } = useStore.getState()
  const report = useReport()!
  const [dropTarget, setDropTarget] = useState<number | null>(null)
  const zoomSem = useStore(s => s.zoomSem)
  // slider: show the next N semesters after the completed ones (D-041)
  const graphCount = useStore(s => s.graphCount)
  const winFrom = Math.min(8, (plan.completedSemesters ?? 0) + 1), winTo = Math.min(8, winFrom + graphCount - 1)
  const toGlobal = (local: number | null) => (local == null ? null : local + winFrom - 1 <= winTo ? local + winFrom - 1 : null)
  const flash = useStore(s => s.flash)
  useEffect(() => { if (!flash) return; const t = setTimeout(() => useStore.getState().setFlash(null), 7000); return () => clearTimeout(t) }, [flash])
  const derived = useMemo(() => derive(plan, dag, report, selected, policies.minUnitsFullTime.value, dropTarget, { from: winFrom, to: winTo }), [plan, dag, report, selected, policies, dropTarget, winFrom, winTo])
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(derived.nodes)
  useEffect(() => { setNodes(derived.nodes) }, [derived.nodes, setNodes])
  const edges = derived.edges
  const rf = useReactFlow()
  // smooth camera: whole degree, or one semester when its label is clicked (D-023)
  const wrap = useRef<HTMLDivElement>(null)
  const heightRef = useRef(derived.height)
  heightRef.current = derived.height
  // smooth camera tween (React Flow's animated setViewport did not move the camera here, D-023)
  const anim = useRef(0)
  const flyTo = useCallback((to: { x: number; y: number; zoom: number }, duration = 700) => {
    cancelAnimationFrame(anim.current)
    const from = rf.getViewport()
    if (!duration || document.hidden) { rf.setViewport(to); return } // hidden tabs pause animation frames
    const t0 = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / duration)
      const e = 1 - Math.pow(1 - t, 3) // ease-out cubic
      rf.setViewport({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, zoom: from.zoom + (to.zoom - from.zoom) * e })
      if (t < 1) anim.current = requestAnimationFrame(step)
    }
    anim.current = requestAnimationFrame(step)
  }, [rf])
  const fitAll = useCallback((duration = 700) => {
    const el = wrap.current
    if (!el) return
    const w = semX(winTo - winFrom + 1) + SEM_W + SEM_X0, h = heightRef.current + 20
    // readable floor: if the whole degree doesn't fit at that zoom, start at Fall 2026 and pan for the rest
    const zoom = Math.max(0.9, Math.min(1.25, (el.clientWidth - 40) / w, (el.clientHeight - 70) / h))
    const x = w * zoom <= el.clientWidth ? (el.clientWidth - w * zoom) / 2 : 16
    flyTo({ x, y: Math.max(16, (el.clientHeight - h * zoom) / 2 - 20), zoom }, duration)
  }, [flyTo, winFrom, winTo])
  useEffect(() => {
    if (zoomSem == null) { const t = setTimeout(() => fitAll(), 30); return () => clearTimeout(t) }
    const el = wrap.current
    if (!el) return
    // center the clicked semester and its neighbours, as tall as fits
    const cx = semX(zoomSem - winFrom + 1) + SEM_W / 2, h = heightRef.current + 20
    const zoom = Math.min(1.9, (el.clientHeight - 80) / h, el.clientWidth / (SEM_W * 3.2))
    flyTo({ x: el.clientWidth / 2 - cx * zoom, y: Math.max(20, (el.clientHeight - h * zoom) / 2), zoom })
  }, [zoomSem, plan.id, fitAll, flyTo, winFrom, winTo])
  useEffect(() => {
    const onResize = () => { if (useStore.getState().zoomSem == null) fitAll(0) }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") useStore.getState().setZoomSem(null) }
    window.addEventListener("resize", onResize); window.addEventListener("keydown", onKey)
    return () => { window.removeEventListener("resize", onResize); window.removeEventListener("keydown", onKey) }
  }, [fitAll])

  return (
    <div ref={wrap} className="h-full w-full">
    <ReactFlow data-tour="board" nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange}
      onInit={() => setTimeout(() => fitAll(0), 50)}
      colorMode="dark" minZoom={0.2} maxZoom={2.5} panOnDrag zoomOnScroll zoomOnPinch nodesConnectable={false} proOptions={{ hideAttribution: true }}
      onNodeClick={(_e, n) => { if (n.type === "course") selectCourse(selected === (n.data as { id: string }).id ? null : (n.data as { id: string }).id) }}
      onPaneClick={() => selectCourse(null)}

      onNodeDrag={(_e, n) => { if (n.type === "course") setDropTarget(toGlobal(semesterAt(n.position.x + COURSE_W / 2))) }}
      onNodeDragStop={(_e, n) => {
        setDropTarget(null)
        if (n.type !== "course") return
        const to = toGlobal(semesterAt(n.position.x + COURSE_W / 2))
        const id = (n.data as { id: string }).id
        if (to) moveCourse(id, to)
        else setNodes(derived.nodes) // dropped outside the semesters: snap back
      }}
      onDragOver={e => {
        e.preventDefault(); e.dataTransfer.dropEffect = "move"
        setDropTarget(toGlobal(semesterAt(rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }).x)))
      }}
      onDragLeave={() => setDropTarget(null)}
      onDrop={e => {
        e.preventDefault()
        setDropTarget(null)
        const id = e.dataTransfer.getData("application/gatorgraph")
        if (!id) return
        const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
        const to = toGlobal(semesterAt(p.x))
        // already planned (dragged from the course list) → move it; otherwise place it
        if (to) (plan.semesters.some(x => x.courseIds.includes(id)) ? moveCourse : placeCourse)(id, to)
        else setFlash(`Drop ${id} onto a semester box.`)
      }}>
      <Background variant={BackgroundVariant.Dots} gap={28} size={0.8} color="#18181b" />
      <Panel position="top-left">
        <div className="flex items-center gap-3 rounded-full border border-white/10 bg-black/70 px-4 py-2 text-[12px] text-zinc-300 backdrop-blur">
          <span>Show next</span>
          <input type="range" min={1} max={8 - winFrom + 1} value={Math.min(graphCount, 8 - winFrom + 1)} onChange={e => useStore.getState().setGraphCount(Number(e.target.value))} className="w-28 accent-lime-300" />
          <b className="w-28 text-white">{winTo - winFrom + 1} semester{winTo > winFrom ? "s" : ""}</b>
        </div>
      </Panel>
      <Panel position="top-right">
        {/* XP: planned units toward the degree (D-055) */}
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/70 px-4 py-2 font-mono text-[11px] text-zinc-300 backdrop-blur">
          <span className="font-bold text-lime-300">XP</span>
          <div className="h-2 w-40 overflow-hidden rounded-full bg-white/10"><div className="h-2 rounded-full bg-gradient-to-r from-lime-300 to-teal-300 transition-all duration-700" style={{ width: `${Math.min(100, report.totalUnitsPlanned / dag.program.degree_units * 100)}%` }} /></div>
          <span>{report.totalUnitsPlanned}/{dag.program.degree_units}</span>
          {report.totalUnitsPlanned >= dag.program.degree_units && <span>🏆</span>}
        </div>
      </Panel>
      <Panel position="bottom-left"><Legend /></Panel>
      {flash && (
        <Panel position="top-center">
          <div className="max-w-xl rounded-full border border-teal-300/30 bg-black/90 px-4 py-1.5 font-mono text-[11px] text-teal-200 shadow-[0_0_24px_-6px_#2dd4bf]">{flash}</div>
        </Panel>
      )}
      {zoomSem != null && (
        <Panel position="top-right">
          <button onClick={() => useStore.getState().setZoomSem(null)} title="Back to all semesters (Esc)"
            className="flex items-center gap-2 rounded-full border border-white/10 bg-black/80 px-3 py-1.5 font-mono text-xs text-zinc-300 backdrop-blur hover:text-white">
            <span className="text-base leading-none">×</span> All semesters
          </button>
        </Panel>
      )}
    </ReactFlow>
    </div>
  )
}
