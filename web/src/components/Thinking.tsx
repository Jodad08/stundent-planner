import { useEffect, useState } from "react"

export type Stage = { label: string; state: "wait" | "run" | "done" | "fail" | "think" }

/** Reveals reasoning/trace lines one at a time, like a model thinking out loud (D-026). */
export function Thinking({ lines, pending, speed = 420, onDone }: { lines: Stage[]; pending?: boolean; speed?: number; onDone?: () => void }) {
  const [n, setN] = useState(0)
  useEffect(() => { setN(0) }, [lines])
  useEffect(() => { if (!pending && lines.length && n >= lines.length) onDone?.() }, [n, lines, pending, onDone])
  useEffect(() => {
    if (n >= lines.length) return
    const t = setTimeout(() => setN(n + 1), lines[n]?.state === "think" ? speed * 1.6 : speed)
    return () => clearTimeout(t)
  }, [n, lines, speed])
  const color = (s: Stage["state"]) => s === "fail" ? "text-red-400" : s === "think" ? "text-zinc-300" : "text-teal-300"
  const mark = (s: Stage["state"]) => s === "fail" ? "✗" : s === "think" ? "›" : "✓"
  return (
    <ol className="space-y-1 font-mono text-[11px] leading-relaxed">
      {lines.slice(0, n).map((t, i) => <li key={i} className={`${color(t.state)} ${t.state === "think" ? "pl-3" : ""}`}>{mark(t.state)} {t.label}</li>)}
      {(pending || n < lines.length) && <li className="animate-pulse text-zinc-500">▍ Thinking…</li>}
    </ol>
  )
}

/** "Gemini" when live, otherwise the product name (offline planner, D-039). */
export const aiName = (provider?: string) => (provider === "gemini" ? "Gemini" : "PlanEd")
