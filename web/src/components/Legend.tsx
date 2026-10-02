import { COLOR } from "./CourseNode"

/** One quiet line of key; details live in the tour (D-022). */
export function Legend() {
  const dot = (c: string, label: string) => <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ border: `1.5px solid ${c}`, boxShadow: `0 0 6px ${c}` }} />{label}</span>
  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-4 font-mono text-[10px] text-zinc-500">
      {dot(COLOR.core, "Core")}{dot(COLOR.math, "Math/Physics")}{dot(COLOR.elective, "Elective")}{dot(COLOR.ge, "GE")}
      <span className="flex items-center gap-1.5"><span className="h-px w-5 bg-white/40" />Prerequisite</span>
      <span className="flex items-center gap-1.5"><span className="h-px w-5 border-t border-dashed border-teal-300" />One of (or)</span>
      <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-red-500 shadow-[0_0_6px_#ff3b3b]" />Broken rule</span>
    </div>
  )
}
