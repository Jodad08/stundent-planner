# ARCHITECTURE: GatorGraph

Read this file before every coding task. Re-read the relevant section before every edit.
This file defines what exists, what each part is called, and what is allowed.
If something is not in this file or in `plan.md`, it does not exist yet. Do not assume it.

Precedence:
1. `architecture.md` wins on technical contracts (names, types, paths, API shapes, rules).
2. `plan.md` wins on scope, schedule, UI behavior and pitch.
3. If the two conflict, stop, fix the conflict in this file, then continue. Do not silently pick one.

---

## 0. Anti-hallucination protocol (always follow)

1. Never invent: course IDs, prerequisites, credit values, policy numbers, URLs, library functions, SDK method names, model IDs, file paths, or API routes.
2. Before using a library API (React Flow, Gemini SDK, Express, Zustand), read the installed package's types or the official docs. Do not write it from memory.
3. If a fact is unknown, write `UNKNOWN` in data or `TODO(verify)` in code. Never fill a gap with a plausible guess.
4. Only use names from section 3 (Glossary) and section 6 (Types). If you need a new name, add it to this file first.
5. Before finishing a task, run the checklist in section 14.
6. If a task seems to need something outside scope (section 2), say so and stop. Do not build it.
7. Never copy code from Minerva's planner. Never paste code from a source without checking its license.
8. When you change a contract (type, route, file path), update this file in the same change.

---

## 1. What this system is

GatorGraph is a visual degree planner for SFSU students.

- A student sees courses as nodes inside semester boxes.
- Prerequisites are red lines.
- A deterministic rules engine checks the plan.
- Gemini builds plans from career goals and explains evaluations.
- Gemini is never the source of truth for rules or data.

Single sentence rule: **The engine decides. Gemini proposes and explains.**

---

## 2. Scope boundaries

In scope (P0):
- One program: `bs-cs` (B.S. Computer Science).
- 8 semesters per plan.
- Multiple plans per browser, stored in `localStorage`.
- AI Plan and AI Evaluate.

Out of scope (do not build, do not stub, do not mention in UI):
- Login, accounts, database, server-side user storage.
- Any connection to SFSU systems or student records.
- Other majors (until P1 is approved in writing in `plan.md`).
- Transfer credit, AP credit, section times, instructors, waitlists.
- Mobile layout.
- Real-time collaboration.

---

## 3. Glossary (canonical names)

Use these exact words in code, comments and UI text.

| Term | Meaning | Code name |
|---|---|---|
| Course | One catalog course | `Course` |
| Course ID | Bulletin format with a space, for example `CSC 413` (D-008) | `courseId: string` |
| Credits | Unit value of a course. Shown as "credits" in UI. Field name in data is `units`. | `units` |
| Program | A major with requirement groups | `Program` |
| Requirement group | A block of a program such as "Lower Division Core" | `RequirementGroup` |
| Policy | A rule value with a source, for example minimum credits per semester | `Policy` |
| Plan | One student plan with 8 semesters | `Plan` |
| Semester | One of 8 boxes, index 1 to 8 | `SemesterPlan` |
| Board | The React Flow canvas rendering the active plan | `Board` |
| Engine | Pure TypeScript rules checker | `evaluatePlan` |
| Issue | One finding from the engine | `Issue` |
| Report | Full engine output | `EngineReport` |
| Direction | A career direction such as Quant | `CareerDirection` |
| Fallback planner | Non-AI planner used when Gemini fails | `buildFallbackPlan` |
| Placeholder course | Generic GE card with no real prerequisites | `isPlaceholder: true` |

Do not use synonyms such as "class", "subject", "schedule", "track", "path" in code identifiers.

---

## 4. System diagram

```
Browser (web/)
  React + React Flow + Zustand
  localStorage: plans
  imports shared/engine.ts  (runs checks live on every change)
        |
        |  HTTP JSON  (/api/*)
        v
Server (server/)  Node + Express + TypeScript
  serves static build and data files
  imports shared/engine.ts  (re-validates every AI result)
  calls Gemini (key lives only here)
        |
        v
Gemini API (structured JSON output)

Data (data/)  static JSON files, verified, with source URLs
  loaded by server at startup, served read-only to the browser
```

Key decisions (locked, do not revisit without editing this file):

