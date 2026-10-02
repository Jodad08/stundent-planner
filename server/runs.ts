// Saved run records (prompt.md B.5 step 6). Every /api/plan and /api/evaluate call writes one to runs/.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { repoRoot } from "../shared/data"
import type { RunRecord, RunStep } from "../shared/types"

const DIR = repoRoot + "runs/"
mkdirSync(DIR, { recursive: true })

export function newRun(variant: string, input: unknown, config: Record<string, unknown>) {
  const rec: RunRecord = { run_id: `${new Date().toISOString().replace(/[:.]/g, "-")}_${variant}_${randomUUID().slice(0, 6)}`,
    variant, input, config, steps: [], final_state: null, scores: {}, errors: [], created_at: new Date().toISOString() }
  return {
    rec,
    step(name: string, detail: unknown) { rec.steps.push({ name, detail, at: new Date().toISOString() } as RunStep) },
    save() { writeFileSync(DIR + rec.run_id + ".json", JSON.stringify(rec, null, 1)); return rec.run_id },
  }
}

export function listRuns() {
  return readdirSync(DIR).filter(f => f.endsWith(".json")).sort().reverse().map(f => {
    const r = JSON.parse(readFileSync(DIR + f, "utf8")) as RunRecord
    const input = r.input as { goalText?: string }
    return { run_id: r.run_id, variant: r.variant, created_at: r.created_at, goalText: input?.goalText ?? "", provider: r.config.provider }
  })
}

export function getRun(id: string): RunRecord | null {
  if (!/^[\w-]+$/.test(id)) return null
  try { return JSON.parse(readFileSync(DIR + id + ".json", "utf8")) as RunRecord } catch { return null }
}
