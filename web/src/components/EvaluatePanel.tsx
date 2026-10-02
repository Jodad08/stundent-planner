import type { Issue, Suggestion } from "../../../shared/types"
import { useActivePlan, useStore } from "../store"
import { termName } from "../lib/derive"
import { useReport } from "./Board"
import { aiName, Thinking, type Stage } from "./Thinking"

/** Evaluate (D-028): AI reasoning, then the plan start-to-end, where it heads, career paths, and the rule check. */
export function EvaluatePanel() {
  const report = useReport()
  const ev = useStore(s => s.evaluation)
  const dag = useStore(s => s.dag)!
  const plan = useActivePlan()
  const st = useStore.getState()
  const ai = aiName(useStore.getState().health?.aiProvider)
  if (!report) return null
  const semOf = new Map(plan.semesters.flatMap(s => s.courseIds.map(c => [c, s.index] as const)))
  const names = (t: string) => t.replace(/(Fall|Spring) Year (\d)/g, (_m, season: string, y: string) => termName(dag, (Number(y) - 1) * 2 + (season === "Fall" ? 1 : 2)))
  const errors = report.issues.filter(i => i.severity === "error")
  const warnings = report.issues.filter(i => i.severity === "warning")
  const apply = (s: Suggestion) => { if (s.remove) st.unplaceCourse(s.remove); st.moveCourse(s.add, s.semester) }
  const thinking: Stage[] = ev?.ai?.thoughts?.map(t => ({ label: t, state: "think" as const })) ?? []
  const H = ({ n, children }: { n: number; children: React.ReactNode }) => (
    <div className="mb-2 mt-6 flex items-center gap-2 text-[13px] font-semibold text-zinc-900">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-[11px] text-white">{n}</span>{children}</div>)
  const Item = ({ i }: { i: Issue }) => (
    <li className="cursor-pointer rounded-lg bg-zinc-50 p-2 text-[12px] hover:bg-zinc-100" onClick={() => i.courseIds[0] && st.selectCourse(i.courseIds[0])}>
      {names(i.message)}{i.sourceUrl && <a className="ml-1 text-sky-700 underline" href={i.sourceUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>Bulletin</a>}
    </li>)

  return (
    <aside className="w-[420px] shrink-0 overflow-y-auto border-l border-zinc-200 bg-white p-5 text-sm text-zinc-700">
      <div className="flex items-center justify-between">
        <div className="text-base font-bold text-zinc-900">Evaluate your plan</div>
        <button className="text-zinc-400 hover:text-zinc-900" onClick={() => st.setPanel("none")}>✕</button>
      </div>
      <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3">
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-violet-700">{ev ? `${ai} · reasoning` : `Evaluating your plan with ${ai}…`}</div>
        <div className="[&_li]:!text-violet-900"><Thinking pending={!ev} lines={ev ? [...thinking, { label: "Done", state: "done" }] : [
          { label: `Reading ${plan.semesters.flatMap(s => s.courseIds).filter(c => !c.startsWith("GE-")).length} planned courses`, state: "think" },
          { label: "Tracing how your courses connect", state: "think" }]} /></div>
      </div>

      {ev && <>
        <H n={1}>Your plan, start to end</H>
        {ev.connections.longestChain.length > 1 ? (
          <ol className="relative ml-2 border-l-2 border-lime-400 pl-4">
            {ev.connections.longestChain.map(c => (
              <li key={c} className="mb-2 cursor-pointer" onClick={() => st.selectCourse(c)}>
                <span className="absolute -left-[7px] mt-1 h-3 w-3 rounded-full border-2 border-white bg-lime-500" />
                <div className="text-[11px] text-zinc-500">{semOf.has(c) ? termName(dag, semOf.get(c)!) : ""}</div>
                <div className="text-[13px]"><b className="text-zinc-900">{c}</b> · {dag.nodes[c]?.title}</div>
              </li>))}
          </ol>) : <div className="text-[12px] text-zinc-500">Add more courses to see how they connect.</div>}
        {ev.ai && <p className="mt-1 text-[13px] leading-relaxed">{ev.ai.summary}</p>}
        <div className="mt-1 text-[11px] text-zinc-500">{ev.connections.links} prerequisite links · {ev.connections.critical.length} courses with no slack{ev.connections.critical.length ? ` (${ev.connections.critical.slice(0, 4).join(", ")})` : ""}</div>

        <H n={2}>Where it's heading</H>
        <div className="text-[15px] font-semibold text-zinc-900">→ {ev.directionScores[0]?.label}</div>
        {ev.ai && <p className="mt-1 text-[13px] leading-relaxed">{ev.ai.directionExplanation}</p>}
        <div className="mt-2 space-y-1">{ev.directionScores.map(d => (
          <div key={d.directionId} className="flex items-center gap-2 text-[11px] text-zinc-500"><span className="w-32 truncate">{d.label}</span>
            <div className="h-1.5 flex-1 rounded bg-zinc-100"><div className="h-1.5 rounded bg-lime-500" style={{ width: `${d.score}%` }} /></div><span className="w-6 text-right">{d.score}</span></div>))}</div>

        {ev.ai && ev.ai.careerPaths.length > 0 && <>
          <H n={3}>Career paths to consider</H>
          <div className="space-y-2">{ev.ai.careerPaths.map(c => (
            <div key={c.title} className="rounded-xl border border-zinc-200 p-3">
              <div className="font-semibold text-zinc-900">{c.title}</div>
              <div className="text-[12px] text-zinc-600">{c.why}</div>
            </div>))}</div>
          <div className="mt-1 text-[10px] text-zinc-400">Suggested by {ai}. Talk to SFSU Career Services and your advisor.</div>
        </>}

        <H n={ev.ai?.careerPaths.length ? 4 : 3}>Rule check</H>
        <div className={`rounded-lg px-3 py-2 text-[13px] font-semibold ${errors.length ? "bg-red-100 text-red-800" : report.graduationReady ? "bg-lime-100 text-lime-900" : "bg-amber-100 text-amber-900"}`}>
          {errors.length ? `${errors.length} rule${errors.length > 1 ? "s" : ""} broken: fix first` : report.graduationReady ? "Follows every checked SFSU rule and reaches graduation" : "No broken rules, but the plan is not complete yet"}
        </div>
        {errors.length + warnings.length > 0 && <ul className="mt-2 space-y-1">{[...errors, ...warnings].map(i => <Item key={i.id} i={i} />)}</ul>}

        {ev.ai && ev.ai.suggestions.length > 0 && <>
          <div className="mb-1 mt-4 text-[12px] font-semibold text-zinc-900">Suggested swaps (re-checked by the engine)</div>
          <ul className="space-y-1">{ev.ai.suggestions.map((s, k) => (
            <li key={k} className="rounded-lg border border-zinc-200 p-2 text-[12px]">
              <b>{s.remove ? `${s.remove} → ` : "+ "}{s.add}</b> ({termName(dag, s.semester)}) · {s.reason}
              <button className="ml-2 rounded bg-zinc-800 px-2 py-0.5 text-[11px] text-white" onClick={() => apply(s)}>apply</button>
            </li>))}</ul>
        </>}
        {!ev.ai && <div className="mt-4 text-[12px] text-amber-700">The AI part is unavailable right now; the rule check above is complete.</div>}
      </>}
      <div className="mt-6 border-t border-zinc-100 pt-3 text-[11px] text-zinc-400">Always confirm with your SFSU advisor. Not checked: GE areas, SF State Studies, the 30 upper-division-unit rule.</div>
    </aside>
  )
}
