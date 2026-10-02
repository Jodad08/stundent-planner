// plan + engine report -> React Flow nodes and edges. Never stored; recomputed on every change.
import type { Edge, Node } from "@xyflow/react"
import { criticalCourses, isPlaceholder, placeholderUnits } from "../../../shared/engine"
import type { CourseId, Dag, EngineReport, Plan, PrereqExpr } from "../../../shared/types"
import { coursePos, semHeight, semX, SEM_W, SEM_Y } from "./layout"

export const slug = (id: CourseId) => "course-" + id.replace(/\s+/g, "-")

export type SemesterData = { index: number; label: string; units: number; status: string; year: number; policyMin: number }
export type CourseData = {
  id: CourseId; title: string; units: number; placeholder: boolean; category: string
  hasError: boolean; critical: null | { slack: number; chain: CourseId[] }; dim: boolean; highlight: boolean
}
export type EdgeData = { state: "satisfied" | "violated"; kind: "prereq" | "prereqOr" | "coreq"; dim: boolean }

type Link = { from: CourseId; kind: EdgeData["kind"] }
function links(expr: PrereqExpr, inOr = false, out: Link[] = []): Link[] {
  if (!expr) return out
  if (typeof expr === "string") out.push({ from: expr, kind: inOr ? "prereqOr" : "prereq" })
  else if ("and" in expr) expr.and.forEach(x => links(x, inOr, out))
  else if ("or" in expr) expr.or.forEach(x => links(x, true, out))
  else if ("course" in expr) out.push({ from: expr.course, kind: inOr ? "prereqOr" : "prereq" })
  else if ("coreq" in expr) out.push({ from: expr.coreq, kind: "coreq" })
  return out
}

export function category(dag: Dag, id: CourseId): string {
  if (isPlaceholder(id)) return "ge"
  const r = dag.requirements.find(g => g.courses.includes(id))
  if (!r) return "other"
  if (r.type === "choose_units") return "elective"
  return r.id.startsWith("math") ? "math" : "core"
}

/** Upstream + downstream closure of a course over the catalog prerequisites. */
export function chainOf(dag: Dag, id: CourseId): Set<CourseId> {
  const out = new Set<CourseId>([id])
  const up = (c: CourseId) => { for (const l of links(dag.nodes[c]?.prereq ?? null)) if (!out.has(l.from) && dag.nodes[l.from]) { out.add(l.from); up(l.from) } }
  const down = (c: CourseId) => { for (const n of Object.values(dag.nodes)) if (!out.has(n.code) && links(n.prereq).some(l => l.from === c)) { out.add(n.code); down(n.code) } }
  up(id); down(id)
  return out
}

export function derive(plan: Plan, dag: Dag, report: EngineReport, selected: CourseId | null, minUnits: number) {
  const nodes: Node[] = []
  const edges: Edge[] = []
  const semOf = new Map<CourseId, number>()
  plan.semesters.forEach(s => s.courseIds.forEach(c => semOf.set(c, s.index)))
  const errored = new Set(report.issues.filter(i => i.severity === "error").map(i => i.courseIds[0]).filter(Boolean))
  const violated = new Set(report.issues.filter(i => i.code === "PREREQ_ORDER" || i.code === "COREQ_ORDER")
    .flatMap(i => i.courseIds.slice(1).map(p => `${p}>${i.courseIds[0]}`)))
  const crit = criticalCourses(plan, dag)
  const chain = selected ? chainOf(dag, selected) : null

  for (const s of plan.semesters) {
    const stat = report.semesterStats.find(x => x.index === s.index)!
    nodes.push({ id: `sem-${s.index}`, type: "semester", position: { x: semX(s.index), y: SEM_Y }, draggable: false, selectable: false,
      style: { width: SEM_W, height: semHeight(s.courseIds.length) },
      data: { index: s.index, label: s.label, units: stat.units, status: stat.status, year: Math.ceil(s.index / 2), policyMin: minUnits } satisfies SemesterData })
    s.courseIds.forEach((id, k) => {
      const ph = isPlaceholder(id)
      const c = crit[id]
      nodes.push({ id: slug(id), type: "course", parentId: `sem-${s.index}`, position: coursePos(k),
        data: { id, title: ph ? "GE or free elective (placeholder)" : dag.nodes[id]?.title ?? "Unknown course",
          units: ph ? placeholderUnits(id) : dag.nodes[id]?.units ?? 0, placeholder: ph, category: category(dag, id),
          hasError: errored.has(id), critical: c && c.slack <= 0 ? c : null,
          dim: !!chain && !chain.has(id), highlight: !!chain && chain.has(id) } satisfies CourseData })
    })
  }
  for (const id of semOf.keys()) {
    const node = dag.nodes[id]
    if (!node) continue
    for (const l of links(node.prereq)) {
      if (!semOf.has(l.from)) continue
      const state = violated.has(`${l.from}>${id}`) ? "violated" : "satisfied"
      edges.push({ id: `edge-${l.from}-${id}`, source: slug(l.from), target: slug(id), type: "prereq", zIndex: state === "violated" ? 10 : 1,
        data: { state, kind: l.kind, dim: !!chain && !(chain.has(id) && chain.has(l.from)) } satisfies EdgeData })
    }
  }
  return { nodes, edges }
}
