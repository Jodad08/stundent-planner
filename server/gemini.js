// The single model adapter (architecture.md §10, prompt.md B.4 #8): completeJson(system, user, {purpose, schema}).
// Providers: "gemini" (Google GenAI SDK) and "mock" (deterministic stand-in, server/mockModel.js).
// AI_PROVIDER selects one; without GEMINI_API_KEY the default is mock, so the app runs with no key.
const { completeMock } = require("./mockModel.js");

const TIMEOUT_MS = 25000;  // architecture.md §9: 25 s timeout, one retry

function provider() {
  const p = process.env.AI_PROVIDER || (process.env.GEMINI_API_KEY ? "gemini" : "mock");
  if (!["gemini", "mock"].includes(p)) throw new Error(`AI_PROVIDER must be gemini or mock, got ${p}`);
  return p;
}

function modelName() {
  return provider() === "gemini" ? process.env.GEMINI_MODEL || null : "mock";
}

let client = null;
async function geminiCall(system, user, schema) {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
  if (!process.env.GEMINI_MODEL) throw new Error("GEMINI_MODEL is not set (use a current model ID from the Gemini docs)");
  if (!client) {
    const { GoogleGenAI } = await import("@google/genai");
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await client.models.generateContent({
      model: process.env.GEMINI_MODEL,
      contents: user,
      config: { systemInstruction: system, responseMimeType: "application/json", responseJsonSchema: schema,
        abortSignal: controller.signal },
    });
    return JSON.parse(res.text);
  } finally {
    clearTimeout(timer);
  }
}

/** Returns { json, provider, model, ms }. Throws after one retry. */
async function completeJson(system, user, { purpose, schema }) {
  const p = provider();
  const started = Date.now();
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const json = p === "mock" ? await completeMock(system, user, { purpose, schema }) : await geminiCall(system, user, schema);
      return { json, provider: p, model: modelName(), ms: Date.now() - started };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

module.exports = { completeJson, provider, modelName };
