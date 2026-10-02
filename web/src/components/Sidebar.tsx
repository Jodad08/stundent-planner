import { useMemo, useState } from "react"
import { electiveSlotId, isPlaceholder, placeholderId, unitsOf } from "../../../shared/engine"
import { useActivePlan, useStore } from "../store"
import { termName } from "../lib/derive"

/** Course list as cards (D-027): search, recommended/all, drag onto a semester or press + to add to the next open semester. */
export function Sidebar() {
  const dag = useStore(s => s.dag)!
  const plan = useActivePlan()
  const student = useStore(s => s.student)
  const showAll = useStore(s => s.showAll)
  const [q, setQ] = useState("")
  // one group at a time so the list stays short (D-045); search looks across all groups
  const [tab, setTab] = useState<"core" | "math" | "electives" | "ge">("core")
  const groupOf = (r: { id: string; type: string }) => r.type === "choose_units" ? "electives" : r.id.startsWith("math") ? "math" : "core"
  const placed = useMemo(() => {
    const m = new Map<string, number>()
    plan.semesters.forEach(s => s.courseIds.forEach(c => m.set(c, s.index)))
    return m
  }, [plan])
  const nextSlot = useMemo(() => { let n = 1; while (placed.has(electiveSlotId(n))) n++; return electiveSlotId(n) }, [placed])
  const nextGe = useMemo(() => { let n = 1; while (placed.has(placeholderId(3, n))) n++; return placeholderId(3, n) }, [placed])
  const drag = (id: string) => (e: React.DragEvent) => { e.dataTransfer.setData("application/gatorgraph", id); e.dataTransfer.effectAllowed = "move" }
  const geUnits = [...placed.keys()].filter(c => isPlaceholder(c) && c.startsWith("GE-")).reduce((s, id) => s + unitsOf(dag, id), 0)
  const rec = student && !showAll ? new Set(dag.tracks[student.trackId]?.courses ?? []) : null
  const match = (id: string) => (!q || (id + " " + dag.nodes[id].title).toLowerCase().includes(q.toLowerCase()))
    && (!rec || dag.requirements.some(r => r.type === "all" && r.courses.includes(id)) || rec.has(id))
  const target = (student?.coursesPerSemester ?? 5) * 3
  /** "+": first semester after the completed ones that still has room. */
  const add = (id: string) => {
    const done = plan.completedSemesters ?? 0
    const sem = plan.semesters.find(s => s.index > done && s.courseIds.reduce((a, c) => a + unitsOf(dag, c), 0) + unitsOf(dag, id) <= target)
      ?? plan.semesters[plan.semesters.length - 1]
    useStore.getState().placeCourse(id, sem.index)
  }

  return (
    <aside data-tour="courses" className="flex w-64 shrink-0 flex-col border-r border-zinc-200 bg-[#f4f4f5] text-zinc-800">
      <div className="p-3">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search courses"
          className="w-full rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-zinc-500" />
        {student && (
          <div className="mt-2 flex gap-1 text-[11px]">
            {[["Recommended", false], ["All courses", true]].map(([l, v]) => (
              <button key={l as string} onClick={() => useStore.getState().setShowAll(v as boolean)}
                className={`rounded-full px-2.5 py-0.5 ${showAll === v ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-800"}`}>{l as string}</button>))}
          </div>
        )}
        {student && !showAll && <div className="mt-1 text-[10px] text-zinc-500">For {dag.tracks[student.trackId]?.label}</div>}
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        {!q && (
          <div className="sticky top-0 z-10 -mx-3 mb-1 grid grid-cols-4 gap-1 bg-[#f4f4f5] px-3 pb-2 pt-1">
            {([["core", "Core"], ["math", "Math"], ["electives", "Electives"], ["ge", "GE"]] as const).map(([k, l]) => {
              const reqs = dag.requirements.filter(r => groupOf(r) === k)
              const all = reqs.flatMap(r => r.type === "all" ? r.courses : [])
              const badge = k === "ge" ? `${geUnits}u` : k === "electives" ? `${reqs.flatMap(r => r.courses).filter(c => placed.has(c)).reduce((a, c) => a + (dag.nodes[c]?.units ?? 0), 0)}u` : `${all.filter(c => placed.has(c)).length}/${all.length}`
              return <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-1 py-1.5 text-center text-[11px] leading-tight ${tab === k ? "bg-zinc-800 text-white" : "bg-white text-zinc-600 hover:bg-zinc-200"}`}>
                <div className="font-semibold">{l}</div><div className="text-[10px] opacity-70">{badge}</div></button>
            })}
          </div>
        )}
        {dag.requirements.filter(r => q || groupOf(r) === tab).map(r => {
          const list = r.courses.filter(c => dag.nodes[c] && !(r.excluded || []).includes(c) && match(c))
          if (!list.length) return null
          const done = r.courses.filter(c => placed.has(c))
          return (
            <div key={r.id}>
              <div className="mb-1.5 flex justify-between text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                <span className="truncate">{r.label.replace("Computer Science", "CS")}</span>
                <span>{r.type === "all" ? `${done.length}/${r.courses.length}` : `${done.reduce((s, c) => s + dag.nodes[c].units, 0)}/${r.min_units} cr`}</span>
              </div>
              <div className="space-y-1.5">
                {r.type === "choose_units" && (
                  <div draggable onDragStart={drag(nextSlot)} title="Reserve 3 credits for an elective you'll pick later"
                    className="flex cursor-grab items-center justify-between rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
                    Elective slot · choose later
                    <button title="Add an elective slot to the next open semester" onClick={() => add(nextSlot)} className="text-xl leading-none text-amber-500 hover:text-amber-900">+</button>
                  </div>
                )}
                {list.map(c => {
                  const sem = placed.get(c)
                  return (
                    <div key={c} draggable onDragStart={drag(c)} title={`${c} · ${dag.nodes[c].title} · ${dag.nodes[c].units} credits`}
                      className={`group flex cursor-grab items-center gap-2 rounded-xl px-2.5 py-1.5 transition hover:shadow-md active:cursor-grabbing ${sem ? "bg-white/60" : "bg-white shadow-sm"}`}>
                      <span className="w-4 text-center text-xs text-zinc-400">{dag.nodes[c].units}</span>
                      <div className="min-w-0 flex-1">
                        {/* hover: full name and credits */}
                        <div className="truncate text-[10.5px] text-zinc-500 group-hover:whitespace-normal group-hover:text-zinc-800">{dag.nodes[c].title}</div>
                        <div className={`text-[15px] font-bold leading-tight ${sem ? "text-zinc-500" : ""}`}>{c}</div>
                        <div className="hidden text-[10.5px] text-zinc-500 group-hover:block">{dag.nodes[c].units} credits · {sem ? "drag to move it" : "drag onto a semester"}</div>
                      </div>
                      {sem ? <span className="shrink-0 rounded-full bg-lime-100 px-1.5 py-0.5 text-[10px] text-lime-800">✓ {termName(dag, sem)}</span>
                        : <button title="Add to the next open semester" onClick={() => add(c)} className="text-xl leading-none text-zinc-400 hover:text-zinc-900">+</button>}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
        {(tab === "ge" && !q) && <div>
          <div className="mb-1.5 flex justify-between text-[11px] font-semibold uppercase tracking-wide text-zinc-500"><span>GE and free electives</span><span>{geUnits} cr</span></div>
          <div draggable onDragStart={drag(nextGe)} className="flex cursor-grab items-center justify-between rounded-xl border-2 border-dashed border-zinc-300 bg-white/60 px-2.5 py-2 text-xs text-zinc-600">
            GE or free elective · 3 cr
            <button title="Add 3 GE units to the next open semester" onClick={() => add(nextGe)} className="text-xl leading-none text-zinc-400 hover:text-zinc-900">+</button>
          </div>
        </div>}
      </div>
    </aside>
  )
}
