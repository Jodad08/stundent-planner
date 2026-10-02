import { useMemo, useState } from "react"
import { isPlaceholder, placeholderId } from "../../../shared/engine"
import { useActivePlan, useStore } from "../store"
import { category } from "../lib/derive"
import { COLOR } from "./CourseNode"

/** Minimal course list: code + dot, grouped by requirement; drag onto a semester (D-022). */
export function Sidebar() {
  const dag = useStore(s => s.dag)!
  const plan = useActivePlan()
  const flash = useStore(s => s.flash)
  const [q, setQ] = useState("")
  const placed = useMemo(() => {
    const m = new Map<string, number>()
    plan.semesters.forEach(s => s.courseIds.forEach(c => m.set(c, s.index)))
    return m
  }, [plan])
  const nextGe = useMemo(() => { let n = 1; while (placed.has(placeholderId(3, n))) n++; return placeholderId(3, n) }, [placed])
  const drag = (id: string) => (e: React.DragEvent) => { e.dataTransfer.setData("application/gatorgraph", id); e.dataTransfer.effectAllowed = "move" }
  const geUnits = [...placed.keys()].filter(isPlaceholder).reduce((s, id) => s + Number(id.split("-")[1].slice(0, -1)), 0)
  const match = (id: string) => !q || (id + " " + dag.nodes[id].title).toLowerCase().includes(q.toLowerCase())

  return (
    <aside data-tour="courses" className="flex w-56 shrink-0 flex-col border-r border-white/5 bg-black">
      <div className="p-3">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="search courses"
          className="w-full rounded-md border border-white/10 bg-transparent px-2 py-1.5 font-mono text-xs text-zinc-300 outline-none placeholder:text-zinc-600 focus:border-white/30" />
        {flash && <div className="mt-2 font-mono text-[11px] text-amber-300" onClick={() => useStore.getState().setFlash(null)}>{flash}</div>}
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4 font-mono text-[11px]">
        {dag.requirements.map(r => {
          const list = r.courses.filter(c => dag.nodes[c] && !(r.excluded || []).includes(c) && match(c))
          if (!list.length) return null
          const done = r.courses.filter(c => placed.has(c))
          return (
            <div key={r.id} className="mb-4">
              <div className="mb-1 flex justify-between text-zinc-600">
                <span className="truncate">{r.label.replace("Computer Science", "CS").toLowerCase()}</span>
                <span>{r.type === "all" ? `${done.length}/${r.courses.length}` : `${done.reduce((s, c) => s + dag.nodes[c].units, 0)}/${r.min_units}u`}</span>
              </div>
              {list.map(c => {
                const sem = placed.get(c)
                return (
                  <div key={c} draggable={!sem} onDragStart={drag(c)} title={dag.nodes[c].title}
                    className={`flex items-center gap-2 rounded px-1.5 py-1 ${sem ? "text-zinc-600" : "cursor-grab text-zinc-300 hover:bg-white/5"}`}>
                    <span className="h-2 w-2 rounded-full" style={{ border: `1.5px solid ${COLOR[category(dag, c)]}`, opacity: sem ? 0.4 : 1 }} />
                    {c}
                    {sem && <span className="ml-auto text-[10px] text-zinc-700">s{sem}</span>}
                  </div>
                )
              })}
            </div>
          )
        })}
        <div className="mb-1 flex justify-between text-zinc-600"><span>general ed / free</span><span>{geUnits}u</span></div>
        <div draggable onDragStart={drag(nextGe)} className="flex cursor-grab items-center gap-2 rounded px-1.5 py-1 text-zinc-500 hover:bg-white/5">
          <span className="h-2 w-2 rounded-full border border-dashed border-zinc-500" /> ge placeholder · 3u
        </div>
      </div>
    </aside>
  )
}