| Decision | Choice | Reason |
|---|---|---|
| Backend language | Node + Express + TypeScript | One language, so the engine exists once in `shared/`. This replaces the Flask mention in `plan.md`. |
| Engine location | `shared/engine.ts`, used by web and server | One implementation, no drift. |
| Graph library | React Flow (`@xyflow/react`) | Group nodes, derived edges, sidebar drag pattern. |
| State | Zustand, plan JSON is the single source of truth | Nodes and edges are derived, never stored. |
| Storage | `localStorage` key `gatorgraph.plans.v1` | No database allowed. |
| AI output format | Gemini structured JSON with a response schema | No free text parsing. |
| AI trust | All AI output re-checked by the engine | Prevents hallucinated plans. |

---

## 5. Repository layout (canonical paths)

Only these top-level folders exist. Do not create others without updating this file.

```
gatorgraph/
  architecture.md
  plan.md
  README.md
  THIRD_PARTY.md
  .env.example
  package.json              single root package (D-006)
  vite.config.ts            Vite root = web/ (D-014)
  prompt.md, decisions.md, harness.py, .harness/, VISION.md, EVALS.md, DEMO.md, ai-hackathon-builder-skill.md
  runs/                     saved run records (prompt.md B.5 step 6)
  evals/                    eval runner + results
  scraper/                  existing Bulletin scraper (data/sfsu/ is its output, D-009)
  data/
    sources.md
    raw/
    catalog.json
    programs/bs-computer-science.json
    policies.json
    career_tags.json
  scripts/
    scrape_bulletin.py
    validate_catalog.py
  shared/
    types.ts
    engine.ts
    engine.test.ts
    fallbackPlanner.ts
    directionScores.ts
    fixtures/
      validPlan.json
      brokenPlan.json
  server/
    index.ts
    routes/
      data.ts               GET routes
      plan.ts               POST /api/plan
      evaluate.ts           POST /api/evaluate
    gemini.ts               SDK wrapper
    prompts.ts              ALL prompts live here only
    cache.ts
  web/
    src/
      main.tsx
      App.tsx
      store.ts
      api.ts
      components/
        Board.tsx
        SemesterNode.tsx
        CourseNode.tsx
        PrereqEdge.tsx
        Sidebar.tsx
        Toolbar.tsx
        PlanModal.tsx
        EvaluatePanel.tsx
        Legend.tsx
        HoverCard.tsx
      lib/
        layout.ts
        derive.ts           plan -> nodes and edges
  docs/
    evidence.md
    pitch.md
    demo-script.md
```

File ownership rules:
- Rules about prerequisites, credits, requirements live ONLY in `shared/engine.ts`.
- Prompts live ONLY in `server/prompts.ts`.
- Policy numbers live ONLY in `data/policies.json`.
- Course facts live ONLY in `data/catalog.json`.
- The UI must not contain a hardcoded credit number such as 12 or 18. It reads policies.

---

## 6. Canonical types (`shared/types.ts`)

These are the only shapes. Copy them exactly.

```ts
export type CourseId = string // normalized, for example "CSC413"

export type Course = {
  id: CourseId
  dept: string
  number: string
  name: string
  units: number
  oneLiner: string
  oneLinerSource: "official" | "generated" | "manual"
  description: string
  prereqs: CourseId[][]      // SUPERSEDED by D-007: engine uses `prereq: PrereqExpr` (DAG grammar, shared/types.ts)
  prereqNotes: string        // prose the engine cannot check, may be ""
  coreqs: CourseId[]
  tags: string[]
  typicalTerms: ("fall" | "spring" | "summer")[] // [] means unknown
  sourceUrl: string
  sourceAccessed: string     // YYYY-MM-DD
  verified: boolean
  isPlaceholder: boolean
  notes: string
}

export type RequirementGroup =
  | { id: string; title: string; type: "all"; courseIds: CourseId[] }
  | { id: string; title: string; type: "pickN"; n: number; courseIds: CourseId[] }
  | { id: string; title: string; type: "units"; unitsRequired: number; courseIds: CourseId[]; note?: string }

export type Program = {
  id: string                 // "bs-cs"
  name: string
  totalUnitsRequired: number
  sourceUrl: string
  requirementGroups: RequirementGroup[]
}

export type Policy = {
  value: number
  sourceUrl: string
  verified: boolean
}

export type Policies = {
  minUnitsFullTime: Policy
  heavyLoadUnits: Policy
  maxUnitsWithoutPermission: Policy
}

export type SemesterPlan = {
  index: number              // 1..8
  label: string              // "Fall Year 1"
  season: "fall" | "spring"
  courseIds: CourseId[]
}

export type Plan = {
  id: string
  name: string
  programId: string
  goalText: string
  createdAt: string          // ISO
  semesters: SemesterPlan[]  // length is always 8
  source: "manual" | "ai" | "fallback"
}

export type IssueCode =
  | "PREREQ_ORDER" | "PREREQ_MISSING" | "COREQ_ORDER"
  | "UNITS_UNDER" | "UNITS_HEAVY" | "UNITS_OVER"
  | "DUPLICATE_COURSE" | "REQ_GROUP_INCOMPLETE" | "TOTAL_UNITS_SHORT"
  | "TERM_NOT_OFFERED" | "UNVERIFIED_DATA" | "PREREQ_NOTE"
  | "UNKNOWN_COURSE"

export type Issue = {
  id: string
  severity: "error" | "warning" | "info"
  code: IssueCode
  message: string
  courseIds: CourseId[]
  semesterIndex?: number
  sourceUrl?: string
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

export type Suggestion = {
  remove: CourseId | null
  add: CourseId
  semester: number
  reason: string
}
```

