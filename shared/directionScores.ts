// Career direction scores, computed by code (plan.md §11.3 step 2). Never by Gemini.
import type { CareerDirection, DirectionScore, Plan } from "./types"

/** Score = share of the plan's electives slots (5) filled with this direction's signal courses, 0..100. */
export function directionScores(plan: Plan, directions: CareerDirection[], electiveSlots = 5): DirectionScore[] {
  const planned = new Set(plan.semesters.flatMap(s => s.courseIds))
  return directions.map(d => {
    const hits = d.signalCourseIds.filter(c => planned.has(c)).length
    return { directionId: d.id, label: d.label, score: Math.round(100 * Math.min(hits, electiveSlots) / Math.min(electiveSlots, d.signalCourseIds.length)) }
  }).sort((a, b) => b.score - a.score)
}
