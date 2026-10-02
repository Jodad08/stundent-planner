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

/** Every active SFSU bachelor's program from the scraped Bulletin; only the DAG's program is mapped (D-026). */
export const majors = load<{ id: string; name: string; degree: string | null; status: string; url: string }[]>("data/sfsu/programs.json")
  .filter(p => p.status === "Active" && /^B\./.test(p.degree ?? ""))
  .map(p => ({ id: p.id, name: p.name, degree: p.degree as string, url: p.url, mapped: p.id === dag.program.id }))
  .sort((a, b) => a.name.localeCompare(b.name))
