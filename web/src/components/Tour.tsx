import { useEffect, useLayoutEffect, useState } from "react"

/** First-load walkthrough (D-022): spotlight one part of the UI at a time. */
const STEPS: { target: string; title: string; body: string; petMenu?: boolean }[] = [
  { target: "[data-tour=semester], .react-flow__node-semester", title: "A semester", body: "Turns red when it has too few credits." },
  { target: "[data-tour=card], .react-flow__node-course", title: "A course", body: "Drag it to another semester. A red outline means it breaks a rule." },
  { target: "[data-tour=courses]", title: "Your course list", body: "Core, math, electives and GE. Drag a course onto a semester, or press +." },
  { target: "[data-tour=view]", title: "Cards or graph", body: "The graph shows how your courses connect." },
  { target: "[data-tour=pet]", title: "Your gator 🐊", body: "Tells you what to add next. Click it for options. Drag it anywhere." },
  { target: "[data-tour=pet-auto]", title: "Auto plan", body: "AI fills your next semester, or your whole degree.", petMenu: true },
  { target: "[data-tour=pet-evaluate]", title: "Evaluate", body: "AI checks your plan: where it leads, careers, and broken rules.", petMenu: true },
  { target: "[data-tour=pet-export]", title: "Export for SFSU", body: "Downloads your next semester as a one-page plan for your advisor.", petMenu: true },
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
  // open the gator's menu while its options are explained
  useEffect(() => { window.dispatchEvent(new CustomEvent("planed:pet-menu", { detail: !!step.petMenu })) }, [step.petMenu])
  useEffect(() => () => { window.dispatchEvent(new CustomEvent("planed:pet-menu", { detail: false })) }, [])
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
  const W = 340, Hc = 150, vw = window.innerWidth, vh = window.innerHeight
  // first spot that fits: below, right, left, above; never on top of the target
  const spot = r.bottom + Hc + 24 < vh ? { top: r.bottom + pad + 12, left: r.left }
    : r.right + W + 24 < vw ? { top: r.top, left: r.right + pad + 12 }
    : r.left - W - 24 > 0 ? { top: r.top, left: r.left - W - pad - 12 }
    : { top: r.top - Hc - pad - 12, left: r.left }
  const cardTop = Math.min(Math.max(16, spot.top), vh - Hc - 16)
  const cardLeft = Math.min(Math.max(16, spot.left), vw - W - 16)
  return (
    <div className="fixed inset-0 z-[100]" onClick={e => e.stopPropagation()}>
      <div className="pointer-events-none fixed rounded-xl transition-all duration-300"
        style={{ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2,
          boxShadow: "0 0 0 9999px rgba(24,24,27,0.55), 0 0 0 3px #a3e635" }} />
      <div className="fixed w-[340px] rounded-xl bg-white p-4 shadow-2xl transition-all duration-300" style={{ top: cardTop, left: cardLeft }}>
        <div className="mb-1 text-[11px] font-medium text-lime-700">Step {i + 1} of {STEPS.length}</div>
        <div className="mb-1 text-[16px] font-semibold text-zinc-900">{step.title}</div>
        <div className="text-[13px] leading-relaxed text-zinc-600">{step.body}</div>
        <div className="mt-4 flex items-center justify-between text-[13px]">
          <button className="text-zinc-500 hover:text-zinc-900" onClick={onDone}>Skip</button>
          <div className="flex gap-2">
            {i > 0 && <button className="rounded-full px-3 py-1 text-zinc-600 hover:bg-zinc-100" onClick={() => setI(i - 1)}>Back</button>}
            <button className="rounded-full bg-zinc-900 px-4 py-1 font-medium text-white" onClick={() => (i < STEPS.length - 1 ? setI(i + 1) : onDone())}>{i < STEPS.length - 1 ? "Next" : "Start planning"}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
