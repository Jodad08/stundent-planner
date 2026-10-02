// Deterministic planner (no AI): the engine's own plan() turned into an 8-semester Plan.
import { emptySemesters, pickElectives, placeholderId, plan, SEMESTER_COUNT, type Profile } from "./engine"
import type { CourseId, Dag, Plan, StudentProfile } from "./types"

export function buildFallbackPlan(dag: Dag, opts: { trackId: string; unitsPerSemester: number; goalText?: string;
  profile: StudentProfile; electives?: CourseId[]; name?: string
  completed?: { courseId: CourseId; semester: number }[]; completedSemesters?: number; unitsEarned?: number }): Plan {
  const done = (opts.completed ?? []).filter(d => dag.nodes[d.courseId])
  const nDone = Math.min(opts.completedSemesters ?? 0, SEMESTER_COUNT - 1)
  const doneUnits = done.reduce((s, d) => s + dag.nodes[d.courseId].units, 0)
  const unitsEarned = Math.max(opts.unitsEarned ?? doneUnits, doneUnits)
  // completed courses count as passed with the major's C minimum (onboarding asks codes, not grades: D-024)
  const profile: Profile = { courses: done.map(d => ({ code: d.courseId, grade: "C", units: dag.nodes[d.courseId].units })),
    placement: opts.profile.placement, unitsEarned }
  const electives = opts.electives ?? pickElectives(dag, profile, opts.trackId)
  const result = plan(dag, profile, { start: { season: nDone % 2 === 0 ? "Fall" : "Spring", year: 1 }, maxUnits: opts.unitsPerSemester, electives })
  const semesters = emptySemesters()
  let n = 0
  const addGe = (s: (typeof semesters)[number], units: number) => { let g = units; while (g > 0) { const u = Math.min(3, g); s.courseIds.push(placeholderId(u, ++n)); g -= u } }
  done.forEach(d => semesters[d.semester - 1].courseIds.push(d.courseId))
  // units earned outside the major (GE, transfer) shown as placeholders in the completed semesters
  let geDone = unitsEarned - doneUnits
  for (let i = 0; i < nDone && geDone > 0; i++) {
    const s = semesters[i]
    const have = s.courseIds.reduce((a, c) => a + (dag.nodes[c]?.units ?? 0), 0)
    const add = i === nDone - 1 ? geDone : Math.min(geDone, Math.max(0, opts.unitsPerSemester - have))
    addGe(s, add); geDone -= add
  }
  result.terms.forEach((t, i) => {
    const s = semesters[Math.min(nDone + i, SEMESTER_COUNT - 1)]
    s.courseIds.push(...t.courses)
    addGe(s, t.generalUnits)
  })
  return { id: `plan_fallback_${opts.trackId}`, name: opts.name ?? `Engine plan (${dag.tracks[opts.trackId]?.label ?? opts.trackId})`,
    programId: "bs-cs", goalText: opts.goalText ?? "", createdAt: new Date(0).toISOString(), semesters, source: "fallback",
    ...(nDone ? { completedSemesters: nDone } : {}) }
}
