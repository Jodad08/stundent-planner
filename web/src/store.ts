import { create } from "zustand"
import { emptySemesters } from "../../shared/engine"
import type { CareerDirection, CourseId, Dag, EvaluateResponse, Plan, Policies } from "../../shared/types"
import type { Health } from "./api"

const KEY = "gatorgraph.plans.v1"

export type Store = {
  dag: Dag | null
  policies: Policies | null
  careers: CareerDirection[]
  health: Health | null
  plans: Plan[]
  activePlanId: string | null
  selectedCourseId: CourseId | null
  evaluation: EvaluateResponse | null
  panel: "none" | "evaluate" | "proof" | "runs"
  modalOpen: boolean
  flash: string | null
  setData(d: { dag: Dag; policies: Policies; careers: CareerDirection[]; health: Health }): void
  placeCourse(courseId: CourseId, semesterIndex: number): void
  moveCourse(courseId: CourseId, toSemester: number): void
  unplaceCourse(courseId: CourseId): void
  addPlan(plan: Plan): void
  newPlan(): void
  duplicatePlan(planId: string): void
  renamePlan(planId: string, name: string): void
  deletePlan(planId: string): void
  setActivePlan(planId: string): void
  selectCourse(courseId: CourseId | null): void
  setEvaluation(e: EvaluateResponse | null): void
  setPanel(p: Store["panel"]): void
  setModal(open: boolean): void
  setFlash(msg: string | null): void
  reset(): void
}

export function blankPlan(name = "My plan"): Plan {
  return { id: "plan_" + Math.random().toString(36).slice(2, 9), name, programId: "bs-cs", goalText: "",
    createdAt: new Date().toISOString(), semesters: emptySemesters(), source: "manual" }
}

function isPlan(x: unknown): x is Plan {
  const p = x as Plan
  return !!p && typeof p.id === "string" && typeof p.name === "string" && Array.isArray(p.semesters) && p.semesters.length === 8
    && p.semesters.every((s, i) => s.index === i + 1 && Array.isArray(s.courseIds) && s.courseIds.every(c => typeof c === "string"))
}

function load(): { plans: Plan[]; activePlanId: string | null } {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null")
    const plans = Array.isArray(raw?.plans) ? raw.plans.filter(isPlan) : []
    if (plans.length) return { plans, activePlanId: plans.some((p: Plan) => p.id === raw.activePlanId) ? raw.activePlanId : plans[0].id }
  } catch { /* invalid storage: start fresh */ }
  const p = blankPlan()
  return { plans: [p], activePlanId: p.id }
}

const initial = load()

/** Replace the active plan's semesters through fn. */
function edit(s: Store, fn: (p: Plan) => Plan): Partial<Store> {
  return { plans: s.plans.map(p => (p.id === s.activePlanId ? fn(p) : p)), evaluation: null }
}

export const useStore = create<Store>((set, get) => ({
  dag: null, policies: null, careers: [], health: null,
  plans: initial.plans, activePlanId: initial.activePlanId,
  selectedCourseId: null, evaluation: null, panel: "none", modalOpen: false, flash: null,
  setData: d => set({ ...d }),
  placeCourse: (courseId, semesterIndex) => set(s => {
    const active = s.plans.find(p => p.id === s.activePlanId)
    if (!active || active.semesters.some(x => x.courseIds.includes(courseId))) return {} // blocked: already placed
    return edit(s, p => ({ ...p, semesters: p.semesters.map(x => x.index === semesterIndex ? { ...x, courseIds: [...x.courseIds, courseId] } : x) }))
  }),
  moveCourse: (courseId, to) => set(s => edit(s, p => ({ ...p, semesters: p.semesters.map(x => ({
    ...x, courseIds: x.index === to ? [...x.courseIds.filter(c => c !== courseId), courseId] : x.courseIds.filter(c => c !== courseId) })) }))),
  unplaceCourse: courseId => set(s => edit(s, p => ({ ...p, semesters: p.semesters.map(x => ({ ...x, courseIds: x.courseIds.filter(c => c !== courseId) })) }))),
  addPlan: plan => set(s => ({ plans: [...s.plans, plan], activePlanId: plan.id, evaluation: null, selectedCourseId: null })),
  newPlan: () => get().addPlan(blankPlan(`Plan ${get().plans.length + 1}`)),
  duplicatePlan: id => {
    const p = get().plans.find(x => x.id === id)
    if (p) get().addPlan({ ...structuredClone(p), id: blankPlan().id, name: p.name + " (copy)", source: "manual" })
  },
  renamePlan: (id, name) => set(s => ({ plans: s.plans.map(p => (p.id === id ? { ...p, name } : p)) })),
  deletePlan: id => set(s => {
    const plans = s.plans.filter(p => p.id !== id)
    if (!plans.length) plans.push(blankPlan())
    return { plans, activePlanId: s.activePlanId === id ? plans[0].id : s.activePlanId, evaluation: null }
  }),
  setActivePlan: id => set({ activePlanId: id, evaluation: null, selectedCourseId: null }),
  selectCourse: id => set({ selectedCourseId: id }),
  setEvaluation: e => set({ evaluation: e }),
  setPanel: panel => set({ panel }),
  setModal: modalOpen => set({ modalOpen }),
  setFlash: flash => set({ flash }),
  reset: () => { const p = blankPlan(); set({ plans: [p], activePlanId: p.id, evaluation: null, selectedCourseId: null }) },
}))

let timer: ReturnType<typeof setTimeout> | undefined
useStore.subscribe(s => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ plans: s.plans, activePlanId: s.activePlanId })) } catch { /* storage full or blocked */ }
  }, 300)
})

export const useActivePlan = () => useStore(s => s.plans.find(p => p.id === s.activePlanId) ?? s.plans[0])