Invariants (the engine and tests enforce these):
- `Plan.semesters.length === 8` and indexes are 1 to 8 in order.
- A course ID appears at most once in a plan.
- Every ID in `courseIds`, `prereqs`, `coreqs` and program groups exists in `catalog.json`. Otherwise the validator script fails.
- `prereqs` is `CourseId[][]`. An empty array means no prerequisites.
- Placeholder courses have empty `prereqs` and `coreqs`.
- `season` is `fall` for odd semester indexes and `spring` for even.

---

## 7. Rules (single definition, `shared/engine.ts`)

The engine is a pure function: `evaluatePlan(plan, catalog, program, policies) => EngineReport`.
No network, no randomness, no clock, no `localStorage`.

Prerequisite check for course C in semester S:
- For each AND group G in `C.prereqs`: at least one course in G must be in a semester with index strictly less than S.
- If none of G is in the plan at all, emit `PREREQ_MISSING`.
- If some of G is in the plan but only in semester S or later, emit `PREREQ_ORDER`.

Corequisite check: each coreq must be in a semester with index less than or equal to S.

Semester status, using policies (never hardcode numbers):
- `empty`: units = 0
- `under`: 0 < units < `minUnitsFullTime`
- `ok`: `minUnitsFullTime` <= units <= `heavyLoadUnits`
- `heavy`: `heavyLoadUnits` < units <= `maxUnitsWithoutPermission`
- `over`: units > `maxUnitsWithoutPermission`

Note: if `heavyLoadUnits` equals `maxUnitsWithoutPermission`, the `heavy` status never appears. That is correct behavior. Do not "fix" it.

Severity map is fixed in `plan.md` section 9.2. Do not change severities in code without updating both files.

Tests must pass before any UI work depends on the engine: `shared/engine.test.ts`.

---

## 8. Data contracts

Files in `data/` are the only data source. They are read-only at runtime.

| File | Shape | Notes |
|---|---|---|
| `catalog.json` | `Course[]` | Every record has `sourceUrl`. |
| `programs/bs-computer-science.json` | `Program` | `id` is `bs-cs`. |
| `policies.json` | `Policies` | Values may be `verified: false`. UI shows "assumed". |
| `career_tags.json` | `{ directions: CareerDirection[] }` | Signals reference real course IDs and tags only. |

Rules:
- `verified: true` only after a human compared the record with the live Bulletin page.
- The scraper may write `verified: false` records only.
- Gemini must never write to `data/`. Generated `oneLiner` text is allowed only with `oneLinerSource: "generated"` and is written by a script that a human runs and reviews.
- `data/sources.md` lists every URL used and the access date.

---

## 9. API contracts (server)

Base path `/api`. All responses are JSON. Errors use `{ "error": string, "code": string }`.

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/api/health` | none | `{ "ok": true }` |
| GET | `/api/catalog` | none | `Course[]` |
| GET | `/api/programs` | none | `{ id, name }[]` |
| GET | `/api/programs/:id` | none | `Program` |
| GET | `/api/policies` | none | `Policies` |
| GET | `/api/career-directions` | none | `CareerDirection[]` |
| POST | `/api/plan` | `PlanRequest` | `PlanResponse` |
| POST | `/api/evaluate` | `EvaluateRequest` | `EvaluateResponse` |

```ts
type PlanRequest = {
  goalText: string                 // 1..500 chars
  programId: string
  unitsPerSemester: number         // integer
  lockedPlacements: { courseId: CourseId; semester: number }[]
}

