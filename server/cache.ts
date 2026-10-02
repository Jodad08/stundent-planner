// In-memory response cache for the demo (architecture.md §10). Keyed by a hash of the request.
import { createHash } from "node:crypto"

const store = new Map<string, unknown>()
export const cacheKey = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex")
export const cacheGet = <T,>(k: string) => store.get(k) as T | undefined
export const cacheSet = (k: string, v: unknown) => { store.set(k, v) }
