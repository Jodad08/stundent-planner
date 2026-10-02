import { useEffect, useRef, useState } from "react"
import { guessTrack } from "../../../shared/directionScores"
import { emptySemesters } from "../../../shared/engine"
import type { CourseId, PlanResponse, RunRecord } from "../../../shared/types"
import { api } from "../api"
import { termName } from "../lib/derive"
import { useStore, type Student } from "../store"
import { Interview } from "./Interview"
import { traceOf } from "./PlanModal"
import { aiName, Thinking } from "./Thinking"
import { firstNumber, parseCodes, parseName, parseSemesters } from "../lib/parse"

/**
 * Onboarding as a conversation (D-034). PlanEd asks one question at a time and reads the raw reply with plain
 * rules (no AI): names, numbers in digits or words, course codes, terms. Then the student picks Auto plan
 * (the simulated AI interview) or planning by hand.
 */
type Msg = { from: "bot" | "me"; text: string }
type Step = "back" | "name" | "major" | "sems" | "courses" | "units" | "grad" | "cps" | "goal" | "how" | "done"

export function Onboarding({ onDone, onSkip }: { onDone: () => void; onSkip?: () => void }) {
  const dag = useStore(s => s.dag)!
  const policies = useStore(s => s.policies)!
  const careers = useStore(s => s.careers)
  const saved = useStore.getState().student
  const savedPlan = useStore.getState().plans.find(p => p.id === useStore.getState().activePlanId)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [step, setStep] = useState<Step>(saved ? "back" : "name")
  const [typing, setTyping] = useState(true)
  const [draft, setDraft] = useState("")
  const [majors, setMajors] = useState(0)
  // answers live in a ref so each reply sees the latest values
  const A = useRef({ name: saved?.name ?? "", sems: saved?.completedSemesters ?? 0, sem: 0, taken: Array.from({ length: 7 }, (_, i) =>
      i < (saved?.completedSemesters ?? 0) ? (savedPlan?.semesters[i]?.courseIds ?? []).filter(c => dag.nodes[c]) : [] as CourseId[]),
    units: saved?.unitsDone ?? 0, grad: 8, cps: saved?.coursesPerSemester ?? 5, goal: saved?.goal ?? "" })
  const [interview, setInterview] = useState(false)
  // course step: pick one course, press +, repeat, then Done (D-038)
  const [picked, setPicked] = useState<CourseId[]>([])
  const [pickWarn, setPickWarn] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ resp: PlanResponse; trace: ReturnType<typeof traceOf>; trackId: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { api.majors().then(m => setMajors(m.length)).catch(() => setMajors(0)) }, [])
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }) }, [msgs, typing, result, busy])

  /** PlanEd "types" one or more lines. */
  function say(lines: string[], next?: Step) {
    setTyping(true)
    lines.forEach((text, k) => setTimeout(() => {
      setMsgs(m => [...m, { from: "bot", text }])
      if (k === lines.length - 1) { setTyping(false); if (next) setStep(next) }
    }, 650 * (k + 1)))
  }
  useEffect(() => {
    if (saved) say([`Welcome back, ${saved.name}! 👋`, "Jump to your plan, or update?"])
    else say(["Hey! I'm PlanEd 👋", "What's your name?"])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const a = A.current
  const askCourses = (k: number) => say([`What did you take in ${termName(dag, k + 1)}? 📚`], "courses")
  const units = () => Math.min(policies.maxUnitsWithoutPermission.value, Math.max(policies.minUnitsFullTime.value, a.cps * 3))

  function reply(raw: string) {
    const t = raw.trim()
    if (!t || typing) return
    setMsgs(m => [...m, { from: "me", text: t }]); setDraft("")
    const s = t.toLowerCase()
    switch (step) {
      case "back":
        if (/plan|jump|go|skip/.test(s) && onSkip) { onSkip(); return }
        return say(["Let's update ✏️", "Semesters done?"], "sems")
      case "name": {
        const n = parseName(t)
        if (!n) return say(["Hmm, what should I call you? 🙂"])
        a.name = n
        return say([`Hey ${n}! 🎉`, "Your major?"], "major")
      }
      case "major":
        if (/comput|\bcs\b|\bcsc\b/.test(s)) return say(["CS, nice! 💻", "Semesters done?"], "sems")
        return say([`Only CS is mapped so far${majors ? ` (${majors - 1} more coming)` : ""}. Using CS for now 💻`, "Semesters done?"], "sems")
      case "sems": {
        const n = parseSemesters(t)
        if (n == null) return say(['Try a number, like "2" 🙂'])
        a.sems = n; a.sem = 0; a.taken = Array.from({ length: 7 }, () => [])
        if (n === 0) return say(["Fresh start! 🌱", "Any AP or transfer units?"], "units")
        say([`${n} down ✅`])
        return setTimeout(() => askCourses(0), 700)
      }
      case "courses": {
        const codes = parseCodes(t)
        const ok = [...new Set(codes)].filter(c => dag.nodes[c] && !a.taken.flat().includes(c)), bad = [...new Set(codes)].filter(c => !dag.nodes[c])
        if (!codes.length && !/none|nothing|no\b|ge only|skip/.test(s)) return say(['Add a course with + 🙂'])
        a.taken[a.sem] = [...a.taken[a.sem], ...ok]
        const lines = [ok.length ? `${ok.join(", ")} ✅` : "No major courses, got it 👍"]
        if (bad.length) lines.push(`Skipped ${bad.join(", ")} (not a CS course) 🤔`)
        a.sem++
        if (a.sem < a.sems) { say(lines); return setTimeout(() => askCourses(a.sem), 650 * (lines.length + 1)) }
        const est = a.sems * 15
        return say([...lines, `Total units so far? (~${est} if unsure)`], "units")
      }
      case "units": {
        const n = firstNumber(s)
        a.units = n != null ? Math.min(200, n) : a.sems * 15
        return say([`${a.units} units 👍`, "Graduating when? 🎓"], "grad")
      }
      case "grad": {
        const m = /(fall|spring)\s*(\d{4})/i.exec(t), y = /(\d{4})/.exec(t)
        const want = m ? `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}` : y ? `Spring ${y[1]}` : ""
        const idx = Array.from({ length: 8 }, (_, i) => i + 1).find(i => termName(dag, i) === want) ?? 8
        a.grad = Math.max(a.sems + 1, idx)
        return say([`${termName(dag, a.grad)} 🎓`, "Courses per semester?"], "cps")
      }
      case "cps": {
        const n = firstNumber(s)
        a.cps = n != null ? Math.min(6, Math.max(4, n)) : /light|part/.test(s) ? 4 : 5
        return say([`${a.cps} it is (~${units()} units) 👌`, "Dream job? 🚀"], "goal")
      }
      case "goal":
        a.goal = t
        return say(["Love it 🚀", "Plan it for you, or DIY?"], "how")
      case "how":
        if (/myself|manual|by hand|\bi'?ll\b|\bi will\b/.test(s) && !/for me/.test(s)) return finishManual()
        setStep("done"); setInterview(true)
    }
  }

  function addPick() {
    const codes = parseCodes(draft)
    if (!codes.length) { setPickWarn('Type a course code like "CSC 101".'); return }
    const bad = codes.filter(c => !dag.nodes[c]), dup = codes.filter(c => picked.includes(c) || a.taken.flat().includes(c))
    const ok = [...new Set(codes)].filter(c => dag.nodes[c] && !dup.includes(c))
    if (ok.length) setPicked(p => [...p, ...ok])
    setDraft(bad.join(", "))
    setPickWarn(bad.length ? `${bad.join(", ")} isn't a Computer Science major course in the 2026-27 Bulletin.` : dup.length ? `${dup.join(", ")} is already added.` : null)
  }

  const chips: Record<Step, string[]> = {
    back: ["Go to my plan", "Update"], name: [], major: ["Computer Science"],
    sems: ["Just starting", "1", "2", "4"], courses: ["None"], units: ["0", "Not sure"], grad: ["Spring 2030", "Fall 2029"],
    cps: ["4", "5", "6"], goal: careers.map(c => c.label), how: ["✦ Plan it for me", "I'll do it myself"], done: [],
  }

  async function build(goalText: string, cps: number, trackId: string) {
    setBusy(true); setErr(null)
    a.cps = cps
    const locked = a.taken.slice(0, a.sems).flatMap((l, i) => l.map(courseId => ({ courseId, semester: i + 1 })))
    try {
      const resp = await api.plan({ goalText, programId: "bs-cs", unitsPerSemester: units(), lockedPlacements: locked,
        completedSemesters: a.sems, unitsEarned: a.units, trackId })
      const run = await api.run(resp.runId).catch(() => null as RunRecord | null)
      setResult({ resp, trace: run ? traceOf(run) : [], trackId })
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }
  const student = (trackId: string): Student => ({ name: a.name || "Student", major: "bs-cs", unitsDone: a.units, gradTerm: termName(dag, a.grad),
    coursesPerSemester: a.cps, completedSemesters: a.sems, goal: a.goal, trackId })
  function finishManual() {
    // returning student: keep the plan they already built; only the completed semesters are rewritten
    const takenIds = new Set(a.taken.slice(0, a.sems).flat())
    const semesters = savedPlan && saved ? savedPlan.semesters.map(x => ({ ...x, courseIds: x.courseIds.filter(c => !takenIds.has(c)) })) : emptySemesters()
    a.taken.slice(0, a.sems).forEach((l, i) => { semesters[i].courseIds = [...semesters[i].courseIds.filter(c => !dag.nodes[c]), ...l] })
    const st = student(guessTrack(a.goal))
    useStore.getState().setStudent(st)
    useStore.setState({ plans: [{ id: "plan_me", name: `${st.name}'s plan`, programId: "bs-cs", goalText: a.goal, createdAt: new Date().toISOString(),
      semesters, source: "manual", ...(a.sems ? { completedSemesters: a.sems } : {}) }], activePlanId: "plan_me", evaluation: null })
    onDone()
  }
  function finish() {
    if (!result) return
    const st = student(result.trackId)
    useStore.getState().setStudent(st)
    useStore.setState({ plans: [{ ...result.resp.plan, id: "plan_me", name: `${st.name}'s plan` }], activePlanId: "plan_me", evaluation: null })
    onDone()
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black">
      <div className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(#27272a 0.8px, transparent 0.8px)", backgroundSize: "28px 28px" }} />
      <div className="relative flex h-[640px] w-[560px] flex-col">
        <div className="mb-3 flex items-center justify-between text-xs">
          <span className="text-lg font-bold text-white">Plan<span className="text-sf-gold">Ed</span></span>
          {onSkip && <button onClick={onSkip} className="text-zinc-400 hover:text-white hover:underline">Skip to my plan →</button>}
        </div>
        <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950">
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {msgs.map((m, k) => (
              <div key={k} className={`flex ${m.from === "me" ? "justify-end" : ""}`}>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed ${m.from === "me" ? "rounded-br-sm bg-lime-300 text-zinc-900" : "rounded-bl-sm bg-white/[0.07] text-zinc-100"}`}>{m.text}</div>
              </div>))}
            {typing && <div className="flex"><div className="rounded-2xl rounded-bl-sm bg-white/[0.07] px-3.5 py-2 text-zinc-400"><span className="animate-pulse">● ● ●</span></div></div>}
            {(busy || result) && (
              // short status only; the button appears once it finishes (D-050)
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-violet-300">✦ {aiName(useStore.getState().health?.aiProvider)}</div>
                <Thinking pending={busy} speed={650} onDone={() => setReady(true)} lines={result
                  ? [{ label: "Evaluating…", state: "think" }, { label: "Checking prerequisites…", state: "think" }, { label: "Picking your electives…", state: "think" },
                     { label: `Plan ready ✓${result.resp.report.issues.some(i => i.severity === "error") ? "" : " · no rule errors"}`, state: "done" }]
                  : [{ label: "Evaluating…", state: "think" }]} />
                {result && ready && <button onClick={finish} className="pop-in mt-3 w-full rounded-full bg-sf-gold py-2 text-sm font-semibold text-black">Show me my map →</button>}
              </div>
            )}
            {err && <div className="text-xs text-red-400">{err}</div>}
            <div ref={end} />
          </div>
          {step === "courses" && !typing && (
            <div className="border-t border-white/10 p-3">
              <div className="mb-2 text-[11px] text-zinc-400">{termName(dag, a.sem + 1)}</div>
              <div className="flex gap-2">
                <input autoFocus list="pe-codes" value={draft} onChange={e => { setDraft(e.target.value); setPickWarn(null) }}
                  onKeyDown={e => { if (e.key === "Enter") addPick() }} placeholder="e.g. CSC 101"
                  className="flex-1 rounded-full border border-white/10 bg-transparent px-4 py-2 font-mono text-sm text-white outline-none placeholder:font-sans placeholder:text-zinc-600 focus:border-lime-300/60" />
                <button onClick={addPick} disabled={!draft.trim()} title="Add this course"
                  className="w-10 rounded-full border border-lime-300/50 text-lg text-lime-300 hover:bg-lime-300/10 disabled:opacity-30">+</button>
              </div>
              {pickWarn && <div className="mt-1.5 text-[11px] text-amber-300">{pickWarn}</div>}
              <div className="mt-2 flex min-h-8 flex-wrap gap-1.5">
                {picked.map(c => (
                  <span key={c} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 font-mono text-[12px] text-zinc-100">
                    {c}<button className="text-zinc-500 hover:text-red-400" onClick={() => setPicked(p => p.filter(x => x !== c))}>×</button>
                  </span>))}
                {!picked.length && <span className="py-1 text-[11px] text-zinc-600">No courses added yet</span>}
              </div>
              <button onClick={() => { const list = picked.join(", "); setPicked([]); setDraft(""); reply(list || "none") }}
                className="mt-2 w-full rounded-full bg-lime-300 py-2 text-sm font-medium text-zinc-900">
                {picked.length ? "Done ✓" : "None this semester"}
              </button>
              <datalist id="pe-codes">{Object.keys(dag.nodes).sort().filter(c => !picked.includes(c) && !a.taken.flat().includes(c)).map(c => <option key={c} value={c}>{dag.nodes[c].title}</option>)}</datalist>
            </div>
          )}
          {step !== "done" && step !== "courses" && (
            <div className="border-t border-white/10 p-3">
              <div className="mb-2 flex min-h-7 flex-wrap gap-1.5">
                {!typing && chips[step].map(c => <button key={c} onClick={() => reply(c)} className="rounded-full border border-white/15 px-3 py-1 text-[12px] text-zinc-200 hover:border-lime-300 hover:text-white">{c}</button>)}
              </div>
              <div className="flex gap-2">
                <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") reply(draft) }}
                  placeholder={typing ? "…" : "Type your answer"} className="flex-1 rounded-full border border-white/10 bg-transparent px-4 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-lime-300/60" />
                <button onClick={() => reply(draft)} disabled={!draft.trim() || typing} className="rounded-full bg-lime-300 px-4 text-sm font-medium text-zinc-900 disabled:opacity-40">Send</button>
              </div>
            </div>
          )}
        </div>
        <div className="mt-2 text-center text-[10px] text-zinc-600">Your answers stay in this browser.</div>
      </div>
      {interview && <Interview name={a.name || "there"} initialGoal={a.goal} knownGoal={a.goal} coursesPerSemester={a.cps}
        onCancel={() => { setInterview(false); setStep("how") }}
        onFinish={(goalText, shortGoal, cps, tId) => { setInterview(false); a.goal = shortGoal; build(goalText, cps, tId) }} />}
    </div>
  )
}
