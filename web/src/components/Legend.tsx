import { useState } from "react"
import { useStore } from "../store"
import { STRIPE } from "./CourseNode"

export function Legend() {
  const pol = useStore(s => s.policies)
  const [open, setOpen] = useState(true)
  if (!pol) return null
  if (!open) return <button className="pointer-events-auto rounded-md border border-slate-700 bg-slate-900/90 px-2 py-1 text-[11px] text-slate-300" onClick={() => setOpen(true)}>Legend</button>
  const line = (s: React.CSSProperties, label: string, cls = "") => (
    <div className="flex items-center gap-2"><svg width="34" height="8"><line x1="0" y1="4" x2="34" y2="4" className={cls} style={s} /></svg>{label}</div>)
  return (
    <div className="pointer-events-auto w-[330px] rounded-lg border border-slate-700 bg-slate-900/90 p-2.5 text-[10px] text-slate-300 shadow-xl">
      <div className="mb-1 flex justify-between font-semibold text-slate-100">Legend<button className="text-slate-400" onClick={() => setOpen(false)}>–</button></div>
      {line({ stroke: "#ef4444", strokeWidth: 1.5 }, "Prerequisite (satisfied)")}
      {line({ stroke: "#ef4444", strokeWidth: 3 }, "Prerequisite broken (bold, moving)", "edge-violated")}
      {line({ stroke: "#ef4444", strokeWidth: 1.5, strokeDasharray: "6 4" }, "One of several options (or)")}
      {line({ stroke: "#60a5fa", strokeWidth: 1.5, strokeDasharray: "2 3" }, "Corequisite (same term or earlier)")}
      <div className="mt-1.5 grid grid-cols-1 gap-y-0.5">
        <span><b className="text-emerald-300">Green dashes</b>: {pol.minUnitsFullTime.value}–{pol.heavyLoadUnits.value} units</span>
        <span><b className="text-red-300">Red</b>: under {pol.minUnitsFullTime.value}</span>
        <span><b className="text-amber-300">Amber</b>: over {pol.heavyLoadUnits.value} (normal load)</span>
        <span><b className="text-red-300">Solid red</b>: over {pol.maxUnitsWithoutPermission.value} (priority-registration max)</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {Object.entries({ core: "Core CS", math: "Math/Physics", elective: "Elective", ge: "GE placeholder" }).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1"><span className={`h-2.5 w-1.5 ${STRIPE[k]}`} />{v}</span>))}
      </div>
      <div className="mt-1 text-slate-500">Assumes calculus placement. Click a course to light up its chain.</div>
    </div>
  )
}
