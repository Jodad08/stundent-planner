import { useEffect, useLayoutEffect, useState } from "react"

/** First-load walkthrough (D-022): spotlight one part of the UI at a time. */
const STEPS: { target: string; title: string; body: string }[] = [
  { target: ".react-flow__node-semester", title: "This is a semester", body: "Your degree is 8 columns, Fall Year 1 to Spring Year 4. The label turns amber or red when a semester's units break SFSU's load rules." },
  { target: ".react-flow__node-course", title: "This is a course", body: "Each dot is one course. Hover it for the description and credits. Click it to light up everything it needs and everything it unlocks." },
  { target: "[data-tour=board]", title: "These are prerequisites", body: "Faint lines connect a course to what it needs. Drag a course before its prerequisite and the line turns red and glows." },
  { target: "[data-tour=courses]", title: "This is your course list", body: "Every B.S. Computer Science requirement from the 2026-27 Bulletin. Drag a course onto a semester to plan it." },
  { target: "[data-tour=status]", title: "The rules engine", body: "Every move is checked against the Bulletin rules: prerequisites, corequisites, standing and unit loads. No AI decides this." },
  { target: "[data-tour=ai]", title: "This is AI Plan", body: "Tell Gemini your career goal. It proposes a plan, the engine checks it and sends mistakes back for repair, and nothing invalid reaches you." },
  { target: "[data-tour=check]", title: "This is Check", body: "A full report: each broken rule with the Bulletin quote, missing requirements, career fit, and Gemini's suggestions (each re-checked)." },
  { target: "[data-tour=proof]", title: "This is Proof", body: "Gemini vs. the engine's own planner vs. SFSU's official roadmap, scored by the same rules. Always confirm with your advisor." },
]

export function Tour({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const step = STEPS[i]
  useLayoutEffect(() => {
    const find = () => setRect(document.querySelector(step.target)?.getBoundingClientRect() ?? null)
    find()
    const t = setInterval(find, 300) // board refits after load
    return () => clearInterval(t)
  }, [step.target])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone()
      if (e.key === "ArrowRight" || e.key === "Enter") i < STEPS.length - 1 ? setI(i + 1) : onDone()
      if (e.key === "ArrowLeft" && i > 0) setI(i - 1)
    }
    window.addEventListener("keydown", k)
    return () => window.removeEventListener("keydown", k)
  }, [i, onDone])
  const pad = 8
  const r = rect ?? new DOMRect(window.innerWidth / 2, window.innerHeight / 2, 0, 0)
  const below = r.bottom + 200 < window.innerHeight
  const cardTop = below ? r.bottom + pad + 12 : Math.max(16, r.top - pad - 12 - 170)
  const cardLeft = Math.min(Math.max(16, r.left), window.innerWidth - 356)
  return (
    <div className="fixed inset-0 z-[100]" onClick={e => e.stopPropagation()}>
      <div className="pointer-events-none fixed rounded-xl transition-all duration-300"
        style={{ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2,
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.78), 0 0 0 1px #2dd4bf, 0 0 24px 2px #2dd4bf66" }} />
      <div className="fixed w-[340px] rounded-xl border border-white/10 bg-black p-4 shadow-2xl transition-all duration-300" style={{ top: cardTop, left: cardLeft }}>
        <div className="mb-1 font-mono text-[10px] text-teal-300">{i + 1} / {STEPS.length}</div>
        <div className="mb-1 text-[15px] font-semibold text-white">{step.title}</div>
        <div className="text-[13px] leading-relaxed text-zinc-400">{step.body}</div>
        <div className="mt-4 flex items-center justify-between font-mono text-xs">
          <button className="text-zinc-500 hover:text-white" onClick={onDone}>skip</button>
          <div className="flex gap-2">
            {i > 0 && <button className="rounded-full px-3 py-1 text-zinc-300 hover:bg-white/10" onClick={() => setI(i - 1)}>back</button>}
            <button className="rounded-full bg-teal-300 px-3 py-1 text-black" onClick={() => (i < STEPS.length - 1 ? setI(i + 1) : onDone())}>{i < STEPS.length - 1 ? "next" : "start planning"}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
