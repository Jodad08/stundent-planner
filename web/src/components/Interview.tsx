import { useEffect, useRef, useState } from "react"
import { guessTrack } from "../../../shared/directionScores"
import { useStore } from "../store"
import { aiName } from "./Thinking"

type Msg = { from: "ai" | "me"; text: string }
type Q = { ask: (a: Answers) => string; chips: (a: Answers) => string[]; react: (answer: string, a: Answers) => string; key: keyof Answers }
type Answers = { goal: string; focus: string; place: string; path: string; load: string }

const FOLLOW_UP: Record<string, { q: string; chips: string[] }> = {
  ai: { q: "Build ML systems, or dig into data? 🤖", chips: ["Building ML systems", "Analyzing data", "Not sure yet"] },
  systems: { q: "Defend systems, or build them? 🛡️", chips: ["Security", "Infrastructure & cloud", "Not sure yet"] },
  web: { q: "Front-end, back-end, or mobile? 📱", chips: ["Front-end", "Back-end", "Mobile", "Not sure yet"] },
  theory: { q: "Graphics, quantum, or theory? ✨", chips: ["Graphics & games", "Quantum computing", "Theory & research"] },
}

/**
 * Simulated AI interview before Auto Plan (D-033). Scripted, personalized questions with follow-ups that branch
 * on earlier answers; no model call. The answers become the goal text the planner receives.
 */
