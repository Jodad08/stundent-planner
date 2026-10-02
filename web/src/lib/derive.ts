// plan + engine report -> React Flow nodes and edges. Never stored; recomputed on every change.
import { MarkerType, type Edge, type Node } from "@xyflow/react"
import { criticalCourses, isPlaceholder, placeholderUnits } from "../../../shared/engine"
import type { CourseId, Dag, EngineReport, Plan, PrereqExpr } from "../../../shared/types"
import { semX, COURSE_STEP, COURSE_X, COURSE_Y0, SEM_W, SEM_Y } from "./layout"

export const slug = (id: CourseId) => "course-" + id.replace(/\s+/g, "-")

export type SemesterData = { index: number; label: string; termName: string; units: number; status: string; year: number; policyMin: number; geUnits: number; drop: boolean; done: boolean; next?: boolean }
export type CourseData = {
  id: CourseId; title: string; units: number; placeholder: boolean; category: string
  hasError: boolean; critical: null | { slack: number; chain: CourseId[] }; dim: boolean; highlight: boolean
  geIds?: CourseId[] // grouped GE placeholders of one semester
  done?: boolean; current?: boolean // taken already / in the next semester (D-055)
}
export type EdgeData = { state: "satisfied" | "violated"; kind: "prereq" | "prereqOr" | "coreq"; dim: boolean; label: boolean }

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

/**
 * Crossing reduction (layered-graph barycenter heuristic): reorder courses inside each semester so a course
 * sits near the courses it depends on, then give each a y as close to its prerequisites' average as spacing allows.
 */
function arrange(cols: CourseId[][], prereqs: Map<CourseId, CourseId[]>, deps: Map<CourseId, CourseId[]>): Map<CourseId, number> {
  const y = new Map<CourseId, number>()
  const assign = () => cols.forEach(col => col.forEach((id, k) => y.set(id, k)))
  const bary = (ids: CourseId[] | undefined, fallback: number) => {
    const v = (ids ?? []).filter(i => y.has(i)).map(i => y.get(i)!)
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : fallback
  }
  assign()
  for (let it = 0; it < 6; it++) {
    for (let c = 1; c < cols.length; c++) { cols[c].sort((a, b) => bary(prereqs.get(a), y.get(a)!) - bary(prereqs.get(b), y.get(b)!)); cols[c].forEach((id, k) => y.set(id, k)) }
    for (let c = cols.length - 2; c >= 0; c--) { cols[c].sort((a, b) => bary(deps.get(a), y.get(a)!) - bary(deps.get(b), y.get(b)!)); cols[c].forEach((id, k) => y.set(id, k)) }
  }
  // positions: pull each course toward its prerequisites' average row, keeping one row of spacing
  const pos = new Map<CourseId, number>()
  for (const col of cols) {
    let prev = -1
    for (const id of col) {
      const ps = (prereqs.get(id) ?? []).filter(p => pos.has(p))
      const want = ps.length ? ps.reduce((acc, p) => acc + pos.get(p)!, 0) / ps.length : prev + 1
      const row = Math.max(prev + 1, Math.round(want * 2) / 2)
      pos.set(id, row); prev = row
    }
  }
  return pos
}

/** "Fall 2026", "Spring 2027"...: semester 1 = fall of the Bulletin's first year (2026-2027 → Fall 2026). */
export function termName(dag: Dag, index: number): string {
  const start = parseInt(dag.program.bulletin, 10)
  return index % 2 === 1 ? `Fall ${start + (index - 1) / 2}` : `Spring ${start + index / 2}`
}

