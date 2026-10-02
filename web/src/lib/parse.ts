// Rule-based reading of chat answers in onboarding (D-034). No AI.
const WORDS: Record<string, number> = { zero: 0, none: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 }
export const firstNumber = (t: string): number | null => {
  const d = /\d+/.exec(t); if (d) return Number(d[0])
  const w = Object.keys(WORDS).find(k => new RegExp(`\\b${k}\\b`).test(t)); return w ? WORDS[w] : null
}
export function parseName(t: string): string {
  const s = t.trim().replace(/^(hi|hey|hello)[,!.\s]*/i, "").replace(/^(my name is|my name's|i am|i'm|im|it's|its|this is|call me)\s+/i, "")
  return s.split(/\s+/).slice(0, 2).map(w => w.replace(/[^\p{L}'-]/gu, "")).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ")
}
export function parseSemesters(t: string): number | null {
  const s = t.toLowerCase()
  if (/just start|starting|haven'?t|not yet|\bnone\b|\bno\b|\bnew\b|freshman|incoming|\bzero\b/.test(s)) return 0
  if (/sophomore/.test(s)) return 2
  if (/junior/.test(s)) return 4
  if (/senior/.test(s)) return 6
  const n = firstNumber(s)
  if (n == null) return null
  return Math.min(7, /year/.test(s) ? n * 2 : n)
}
export function parseCodes(t: string): string[] {
  return [...t.toUpperCase().matchAll(/\b([A-Z]{2,5})\s*-?\s*(\d{3}[A-Z]{0,2})\b/g)].map(m => `${m[1]} ${m[2]}`)
}