export function Interview({ name, initialGoal, knownGoal, coursesPerSemester, onFinish, onCancel }: {
  name: string; initialGoal: string; knownGoal?: string; coursesPerSemester: number
  onFinish: (goalText: string, shortGoal: string, coursesPerSemester: number, trackId: string) => void; onCancel: () => void
}) {
  const dag = useStore(s => s.dag)!
  const careers = useStore(s => s.careers)
  const ai = aiName(useStore.getState().health?.aiProvider)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [i, setI] = useState(knownGoal ? 1 : 0) // goal already answered in onboarding: start at the follow-up
  const [typing, setTyping] = useState(true)
  const [draft, setDraft] = useState("")
  const [a, setA] = useState<Answers>({ goal: knownGoal ?? "", focus: "", place: "", path: "", load: "" })
  const end = useRef<HTMLDivElement>(null)
  const track = (x: Answers) => guessTrack(x.goal)
  const label = (x: Answers) => dag.tracks[track(x)].label

  const Qs: Q[] = [
    { key: "goal", ask: () => `Hi ${name}! Dream job? 🚀`,
      chips: () => [...(initialGoal ? [initialGoal] : []), ...careers.map(c => c.label)].slice(0, 5),
      react: (ans, x) => `${label({ ...x, goal: ans })} track it is 👍` },
    { key: "focus", ask: x => FOLLOW_UP[track(x)].q, chips: x => FOLLOW_UP[track(x)].chips,
      react: ans => /not sure/i.test(ans) ? "I'll keep it broad 👌" : `${ans}, nice 👌` },
    { key: "place", ask: () => `Where do you want to work, ${name}? 🌍`,
      chips: () => ["San Francisco / Bay Area", "Elsewhere in the US", "Back home / abroad", "Not sure yet"],
      react: ans => /bay|sf|san francisco/i.test(ans) ? "Bay Area 🌉 I'll leave room for internships."
        : /not sure/i.test(ans) ? "Open to anywhere 🌎" : `${ans.trim()} 🌍 Skills first, then.` },
    { key: "path", ask: () => "Industry or grad school? 🎓", chips: () => ["Industry", "Grad school", "Undecided"],
      react: ans => /grad/i.test(ans) ? "More theory, then 📐" : /industry/i.test(ans) ? "Hands-on electives, then 🛠️" : "A balanced mix ⚖️" },
    { key: "load", ask: () => `Keep ${coursesPerSemester} courses a semester?`,
      chips: () => ["Keep it", "Lighter (4 courses)", "Heavier (6 courses)"],
      react: ans => /light/i.test(ans) ? "Lighter it is 🌿" : /heav/i.test(ans) ? "Full speed 🏃" : "Keeping it 👍" },
  ]

  // the AI "types" its next question
  useEffect(() => {
    if (i >= Qs.length) return
    setTyping(true)
    const intro = knownGoal && i === 1 && msgs.length === 0
      ? [`${dag.tracks[guessTrack(knownGoal)].label} track 👍 A few quick ones!`] : []
    const t = setTimeout(() => { setMsgs(m => [...m, ...intro.map(text => ({ from: "ai" as const, text })), { from: "ai", text: Qs[i].ask(a) }]); setTyping(false) }, 900)
    return () => clearTimeout(t)
  }, [i]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }) }, [msgs, typing])

  function answer(text: string) {
    const ans = text.trim()
    if (!ans || typing) return
    const q = Qs[i]
    const next = { ...a, [q.key]: ans }
    setA(next); setDraft("")
    setMsgs(m => [...m, { from: "me", text: ans }])
    setTyping(true)
    setTimeout(() => {
      setMsgs(m => [...m, { from: "ai", text: q.react(ans, next) }])
      if (i + 1 < Qs.length) setI(i + 1)
      else {
        const cps = /light/i.test(next.load) ? 4 : /heav/i.test(next.load) ? 6 : coursesPerSemester
        const summary = "Got everything ✨ Building your plan…"
        setTimeout(() => {
          setMsgs(m => [...m, { from: "ai", text: summary }]); setTyping(false)
          const goalText = `${label(next)}: ${next.goal}. Focus: ${next.focus}. Wants to work: ${next.place}. After graduating: ${next.path}.`
          setTimeout(() => onFinish(goalText, next.goal, cps, track(next)), 1400)
        }, 900)
      }
    }, 800)
  }

  const q = Qs[Math.min(i, Qs.length - 1)]
  const done = msgs.length > 0 && msgs[msgs.length - 1].text.startsWith("Got everything")
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="flex h-[560px] w-[520px] flex-col rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500/20 text-sm text-violet-300">✦</span>
            <div><div className="text-sm font-semibold text-white">Plan advisor</div><div className="text-[10px] text-violet-300">{ai} · question {Math.min(i + 1, Qs.length) - (knownGoal ? 1 : 0)} of {Qs.length - (knownGoal ? 1 : 0)}</div></div>
          </div>
          <button onClick={onCancel} className="text-zinc-500 hover:text-white">✕</button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {msgs.map((m, k) => (
            <div key={k} className={`flex ${m.from === "me" ? "justify-end" : ""}`}>
              <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${m.from === "me" ? "rounded-br-sm bg-lime-300 text-zinc-900" : "rounded-bl-sm bg-white/[0.07] text-zinc-100"}`}>{m.text}</div>
            </div>))}
          {typing && <div className="flex"><div className="rounded-2xl rounded-bl-sm bg-white/[0.07] px-3.5 py-2 text-zinc-400"><span className="animate-pulse">● ● ●</span></div></div>}
          <div ref={end} />
        </div>
        {!done && <div className="border-t border-white/10 p-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {!typing && q.chips(a).map(c => <button key={c} onClick={() => answer(c)} className="rounded-full border border-white/15 px-3 py-1 text-[12px] text-zinc-200 hover:border-lime-300 hover:text-white">{c}</button>)}
          </div>
          <div className="flex gap-2">
            <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") answer(draft) }}
              placeholder={typing ? "…" : "Type your answer"} className="flex-1 rounded-full border border-white/10 bg-transparent px-4 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-lime-300/60" />
            <button onClick={() => answer(draft)} disabled={!draft.trim() || typing} className="rounded-full bg-lime-300 px-4 text-sm font-medium text-zinc-900 disabled:opacity-40">Send</button>
          </div>
        </div>}
      </div>
    </div>
  )
}