type PlanResponse = {
  plan: Plan                       // source is "ai" or "fallback"
  report: EngineReport
  rationale: string
  electiveChoices: { courseId: CourseId; reason: string }[]
  attempts: number                 // Gemini calls used
}

type EvaluateRequest = {
  plan: Plan
  goalText?: string
}

type EvaluateResponse = {
  report: EngineReport
  directionScores: DirectionScore[]       // computed by code
  ai: {
    summary: string
    directionExplanation: string
    suggestions: Suggestion[]             // only engine-validated ones
  } | null                                // null if Gemini failed
  aiStatus: "ok" | "failed" | "skipped"
}
```

Behavior rules:
- `/api/plan` flow: build prompt, call Gemini, parse, run engine, if errors then repair (max 2 repairs), else fallback planner. Never return an invalid plan without `source: "fallback"` or a clear error.
- `/api/evaluate` flow: run engine first, compute direction scores in code, then call Gemini with a summary. If Gemini fails, return the engine result with `ai: null` and `aiStatus: "failed"`. The UI still works.
- Validate request bodies. Reject unknown course IDs with code `UNKNOWN_COURSE`.
- Gemini timeout is 25 seconds with one retry.
- The Gemini key is read from `process.env.GEMINI_API_KEY` on the server only. The model is read from `process.env.GEMINI_MODEL`. Do not hardcode either.

---

## 10. Gemini rules

- All prompts live in `server/prompts.ts`. No inline prompts elsewhere.
- Use structured output with a JSON response schema. Parse with a schema validator.
- Give Gemini only what it needs: compact course lines `id | name | units | prereqs | tags | oneLiner`.
- Prompt must say: use only provided course IDs, never invent a course, return only JSON.
- After parsing, drop or reject any course ID that is not in the catalog. Do not "auto-correct" it.
- AI text shown in the UI must carry the label "Generated by Gemini". Engine text carries "Checked by rules engine".
- Never send secrets, user personal data or anything beyond plan and goal text.
- Cache by hash of `(goalText, programId, unitsPerSemester, lockedPlacements)` in memory. Pre-warm demo goals before presenting.

---

## 11. Frontend architecture

State (Zustand, `web/src/store.ts`):

```ts
type Store = {
  catalog: Course[]
  program: Program | null
  policies: Policies | null
  plans: Plan[]
  activePlanId: string | null
  selectedCourseId: CourseId | null   // for chain highlight
  reports: Record<string, EngineReport>  // by plan id, derived, never persisted
  evaluation: EvaluateResponse | null
  // actions
  placeCourse(planId: string, courseId: CourseId, semesterIndex: number): void
  moveCourse(planId: string, courseId: CourseId, toSemester: number): void
  unplaceCourse(planId: string, courseId: CourseId): void
  addPlan(plan: Plan): void
  duplicatePlan(planId: string): void
  renamePlan(planId: string, name: string): void
  deletePlan(planId: string): void
  setActivePlan(planId: string): void
  selectCourse(courseId: CourseId | null): void
}
```

Data flow (one direction only):

```
user action -> store action -> plan JSON changes
  -> evaluatePlan(plan,...) -> EngineReport
  -> derive(plan, report) -> React Flow nodes and edges
  -> render
