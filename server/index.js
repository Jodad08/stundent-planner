// GatorGraph server: serves the static UI and the /api routes (architecture.md §9). Plain Node (D-011).
const path = require("path");
const express = require("express");
const D = require("./data.js");
const { aiPlan } = require("./aiPlan.js");
const { evaluate } = require("./evaluate.js");
const runs = require("./runs.js");
const gemini = require("./gemini.js");

function createApp(deps = {}) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(express.static(path.join(D.ROOT, "web")));

  app.get("/api/health", (req, res) => res.json({ ok: true, provider: gemini.provider(), model: gemini.modelName() }));
  app.get("/api/catalog", (req, res) => {
    if (req.query.programId) {
      if (!D.programs[req.query.programId]) return res.status(404).json({ error: "Unknown program", code: "UNKNOWN_PROGRAM" });
      const ids = new Set(D.programCourseIds(req.query.programId));
      return res.json(D.catalog.filter(c => ids.has(c.id)));
    }
    res.json(D.catalog);
  });
  app.get("/api/programs", (req, res) => res.json(Object.values(D.programs).map(p => ({ id: p.id, name: p.name }))));
  app.get("/api/programs/:id", (req, res) => D.programs[req.params.id] ? res.json(D.programs[req.params.id])
    : res.status(404).json({ error: "Unknown program", code: "UNKNOWN_PROGRAM" }));
  app.get("/api/policies", (req, res) => res.json(D.policies));
  app.get("/api/career-directions", (req, res) => res.json(D.careerTags.directions));
  app.get("/api/runs", (req, res) => res.json(runs.listRuns()));
  app.get("/api/runs/:id", (req, res) => {
    const r = runs.getRun(req.params.id);
    return r ? res.json(r) : res.status(404).json({ error: "Run not found", code: "RUN_NOT_FOUND" });
  });

  app.post("/api/plan", async (req, res, next) => {
    try {
      const out = await aiPlan(req.body, deps);
      const scores = runs.scorePlan(out.plan, out.report, Planner().directionScores(out.plan, D.catalog, D.careerTags), out.attempts);
      const run = runs.saveRun({ variant: "plan", input: req.body,
        config: { provider: gemini.provider(), model: gemini.modelName(), maxRepairs: 2 },
        steps: out.steps, final_state: { plan: out.plan, source: out.source, rationale: out.rationale }, scores });
      res.json(Object.assign({}, out, { runId: run.run_id, aiProvider: gemini.provider() }));
    } catch (e) { next(e); }
  });
  app.post("/api/evaluate", async (req, res, next) => {
    try {
      const out = await evaluate(req.body, deps);
      const scores = runs.scorePlan(req.body.plan, out.report, out.directionScores, null);
      const run = runs.saveRun({ variant: "evaluate", input: req.body,
        config: { provider: gemini.provider(), model: gemini.modelName() },
        steps: out.steps, final_state: { report: out.report, ai: out.ai, aiStatus: out.aiStatus }, scores });
      res.json(Object.assign({}, out, { runId: run.run_id, aiProvider: gemini.provider() }));
    } catch (e) { next(e); }
  });

  app.use((err, req, res, next) => {  // eslint-disable-line no-unused-vars
    const status = err.status || 500;
    res.status(status).json({ error: status === 500 ? "Something went wrong on the server." : err.message, code: err.code || "SERVER_ERROR" });
    if (status === 500) console.error(err);
  });
  return app;
}

function Planner() { return require("../web/planner.js"); }

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, () => console.log(`GatorGraph on http://localhost:${port} (model provider: ${gemini.provider()})`));
}

module.exports = { createApp };
