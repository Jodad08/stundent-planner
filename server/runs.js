// Saved runs (prompt.md B.5 step 6): every /api/plan and /api/evaluate call is written to runs/ and can be
// replayed in the UI without a model call.
const fs = require("fs");
const path = require("path");
const { ROOT } = require("./data.js");

const DIR = process.env.RUNS_DIR || path.join(ROOT, "runs");
let seq = 0;

function saveRun({ variant, input, config, steps, final_state, scores, errors }) {
  fs.mkdirSync(DIR, { recursive: true });
  const created_at = new Date().toISOString();
  const run_id = created_at.replace(/[-:.TZ]/g, "").slice(0, 14) + "-" + variant + "-" + String(++seq).padStart(3, "0");
  const record = { run_id, variant, input, config, steps, final_state, scores, errors: errors || [], created_at };
  fs.writeFileSync(path.join(DIR, run_id + ".json"), JSON.stringify(record, null, 1));
  return record;
}

function listRuns() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter(f => f.endsWith(".json")).sort().reverse().map(f => {
    const r = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
    return { run_id: r.run_id, variant: r.variant, created_at: r.created_at, goalText: r.input && (r.input.goalText || r.input.plan && r.input.plan.goalText),
      source: r.final_state && r.final_state.source, scores: r.scores };
  });
}

function getRun(id) {
  if (!/^[0-9]{14}-[a-z-]+-[0-9]{3}$/.test(id)) return null;
  const p = path.join(DIR, id + ".json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}

/** Scores shared by runs and evals. */
function scorePlan(plan, report, directionScores, attempts) {
  const nonEmpty = plan.semesters.filter(s => s.courseIds.length).map(s => s.index);
  return {
    errors: report.issues.filter(x => x.severity === "error").length,
    warnings: report.issues.filter(x => x.severity === "warning").length,
    requirementGroupsSatisfied: report.requirementStatus.filter(r => r.satisfied).length,
    requirementGroups: report.requirementStatus.length,
    semestersToGraduate: report.graduationReady && nonEmpty.length ? Math.max(...nonEmpty) : null,
    totalUnits: (plan.completedUnits || 0) + report.totalUnitsPlanned,
    graduationReady: report.graduationReady,
    topDirection: directionScores && directionScores[0] ? directionScores[0].directionId : null,
    repairAttempts: attempts != null ? Math.max(0, attempts - 1) : null,
  };
}

module.exports = { saveRun, listRuns, getRun, scorePlan, DIR };