persist: plans + activePlanId -> localStorage (debounced)
```

Rules:
- Nodes and edges are derived in `lib/derive.ts`. Never mutate them as state.
- Never store `EngineReport` in `localStorage`. Recompute on load.
- Dropping a course: find the semester under the pointer, call `placeCourse` or `moveCourse`. If none, do nothing.
- A course already in the plan cannot be placed again. Block it in the store action.
- Edge for each `(prereqId, courseId)` pair where both are in the plan.
  - Satisfied: prereq semester index < course semester index.
  - Violated: otherwise.
  - Edge `type` values: `"prereq"`, `"prereqOr"`, `"coreq"`. Edge `data.state`: `"satisfied"` or `"violated"`.
- Semester node data comes from `EngineReport.semesterStats`. The component never computes status itself.
- Node IDs: semester = `sem-{index}`, course = `course-{courseId}`. Edge ID = `edge-{prereqId}-{courseId}`.
- Course nodes use `parentId = sem-{index}` and `extent: "parent"`.
- Highlight on select: compute upstream and downstream sets from the catalog `prereqs` (graph walk), dim everything else.

LocalStorage:
- Key: `gatorgraph.plans.v1`. Value: `{ plans: Plan[], activePlanId: string | null }`.
- On load: validate with the type guard. If invalid, discard and start with one empty plan. Never crash.

---

## 12. Environment and commands

Environment variables (`.env`, never committed):

| Name | Used by | Notes |
|---|---|---|
| `GEMINI_API_KEY` | server | required for AI routes |
| `GEMINI_MODEL` | server | check current ID in Gemini docs before use |
| `GEMINI_FALLBACK_MODEL` | server | comma list tried in order after a failure (D-018) |
| `AI_PROVIDER` | server | `gemini` or `mock` (default mock without a key) |
| `PORT` | server | default 3000 |

Commands (fill in the exact scripts in `package.json` and keep this table true):

| Task | Command |
|---|---|
| Install | `npm install` |
| Dev (web + server) | `npm run dev` (server :3000, board :5173) |
| Test engine | `npm test` |
| Rebuild contract data | `python3 scraper/build_cs_dag.py && python3 scripts/build_contract_data.py` |
| Evals | `npm run evals` |
| Critic | `python3 harness.py scan` / `check` / `review` |
| Build + serve | `npm run build && npm start` (http://localhost:3000) |

Update this table as soon as scripts exist. An agent must not run a command that is not in this table without checking `package.json`.

---

## 13. Versions (fill in at install time)

Do not write versions from memory. After install, copy the real versions from `package.json` here.

| Package | Version |
|---|---|
| node | 26.4.0 |
| @xyflow/react | 12.12.0 |
| react | 19.3.0 |
| zustand | 5.0.15 |
| express | 5.2.1 |
| @google/genai | 2.27.0 |
| tailwindcss | 4.3.3 |
| vitest | 5.0.3 |

---

## 14. Pre-finish checklist (run for every task)

- [ ] I used only names from sections 3 and 6.
- [ ] I did not invent any course, prerequisite, credit, policy, URL or API.
- [ ] No hardcoded 12 or 18 (or any policy number) outside `data/policies.json`.
- [ ] Rules logic exists only in `shared/engine.ts`.
- [ ] Prompts exist only in `server/prompts.ts`.
- [ ] Nodes and edges are derived, not stored.
- [ ] Every AI result is re-validated by the engine before display.
- [ ] The app still works when Gemini fails (fallback or engine-only).
- [ ] Engine tests pass.
- [ ] Types compile with no `any`.
- [ ] If I changed a contract, I updated this file.
- [ ] If I was unsure about a library call, I checked the installed types or docs.

---

## 15. Known unknowns (do not resolve by guessing)

Each item must be resolved from an official source and then moved to the data files.

| Unknown | Where it will live | Status |
|---|---|---|
| Official minimum credits for full-time status | `policies.json` | Resolved: 12 (`fa_enrollment_status`, D-010) |
| Official heavy load threshold | `policies.json` | Resolved: 15, top of normal load (`normal_load`, D-010) |
| Official maximum credits without permission | `policies.json` | Resolved: 19, priority-registration max (D-010) |
| Exact B.S. CS requirement list | `programs/bs-computer-science.json` | UNKNOWN until read from the Bulletin |
| Which electives count for each requirement group | `programs/bs-computer-science.json` | UNKNOWN until verified |
| Term offering data | `typicalTerms` | Leave `[]` unless a source states it |
| SFSU brand colors | `web/` styles | Check the official brand page |
| Current Gemini model ID | `.env` | Resolved: `gemini-3.8-flash` from the live model list (D-018) |
| Hackathon rules on open source and pre-existing code | `THIRD_PARTY.md` | Check event rules |

---

## 16. Change log

Add one line per contract change. Newest first.

- 2026-10-02: D-016..D-021. `IssueCode` adds `STANDING_TOO_LOW`; `Plan.source` adds `roadmap`; placeholder IDs `GE-<u>u-<n>`; routes add `GET /api/runs`, `/api/runs/:id`, `/api/evals`; `server/runs.ts`; Vite root `web/src`.
- 2026-10-02: D-006..D-014. TS engine ported from web/planner.js; prereqs use the DAG grammar; IDs keep the space; data stays in data/sfsu/ (+ generated policies.json, career_tags.json); local-only hosting; root vite.config.ts.

- 2026-10-02: Initial version. Backend locked to Node + Express + TypeScript so the engine exists once in `shared/`.
