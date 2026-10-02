/*
 * Degree planner engine: prerequisite DAG (AND/OR) -> semester-by-semester plan,
 * projected graduation term, and critical-path (bottleneck) analysis.
 * Pure functions, no DOM. Works in the browser (window.Planner) and in Node (require).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Planner = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const GRADE_POINTS = { "A": 4, "A-": 3.7, "B+": 3.3, "B": 3, "B-": 2.7, "C+": 2.3, "C": 2, "C-": 1.7,
    "D+": 1.3, "D": 1, "D-": 0.7, "F": 0, "WU": 0, "IC": 0 };
  const UD = /upper-division standing/i;
  const SENIOR = /senior standing/i;
  const GPA3 = /GPA 3\.0/;

  // ------------------------------------------------------------------ terms
  function termAt(start, i) {
    let season = start.season, year = start.year;
    for (let k = 0; k < i; k++) {
      if (season === "Fall") { season = "Spring"; year += 1; } else { season = "Fall"; }
    }
    return { season, year, label: season + " " + year };
  }

  // ------------------------------------------------------------------ grades
  /** Does a transcript grade satisfy a minimum grade ("C") for prerequisite/major purposes? */
  function passes(grade, min) {
    if (grade === "IP") return true;                 // in progress: assumed to pass for planning
    if (grade === "CR") return !min;                 // CR/NC isn't accepted where a letter minimum applies
    if (!(grade in GRADE_POINTS)) return false;      // W, NC, I, RP, AU...
    if (!min) return GRADE_POINTS[grade] > 0;
    return GRADE_POINTS[grade] >= GRADE_POINTS[min];
  }

  // ------------------------------------------------------------------ expressions
  function leaves(expr, out, soft) {
    out = out || [];
    if (!expr) return out;
    if (typeof expr === "string") out.push({ code: expr, soft: !!soft });
    else if (expr.and) expr.and.forEach(x => leaves(x, out, soft));
    else if (expr.or) expr.or.forEach(x => leaves(x, out, soft));
    else if (expr.course) out.push({ code: expr.course, soft: !!expr.concurrent });
    else if (expr.coreq) out.push({ code: expr.coreq, soft: true, coreq: true });
    return out;
  }

  /** ctx: { before:Set (completed before this term), now:Set (same term), placement:{} } */
  function evaluate(expr, ctx) {
    if (!expr) return true;
    if (typeof expr === "string") return ctx.before.has(expr);
    if (expr.and) return expr.and.every(x => evaluate(x, ctx));
    if (expr.or) return expr.or.some(x => evaluate(x, ctx));
    if (expr.course) return ctx.before.has(expr.course) || (expr.concurrent && ctx.now.has(expr.course));
    if (expr.coreq) return ctx.before.has(expr.coreq) || ctx.now.has(expr.coreq);
    if (expr.placement) return !!(ctx.placement && ctx.placement[expr.placement]);
    return false;
  }

  /** Status tree for display: each leaf marked done / planned (term index) / missing. */
  function explain(expr, lookup) {
    if (!expr) return null;
    if (typeof expr === "string") return Object.assign({ type: "course", code: expr }, lookup(expr));
    if (expr.and) return { type: "and", items: expr.and.map(x => explain(x, lookup)) };
    if (expr.or) return { type: "or", items: expr.or.map(x => explain(x, lookup)) };
    if (expr.course) return Object.assign({ type: "course", code: expr.course, concurrent: !!expr.concurrent },
      lookup(expr.course));
    if (expr.coreq) return Object.assign({ type: "course", code: expr.coreq, coreq: true }, lookup(expr.coreq));
    if (expr.placement) return { type: "placement", name: expr.placement, status: lookup("placement:" + expr.placement).status };
    return null;
  }

  // ------------------------------------------------------------------ prerequisite closure
  /** Add to `needed` the cheapest set of courses that satisfies expr, given courses in `have`. */
  function expand(expr, dag, have, needed, placement) {
    if (!expr) return true;
    if (typeof expr === "string" || expr.course || expr.coreq) {
      const code = typeof expr === "string" ? expr : (expr.course || expr.coreq);
      if (have.has(code) || needed.has(code)) return true;
      const node = dag.nodes[code];
      if (!node) return false;                       // external alternative not on the transcript
      needed.add(code);
      return expand(node.prereq, dag, have, needed, placement);
    }
    if (expr.placement) return !!(placement && placement[expr.placement]);
    if (expr.and) return expr.and.map(x => expand(x, dag, have, needed, placement)).every(Boolean);
    if (expr.or) {
      let best = null;
      for (const opt of expr.or) {
        const trial = new Set(needed);
        if (!expand(opt, dag, have, trial, placement)) continue;
        const added = [...trial].filter(c => !needed.has(c));
        const cost = added.reduce((s, c) => s + (dag.nodes[c] ? dag.nodes[c].units : 0), 0);
        if (!best || cost < best.cost) best = { cost, added };
        if (cost === 0) break;
      }
      if (!best) return false;
      best.added.forEach(c => needed.add(c));
      return true;
    }
    return false;
  }

  function extraUnitsFor(dag, code, have, needed, placement) {
    const trial = new Set(needed);
    if (have.has(code) || trial.has(code)) return 0;
    trial.add(code);
    expand(dag.nodes[code].prereq, dag, have, trial, placement);
    let units = 0;
    trial.forEach(c => { if (!needed.has(c) && c !== code) units += dag.nodes[c].units; });
    return units;
  }

  // ------------------------------------------------------------------ profile
  function profileSets(dag, profile) {
    const passed = new Set(), retake = [];
    for (const row of profile.courses) {
      if (row.include === false) continue;
      const node = dag.nodes[row.code];
      if (row.grade === "IP") continue;
      if (passes(row.grade, node ? node.min_grade : null)) passed.add(row.code);
      else if (node) retake.push({ code: row.code, grade: row.grade, min: node.min_grade });
    }
    const inProgress = new Set(profile.courses.filter(r => r.grade === "IP" && r.include !== false).map(r => r.code));
    return { passed, inProgress, retake };
  }

  // ------------------------------------------------------------------ elective picking
  function electivePool(dag) {
    const req = dag.requirements.find(r => r.type === "choose_units");
    const skip = new Set([...(req.excluded || []), ...(req.auto_plan_excludes || [])]);
    return req.courses.filter(c => !skip.has(c));
  }

  function pickElectives(dag, profile, track, keep) {
    const { passed, inProgress } = profileSets(dag, profile);
    const have = new Set([...passed, ...inProgress]);
    const req = dag.requirements.find(r => r.type === "choose_units");
    const pool = electivePool(dag);
    const order = [...(dag.tracks[track] ? dag.tracks[track].courses : []),
      ...Object.values(dag.tracks).flatMap(t => t.courses), ...pool];
    const chosen = [];
    const doneElectives = pool.filter(c => have.has(c));
    let units = doneElectives.reduce((s, c) => s + dag.nodes[c].units, 0);
    let nonCsc = doneElectives.filter(c => !c.startsWith("CSC ")).reduce((s, c) => s + dag.nodes[c].units, 0);
    for (const c of (keep || [])) {
      if (units >= req.min_units) break;
      if (have.has(c) || chosen.includes(c) || !dag.nodes[c]) continue;
      chosen.push(c); units += dag.nodes[c].units;
      if (!c.startsWith("CSC ")) nonCsc += dag.nodes[c].units;
    }
    for (const c of order) {
      if (units >= req.min_units) break;
      if (have.has(c) || chosen.includes(c) || !pool.includes(c)) continue;
      const isCsc = c.startsWith("CSC ");
      if (!isCsc && nonCsc + dag.nodes[c].units > req.min_units - req.min_csc_units) continue;
      chosen.push(c); units += dag.nodes[c].units;
      if (!isCsc) nonCsc += dag.nodes[c].units;
    }
    return chosen;
  }

  function electiveRuleCheck(dag, codes) {
    const req = dag.requirements.find(r => r.type === "choose_units");
    const units = codes.reduce((s, c) => s + dag.nodes[c].units, 0);
    const csc = codes.filter(c => c.startsWith("CSC ")).reduce((s, c) => s + dag.nodes[c].units, 0);
    return { units, cscUnits: csc, ok: units >= req.min_units && csc >= req.min_csc_units,
      minUnits: req.min_units, minCsc: req.min_csc_units };
  }

  // ------------------------------------------------------------------ scheduler
  /**
   * opts: { start:{season,year}, maxUnits, electives:[codes], blocked:{code:termIndex},
   *         offerings:{code:["Fall","Spring"]}, maxTerms }
   */
  function plan(dag, profile, opts) {
    opts = Object.assign({ maxUnits: 15, electives: [], blocked: {}, offerings: {}, maxTerms: 14 }, opts);
    const nodes = dag.nodes;
    const placement = profile.placement || {};
    const { passed, inProgress, retake } = profileSets(dag, profile);
    const have = new Set([...passed, ...inProgress]);

    const targets = [];
    dag.requirements.filter(r => r.type === "all").forEach(r => targets.push(...r.courses));
    targets.push(...opts.electives);
    const needed = new Set();
    const unreachable = [];
    for (const c of targets) {
      if (have.has(c)) continue;
      needed.add(c);
      if (!expand(nodes[c].prereq, dag, have, needed, placement)) unreachable.push(c);
    }
    const extra = [...needed].filter(c => !targets.includes(c));

    // dependency heights: longest remaining chain (in terms) starting at each course
    const dependents = {};
    needed.forEach(c => { dependents[c] = []; });
    needed.forEach(c => {
      leaves(nodes[c].prereq).forEach(l => {
        if (needed.has(l.code)) dependents[l.code].push({ code: c, soft: l.soft });
      });
    });
    const height = {};
    const h = (c, seen) => {
      if (height[c] != null) return height[c];
      if (seen.has(c)) return 1;
      seen.add(c);
      let best = 1;
      for (const d of dependents[c]) best = Math.max(best, h(d.code, seen) + (d.soft ? 0 : 1));
      seen.delete(c);
      height[c] = best;
      return best;
    };
    needed.forEach(c => h(c, new Set()));

    const coreqs = c => leaves(nodes[c].prereq).filter(l => l.coreq).map(l => l.code);
    const offered = (c, season) => !opts.offerings[c] || opts.offerings[c].includes(season);
    const standingOK = (c, units) => nodes[c].conditions.every(cond =>
      !(UD.test(cond) && units < 60) && !(SENIOR.test(cond) && units < 90));

    const inProgressUnits = profile.inProgressUnits != null ? profile.inProgressUnits
      : profile.courses.filter(r => r.grade === "IP" && r.include !== false).reduce((s, r) => s + (r.units || 0), 0);
    let cum = (profile.unitsEarned || 0) + inProgressUnits;
    const majorLeft = [...needed].reduce((s, c) => s + nodes[c].units, 0);
    const degreeUnits = (dag.university && dag.university.min_units) || 120;
    let generalLeft = Math.max(0, degreeUnits - cum - majorLeft);

    const remaining = new Set(needed);
    const placedTerm = {};
    const terms = [];
    const before = new Set(have);
    for (let t = 0; t < opts.maxTerms && (remaining.size || generalLeft > 0); t++) {
      const term = termAt(opts.start, t);
      const now = new Set();
      let units = 0;
      const startUnits = cum;
      for (;;) {
        let best = null;
        for (const c of remaining) {
          const bundle = [c, ...coreqs(c).filter(p => remaining.has(p) && !now.has(p))];
          if (bundle.some(b => opts.blocked[b] === t || !offered(b, term.season) || !standingOK(b, startUnits))) continue;
          const bu = bundle.reduce((s, b) => s + nodes[b].units, 0);
          if (units + bu > opts.maxUnits) continue;
          const nowPlus = new Set([...now, ...bundle]);
          if (!bundle.every(b => evaluate(nodes[b].prereq, { before, now: nowPlus, placement }))) continue;
          const score = Math.max(...bundle.map(b => height[b]));
          const req = bundle.some(b => !opts.electives.includes(b)) ? 1 : 0;
          if (!best || score > best.score || (score === best.score && (req > best.req ||
            (req === best.req && c < best.code)))) best = { code: c, bundle, units: bu, score, req };
        }
        if (!best) break;
        best.bundle.forEach(b => { now.add(b); remaining.delete(b); placedTerm[b] = t; });
        units += best.units;
      }
      const general = Math.min(Math.max(0, opts.maxUnits - units), generalLeft);
      generalLeft -= general;
      cum += units + general;
      now.forEach(c => before.add(c));
      terms.push({ index: t, term, courses: [...now].sort((a, b) => height[b] - height[a] || (a < b ? -1 : 1)),
        majorUnits: units, generalUnits: general, totalUnits: units + general, unitsAfter: cum });
    }
    while (terms.length && !terms[terms.length - 1].totalUnits) terms.pop();
    // in-progress courses whose prerequisites the transcript doesn't support (e.g. a misread grade)
    const ipWarnings = [];
    inProgress.forEach(c => {
      const node = nodes[c];
      if (node && !evaluate(node.prereq, { before: passed, now: inProgress, placement })) {
        const missing = leaves(node.prereq).filter(l => !l.coreq && !passed.has(l.code) && !inProgress.has(l.code))
          .map(l => l.code);
        ipWarnings.push({ code: c, missing });
      }
    });
    const gradIndex = remaining.size ? Infinity : terms.length - 1;
    return {
      terms, placedTerm, height, needed: [...needed], extra, targets, retake, unreachable,
      unscheduled: [...remaining], have, passed, inProgress,
      gradIndex, gradTerm: Number.isFinite(gradIndex) ? termAt(opts.start, gradIndex) : null, ipWarnings,
      maxUnits: opts.maxUnits,
      startUnits: (profile.unitsEarned || 0) + inProgressUnits, finalUnits: cum, dependents,
    };
  }

  // ------------------------------------------------------------------ bottlenecks
  function chainFrom(base, c) {
    const out = [c];
    let cur = c;
    for (;;) {
      const next = (base.dependents[cur] || []).filter(d => !d.soft)
        .sort((a, b) => base.height[b.code] - base.height[a.code])[0];
      if (!next) return out;
      out.push(next.code);
      cur = next.code;
    }
  }

  function bottlenecks(dag, profile, opts) {
    const base = plan(dag, profile, opts);
    const flags = [];
    for (const [code, t] of Object.entries(base.placedTerm)) {
      // only courses that unlock later courses can be bottlenecks; a leaf in a full term is a capacity issue
      if ((base.height[code] || 1) < 2) continue;
      const alt = plan(dag, profile, Object.assign({}, opts, { blocked: Object.assign({}, opts.blocked, { [code]: t }) }));
      const delay = alt.gradIndex - base.gradIndex;
      if (delay > 0) {
        flags.push({ code, termIndex: t, term: base.terms[t].term, delay,
          altGrad: alt.gradTerm, chain: chainFrom(base, code) });
      }
    }
    flags.sort((a, b) => b.delay - a.delay || a.termIndex - b.termIndex || (a.code < b.code ? -1 : 1));
    return { base, flags };
  }

  return { plan, bottlenecks, evaluate, explain, leaves, expand, passes, termAt, pickElectives,
    electivePool, electiveRuleCheck, extraUnitsFor, profileSets, GRADE_POINTS };
});