/** win: the semesters to draw (graph slider, D-041); columns are packed from the left. */
export function derive(plan: Plan, dag: Dag, report: EngineReport, selected: CourseId | null, minUnits: number, dropTarget: number | null = null,
  win: { from: number; to: number } = { from: 1, to: 8 }) {
  const shownSems = plan.semesters.filter(s => s.index >= win.from && s.index <= win.to)
  const col = (index: number) => semX(index - win.from + 1)
  const nodes: Node[] = []
  const edges: Edge[] = []
  const semOf = new Map<CourseId, number>()
  plan.semesters.forEach(s => s.courseIds.forEach(c => semOf.set(c, s.index)))
  const errored = new Set(report.issues.filter(i => i.severity === "error").map(i => i.courseIds[0]).filter(Boolean))
  const violated = new Set(report.issues.filter(i => i.code === "PREREQ_ORDER" || i.code === "COREQ_ORDER")
    .flatMap(i => i.courseIds.slice(1).map(p => `${p}>${i.courseIds[0]}`)))
  const crit = criticalCourses(plan, dag)
  // click: the course, what it needs and what it unlocks; direct links only (D-036)
  const near = selected ? new Set<CourseId>([selected,
    ...links(dag.nodes[selected]?.prereq ?? null).map(l => l.from),
    ...[...semOf.keys()].filter(id => links(dag.nodes[id]?.prereq ?? null).some(l => l.from === selected))]) : null

  // graph for layout: planned prerequisite links only
  const prereqs = new Map<CourseId, CourseId[]>(), deps = new Map<CourseId, CourseId[]>()
  for (const id of semOf.keys()) {
    const from = links(dag.nodes[id]?.prereq ?? null).map(l => l.from).filter(f => semOf.has(f) && f !== id)
    prereqs.set(id, from)
    from.forEach(f => deps.set(f, [...(deps.get(f) ?? []), id]))
  }
  const cols = shownSems.map(s => s.courseIds.filter(c => !isPlaceholder(c)))
  const row = arrange(cols, prereqs, deps)
  let maxRow = 0

  shownSems.forEach((s, i) => {
    const stat = report.semesterStats.find(x => x.index === s.index)!
    const ge = s.courseIds.filter(isPlaceholder)
    const geUnits = ge.reduce((a, c) => a + placeholderUnits(c), 0)
    const x = col(s.index)
    cols[i].forEach(id => {
      const r = row.get(id) ?? 0
      maxRow = Math.max(maxRow, r)
      const c = crit[id]
      nodes.push({ id: slug(id), type: "course", position: { x: x + COURSE_X, y: COURSE_Y0 + r * COURSE_STEP }, zIndex: 2,
        data: { id, title: dag.nodes[id]?.title ?? "Unknown course", units: dag.nodes[id]?.units ?? 0, placeholder: false, category: category(dag, id),
          hasError: errored.has(id), critical: c && c.slack <= 0 ? c : null,
          dim: near ? !near.has(id) : false, highlight: near ? near.has(id) : false,
          done: s.index <= (plan.completedSemesters ?? 0), current: s.index === (plan.completedSemesters ?? 0) + 1 } satisfies CourseData })
    })
    if (ge.length) {
      // one quiet "ge" dot per semester, under that semester's courses
      const r = Math.max(-1, ...cols[i].map(id => row.get(id) ?? 0)) + 1
      maxRow = Math.max(maxRow, r)
      nodes.push({ id: `ge-${s.index}`, type: "course", draggable: false, position: { x: x + COURSE_X, y: COURSE_Y0 + r * COURSE_STEP }, zIndex: 2,
        data: { id: `ge-${s.index}`, title: "General education / free electives", units: geUnits, placeholder: true, category: "ge",
          hasError: false, critical: null, dim: !!near, highlight: false, geIds: ge } satisfies CourseData })
    }
    nodes.push({ id: `sem-${s.index}`, type: "semester", position: { x, y: SEM_Y }, draggable: false, selectable: false, zIndex: 0,
      className: "pointer-events-none",
      style: { width: SEM_W, height: 0 }, // height set below once maxRow is known
      data: { index: s.index, label: s.label, termName: termName(dag, s.index), units: stat.units, status: stat.status, year: Math.ceil(s.index / 2), policyMin: minUnits,
        geUnits, drop: dropTarget === s.index, done: s.index <= (plan.completedSemesters ?? 0), next: s.index === (plan.completedSemesters ?? 0) + 1 } satisfies SemesterData })
  })
  const height = COURSE_Y0 + (maxRow + 1) * COURSE_STEP + 10
  nodes.forEach(n => { if (n.type === "semester") n.style = { width: SEM_W, height } })

  // default arrows run semester to semester (D-036)
  for (let i = win.from; i < win.to; i++) {
    edges.push({ id: `sem-edge-${i}`, source: `sem-${i}`, target: `sem-${i + 1}`, sourceHandle: "out", targetHandle: "in", type: "straight", zIndex: 0,
      style: { stroke: "#52525b", strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: "#52525b" } })
  }
  const labeled = new Set<CourseId>() // one "out of order" label per course
  const inWin = (c: CourseId) => { const i = semOf.get(c); return i != null && i >= win.from && i <= win.to }
  for (const id of semOf.keys()) {
    const node = dag.nodes[id]
    if (!node || !inWin(id)) continue
    for (const l of links(node.prereq)) {
      if (!semOf.has(l.from) || !inWin(l.from)) continue
      const state = violated.has(`${l.from}>${id}`) ? "violated" : "satisfied"
      const label = state === "violated" && !labeled.has(id)
      if (label) labeled.add(id)
      // course lines are hidden unless they break a rule or touch the clicked course (D-036)
      const shown = state === "violated" || (!!selected && (selected === id || selected === l.from))
      edges.push({ id: `edge-${l.from}-${id}`, source: slug(l.from), target: slug(id), type: "prereq", zIndex: state === "violated" ? 10 : 1,
        hidden: !shown, markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: state === "violated" ? "#ff3b3b" : l.kind === "coreq" ? "#2dd4bf" : "#e4e4e7" },
        data: { state, kind: l.kind, dim: false, label } satisfies EdgeData })
    }
  }
  return { nodes, edges, height: SEM_Y + height }
}
