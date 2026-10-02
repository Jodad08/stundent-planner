// Free-flow layout (D-023): semesters are invisible columns; course y comes from a crossing-reduction pass in derive.ts.
export const SEM_W = 160, SEM_GAP = 112, SEM_X0 = 20, SEM_Y = 20
export const COURSE_X = 18, COURSE_Y0 = 84, COURSE_STEP = 58, COURSE_W = 124
export const semX = (index: number) => SEM_X0 + (index - 1) * (SEM_W + SEM_GAP)
/** Semester index under a flow-space x, or null when outside the 8 columns. */
export function semesterAt(x: number): number | null {
  const i = Math.floor((x - SEM_X0 + SEM_GAP / 2) / (SEM_W + SEM_GAP)) + 1
  return i >= 1 && i <= 8 ? i : null
}
