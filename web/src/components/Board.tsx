import { useEffect, useMemo, useRef } from "react"
import { Background, BackgroundVariant, Panel, ReactFlow, useNodesState, useReactFlow, type Node } from "@xyflow/react"
import { evaluatePlan } from "../../../shared/engine"
import { derive } from "../lib/derive"
import { semesterAt, semHeight, semX, COURSE_W, SEM_W, SEM_X0, SEM_Y } from "../lib/layout"
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
  const derived = useMemo(() => derive(plan, dag, report, selected, policies.minUnitsFullTime.value), [plan, dag, report, selected, policies])
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(derived.nodes)
  useEffect(() => { setNodes(derived.nodes) }, [derived.nodes, setNodes])
  const edges = derived.edges
  const rf = useReactFlow()
  // fit the fixed 8-column layout to the canvas (computed, so it works before nodes are measured)
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const fit = () => {
      const el = wrap.current
      if (!el) return
      const tallest = Math.max(...plan.semesters.map(s => semHeight(s.courseIds.length)))
      const w = semX(8) + SEM_W + SEM_X0, h = SEM_Y + tallest + 40
      const zoom = Math.min(1.2, (el.clientWidth - 40) / w, (el.clientHeight - 60) / h)
      rf.setViewport({ x: (el.clientWidth - w * zoom) / 2, y: Math.max(16, (el.clientHeight - h * zoom) / 2 - 30), zoom }, { duration: 250 })
    }
    const t = setTimeout(fit, 30)
    window.addEventListener("resize", fit)
    return () => { clearTimeout(t); window.removeEventListener("resize", fit) }
  }, [plan.id, rf]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={wrap} className="h-full w-full">
    <ReactFlow data-tour="board" nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange}
      colorMode="dark" minZoom={0.2} nodesConnectable={false} proOptions={{ hideAttribution: true }}
      onNodeClick={(_e, n) => { if (n.type === "course") selectCourse(selected === (n.data as { id: string }).id ? null : (n.data as { id: string }).id) }}
      onPaneClick={() => selectCourse(null)}
      onNodeDragStop={(_e, n) => {
        if (n.type !== "course") return
        const parent = nodes.find(x => x.id === n.parentId)
        const absX = (parent?.position.x ?? 0) + n.position.x + COURSE_W / 2
        const to = semesterAt(absX)
        const id = (n.data as { id: string }).id
        if (to) moveCourse(id, to)
        else setNodes(derived.nodes) // dropped outside the semesters: snap back
      }}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move" }}
      onDrop={e => {
        e.preventDefault()
        const id = e.dataTransfer.getData("application/gatorgraph")
        if (!id) return
        const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
        const to = semesterAt(p.x)
        if (to) placeCourse(id, to)
        else setFlash(`Drop ${id} onto a semester box.`)
      }}>
      <Background variant={BackgroundVariant.Dots} gap={28} size={0.8} color="#18181b" />
      <Panel position="bottom-left"><Legend /></Panel>
    </ReactFlow>
    </div>
  )
}
