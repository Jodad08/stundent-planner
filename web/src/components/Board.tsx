import { useEffect, useMemo } from "react"
import { Background, BackgroundVariant, Controls, MarkerType, MiniMap, Panel, ReactFlow, useNodesState, useReactFlow, type Node } from "@xyflow/react"
import { evaluatePlan } from "../../../shared/engine"
import { derive } from "../lib/derive"
import { semesterAt, COURSE_W } from "../lib/layout"
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
  const edges = useMemo(() => derived.edges.map(e => ({ ...e, markerEnd: { type: MarkerType.ArrowClosed, color: "#ef4444", width: 14, height: 14 } })), [derived.edges])
  const rf = useReactFlow()
  useEffect(() => { const t = setTimeout(() => rf.fitView({ padding: 0.06, maxZoom: 0.95, duration: 300 }), 60); return () => clearTimeout(t) }, [plan.id, rf])

  return (
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange}
      colorMode="dark" fitView fitViewOptions={{ padding: 0.06, maxZoom: 0.95 }} minZoom={0.2} nodesConnectable={false} proOptions={{ hideAttribution: true }}
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
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#1e2a4a" />
      <Controls position="bottom-right" />
      <MiniMap position="top-right" pannable zoomable bgColor="#0b1022" nodeColor={n => (n.type === "semester" ? "#1e293b" : "#6d28d9")} maskColor="rgba(11,16,34,0.7)" />
      <Panel position="top-left"><Legend /></Panel>
    </ReactFlow>
  )
}
