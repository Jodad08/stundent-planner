import { useEffect, useMemo, useRef, useState } from "react"
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
  const [menu, setMenu] = useState(false)
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
  // required credits for the next semester: the student's own load, never below full time (policies) (D-048)
  const target = Math.max(policies.minUnitsFullTime.value, (student?.coursesPerSemester ?? 5) * 3)
  const units = plan.semesters[sem - 1].courseIds.reduce((a, c) => a + unitsOf(dag, c), 0)
  const broken = report.issues.find(i => i.severity === "error" && i.courseIds[0] && plan.semesters[sem - 1].courseIds.includes(i.courseIds[0]))
  // moods: hop when a course is added, shake on a rule break, wiggle when the semester is done (D-047)
  const [mood, setMood] = useState<"idle" | "hop" | "shake" | "happy">("idle")
  const [thinking, setThinking] = useState(false)
  const prev = useRef({ units: -1, broken: false })
  const pick = useMemo(() => nextCourses(plan, dag, sem, student?.trackId)[0], [plan, dag, sem, student])

  /** Fill the next semester one course at a time so the student watches it happen (D-043). */
  async function fillNext() {
    st.setPetAsk(false); setFilling("Reading your prerequisite map…")
    await new Promise(r => setTimeout(r, 700))
    for (let k = 0; k < 8; k++) {
      const cur = useStore.getState().plans.find(p => p.id === plan.id)!
      const have = cur.semesters[sem - 1].courseIds.reduce((a, c) => a + unitsOf(dag, c), 0)
      if (have >= target) break
      const next = nextCourses(cur, dag, sem, student?.trackId).find(c => have + dag.nodes[c].units <= target)
      if (!next) { // no major course fits: top up with GE units
        let n = 1; while (cur.semesters.some(x => x.courseIds.includes(`GE-3u-${n}`))) n++
        setFilling("Adding a GE course to reach full time"); st.placeCourse(`GE-3u-${n}`, sem)
        await new Promise(r => setTimeout(r, 900)); continue
      }
      setFilling(why(next))
      st.placeCourse(next, sem)
      await new Promise(r => setTimeout(r, 1100))
    }
    setFilling(null)
  }

  const isBroken = !!broken
  useEffect(() => {
    const p = prev.current
    if (p.units >= 0) {
      const next = isBroken && !p.broken ? "shake" : units >= target && p.units < target ? "happy" : units > p.units ? "hop" : null
      if (next) { setMood(next); setTimeout(() => setMood("idle"), 900) }
      setThinking(true); setTimeout(() => setThinking(false), 500) // a short "…" before the new tip
    }
    prev.current = { units, broken: isBroken }
  }, [units, isBroken, target])

  let msg: React.ReactNode, action: React.ReactNode = null
  const item = "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-zinc-100"
  if (menu) {
    msg = <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-violet-600">✦ What should I do?</div>
    action = <div className="-mx-1 flex flex-col text-[13px]">
      <button className={item} onClick={() => { setMenu(false); st.setPetAsk(true) }}><span>✦</span><span><b>Auto plan</b><span className="block text-[11px] text-zinc-500">Fill {termName(dag, sem)} or the whole degree</span></span></button>
      <button className={item} onClick={() => { setMenu(false); window.dispatchEvent(new Event("planed:evaluate")) }}><span>🔍</span><span><b>Evaluate</b><span className="block text-[11px] text-zinc-500">Where your plan leads, careers, rule check</span></span></button>
      <button className={item} onClick={() => { setMenu(false); exportSemester(plan, dag, sem, student?.name ?? "Student") }}><span>⬇</span><span><b>Export for SFSU</b><span className="block text-[11px] text-zinc-500">{termName(dag, sem)} as a one-page plan</span></span></button>
    </div>
  } else if (ask) {
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
  } else if (units < target) {
    // keep nudging until the required credits are reached
    const left = target - units
    const count = plan.semesters[sem - 1].courseIds.filter(c => dag.nodes[c]).length
    const meter = <div className="mb-1.5 flex items-center gap-2 text-[11px] text-zinc-500">
      <div className="h-1.5 flex-1 rounded bg-zinc-200"><div className="h-1.5 rounded bg-red-400" style={{ width: `${Math.min(100, (units / target) * 100)}%` }} /></div>
      {units}/{target} units</div>
    const ge = () => { let n = 1; while (plan.semesters.some(x => x.courseIds.includes(`GE-3u-${n}`))) n++; st.placeCourse(`GE-3u-${n}`, sem) }
    if (pick) {
      msg = <>{meter}{count === 0 ? <>{termName(dag, sem)} is empty 👀 Start with <b>{pick}</b>!</> : <>Add more! <b>{left} units</b> to go. Try <b>{pick}</b>.</>}
        <span className="block text-zinc-500">{dag.nodes[pick].title}</span></>
      action = <span className="flex gap-1.5">
        <button onClick={() => st.placeCourse(pick, sem)} className="rounded-full bg-zinc-900 px-3 py-1 text-white">Add it</button>
        <button onClick={fillNext} className="rounded-full border border-zinc-300 px-3 py-1">Fill it for me</button>
      </span>
    } else {
      msg = <>{meter}Add more! <b>{left} units</b> to go. No major course fits yet, so add a GE course.</>
      action = <button onClick={ge} className="rounded-full bg-zinc-900 px-3 py-1 text-white">Add a GE course</button>
    }
  } else {
    msg = <>{termName(dag, sem)} is done: {units} units ✅ Ready to send!</>
    action = <button onClick={() => exportSemester(plan, dag, sem, student?.name ?? "Student")} className="rounded-full bg-lime-500 px-3 py-1 font-semibold text-zinc-900">Export for SFSU</button>
  }

  return (
    <div className="pointer-events-none absolute z-30 flex items-end gap-1" style={{ right: pos.right, bottom: pos.bottom }}>
      {(open || ask || menu) && (
        <div className="pointer-events-auto mb-10 max-w-[270px] rounded-2xl rounded-br-sm bg-white p-3 text-[13px] text-zinc-800 shadow-xl">
          {thinking && !menu ? <div className="animate-pulse text-zinc-400">● ● ●</div> : <>
            <div>{msg}</div>
            {action && <div className="mt-2 text-[12px]">{action}</div>}
          </>}
        </div>
      )}
      <button data-tour="pet" title="Click for Auto plan, Evaluate, Export. Drag me anywhere."
        onPointerDown={e => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, ...pos, moved: false } }}
        onPointerMove={e => {
          const d = drag.current; if (!d) return
          const dx = e.clientX - d.x, dy = e.clientY - d.y
          if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true
          if (d.moved) setPos({ right: Math.max(0, d.right - dx), bottom: Math.max(0, d.bottom - dy) })
        }}
        onPointerUp={() => { if (drag.current && !drag.current.moved) { setOpen(true); setMenu(!menu) } drag.current = null }}
        className="pointer-events-auto cursor-grab touch-none select-none text-7xl leading-none drop-shadow-xl transition-transform hover:scale-110 active:cursor-grabbing">
        <span key={mood} className={`inline-block gator-${mood}`}>🐊</span>
      </button>
    </div>
  )
}
