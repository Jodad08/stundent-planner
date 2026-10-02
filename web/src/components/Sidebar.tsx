import { useMemo, useState } from "react"
import { isPlaceholder, placeholderId } from "../../../shared/engine"
import { useActivePlan, useStore } from "../store"
import { category } from "../lib/derive"
import { STRIPE } from "./CourseNode"

const FILTERS = ["All", "Required", "Electives", "Math", "GE"] as const

export function Sidebar() {
  const dag = useStore(s => s.dag)!
  const plan = useActivePlan()
  const flash = useStore(s => s.flash)
  const [q, setQ] = useState("")
  const [f, setF] = useState<(typeof FILTERS)[number]>("All")
  const placed = useMemo(() => {
    const m = new Map<string, number>()
    plan.semesters.forEach(s => s.courseIds.forEach(c => m.set(c, s.index)))
    return m
  }, [plan])
  const nextGe = useMemo(() => {
    let n = 1
    while (placed.has(placeholderId(3, n))) n++
    return placeholderId(3, n)
  }, [placed])
  const match = (id: string) => {
    const n = dag.nodes[id]
    const text = (id + " " + n.title).toLowerCase()
    if (q && !text.includes(q.toLowerCase())) return false
    const cat = category(dag, id)
    return f === "All" || (f === "Required" && (cat === "core" || cat === "math")) || (f === "Electives" && cat === "elective") || (f === "Math" && cat === "math")
  }
  const drag = (id: string) => (e: React.DragEvent) => { e.dataTransfer.setData("application/gatorgraph", id); e.dataTransfer.effectAllowed = "move" }
  const usedGe = [...placed.keys()].filter(isPlaceholder).reduce((s, id) => s + Number(id.split("-")[1].slice(0, -1)), 0)

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-slate-800 bg-slate-950/80">
      <div className="p-3">
        <div className="mb-2 text-sm font-semibold text-slate-100">Courses <span className="font-normal text-slate-500">· drag onto a semester</span></div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search ID or name" className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm outline-none focus:border-sf-gold" />
        <div className="mt-2 flex flex-wrap gap-1">
          {FILTERS.map(x => <button key={x} onClick={() => setF(x)} className={`rounded-full px-2 py-0.5 text-xs ${f === x ? "bg-sf-gold text-slate-900" : "bg-slate-800 text-slate-300"}`}>{x}</button>)}
        </div>
        {flash && <div className="mt-2 rounded bg-amber-500/20 px-2 py-1 text-xs text-amber-200" onClick={() => useStore.getState().setFlash(null)}>{flash}</div>}
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {(f === "All" || f === "GE") && (
          <div className="mb-3">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">General education / free electives <span className="normal-case text-slate-500">({usedGe} units placed)</span></div>
            <div draggable onDragStart={drag(nextGe)} className="flex cursor-grab items-center gap-2 rounded-md border border-dashed border-slate-600 bg-slate-900 px-2 py-1.5 text-xs">
              <span className={`h-6 w-1 ${STRIPE.ge}`} /> <span className="font-mono font-bold text-slate-300">GE</span> placeholder · 3 cr
            </div>
          </div>
        )}
        {f !== "GE" && dag.requirements.map(r => {
          const list = r.courses.filter(c => dag.nodes[c] && !(r.excluded || []).includes(c) && match(c))
          if (!list.length) return null
          const chosen = r.courses.filter(c => placed.has(c))
          const unitsChosen = chosen.reduce((s, c) => s + dag.nodes[c].units, 0)
          return (
            <div key={r.id} className="mb-3">
              <div className="mb-1 flex justify-between text-xs font-semibold uppercase tracking-wide text-slate-400">
                <span>{r.label}</span>
                <span className="normal-case text-slate-500">{r.type === "all" ? `${chosen.length} of ${r.courses.length}` : `${unitsChosen} of ${r.min_units} units`}</span>
              </div>
              {list.map(c => {
                const sem = placed.get(c)
                return (
                  <div key={c} draggable={!sem} onDragStart={drag(c)}
                    className={`mb-1 flex items-center gap-2 rounded-md border px-2 py-1 text-xs ${sem ? "border-slate-800 bg-slate-900/40 text-slate-500" : "cursor-grab border-slate-700 bg-slate-900 hover:border-sf-gold"}`}>
                    <span className={`h-6 w-1 shrink-0 ${STRIPE[category(dag, c)]}`} />
                    <span className="w-16 shrink-0 font-mono font-bold">{c}</span>
                    <span className="truncate">{dag.nodes[c].title}</span>
                    {sem && <span className="ml-auto shrink-0 rounded bg-slate-800 px-1 text-[10px]">Sem {sem}</span>}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </aside>
  )
}
