import { useMemo, useState } from "react"
import { guessTrack } from "../../../shared/directionScores"
import type { CourseId, PlanResponse, RunRecord } from "../../../shared/types"
import { api } from "../api"
import { termName } from "../lib/derive"
import { useStore, type Student } from "../store"
import { traceOf } from "./PlanModal"
import { COLOR } from "./CourseNode"
import { category } from "../lib/derive"

/**
 * First-visit questions (D-024): who you are, where you are in the degree, which courses you already took
 * (semester by semester), and your goal. Then Gemini + the rules engine plan the remaining semesters.
 */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const dag = useStore(s => s.dag)!
  const careers = useStore(s => s.careers)
  const policies = useStore(s => s.policies)!
  const [step, setStep] = useState(0) // 0 about, 1 progress, 2..2+N-1 courses per done semester, then goal, then build
  const [name, setName] = useState("")
  const [unitsDone, setUnitsDone] = useState(0)
  const [coursesPerSemester, setCps] = useState(5)
  const [doneSems, setDoneSems] = useState(0)
  const [gradIndex, setGradIndex] = useState(8)
  const [taken, setTaken] = useState<CourseId[][]>(Array.from({ length: 7 }, () => []))
  const [draft, setDraft] = useState("")
  const [warn, setWarn] = useState<string | null>(null)
  const [goal, setGoal] = useState("")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ resp: PlanResponse; trace: ReturnType<typeof traceOf> } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const unitsPerSemester = Math.min(policies.maxUnitsWithoutPermission.value, Math.max(policies.minUnitsFullTime.value, coursesPerSemester * 3))
  const codes = useMemo(() => Object.keys(dag.nodes).sort(), [dag])
  const goalStep = 2 + doneSems, buildStep = goalStep + 1
  const trackId = guessTrack(goal)
  const allTaken = taken.slice(0, doneSems).flat()

  function addCourse(sem: number) {
    const code = draft.trim().toUpperCase().replace(/^([A-Z]+)\s*(\d)/, "$1 $2")
    if (!code) return
    if (!dag.nodes[code]) { setWarn(`${code} is not a B.S. CS course in the 2026-27 Bulletin data.`); return }
    if (allTaken.includes(code)) { setWarn(`${code} is already listed.`); return }
    setTaken(t => t.map((l, i) => (i === sem ? [...l, code] : l))); setDraft(""); setWarn(null)
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
    <button disabled={!ok} onClick={() => setStep(step + 1)} className="rounded-full bg-teal-300 px-4 py-1.5 font-mono text-xs text-black disabled:opacity-40">next</button>)
  const total = buildStep + 1

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black">
      <div className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(#27272a 0.8px, transparent 0.8px)", backgroundSize: "28px 28px" }} />
      <div className="relative w-[520px]">
        <div className="mb-6 flex items-center justify-between font-mono text-xs">
          <span className="text-sm text-white">Plan<span className="text-sf-gold">Ed</span></span>
          <span className="text-zinc-600">{Math.min(step + 1, total)} / {total}</span>
        </div>
        <div className="mb-6 h-px w-full bg-white/10"><div className="h-px bg-teal-300 transition-all duration-500" style={{ width: `${(Math.min(step + 1, total) / total) * 100}%` }} /></div>

        {step === 0 && <>
          <h1 className="text-2xl font-semibold text-white">Let's map your degree.</h1>
          <p className="mt-1 text-sm text-zinc-500">A few questions, then the rules engine and Gemini lay out every semester.</p>
          <label className={label}>your name</label>
          <input autoFocus className={input} value={name} onChange={e => setName(e.target.value)} placeholder="first name" onKeyDown={e => { if (e.key === "Enter" && name.trim()) setStep(1) }} />
          <label className={label}>major</label>
          <select className={input} defaultValue="bs-cs">
            <option value="bs-cs" className="bg-black">B.S. Computer Science (2026-27 Bulletin)</option>
            <option disabled className="bg-black">More majors: same pipeline, not verified yet</option>
          </select>
          <div className="mt-6 flex justify-end">{next(!!name.trim())}</div>
        </>}

        {step === 1 && <>
          <h1 className="text-2xl font-semibold text-white">Where are you now, {name.trim()}?</h1>
          <div className="grid grid-cols-2 gap-x-4">
            <div><label className={label}>units completed</label>
              <input type="number" min={0} max={200} className={input} value={unitsDone} onChange={e => setUnitsDone(Math.max(0, Number(e.target.value)))} /></div>
            <div><label className={label}>semesters completed</label>
              <select className={input} value={doneSems} onChange={e => setDoneSems(Number(e.target.value))}>
                {Array.from({ length: 8 }, (_, i) => <option key={i} value={i} className="bg-black">{i === 0 ? "none, I'm starting" : `${i} (through ${termName(dag, i)})`}</option>)}
              </select></div>
            <div><label className={label}>expected graduation</label>
              <select className={input} value={gradIndex} onChange={e => setGradIndex(Number(e.target.value))}>
                {Array.from({ length: 8 }, (_, i) => i + 1).filter(i => i > doneSems).map(i => <option key={i} value={i} className="bg-black">{termName(dag, i)}</option>)}
              </select></div>
            <div><label className={label}>courses per semester</label>
              <select className={input} value={coursesPerSemester} onChange={e => setCps(Number(e.target.value))}>
                {[4, 5, 6].map(n => <option key={n} value={n} className="bg-black">{n} courses (~{Math.min(policies.maxUnitsWithoutPermission.value, Math.max(policies.minUnitsFullTime.value, n * 3))} units)</option>)}
              </select></div>
          </div>
          <div className="mt-6 flex justify-between"><button className="font-mono text-xs text-zinc-500" onClick={() => setStep(0)}>back</button>{next()}</div>
        </>}

        {step >= 2 && step < goalStep && (() => {
          const sem = step - 2
          return <>
            <h1 className="text-2xl font-semibold text-white">What did you take in {termName(dag, sem + 1)}?</h1>
            <p className="mt-1 text-sm text-zinc-500">Type a course code and press Enter. Only CS-major courses; GE counts through your units.</p>
            <input autoFocus list="gg-codes" className={`${input} mt-4 font-mono`} value={draft} onChange={e => setDraft(e.target.value)}
              placeholder="e.g. CSC 215" onKeyDown={e => { if (e.key === "Enter") addCourse(sem) }} />
            <datalist id="gg-codes">{codes.filter(c => !allTaken.includes(c)).map(c => <option key={c} value={c}>{dag.nodes[c].title}</option>)}</datalist>
            {warn && <div className="mt-2 font-mono text-[11px] text-amber-300">{warn}</div>}
            <div className="mt-3 flex min-h-8 flex-wrap gap-2">
              {taken[sem].map(c => (
                <span key={c} className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 font-mono text-xs text-zinc-200">
                  <span className="h-2 w-2 rounded-full" style={{ border: `1.5px solid ${COLOR[category(dag, c)]}` }} />{c}
                  <button className="text-zinc-600 hover:text-red-400" onClick={() => setTaken(t => t.map((l, i) => (i === sem ? l.filter(x => x !== c) : l)))}>×</button>
                </span>))}
              {!taken[sem].length && <span className="font-mono text-xs text-zinc-700">no major courses yet</span>}
            </div>
            <div className="mt-6 flex justify-between">
              <button className="font-mono text-xs text-zinc-500" onClick={() => { setStep(step - 1); setWarn(null) }}>back</button>
              <button onClick={() => { setStep(step + 1); setWarn(null); setDraft("") }} className="rounded-full bg-teal-300 px-4 py-1.5 font-mono text-xs text-black">
                {sem + 1 < doneSems ? `next: ${termName(dag, sem + 2)}` : "done with courses"}</button>
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
            <label className={label}>recommended electives · {dag.tracks[trackId].label}</label>
            <div className="grid grid-cols-2 gap-1.5">
              {dag.tracks[trackId].courses.filter(c => !allTaken.includes(c)).map(c => (
                <div key={c} className="flex items-center gap-2 font-mono text-[11px] text-zinc-300">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ border: `1.5px solid ${COLOR.elective}`, boxShadow: `0 0 6px ${COLOR.elective}` }} />
                  {c} <span className="truncate font-sans text-zinc-500">{dag.nodes[c].title}</span>
                </div>))}
            </div>
            <p className="mt-2 text-[11px] text-zinc-600">From the department's own elective tracks. Gemini picks among them for your goal; the engine checks every rule.</p>
          </>}
          <div className="mt-6 flex justify-between"><button className="font-mono text-xs text-zinc-500" onClick={() => setStep(step - 1)}>back</button>{next(!!goal.trim())}</div>
        </>}

        {step === buildStep && <>
          <h1 className="text-2xl font-semibold text-white">{result ? "Your plan is ready." : "Ready to map it out?"}</h1>
          <div className="mt-3 space-y-1 font-mono text-[11px] text-zinc-500">
            <div>{name.trim()} · B.S. Computer Science · {unitsDone} units done · graduating {termName(dag, gradIndex)}</div>
            <div>{doneSems ? `${allTaken.length} major courses locked in ${doneSems} completed semester${doneSems > 1 ? "s" : ""}` : "starting fresh"} · ~{unitsPerSemester} units per semester</div>
            <div>goal: {goal}</div>
          </div>
          {busy && <div className="mt-5 animate-pulse font-mono text-xs text-teal-300">Gemini is proposing a plan · the rules engine is checking every prerequisite…</div>}
          {err && <div className="mt-4 font-mono text-xs text-red-400">{err}</div>}
          {result && (
            <ol className="mt-5 space-y-1 font-mono text-[11px]">
              {result.trace.map((t, i) => <li key={i} className={t.state === "fail" ? "text-red-400" : "text-teal-300"}>{t.state === "fail" ? "✗" : "✓"} {t.label}</li>)}
              <li className="pt-1 text-zinc-300">{result.resp.plan.source === "ai" ? "Gemini plan accepted by the rules engine" : "Deterministic engine plan (Gemini unavailable)"} · {result.resp.report.issues.filter(i => i.severity === "error").length} rule errors</li>
            </ol>
          )}
          <div className="mt-6 flex justify-between">
            <button className="font-mono text-xs text-zinc-500" onClick={() => setStep(step - 1)} disabled={busy}>back</button>
            {result ? <button onClick={finish} className="rounded-full bg-sf-gold px-4 py-1.5 font-mono text-xs text-black">show me my map</button>
              : <button onClick={build} disabled={busy} className="rounded-full bg-sf-gold px-4 py-1.5 font-mono text-xs text-black disabled:opacity-40">✦ build my plan</button>}
          </div>
        </>}
      </div>
    </div>
  )
}
