import { useMemo, useState } from "react"
import { isElectiveSlot, isPlaceholder, leaves, placeholderUnits, suggestSemester } from "../../../shared/engine"
import type { CourseId, Dag, PrereqExpr } from "../../../shared/types"
import { category, termName } from "../lib/derive"
import { useActivePlan, useStore } from "../store"
import { exportSemester, nextSemester } from "./Pet"
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
  // one year at a time, opening on the year of the next semester (D-042)
  const [year, setYear] = useState(() => Math.ceil(nextSemester(plan) / 2))
  const student = useStore(s => s.student)
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
  const names = (t?: string) => t?.replace(/(Fall|Spring) Year (\d)/g, (_m, season: string, y: string) => termName(dag, (Number(y) - 1) * 2 + (season === "Fall" ? 1 : 2)))
  const issueFor = (id: CourseId) => report.issues.find(i => i.courseIds[0] === id && i.severity !== "info" && i.code !== "REQ_GROUP_INCOMPLETE")
  const done = plan.completedSemesters ?? 0
  // where each broken course should go (D-040)
  const fixes = useMemo(() => new Map([...status].filter(([, v]) => v === "error").map(([id]) => [id, suggestSemester(plan, dag, policies, id)])), [status, plan, dag, policies])
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
    <div className="relative h-full overflow-hidden bg-[#e7e7ea] text-zinc-800">
      <div className="sticky left-0 top-0 z-10 flex items-center justify-between px-5 pt-3 text-[12px] text-zinc-500">
        <span className="flex items-center gap-1">
          {[1, 2, 3, 4].map(y => <button key={y} onClick={() => setYear(y)}
            className={`rounded-full px-3 py-1 text-[13px] ${year === y ? "bg-zinc-800 font-semibold text-white" : "text-zinc-600 hover:bg-zinc-200"}`}>Year {y}</button>)}
          <button onClick={() => exportSemester(plan, dag, nextSemester(plan), student?.name ?? "Student")}
            className="ml-3 rounded-full border border-zinc-300 bg-white px-3 py-1 text-[12px] text-zinc-700 hover:border-zinc-500">⬇ Export {termName(dag, nextSemester(plan))}</button>
        </span>
        <span className="flex items-center gap-3">
          {(["core", "math", "elective"] as const).map(k => <span key={k} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${TYPE[k].bg}`} />{TYPE[k].label}</span>)}
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm ring-2 ring-inset ring-red-500" />Breaks a rule</span>
        </span>
      </div>
      <div className="flex h-[calc(100%-36px)] gap-3 px-4 pb-3 pt-2">
        {plan.semesters.filter(s => Math.ceil(s.index / 2) === year).map(s => {
          const stat = report.semesterStats.find(x => x.index === s.index)!
          const isDone = s.index <= done
          const ge = s.courseIds.filter(c => isPlaceholder(c) && !isElectiveSlot(c))
          const slots = s.courseIds.filter(isElectiveSlot)
          const footer = stat.status === "over" || stat.status === "under" ? "bg-red-200 text-red-800" : stat.status === "heavy" ? "bg-amber-200 text-amber-900" : "bg-zinc-300/70 text-zinc-700"
          return (
            <div key={s.index} data-tour={s.index === 1 ? "semester" : undefined}
              onDragOver={e => { e.preventDefault(); setOver(s.index) }} onDragLeave={() => setOver(null)} onDrop={drop(s.index)}
              className={`flex w-[218px] max-w-[440px] flex-1 shrink-0 flex-col rounded-2xl bg-zinc-300/60 transition ${over === s.index ? "ring-4 ring-lime-400/70" : ""}`}>
              <div className="flex justify-center py-2">
                <button className="cursor-default rounded-full bg-zinc-500 px-4 py-1 text-sm font-semibold text-white shadow">
                  {termName(dag, s.index)}{isDone && " ✓"}{s.index === nextSemester(plan) && " · next"}
                </button>
              </div>
              <div className="flex-1 space-y-2.5 overflow-y-auto px-2 pb-2">
                {s.courseIds.filter(c => !isPlaceholder(c)).map((id, k) => (
                  <Card key={id} first={s.index === (plan.semesters.find(x => x.courseIds.some(c => !isPlaceholder(c)))?.index) && k === 0} dag={dag} id={id} sem={s.index} semOf={semOf} status={status.get(id)} issue={names(issueFor(id)?.message)} done={isDone} fix={fixes.get(id)} onFix={to => st.moveCourse(id, to)}
                    onRemove={() => st.unplaceCourse(id)} />
                ))}
                {slots.map(slot => (
                  // drop a specific elective here to fill the slot
                  <div key={slot} draggable onDragStart={e => { e.dataTransfer.setData("application/gatorgraph", slot) }}
                    onDragOver={e => { e.preventDefault(); e.stopPropagation() }}
                    onDrop={e => {
                      e.preventDefault(); e.stopPropagation(); setOver(null)
                      const id = e.dataTransfer.getData("application/gatorgraph")
                      if (!id || isPlaceholder(id)) return
                      st.unplaceCourse(slot)
                      if (semOf.has(id)) st.moveCourse(id, s.index); else st.placeCourse(id, s.index)
                    }}
                    className="rounded-xl border-2 border-dashed border-amber-500/70 bg-amber-100/70 px-3 py-2.5 text-amber-900">
                    <div className="flex items-center justify-between text-[11px]"><span>Elective · choose later</span>
                      <span className="flex items-center gap-2"><b>3 cr</b><button title="Remove slot" className="hover:text-red-600" onClick={() => st.unplaceCourse(slot)}>×</button></span></div>
                    <div className="mt-0.5 text-[10px] text-amber-800/80">Drag an elective from the list onto this slot</div>
                  </div>
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

function Card({ dag, id, sem, semOf, status, issue, done, onRemove, first, fix, onFix }: { first?: boolean; fix?: number | null; onFix: (to: number) => void; dag: Dag; id: CourseId; sem: number; semOf: Map<CourseId, number>
  status?: "error" | "warning"; issue?: string; done: boolean; onRemove: () => void }) {
  const n = dag.nodes[id]
  const [open, setOpen] = useState(false)
  const [needsOpen, setNeedsOpen] = useState(false)
  const desc = useStore(s => s.descriptions[id])
  // color = course type; outline = engine status (D-030)
  const cat = category(dag, id)
  const tone = done ? "bg-zinc-300" : TYPE[cat]?.bg ?? TYPE.other.bg
  const ring = status === "error" ? "ring-[3px] ring-red-500" : status === "warning" ? "ring-[3px] ring-amber-500" : ""
  return (
    <div data-tour={first ? "card" : undefined} draggable onDragStart={e => { e.dataTransfer.setData("application/gatorgraph", id); e.dataTransfer.effectAllowed = "move" }}
      className={`pop-in group cursor-grab rounded-xl ${tone} ${ring} p-2 shadow-sm transition-all`}>
      {status && <div className={`-mx-2 -mt-2 mb-1.5 rounded-t-xl px-3 py-0.5 text-[10px] font-semibold text-white ${status === "error" ? "bg-red-500" : "bg-amber-500"}`}>{status === "error" ? "Breaks a rule" : "Warning"}</div>}
      <div className="flex items-start justify-between px-1">
        <div className="min-w-0">
          <div className="truncate text-[11px] text-zinc-900/80" title={n?.title}>{n?.title ?? "Unknown course"}</div>
          <div className="text-lg font-bold leading-tight text-zinc-900">{id}</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-1 text-zinc-800/70 opacity-0 transition group-hover:opacity-100">
            <button title={open ? "Hide details" : "Show description and Bulletin text"} onClick={() => setOpen(!open)} className="text-xs hover:text-black">{open ? "︿" : "﹀"}</button>
            <button title="Remove" onClick={onRemove} className="text-sm leading-none hover:text-black">×</button>
          </div>
          <span className="rounded bg-zinc-800/80 px-1.5 text-xs font-bold text-white">{n?.units ?? 0}</span>
        </div>
      </div>
      {n && issue && <div title={issue} className="mt-1.5 rounded-lg bg-white/85 px-2 py-1.5 text-[11px] font-medium text-red-700">{shortIssue(issue)}
        {status === "error" && (fix
          ? <button onClick={() => onFix(fix)} className="mt-1.5 block w-full rounded-md bg-zinc-900 px-2 py-1 text-[11px] font-semibold text-white hover:bg-zinc-700">Move it to {termName(dag, fix)} →</button>
          : fix === null && <div className="mt-1 text-[10.5px] text-zinc-600">Moving it alone won't fix this. Add the missing prerequisite to an earlier semester first.</div>)}
      </div>}
      {n && n.prereq && !done && (() => {
        // collapsed by default: one line with the count and whether they're met; click to see the chips (D-037)
        const count = new Set(leaves(n.prereq).map(l => l.code)).size
        const met = !issue || !/must come|Missing from the plan/.test(issue)
        return (
          <div className={`mt-1 rounded-lg ${needsOpen || !met ? "bg-white/70" : ""}`}>
            <button onClick={() => setNeedsOpen(!needsOpen)} className="flex w-full items-center justify-between px-1.5 py-0.5 text-[10.5px] text-zinc-600">
              <span className={met ? "" : "font-semibold text-red-600"}>{met ? `✓ Prereqs met (${count})` : `Prereqs not met (${count})`}</span>
              <span className="text-zinc-500">{needsOpen ? "▴" : "▾"}</span>
            </button>
            {needsOpen && <div className="flex flex-wrap items-center gap-1 px-2 pb-1.5"><Expr e={n.prereq} sem={sem} semOf={semOf} /></div>}
          </div>
        )
      })()}
      {open && n && <>
        {n.bulletin_prerequisite_text && <div className="mt-1.5 rounded-lg bg-white/85 p-2 text-[10.5px] leading-snug text-zinc-600"><b>Bulletin:</b> {n.bulletin_prerequisite_text}</div>}
        {desc && <div className="mt-1.5 line-clamp-4 rounded-lg bg-white/85 p-2 text-[10.5px] leading-snug text-zinc-600">{desc}</div>}
      </>}
    </div>
  )
}

/** One short line for a card; the full engine message stays in the tooltip. */
function shortIssue(m: string): string {
  const order = /but (.+?) must come/.exec(m)
  if (order) return `Needs ${order[1].replace(/ \([^)]*\)/g, "")} first`
  const missing = /Missing from the plan: (.+?)\./.exec(m)
  if (missing) return `Missing prerequisite: ${missing[1]}`
  const standing = /needs (upper-division|senior) standing \((\d+)\+ units\)/.exec(m)
  if (standing) return `Needs ${standing[1]} standing (${standing[2]}+ units)`
  return m.split(". ")[0]
}

/** Card colors by course type (D-030), matching the graph's dot colors. */
export const TYPE: Record<string, { bg: string; label: string }> = {
  core: { bg: "bg-violet-200", label: "Core CS" },
  math: { bg: "bg-teal-200", label: "Math / Physics" },
  elective: { bg: "bg-amber-200", label: "Elective" },
  other: { bg: "bg-zinc-200", label: "Other" },
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
