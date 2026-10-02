import { useMemo, useRef, useState } from "react"
import { leaves, nextCourses, suggestSemester, unitsOf } from "../../../shared/engine"
import { aiName } from "./Thinking"
import type { Dag, Plan } from "../../../shared/types"
import { termName } from "../lib/derive"
import { useActivePlan, useStore } from "../store"
import { useReport } from "./Board"

/** The next semester to plan: the first one after the completed semesters. */
export const nextSemester = (p: Plan) => Math.min(8, (p.completedSemesters ?? 0) + 1)

/** A one-page plan for the advisor / registration. */
export function exportSemester(p: Plan, dag: Dag, sem: number, name: string) {
  const ids = p.semesters[sem - 1].courseIds
  const rows = ids.map(c => dag.nodes[c] ? `<tr><td><b>${c}</b></td><td>${dag.nodes[c].title}</td><td>${dag.nodes[c].units}</td></tr>`
    : `<tr><td>GE</td><td>General education / free elective</td><td>${unitsOf(dag, c)}</td></tr>`).join("")
  const total = ids.reduce((a, c) => a + unitsOf(dag, c), 0)
  const html = `<!doctype html><meta charset="utf-8"><title>${name} - ${termName(dag, sem)} plan</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;color:#18181b}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e4e4e7;padding:8px;text-align:left}small{color:#71717a}</style>
<h2>${termName(dag, sem)} course plan</h2><p>${name} · ${dag.program.name} · ${dag.program.bulletin} Bulletin</p>
<table><tr><th>Course</th><th>Title</th><th>Units</th></tr>${rows}<tr><td></td><td><b>Total</b></td><td><b>${total}</b></td></tr></table>
<p><small>Prerequisites and unit load checked by the PlanEd rules engine against the SFSU ${dag.program.bulletin} Bulletin. Please confirm with your advisor.</small></p>`
  const a = document.createElement("a")
  a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }))
  a.download = `${name.replace(/\s+/g, "_")}_${termName(dag, sem).replace(" ", "_")}_plan.html`
  a.click()
}

/** The gator: one short tip at a time about the next semester. */
export function Pet() {
  const plan = useActivePlan()
  const dag = useStore(s => s.dag)!
  const policies = useStore(s => s.policies)!
  const student = useStore(s => s.student)
  const report = useReport()!
  const [open, setOpen] = useState(true)
  // drag the gator anywhere (offset from the bottom-right corner); a click without moving toggles its tips
  const [pos, setPos] = useState({ right: 16, bottom: 16 })
  const drag = useRef<{ x: number; y: number; right: number; bottom: number; moved: boolean } | null>(null)
  const ask = useStore(s => s.petAsk)
  const [filling, setFilling] = useState<string | null>(null)
  const ai = aiName(useStore.getState().health?.aiProvider)
  /** Why this course, from the prerequisite map and the student's goal track. */
  const why = (c: string) => {
    const later = Object.values(dag.nodes).filter(n => leaves(n.prereq).some(l => l.code === c)).map(n => n.code)
    const goalCourse = later.find(x => student && dag.tracks[student.trackId]?.courses.includes(x))
    return `${c}: unlocks ${later.length} later course${later.length === 1 ? "" : "s"}${goalCourse && student ? `, including ${goalCourse} on your path to ${student.goal}` : ""}`
  }
  const sem = nextSemester(plan)
  const st = useStore.getState()
  const target = (student?.coursesPerSemester ?? 5) * 3
  const units = plan.semesters[sem - 1].courseIds.reduce((a, c) => a + unitsOf(dag, c), 0)
  const broken = report.issues.find(i => i.severity === "error" && i.courseIds[0] && plan.semesters[sem - 1].courseIds.includes(i.courseIds[0]))
  const pick = useMemo(() => nextCourses(plan, dag, sem, student?.trackId)[0], [plan, dag, sem, student])

  /** Fill the next semester one course at a time so the student watches it happen (D-043). */
  async function fillNext() {
    st.setPetAsk(false); setFilling("Reading your prerequisite map…")
    await new Promise(r => setTimeout(r, 700))
    for (let k = 0; k < 8; k++) {
      const cur = useStore.getState().plans.find(p => p.id === plan.id)!
      const have = cur.semesters[sem - 1].courseIds.reduce((a, c) => a + unitsOf(dag, c), 0)
      const next = nextCourses(cur, dag, sem, student?.trackId).find(c => have + dag.nodes[c].units <= target)
      if (!next) break
      setFilling(why(next))
      st.placeCourse(next, sem)
      await new Promise(r => setTimeout(r, 1100))
    }
    setFilling(null)
  }

  let msg: React.ReactNode, action: React.ReactNode = null
  if (ask) {
    msg = <><div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-violet-600">✦ {ai}</div>What should I plan, {student?.name ?? "friend"}? 🐊</>
    action = <span className="flex gap-1.5">
      <button onClick={fillNext} className="rounded-full bg-zinc-900 px-3 py-1 text-white">{termName(dag, sem)}</button>
      <button onClick={() => { st.setPetAsk(false); window.dispatchEvent(new Event("planed:whole-degree")) }} className="rounded-full border border-zinc-300 px-3 py-1">Whole degree</button>
    </span>
  } else if (filling) {
    msg = <><div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-violet-600">✦ {ai} is planning {termName(dag, sem)}</div>{filling}</>
  } else if (broken) {
    const id = broken.courseIds[0], to = suggestSemester(plan, dag, policies, id)
    msg = <>Oops, <b>{id}</b> can't go in {termName(dag, sem)} yet.</>
    if (to) action = <button onClick={() => st.moveCourse(id, to)} className="rounded-full bg-zinc-900 px-3 py-1 text-white">Move it to {termName(dag, to)}</button>
  } else if (units < target && pick) {
    msg = <>Take <b>{pick}</b> in {termName(dag, sem)}. <span className="text-zinc-500">{dag.nodes[pick].title}</span></>
    action = <button onClick={() => st.placeCourse(pick, sem)} className="rounded-full bg-zinc-900 px-3 py-1 text-white">Add it</button>
  } else {
    msg = <>{termName(dag, sem)} looks good: {units} units ✅</>
    action = <button onClick={() => exportSemester(plan, dag, sem, student?.name ?? "Student")} className="rounded-full bg-lime-500 px-3 py-1 font-semibold text-zinc-900">Export for SFSU</button>
  }

  return (
    <div className="pointer-events-none absolute z-30 flex items-end gap-1" style={{ right: pos.right, bottom: pos.bottom }}>
      {(open || ask) && (
        <div className="pointer-events-auto mb-10 max-w-[270px] rounded-2xl rounded-br-sm bg-white p-3 text-[13px] text-zinc-800 shadow-xl">
          <div>{msg}</div>
          {action && <div className="mt-2 text-[12px]">{action}</div>}
        </div>
      )}
      <button title="Drag me, or click to show or hide tips"
        onPointerDown={e => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, ...pos, moved: false } }}
        onPointerMove={e => {
          const d = drag.current; if (!d) return
          const dx = e.clientX - d.x, dy = e.clientY - d.y
          if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true
          if (d.moved) setPos({ right: Math.max(0, d.right - dx), bottom: Math.max(0, d.bottom - dy) })
        }}
        onPointerUp={() => { if (drag.current && !drag.current.moved) setOpen(!open); drag.current = null }}
        className="pointer-events-auto cursor-grab touch-none select-none text-7xl leading-none drop-shadow-xl transition-transform hover:scale-110 active:cursor-grabbing">
        <span className="inline-block animate-bounce [animation-duration:2.5s]">🐊</span>
      </button>
    </div>
  )
}
