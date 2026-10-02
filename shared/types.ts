// Canonical types (architecture.md §6, amended by D-007/D-008/D-016).

export type CourseId = string // Bulletin format, for example "CSC 413" (D-008)

/** DAG prerequisite grammar (D-007). See data/sfsu/dags/bs-computer-science.json `grammar`. */
export type PrereqExpr =
  | null
  | string
  | { and: PrereqExpr[] }
  | { or: PrereqExpr[] }
  | { course: CourseId; concurrent?: boolean }
  | { coreq: CourseId }
  | { placement: string }

export type DagNode = {
  code: CourseId
  title: string
  units: number
  prereq: PrereqExpr
  min_grade: string | null
  conditions: string[]
  enforced_at_registration: CourseId[]
  recommended: CourseId[]
  bulletin_prerequisite_text: string | null
  ge_areas: string[]
  url: string
}

export type Requirement = {
  id: string
  label: string
  units: number
  courses: CourseId[]
  type: "all" | "choose_units"
  rules?: string[]
  min_units?: number
  min_csc_units?: number
  excluded?: CourseId[]
  auto_plan_excludes?: CourseId[]
}

export type Dag = {
  program: { id: string; name: string; url: string; major_units: number; degree_units: number; bulletin: string }
  notes: string[]
  requirements: Requirement[]
  nodes: Record<CourseId, DagNode>
  external: Record<CourseId, { code: CourseId; title: string | null; in_catalog: boolean; note: string }>
  tracks: Record<string, { label: string; courses: CourseId[] }>
  term_offerings: Record<CourseId, Season[]>
  university: {
    min_units: number
    min_gpa: number
    priority_registration_max_units_per_term: number
    typical_units_per_term: number
    upper_division_standing_units: number
    senior_standing_units: number
    min_upper_division_units_for_degree: number
    gwar_course: CourseId
  }
}

export type Season = "Fall" | "Spring"

export type Policy = { value: number; label: string; ruleId: string; quote: string; sourceUrl: string; verified: boolean }
export type Policies = {
  minUnitsFullTime: Policy
  heavyLoadUnits: Policy
  maxUnitsWithoutPermission: Policy
}

export type SemesterPlan = {
  index: number // 1..8
  label: string // "Fall Year 1"
  season: "fall" | "spring"
  courseIds: CourseId[]
}

export type Plan = {
  id: string
  name: string
  programId: string
  goalText: string
  createdAt: string
  semesters: SemesterPlan[] // length 8
  source: "manual" | "ai" | "fallback" | "roadmap"
}

export type IssueCode =
  | "PREREQ_ORDER" | "PREREQ_MISSING" | "COREQ_ORDER"
  | "UNITS_UNDER" | "UNITS_HEAVY" | "UNITS_OVER"
  | "DUPLICATE_COURSE" | "REQ_GROUP_INCOMPLETE" | "TOTAL_UNITS_SHORT"
  | "TERM_NOT_OFFERED" | "UNVERIFIED_DATA" | "PREREQ_NOTE"
  | "UNKNOWN_COURSE" | "STANDING_TOO_LOW"

export type Issue = {
  id: string
  severity: "error" | "warning" | "info"
  code: IssueCode
  message: string
  courseIds: CourseId[]
  semesterIndex?: number
  sourceUrl?: string
  quote?: string
}

export type SemesterStatus = "empty" | "under" | "ok" | "heavy" | "over"

export type EngineReport = {
  issues: Issue[]
  semesterStats: { index: number; units: number; status: SemesterStatus }[]
  requirementStatus: {
    groupId: string
    title: string
    satisfied: boolean
    missingCourseIds: CourseId[]
    unitsHave?: number
    unitsNeed?: number
  }[]
  totalUnitsPlanned: number
  graduationReady: boolean
}

export type CareerDirection = {
  id: string
  label: string
  signalTags: string[]
  signalCourseIds: CourseId[]
  description: string
}

export type DirectionScore = { directionId: string; label: string; score: number } // 0..100

export type Suggestion = { remove: CourseId | null; add: CourseId; semester: number; reason: string }

/** Student profile flags the engine reads (D-016). */
export type StudentProfile = { placement: Record<string, boolean> }

export type PlanRequest = {
  goalText: string
  programId: string
  unitsPerSemester: number
  lockedPlacements: { courseId: CourseId; semester: number }[]
}

export type PlanResponse = {
  plan: Plan
  report: EngineReport
  rationale: string
  electiveChoices: { courseId: CourseId; reason: string }[]
  attempts: number
  runId: string
}

export type EvaluateRequest = { plan: Plan; goalText?: string }

export type EvaluateResponse = {
  report: EngineReport
  directionScores: DirectionScore[]
  ai: { summary: string; directionExplanation: string; suggestions: Suggestion[] } | null
  aiStatus: "ok" | "failed" | "skipped"
  droppedSuggestions: number
  runId: string
}

export type RunStep = { name: string; detail: unknown; at: string }

export type RunRecord = {
  run_id: string
  variant: string
  input: unknown
  config: Record<string, unknown>
  steps: RunStep[]
  final_state: unknown
  scores: Record<string, unknown>
  errors: string[]
  created_at: string
}
