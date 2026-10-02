// Deterministic planner (no AI): the engine's own plan() turned into an 8-semester Plan.
import { emptySemesters, pickElectives, placeholderId, plan, SEMESTER_COUNT, type Profile } from "./engine"
import type { CourseId, Dag, Plan, StudentProfile } from "./types"

export function buildFallbackPlan(dag: Dag, opts: { trackId: string; unitsPerSemester: number; goalText?: string;
  profile: StudentProfile; electives?: CourseId[]; name?: string }): Plan {
  const profile: Profile = { courses: [], placement: opts.profile.placement }
  const electives = opts.electives ?? pickElectives(dag, profile, opts.trackId)
  const result = plan(dag, profile, { start: { season: "Fall", year: 1 }, maxUnits: opts.unitsPerSemester, electives })
  const semesters = emptySemesters()
  let n = 0
  result.terms.forEach((t, i) => {
    const s = semesters[Math.min(i, SEMESTER_COUNT - 1)]
    s.courseIds.push(...t.courses)
    // GE / free-elective units become 3-unit placeholder cards (plus one remainder card)
    let g = t.generalUnits
    while (g > 0) { const u = Math.min(3, g); s.courseIds.push(placeholderId(u, ++n)); g -= u }
  })
  return { id: `plan_fallback_${opts.trackId}`, name: opts.name ?? `Engine plan (${dag.tracks[opts.trackId]?.label ?? opts.trackId})`,
    programId: "bs-cs", goalText: opts.goalText ?? "", createdAt: new Date(0).toISOString(), semesters, source: "fallback" }
}
