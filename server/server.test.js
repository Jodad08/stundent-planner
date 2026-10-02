// Server pipeline tests (mock provider and injected fake models; no network, no API key).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

process.env.RUNS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "gg-runs-"));
delete process.env.GEMINI_API_KEY;
process.env.AI_PROVIDER = "mock";
const { createApp } = require("./index.js");
const D = require("./data.js");

const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "web", "data.js"), "utf8"), ctx);
const sample = ctx.window.SAMPLE_TRANSCRIPT;

async function withServer(deps, fn) {
  const server = createApp(deps).listen(0);
  await new Promise(r => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { return await fn(base); } finally { server.close(); }
}
const post = (base, p, body) => fetch(base + p, { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json() }));
const planReq = extra => Object.assign({ goalText: "Cybersecurity analyst", programId: "bs-cs", unitsPerSemester: 15,
  lockedPlacements: [], startTerm: { season: "Spring", year: 2027 }, profile: { courses: sample.courses, placement: sample.placement } }, extra);
const fakeId = n => ["CSC", String(n)].join(" ");  // intentionally not a catalog course

test("mock pipeline returns an engine-valid plan and saves a replayable run", async () => {
  await withServer({}, async base => {
    const r = await post(base, "/api/plan", planReq());
    assert.equal(r.status, 200);
    assert.equal(r.body.report.issues.filter(x => x.severity === "error").length, 0);
    assert.ok(["ai", "fallback"].includes(r.body.source));
    assert.equal(r.body.aiProvider, "mock");
    const run = await fetch(`${base}/api/runs/${r.body.runId}`).then(x => x.json());
    assert.deepEqual(run.final_state.plan.semesters, r.body.plan.semesters, "replay shows the same plan without a model call");
    assert.ok(run.steps.length >= 1 && run.scores && run.config.provider === "mock");
  });
});

test("invented course IDs are rejected, never auto-corrected; repairs are capped at 2", async () => {
  let calls = 0;
  const fake = async () => {
    calls++;
    return { json: { semesters: [{ index: 1, courseIds: ["CSC 101", fakeId(777)] }], rationale: "x", electiveChoices: [] },
      provider: "fake", model: "fake", ms: 0 };
  };
  await withServer({ completeJson: fake }, async base => {
    const r = await post(base, "/api/plan", planReq());
    assert.equal(calls, 3, "1 plan call + 2 repairs");
    assert.equal(r.body.source, "fallback");
    assert.ok(r.body.steps.slice(0, 3).every(s => s.problems.some(p => p.code === "UNKNOWN_COURSE")));
    assert.ok(!r.body.plan.semesters.flatMap(s => s.courseIds).includes(fakeId(777)));
  });
});

test("schema-invalid model output goes to repair, then fallback", async () => {
  const fake = async () => ({ json: { plan: "not the schema" }, provider: "fake", model: "fake", ms: 0 });
  await withServer({ completeJson: fake }, async base => {
    const r = await post(base, "/api/plan", planReq());
    assert.equal(r.body.source, "fallback");
    assert.ok(r.body.steps[0].problems.some(p => p.code === "SCHEMA"));
  });
});

test("a model failure (exception) falls back without crashing", async () => {
  const fake = async () => { throw new Error("quota exceeded"); };
  await withServer({ completeJson: fake }, async base => {
    const r = await post(base, "/api/plan", planReq());
    assert.equal(r.status, 200);
    assert.equal(r.body.source, "fallback");
    const e = await post(base, "/api/evaluate", { plan: r.body.plan });
    assert.equal(e.body.aiStatus, "failed");
    assert.ok(e.body.report && e.body.ai === null, "engine result still returned");
  });
});

test("evaluate keeps only suggestions the engine accepts", async () => {
  let plan;
  await withServer({}, async base => { plan = (await post(base, "/api/plan", planReq())).body.plan; });
  const fake = async () => ({ json: { summary: "s", directionExplanation: "d", suggestions: [
    { remove: null, add: "CSC 671", semester: 1, reason: "breaks prerequisites (needs CSC 510 first)" },
    { remove: null, add: fakeId(888), semester: 2, reason: "unknown course" },
    { remove: null, add: "CSC 665", semester: 8, reason: "fine: CSC 413 comes earlier" },
  ] }, provider: "fake", model: "fake", ms: 0 });
  await withServer({ completeJson: fake }, async base => {
    const e = await post(base, "/api/evaluate", { plan });
    assert.equal(e.body.aiStatus, "ok");
    assert.deepEqual(e.body.ai.suggestions.map(s => s.add), ["CSC 665"]);
  });
});

test("a plan that retakes finished requirements goes back for repair", async () => {
  const { plan } = (await (async () => { let out; await withServer({}, async base => { out = (await post(base, "/api/plan", planReq())).body; }); return out; })());
  const done = new Set(plan.completedCourseIds);
  const coveredArea = ["GE-1A", "GE-1B", "GE-1C", "GE-3A", "GE-4-1"].find(p => !plan.semesters.some(s => s.courseIds.includes(p)));
  assert.ok(coveredArea && done.size, "the sample student already covers a lower-division GE area");
  const semesters = plan.semesters.map(s => ({ index: s.index, courseIds: s.courseIds.slice() }));
  semesters[semesters.findIndex(s => s.courseIds.length)].courseIds.push(coveredArea);
  let calls = 0;
  const fake = async () => { calls++; return { json: { semesters, rationale: "x", electiveChoices: [] }, provider: "fake", model: "fake", ms: 0 }; };
  await withServer({ completeJson: fake }, async base => {
    const r = await post(base, "/api/plan", planReq());
    assert.ok(r.body.steps[0].problems.some(p => p.code === "ALREADY_SATISFIED"), JSON.stringify(r.body.steps[0].problems));
    assert.equal(calls, 3);
    assert.equal(r.body.source, "fallback");
  });
});

test("goal text maps to the right career direction", () => {
  const { matchDirection } = require("./aiPlan.js");
  assert.equal(matchDirection("Cybersecurity analyst, maybe penetration testing").id, "cybersecurity");
  assert.equal(matchDirection("Machine learning engineer working on AI models").id, "ml-engineer");
  assert.equal(matchDirection("Quant trading developer at a finance firm").id, "quant");
  assert.equal(matchDirection("I want to be a backend software engineer at a startup").id, "software-engineer");
});

test("bad requests get clear error codes", async () => {
  await withServer({}, async base => {
    assert.equal((await post(base, "/api/plan", planReq({ goalText: "" }))).body.code, "BAD_GOAL");
    assert.equal((await post(base, "/api/plan", planReq({ unitsPerSemester: D.policies.maxUnitsWithoutPermission.value + 1 }))).body.code, "BAD_UNITS");
    assert.equal((await post(base, "/api/plan", planReq({ programId: "bs-nope" }))).body.code, "UNKNOWN_PROGRAM");
    assert.equal((await post(base, "/api/evaluate", { plan: { programId: "bs-cs", semesters: [] } })).body.code, "BAD_PLAN");
  });
});
