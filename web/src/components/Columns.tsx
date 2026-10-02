import { useMemo, useState } from "react"
import { isPlaceholder, placeholderUnits } from "../../../shared/engine"
import type { CourseId, Dag, PrereqExpr } from "../../../shared/types"
import { termName } from "../lib/derive"
import { useActivePlan, useStore } from "../store"
import { useReport } from "./Board"

/**
 * Card-column view (D-027), modeled on the human's AcaMapa reference: one column per semester, one card per
 * course, prerequisite chips that turn green when satisfied, card color = engine status.
 */
export function Columns() {
  const plan = useActivePlan()
  const dag = useStore(s => s.dag)!
  const policies = useStore(s => s.policies)!
  const report = useReport()!
  const st = useStore.getState()
  const [over, setOver] = useState<number | null>(null)
  const semOf = useMemo(() => { const m = new Map<CourseId, number>(); plan.semesters.forEach(s => s.courseIds.forEach(c => m.set(c, s.index))); return m }, [plan])
  const status = useMemo(() => {
    const m = new Map<CourseId, "error" | "warning">()
    for (const i of report.issues) {
      const id = i.courseIds[0]
      if (!id || i.code === "REQ_GROUP_INCOMPLETE") continue
      if (i.severity === "error") m.set(id, "error")
      else if (i.severity === "warning" && !m.has(id)) m.set(id, "warning")
    }
    return m
  }, [report])
  const issueFor = (id: CourseId) => report.issues.find(i => i.courseIds[0] === id && i.severity !== "info" && i.code !== "REQ_GROUP_INCOMPLETE")
  const done = plan.completedSemesters ?? 0
  const drop = (index: number) => (e: React.DragEvent) => {
    e.preventDefault(); setOver(null)
    const id = e.dataTransfer.getData("application/gatorgraph")
    if (!id) return
    if (semOf.has(id)) st.moveCourse(id, index); else st.placeCourse(id, index)
  }
  const stats = {
    courses: [...semOf.keys()].filter(c => !isPlaceholder(c)).length,
    units: report.totalUnitsPlanned,
    taken: plan.semesters.slice(0, done).flatMap(s => s.courseIds).filter(c => !isPlaceholder(c)).length,
    semesters: plan.semesters.filter(s => s.courseIds.length).length,
  }

  return (
    <div className="relative h-full overflow-x-auto overflow-y-hidden bg-[#e7e7ea] text-zinc-800">
      <div className="sticky left-0 top-0 z-10 flex gap-2 px-4 pt-3">
        <div className="rounded-lg bg-zinc-600/90 px-3 py-1.5 text-[11px] text-white shadow">
          <div className="font-semibold">Program</div>
          <div className="mt-0.5 rounded bg-white/15 px-2 py-0.5">{dag.program.name.replace("Bachelor of Science in ", "")} (B.S.)</div>
        </div>
        <div className="rounded-lg bg-zinc-600/90 px-3 py-1.5 text-[11px] text-white shadow">
          <div className="font-semibold">Plan Stats</div>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {[`Courses: ${stats.courses} (${stats.units} cr)`, `Taken: ${stats.taken}`, `Semesters: ${stats.semesters}`,
              report.graduationReady ? "✓ Graduation-ready" : `${report.issues.filter(i => i.severity === "error").length} rule errors`].map(t =>
              <span key={t} className="rounded bg-white/15 px-2 py-0.5">{t}</span>)}
          </div>
        </div>
      </div>
      <div className="flex h-[calc(100%-64px)] gap-4 px-4 pb-3 pt-3">
        {plan.semesters.map(s => {
          const stat = report.semesterStats.find(x => x.index === s.index)!
          const isDone = s.index <= done
          const ge = s.courseIds.filter(isPlaceholder)
          const footer = stat.status === "over" || stat.status === "under" ? "bg-red-200 text-red-800" : stat.status === "heavy" ? "bg-amber-200 text-amber-900" : "bg-zinc-300/70 text-zinc-700"
          return (
            <div key={s.index} data-tour={s.index === 1 ? "semester" : undefined}
              onDragOver={e => { e.preventDefault(); setOver(s.index) }} onDragLeave={() => setOver(null)} onDrop={drop(s.index)}
              className={`flex w-[250px] shrink-0 flex-col rounded-2xl bg-zinc-300/60 transition ${over === s.index ? "ring-4 ring-lime-400/70" : ""}`}>
              <div className="flex justify-center py-2">
                <button className="cursor-default rounded-full bg-zinc-500 px-4 py-1 text-sm font-semibold text-white shadow">
                  {termName(dag, s.index)}{isDone && " ✓"}
                </button>
              </div>
              <div className="flex-1 space-y-2.5 overflow-y-auto px-2 pb-2">
                {s.courseIds.filter(c => !isPlaceholder(c)).map((id, k) => (
                  <Card key={id} first={s.index === (plan.semesters.find(x => x.courseIds.some(c => !isPlaceholder(c)))?.index) && k === 0} dag={dag} id={id} sem={s.index} semOf={semOf} status={status.get(id)} issue={issueFor(id)?.message} done={isDone}
                    onRemove={() => st.unplaceCourse(id)} />
                ))}
                {ge.length > 0 && (
                  <div className="flex items-center justify-between rounded-xl border-2 border-dashed border-zinc-400/70 px-3 py-2 text-xs text-zinc-600">
                    <span>GE and free electives</span>
                    <span className="flex items-center gap-2"><b>{ge.reduce((a, c) => a + placeholderUnits(c), 0)} cr</b>
                      <button title="Remove 3 GE units" className="text-zinc-500 hover:text-red-600" onClick={() => st.unplaceCourse(ge[ge.length - 1])}>−</button></span>
                  </div>
                )}
                {!s.courseIds.length && <div className="rounded-xl border-2 border-dashed border-zinc-400/60 p-6 text-center text-xs text-zinc-500">Drag courses here</div>}
              </div>
              <div className={`rounded-b-2xl py-2 text-center text-sm font-medium ${footer}`}>
                {stat.units} Credits{stat.status === "heavy" ? ` · above ${policies.heavyLoadUnits.value}` : stat.status === "over" ? ` · over ${policies.maxUnitsWithoutPermission.value}` : stat.status === "under" ? ` · below ${policies.minUnitsFullTime.value}` : ""}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Card({ dag, id, sem, semOf, status, issue, done, onRemove, first }: { first?: boolean; dag: Dag; id: CourseId; sem: number; semOf: Map<CourseId, number>
  status?: "error" | "warning"; issue?: string; done: boolean; onRemove: () => void }) {
  const n = dag.nodes[id]
  const [open, setOpen] = useState(!done)
  const desc = useStore(s => s.descriptions[id])
  const tone = status === "error" ? "bg-[#e9775c]" : status === "warning" ? "bg-[#f2c14e]" : done ? "bg-zinc-400" : "bg-[#b5d94c]"
  return (
    <div data-tour={first ? "card" : undefined} draggable onDragStart={e => { e.dataTransfer.setData("application/gatorgraph", id); e.dataTransfer.effectAllowed = "move" }}
      className={`cursor-grab rounded-xl ${tone} p-2 shadow-sm`}>
      <div className="flex items-start justify-between px-1">
        <div className="min-w-0">
          <div className="truncate text-[11px] text-zinc-900/80" title={n?.title}>{n?.title ?? "Unknown course"}</div>
          <div className="text-lg font-bold leading-tight text-zinc-900">{id}</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-1 text-zinc-800/70">
            <button title={open ? "Collapse" : "Expand"} onClick={() => setOpen(!open)} className="text-xs hover:text-black">{open ? "︿" : "﹀"}</button>
            <button title="Remove" onClick={onRemove} className="text-sm leading-none hover:text-black">×</button>
          </div>
          <span className="rounded bg-zinc-800/80 px-1.5 text-xs font-bold text-white">{n?.units ?? 0}</span>
        </div>
      </div>
      {open && n && <>
        {issue && <div className="mt-1.5 rounded-lg bg-white/85 px-2 py-1.5 text-[11px] font-medium text-red-700">{issue}</div>}
        {n.prereq && (
          <div className="mt-1.5 rounded-lg bg-white/85 p-2">
            <div className="text-[11px] font-semibold text-zinc-700">Pre-req:</div>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-1"><Expr e={n.prereq} sem={sem} semOf={semOf} /></div>
            {n.bulletin_prerequisite_text && <div className="mt-1.5 border-t border-zinc-200 pt-1 text-[10.5px] leading-snug text-zinc-600">• {n.bulletin_prerequisite_text}</div>}
          </div>
        )}
        {desc && !n.prereq && <div className="mt-1.5 line-clamp-3 rounded-lg bg-white/85 p-2 text-[10.5px] leading-snug text-zinc-600">{desc}</div>}
      </>}
    </div>
  )
}

/** Prerequisite expression as chips; a chip is green when it is satisfied where the course sits. */
function Expr({ e, sem, semOf }: { e: PrereqExpr; sem: number; semOf: Map<CourseId, number> }) {
  if (!e) return null
  const chip = (code: string, ok: boolean, note?: string) => (
    <span className={`rounded px-1.5 py-0.5 font-mono text-[10.5px] font-semibold ${ok ? "bg-lime-300 text-lime-950" : "bg-zinc-200 text-zinc-700"}`} title={note}>{code}</span>)
  const sep = (t: string) => <span className="text-[9px] font-semibold text-zinc-400">{t}</span>
  if (typeof e === "string") return chip(e, (semOf.get(e) ?? 99) < sem)
  if ("course" in e) return chip(e.course, (semOf.get(e.course) ?? 99) < sem || (!!e.concurrent && semOf.get(e.course) === sem), e.concurrent ? "may be taken the same term" : undefined)
  if ("coreq" in e) return chip(e.coreq, (semOf.get(e.coreq) ?? 99) <= sem, "corequisite: same term or earlier")
  if ("placement" in e) return chip(`${e.placement} placement`, true)
  const parts = "and" in e ? e.and : e.or
  return <>{parts.map((p, i) => <span key={i} className="flex items-center gap-1">{i > 0 && sep("and" in e ? "AND" : "OR")}<Expr e={p} sem={sem} semOf={semOf} /></span>)}</>
}
