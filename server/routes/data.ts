import { Router } from "express"
import { careers, dag, policies } from "../../shared/data"
import { providerName } from "../gemini"
import { getRun, listRuns } from "../runs"

export const dataRoutes = Router()
dataRoutes.get("/health", (_req, res) => { res.json({ ok: true, aiProvider: providerName(), model: providerName() === "gemini" ? process.env.GEMINI_MODEL : "mock" }) })
dataRoutes.get("/catalog", (_req, res) => { res.json(Object.values(dag.nodes)) })
dataRoutes.get("/programs", (_req, res) => { res.json([{ id: "bs-cs", name: dag.program.name }]) })
dataRoutes.get("/programs/:id", (req, res) => {
  if (req.params.id !== "bs-cs") { res.status(404).json({ error: "Unknown program", code: "UNKNOWN_PROGRAM" }); return }
  res.json(dag)
})
dataRoutes.get("/policies", (_req, res) => { res.json(policies) })
dataRoutes.get("/career-directions", (_req, res) => { res.json(careers) })
dataRoutes.get("/runs", (_req, res) => { res.json(listRuns()) })
dataRoutes.get("/runs/:id", (req, res) => {
  const r = getRun(req.params.id)
  if (!r) { res.status(404).json({ error: "Run not found", code: "RUN_NOT_FOUND" }); return }
  res.json(r)
})
