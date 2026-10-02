// The ONE model adapter. Every model call goes through completeJson(). Providers: gemini | mock.
import { GoogleGenAI } from "@google/genai"

export type Purpose = "plan" | "repair" | "evaluate"
export type CompleteResult = { json: unknown; provider: "gemini" | "mock"; model: string; ms: number }

const TIMEOUT_MS = 25_000

export function providerName(): "gemini" | "mock" {
  const p = process.env.AI_PROVIDER
  if (p === "gemini" || p === "mock") return p
  return process.env.GEMINI_API_KEY ? "gemini" : "mock"
}

let client: GoogleGenAI | null = null

/**
 * system/user: prompt text from server/prompts.ts. schema: JSON schema for structured output.
 * mock: deterministic stand-in used when the provider is "mock" (no key needed).
 */
export async function completeJson(system: string, user: string,
  opts: { purpose: Purpose; schema: object; mock: () => unknown }): Promise<CompleteResult> {
  const t0 = Date.now()
  if (providerName() === "mock") return { json: opts.mock(), provider: "mock", model: "mock", ms: Date.now() - t0 }
  const model = process.env.GEMINI_MODEL
  if (!model) throw new Error("GEMINI_MODEL is not set")
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  let lastErr: unknown
  // primary, then each GEMINI_FALLBACK_MODEL (comma list) once; plain retry if none set (D-018, D-021)
  const chain = [model, ...(process.env.GEMINI_FALLBACK_MODEL || model).split(",").map(x => x.trim()).filter(Boolean)]
  for (let attempt = 0; attempt < chain.length; attempt++) {
    const m = chain[attempt]
    try {
      const res = await client.models.generateContent({
        model: m, contents: user,
        config: { systemInstruction: system, responseMimeType: "application/json", responseJsonSchema: opts.schema,
          abortSignal: AbortSignal.timeout(TIMEOUT_MS) },
      })
      const text = res.text ?? ""
      console.log(`[gemini] purpose=${opts.purpose} model=${m} ms=${Date.now() - t0} chars=${text.length}`)
      return { json: JSON.parse(text), provider: "gemini", model: m, ms: Date.now() - t0 }
    } catch (e) {
      lastErr = e
      console.warn(`[gemini] purpose=${opts.purpose} model=${m} attempt ${attempt + 1} failed: ${String(e).slice(0, 200)}`)
      if (attempt < chain.length - 1) await new Promise(r => setTimeout(r, 1500)) // brief backoff on 503 spikes
    }
  }
  throw lastErr
}
