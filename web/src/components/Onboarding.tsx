import { useEffect, useMemo, useState } from "react"
import { guessTrack } from "../../../shared/directionScores"
import type { CourseId, PlanResponse, RunRecord } from "../../../shared/types"
import { api } from "../api"
import { termName } from "../lib/derive"
import { useStore, type Student } from "../store"
import { traceOf } from "./PlanModal"
import { COLOR } from "./CourseNode"
import { aiName, Thinking } from "./Thinking"
import { emptySemesters } from "../../../shared/engine"
import { category } from "../lib/derive"

/**
 * First-visit questions (D-024): who you are, where you are in the degree, which courses you already took
 * (semester by semester), and your goal. Then the AI + rules engine plan the rest, or the student plans manually.
 */
export function Onboarding({ onDone, onSkip }: { onDone: () => void; onSkip?: () => void }) {
  const dag = useStore(s => s.dag)!
  const careers = useStore(s => s.careers)
  const policies = useStore(s => s.policies)!
  const [step, setStep] = useState(0) // 0 about, 1 progress, 2..2+N-1 courses per done semester, then goal, then build
  // prefilled from the saved answers and the current plan, so a returning student just clicks through (D-032)
  const saved = useStore.getState().student
  const savedPlan = useStore.getState().plans.find(p => p.id === useStore.getState().activePlanId)
  const [name, setName] = useState(saved?.name ?? "")
  const [unitsDone, setUnitsDone] = useState(saved?.unitsDone ?? 0)
  const [coursesPerSemester, setCps] = useState(saved?.coursesPerSemester ?? 5)
  const [doneSems, setDoneSems] = useState(saved?.completedSemesters ?? 0)
  const [gradIndex, setGradIndex] = useState(() => Math.max(1, Array.from({ length: 8 }, (_, i) => i + 1).find(i => termName(dag, i) === saved?.gradTerm) ?? 8))
  const [taken, setTaken] = useState<CourseId[][]>(() => Array.from({ length: 7 }, (_, i) =>
    i < (saved?.completedSemesters ?? 0) ? (savedPlan?.semesters[i]?.courseIds ?? []).filter(c => dag.nodes[c]) : []))
  const [draft, setDraft] = useState("")
  const [warn, setWarn] = useState<string | null>(null)
  const [goal, setGoal] = useState(saved?.goal ?? "")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ resp: PlanResponse; trace: ReturnType<typeof traceOf> } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [majors, setMajors] = useState<Awaited<ReturnType<typeof api.majors>>>([])
  useEffect(() => { api.majors().then(setMajors).catch(() => setMajors([])) }, [])

  const unitsPerSemester = Math.min(policies.maxUnitsWithoutPermission.value, Math.max(policies.minUnitsFullTime.value, coursesPerSemester * 3))
  const codes = useMemo(() => Object.keys(dag.nodes).sort(), [dag])
  const goalStep = 2 + doneSems, buildStep = goalStep + 1
  const trackId = guessTrack(goal)
  const allTaken = taken.slice(0, doneSems).flat()

  /** Adds one or more codes ("CSC 101, MATH 226"); bad codes stay in the box with a warning. */
  function addCourse(sem: number) {
    const parts = draft.split(/[,;]+/).map(x => x.trim().toUpperCase().replace(/^([A-Z]+)\s*(\d)/, "$1 $2")).filter(Boolean)
    if (!parts.length) return
    const ok: CourseId[] = [], bad: string[] = [], dup: string[] = []
    for (const code of parts) {
      if (!dag.nodes[code]) bad.push(code)
      else if (allTaken.includes(code) || ok.includes(code)) dup.push(code)
      else ok.push(code)
    }
    if (ok.length) setTaken(t => t.map((l, i) => (i === sem ? [...l, ...ok] : l)))
    setDraft(bad.join(", "))
    setWarn(bad.length ? `${bad.join(", ")} ${bad.length > 1 ? "are" : "is"} not a B.S. CS course in the 2026-27 Bulletin data.`
      : dup.length ? `${dup.join(", ")} already listed.` : null)
  }

  async function build() {
    setBusy(true); setErr(null)
    const locked = taken.slice(0, doneSems).flatMap((l, i) => l.map(courseId => ({ courseId, semester: i + 1 })))
    try {
      const resp = await api.plan({ goalText: goal || "Software engineer", programId: "bs-cs", unitsPerSemester, lockedPlacements: locked,
        completedSemesters: doneSems, unitsEarned: unitsDone })
      const run = await api.run(resp.runId).catch(() => null as RunRecord | null)
      setResult({ resp, trace: run ? traceOf(run) : [] })
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }
  /** Manual path: completed semesters filled in, the rest left for the student to drag in. */
  function finishManual() {
    // returning student: keep the plan they already built; only the completed semesters are rewritten
    const takenIds = new Set(taken.slice(0, doneSems).flat())
    const semesters = savedPlan && saved ? savedPlan.semesters.map(x => ({ ...x, courseIds: x.courseIds.filter(c => !takenIds.has(c)) })) : emptySemesters()
    taken.slice(0, doneSems).forEach((l, i) => { semesters[i].courseIds = [...semesters[i].courseIds.filter(c => !dag.nodes[c]), ...l] })
    const student: Student = { name: name.trim() || "Student", major: "bs-cs", unitsDone, gradTerm: termName(dag, gradIndex),
      coursesPerSemester, completedSemesters: doneSems, goal, trackId }
    useStore.getState().setStudent(student)
    useStore.setState({ plans: [{ id: "plan_me", name: `${student.name}'s plan`, programId: "bs-cs", goalText: goal, createdAt: new Date().toISOString(),
      semesters, source: "manual", ...(doneSems ? { completedSemesters: doneSems } : {}) }], activePlanId: "plan_me", evaluation: null })
    onDone()
  }
  function finish() {
    if (!result) return
    const student: Student = { name: name.trim() || "Student", major: "bs-cs", unitsDone, gradTerm: termName(dag, gradIndex),
      coursesPerSemester, completedSemesters: doneSems, goal, trackId }
    const st = useStore.getState()
    st.setStudent(student)
    useStore.setState({ plans: [{ ...result.resp.plan, id: "plan_me", name: `${student.name}'s plan` }], activePlanId: "plan_me", evaluation: null })
    onDone()
  }

  const input = "w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-teal-300/60"
  const label = "mb-1 mt-4 block font-mono text-[11px] text-zinc-500"
  const next = (ok = true) => (
    <button disabled={!ok} onClick={() => setStep(step + 1)} className="rounded-full bg-teal-300 px-4 py-1.5 font-mono text-xs text-black disabled:opacity-40">Next</button>)
  const total = buildStep + 1

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black">
      <div className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(#27272a 0.8px, transparent 0.8px)", backgroundSize: "28px 28px" }} />
      <div className="relative w-[520px]">
        <div className="mb-6 flex items-center justify-between font-mono text-xs">
          <span className="text-sm text-white">Plan<span className="text-sf-gold">Ed</span></span>
          <span className="flex items-center gap-4">
            {onSkip && <button onClick={onSkip} className="text-zinc-400 underline-offset-2 hover:text-white hover:underline">Skip to my plan →</button>}
            <span className="text-zinc-600">{Math.min(step + 1, total)} / {total}</span>
          </span>
        </div>
        <div className="mb-6 h-px w-full bg-white/10"><div className="h-px bg-teal-300 transition-all duration-500" style={{ width: `${(Math.min(step + 1, total) / total) * 100}%` }} /></div>

        {step === 0 && <>
          <h1 className="text-2xl font-semibold text-white">{saved ? `Welcome back, ${saved.name}.` : "Let's map your degree."}</h1>
          <p className="mt-1 text-sm text-zinc-500">A few questions, then lay out every semester: automatically, or by hand.</p>
          <label className={label}>Your name</label>
          <input autoFocus className={input} value={name} onChange={e => setName(e.target.value)} placeholder="First name" onKeyDown={e => { if (e.key === "Enter" && name.trim()) setStep(1) }} />
          <label className={label}>Major</label>
          <select className={input} value={dag.program.id} onChange={() => { /* only the mapped major is selectable */ }}>
            {majors.length === 0 && <option value={dag.program.id} className="bg-black">{dag.program.name}</option>}
            {majors.map(m => <option key={m.id} value={m.id} disabled={!m.mapped} className="bg-black">
              {m.name}{m.mapped ? "" : " (coming soon)"}</option>)}
          </select>
          <p className="mt-1 font-mono text-[10px] text-zinc-600">{majors.length} SFSU bachelor's programs from the 2026-27 Bulletin. Computer Science is mapped and verified first.</p>
          <div className="mt-6 flex justify-end">{next(!!name.trim())}</div>
        </>}

        {step === 1 && <>
          <h1 className="text-2xl font-semibold text-white">Where are you now, {name.trim()}?</h1>
          <div className="grid grid-cols-2 gap-x-4">
            <div><label className={label}>Units completed</label>
              <input type="number" min={0} max={200} className={input} value={unitsDone} onChange={e => setUnitsDone(Math.max(0, Number(e.target.value)))} /></div>
            <div><label className={label}>Semesters completed</label>
              <select className={input} value={doneSems} onChange={e => setDoneSems(Number(e.target.value))}>
                {Array.from({ length: 8 }, (_, i) => <option key={i} value={i} className="bg-black">{i === 0 ? "None, I'm just starting" : `${i} (through ${termName(dag, i)})`}</option>)}
              </select></div>
            <div><label className={label}>Expected graduation</label>
              <select className={input} value={gradIndex} onChange={e => setGradIndex(Number(e.target.value))}>
                {Array.from({ length: 8 }, (_, i) => i + 1).filter(i => i > doneSems).map(i => <option key={i} value={i} className="bg-black">{termName(dag, i)}</option>)}
              </select></div>
            <div><label className={label}>Courses per semester</label>
              <select className={input} value={coursesPerSemester} onChange={e => setCps(Number(e.target.value))}>
                {[4, 5, 6].map(n => <option key={n} value={n} className="bg-black">{n} courses (~{Math.min(policies.maxUnitsWithoutPermission.value, Math.max(policies.minUnitsFullTime.value, n * 3))} units)</option>)}
              </select></div>
          </div>
          <div className="mt-6 flex justify-between"><button className="font-mono text-xs text-zinc-500" onClick={() => setStep(0)}>Back</button>{next()}</div>
        </>}

        {step >= 2 && step < goalStep && (() => {
          const sem = step - 2
          return <>
            <h1 className="text-2xl font-semibold text-white">What did you take in {termName(dag, sem + 1)}?</h1>
            <p className="mt-1 text-sm text-zinc-500">Type a course code and press + or Enter. Add several at once with commas. Only CS-major courses; GE counts through your units.</p>
            <div className="mt-4 flex gap-2">
              <input autoFocus list="gg-codes" className={`${input} font-mono`} value={draft} onChange={e => setDraft(e.target.value)}
                placeholder="e.g. CSC 215, MATH 226" onKeyDown={e => { if (e.key === "Enter") addCourse(sem) }} />
              <button onClick={() => addCourse(sem)} disabled={!draft.trim()} title="Add course(s)"
                className="shrink-0 rounded-lg border border-teal-300/40 px-4 font-mono text-lg text-teal-300 hover:bg-teal-300/10 disabled:opacity-30">+</button>
            </div>
            <datalist id="gg-codes">{codes.filter(c => !allTaken.includes(c)).map(c => <option key={c} value={c}>{dag.nodes[c].title}</option>)}</datalist>
            {warn && <div className="mt-2 font-mono text-[11px] text-amber-300">{warn}</div>}
            <div className="mt-3 flex min-h-8 flex-wrap gap-2">
              {taken[sem].map(c => (
                <span key={c} className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 font-mono text-xs text-zinc-200">
                  <span className="h-2 w-2 rounded-full" style={{ border: `1.5px solid ${COLOR[category(dag, c)]}` }} />{c}
                  <button className="text-zinc-600 hover:text-red-400" onClick={() => setTaken(t => t.map((l, i) => (i === sem ? l.filter(x => x !== c) : l)))}>×</button>
                </span>))}
              {!taken[sem].length && <span className="font-mono text-xs text-zinc-700">No major courses yet</span>}
            </div>
            <div className="mt-6 flex justify-between">
              <button className="font-mono text-xs text-zinc-500" onClick={() => { setStep(step - 1); setWarn(null) }}>Back</button>
              <button onClick={() => { setStep(step + 1); setWarn(null); setDraft("") }} className="rounded-full bg-teal-300 px-4 py-1.5 font-mono text-xs text-black">
                {sem + 1 < doneSems ? `Next: ${termName(dag, sem + 2)}` : "Done with courses"}</button>
            </div>
          </>
        })()}

        {step === goalStep && <>
          <h1 className="text-2xl font-semibold text-white">What do you want to do after graduating?</h1>
          <textarea autoFocus rows={2} className={`${input} mt-4`} value={goal} onChange={e => setGoal(e.target.value)} placeholder="e.g. Machine learning engineer at a health-tech startup" />
          <div className="mt-2 flex flex-wrap gap-2">
            {careers.map(c => <button key={c.id} onClick={() => setGoal(c.label)} className="rounded-full border border-white/10 px-3 py-1 font-mono text-[11px] text-zinc-400 hover:border-teal-300/60 hover:text-white">{c.label}</button>)}
          </div>
          {goal.trim() && <>
            <label className={label}>Recommended electives · {dag.tracks[trackId].label}</label>
            <div className="grid grid-cols-2 gap-1.5">
              {dag.tracks[trackId].courses.filter(c => !allTaken.includes(c)).map(c => (
                <div key={c} className="flex items-center gap-2 font-mono text-[11px] text-zinc-300">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ border: `1.5px solid ${COLOR.elective}`, boxShadow: `0 0 6px ${COLOR.elective}` }} />
                  {c} <span className="truncate font-sans text-zinc-500">{dag.nodes[c].title}</span>
                </div>))}
            </div>
            <p className="mt-2 text-[11px] text-zinc-600">From the department's own elective tracks. Auto plan picks among them for your goal; the engine checks every rule.</p>
          </>}
          <div className="mt-6 flex justify-between"><button className="font-mono text-xs text-zinc-500" onClick={() => setStep(step - 1)}>Back</button>{next(!!goal.trim())}</div>
        </>}

        {step === buildStep && <>
          <h1 className="text-2xl font-semibold text-white">{result ? "Your plan is ready." : "How do you want to plan?"}</h1>
          <div className="mt-3 space-y-1 font-mono text-[11px] text-zinc-500">
            <div>{name.trim()} · B.S. Computer Science · {unitsDone} units done · Graduating {termName(dag, gradIndex)}</div>
            <div>{doneSems ? `${allTaken.length} major course${allTaken.length === 1 ? "" : "s"} locked in ${doneSems} completed semester${doneSems > 1 ? "s" : ""}` : "Starting fresh"} · ~{unitsPerSemester} units per semester</div>
            <div>Goal: {goal}</div>
          </div>
          {err && <div className="mt-4 font-mono text-xs text-red-400">{err}</div>}
          {(busy || result) && (
            <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.02] p-3">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-violet-300">{aiName(useStore.getState().health?.aiProvider)} · Reasoning</div>
              <Thinking pending={busy} lines={result ? [...result.trace, { label: `${result.resp.plan.source === "ai" ? "Plan accepted by the rules engine" : "Deterministic engine plan"} · ${result.resp.report.issues.filter(i => i.severity === "error").length} rule errors`, state: "done" }]
                : [{ label: `Reading your ${allTaken.length} completed course${allTaken.length === 1 ? "" : "s"} and ${dag.requirements.length} requirement groups`, state: "think" },
                   { label: `Loading ${Object.keys(dag.nodes).length} course prerequisites from the ${dag.program.bulletin} Bulletin`, state: "think" }]} />
            </div>
          )}
          <div className="mt-6 flex justify-between">
            <button className="font-mono text-xs text-zinc-500" onClick={() => setStep(step - 1)} disabled={busy}>Back</button>
            {result ? <button onClick={finish} className="rounded-full bg-sf-gold px-4 py-1.5 font-mono text-xs text-black">Show me my map</button>
              : <div className="flex gap-2">
                  <button onClick={finishManual} disabled={busy} className="rounded-full border border-white/15 px-4 py-1.5 font-mono text-xs text-zinc-200 hover:bg-white/10 disabled:opacity-40">I'll plan it myself</button>
                  <button onClick={build} disabled={busy} className="rounded-full bg-sf-gold px-4 py-1.5 font-mono text-xs text-black disabled:opacity-40">✦ Auto plan it</button>
                </div>}
          </div>
        </>}
      </div>
    </div>
  )
}
