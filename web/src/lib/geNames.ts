// Which real GE course a GE placeholder stands for (D-053). The engine only sees units; this is display-only.
const KEY = "planed.geNames"
let names: Record<string, string> = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") } catch { return {} } })()
export const geName = (id: string): string | undefined => names[id]
export function nameGe(id: string, code: string) {
  names = { ...names, [id]: code }
  try { localStorage.setItem(KEY, JSON.stringify(names)) } catch { /* storage blocked */ }
}
