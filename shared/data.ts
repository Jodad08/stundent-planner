// Loads the data files (Node only: server, tests, evals). The browser gets them from /api.
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import type { CareerDirection, Dag, Policies } from "./types"

const root = fileURLToPath(new URL("..", import.meta.url))
const load = <T,>(p: string): T => JSON.parse(readFileSync(root + p, "utf8")) as T

export const dag = load<Dag>("data/sfsu/dags/bs-computer-science.json")
export const policies = load<Policies>("data/policies.json")
export const careers = load<{ directions: CareerDirection[] }>("data/career_tags.json").directions
export const repoRoot = root
/** Official Bulletin descriptions for the program's courses (shown on hover, D-022). */
export const descriptions: Record<string, string> = Object.fromEntries(
  load<{ code: string; description: string | null }[]>("data/sfsu/courses.json")
    .filter(c => dag.nodes[c.code] && c.description).map(c => [c.code, c.description as string]))
