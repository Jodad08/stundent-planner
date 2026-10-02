// Fixed column layout (plan.md §13).
export const SEM_W = 260, SEM_GAP = 40, SEM_X0 = 40, SEM_Y = 80
export const COURSE_X = 20, COURSE_Y0 = 60, COURSE_STEP = 76, COURSE_W = 220
export const semX = (index: number) => SEM_X0 + (index - 1) * (SEM_W + SEM_GAP)
export const semHeight = (count: number) => Math.max(220, COURSE_Y0 + count * COURSE_STEP + 30)
export const coursePos = (k: number) => ({ x: COURSE_X, y: COURSE_Y0 + k * COURSE_STEP })
/** Semester index under a flow-space x, or null when outside the 8 columns. */
export function semesterAt(x: number): number | null {
  const i = Math.floor((x - SEM_X0 + SEM_GAP / 2) / (SEM_W + SEM_GAP)) + 1
  return i >= 1 && i <= 8 ? i : null
}
