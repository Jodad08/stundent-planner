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
    if (expr.ge_area) return !!ctx.areas && [...ctx.before].some(c => (ctx.areas[c] || []).includes(expr.ge_area));
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
    // add every required course first, so OR branches prefer courses that are needed anyway
    const needed = new Set(targets.filter(c => !have.has(c)));
    const unreachable = [];
    for (const c of targets) {
      if (have.has(c)) continue;
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
    const uni = dag.university || {};
    const udStanding = uni.upper_division_standing_units, seniorStanding = uni.senior_standing_units;
    const standingOK = (c, units) => nodes[c].conditions.every(cond =>
      !(UD.test(cond) && units < udStanding) && !(SENIOR.test(cond) && units < seniorStanding));

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

  // ================================================================== plan checking
  // evaluatePlan(plan, catalog, program, policies) -> EngineReport (architecture.md §6, plan.md §9).
  // Works on any plan, including one a student edited by hand.

  function indexCatalog(catalog) {
    if (catalog instanceof Map) return catalog;
    const m = new Map();
    (Array.isArray(catalog) ? catalog : Object.values(catalog)).forEach(c => m.set(c.id, c));
    return m;
  }

  /** Unsatisfied requirement groups of an expression: [{options, kind, area?, placement?}] */
  function unmet(expr, ctx) {
    if (!expr || evaluate(expr, ctx)) return [];
    if (typeof expr === "string") return [{ options: [expr], kind: "course" }];
    if (expr.and) return expr.and.flatMap(x => unmet(x, ctx));
    if (expr.or) {
      const parts = expr.or.flatMap(x => unmet(x, ctx));
      const options = [...new Set(parts.flatMap(g => g.options))];
      const placement = parts.find(g => g.kind === "placement");
      const concurrent = parts.length > 0 && parts.every(g => g.kind === "concurrent");
      return [{ options, kind: concurrent ? "concurrent" : "course", placement: placement && placement.placement }];
    }
    if (expr.course) return [{ options: [expr.course], kind: expr.concurrent ? "concurrent" : "course" }];
    if (expr.coreq) return [{ options: [expr.coreq], kind: "coreq" }];
    if (expr.placement) return [{ options: [], kind: "placement", placement: expr.placement }];
    if (expr.ge_area) return [{ options: [], kind: "ge_area", area: expr.ge_area }];
    return [];
  }

  const orList = xs => xs.length <= 1 ? (xs[0] || "") : xs.slice(0, -1).join(", ") + " or " + xs[xs.length - 1];

  function evaluatePlan(plan, catalog, program, policies) {
    const cat = indexCatalog(catalog);
    const issues = [];
    let seq = 0;
    const add = (severity, code, message, courseIds, extra) =>
      issues.push(Object.assign({ id: code + "-" + (++seq), severity, code, message, courseIds }, extra || {}));
    const P = k => policies[k].value;
    const src = k => policies[k].sourceUrl;
    const unitsOf = c => cat.has(c) ? Number(cat.get(c).units) || 0 : 0;

    // where each course sits: 0 = already done, 1..n = plan semester
    const pos = new Map();
    (plan.completedCourseIds || []).forEach(c => pos.set(c, 0));
    plan.semesters.forEach(s => s.courseIds.forEach(c => {
      if (pos.has(c)) {
        add("error", "DUPLICATE_COURSE", `${c} appears more than once in the plan.`, [c], { semesterIndex: s.index });
      } else pos.set(c, s.index);
    }));
    for (const c of pos.keys()) {
      if (!cat.has(c)) add("error", "UNKNOWN_COURSE", `${c} is not in the 2026-27 catalog.`, [c]);
    }
    const areas = {};
    for (const c of pos.keys()) if (cat.has(c)) areas[c] = cat.get(c).geAreas || [];
    const completedUnits = plan.completedUnits != null ? plan.completedUnits
      : (plan.completedCourseIds || []).reduce((t, c) => t + unitsOf(c), 0);

    // unit load per semester
    const semesterStats = plan.semesters.map(s => {
      const units = s.courseIds.reduce((t, c) => t + unitsOf(c), 0);
      const status = units === 0 ? "empty" : units < P("minUnitsFullTime") ? "under"
        : units <= P("heavyLoadUnits") ? "ok" : units <= P("maxUnitsWithoutPermission") ? "heavy" : "over";
      if (status === "under") add("warning", "UNITS_UNDER", `${s.label}: ${units} units is below full time (${P("minUnitsFullTime")}).`, [], { semesterIndex: s.index, sourceUrl: src("minUnitsFullTime") });
      if (status === "heavy") add("warning", "UNITS_HEAVY", `${s.label}: ${units} units is above the normal load (${P("heavyLoadUnits")}).`, [], { semesterIndex: s.index, sourceUrl: src("heavyLoadUnits") });
      if (status === "over") add("error", "UNITS_OVER", `${s.label}: ${units} units is above the registration maximum (${P("maxUnitsWithoutPermission")}); it needs an Exceed Maximum Units Petition.`, [], { semesterIndex: s.index, sourceUrl: src("maxUnitsWithoutPermission") });
      return { index: s.index, units, status };
    });

    // prerequisites, corequisites, standing
    let unitsBefore = completedUnits;
    plan.semesters.forEach((s, i) => {
      const before = new Set([...pos].filter(([, at]) => at < s.index).map(([c]) => c));
      const ctx = { before, now: new Set(s.courseIds), placement: plan.placement || {}, areas };
      s.courseIds.forEach(c => {
        const course = cat.get(c);
        if (!course) return;
        const at = { semesterIndex: s.index, sourceUrl: course.sourceUrl };
        if (!course.prereqEncoded && course.prereqNotes) {
          add("info", "PREREQ_NOTE", `${c}: prerequisites aren't checked automatically. Bulletin: "${course.prereqNotes}"`, [c], at);
        }
        unmet(course.prereq, ctx).forEach(g => {
          if (g.kind === "placement" || (g.placement && plan.placement && plan.placement[g.placement] === undefined)) {
            add("info", "PREREQ_NOTE", `${c} needs ${g.options.length ? orList(g.options) + " or " : ""}${g.placement} placement; placement isn't known for this plan.`, [c, ...g.options], at);
            return;
          }
          if (g.kind === "ge_area") {
            const later = [...pos].filter(([x, p]) => p >= s.index && (areas[x] || []).includes(g.area)).map(([x]) => x);
            add("error", later.length ? "PREREQ_ORDER" : "PREREQ_MISSING",
              `${c} needs a GE Area ${g.area} course in an earlier term${later.length ? ` (${later.join(", ")} is too late)` : ""}.`, [c, ...later], at);
            return;
          }
          const placed = g.options.filter(o => pos.has(o));
          if (g.kind === "coreq") {
            if (placed.length) add("error", "COREQ_ORDER", `${c} must be taken in the same term as ${g.options[0]} (or after it).`, [c, ...placed], at);
            else add("error", "PREREQ_MISSING", `${c} must be taken with ${g.options[0]}, which isn't in the plan.`, [c, ...g.options], at);
            return;
          }
          if (placed.length) {
            add("error", "PREREQ_ORDER", `${c} in ${s.label} needs ${orList(g.options)} ${g.kind === "concurrent" ? "in the same term or earlier" : "in an earlier term"}.`, [c, ...placed], at);
          } else {
            add("error", "PREREQ_MISSING", `${c} needs ${orList(g.options)}, which ${g.options.length > 1 ? "aren't" : "isn't"} in the plan.`, [c, ...g.options], at);
          }
        });
        (course.conditions || []).forEach(cond => {
          if (UD.test(cond) && unitsBefore < P("upperDivisionStandingUnits")) {
            add("warning", "STANDING_NOT_MET", `${c} needs upper-division standing (${P("upperDivisionStandingUnits")}+ units); the plan reaches ${unitsBefore} units before ${s.label}.`, [c], { semesterIndex: s.index, sourceUrl: src("upperDivisionStandingUnits") });
          }
          if (SENIOR.test(cond) && unitsBefore < P("seniorStandingUnits")) {
            add("warning", "STANDING_NOT_MET", `${c} needs senior standing (${P("seniorStandingUnits")}+ units); the plan reaches ${unitsBefore} units before ${s.label}.`, [c], { semesterIndex: s.index, sourceUrl: src("seniorStandingUnits") });
          }
          if (GPA3.test(cond)) add("info", "PREREQ_NOTE", `${c} requires a 3.0 GPA or the instructor's permission.`, [c], at);
        });
        if (course.typicalTerms && course.typicalTerms.length && s.season && !course.typicalTerms.includes(s.season)) {
          add("info", "TERM_NOT_OFFERED", `${c} is usually offered in ${course.typicalTerms.join("/")}, not ${s.season}.`, [c], at);
        }
      });
      unitsBefore += semesterStats[i].units;
    });

    // requirement groups (all -> elective units -> GE coverage -> free elective units with leftovers)
    const used = new Set();
    const isFree = g => g.type === "units" && g.courseIds.every(c => cat.has(c) && cat.get(c).isPlaceholder && !(cat.get(c).geAreas || []).length);
    const isGE = g => g.type === "units" && g.courseIds.length && g.courseIds.every(c => cat.has(c) && cat.get(c).isPlaceholder && (cat.get(c).geAreas || []).length);
    const order = [...program.requirementGroups].sort((a, b) => (isFree(a) - isFree(b)) || (isGE(a) - isGE(b)));
    const statusById = {};
    order.forEach(g => {
      if (g.type === "all") {
        const missing = g.courseIds.filter(c => !pos.has(c));
        g.courseIds.forEach(c => pos.has(c) && used.add(c));
        statusById[g.id] = { groupId: g.id, title: g.title, satisfied: !missing.length, missingCourseIds: missing };
      } else if (g.type === "pickN") {
        const have = g.courseIds.filter(c => pos.has(c));
        have.forEach(c => used.add(c));
        statusById[g.id] = { groupId: g.id, title: g.title, satisfied: have.length >= g.n, missingCourseIds: have.length >= g.n ? [] : g.courseIds.filter(c => !pos.has(c)), unitsHave: have.length, unitsNeed: g.n };
      } else if (isGE(g)) {
        const missing = [];
        let have = 0;
        g.courseIds.forEach(p => {
          const want = cat.get(p).geAreas;
          let cover = pos.has(p) ? p : null;
          if (!cover) {
            cover = [...pos.keys()].find(c => !used.has(c) && cat.has(c) && !cat.get(c).isPlaceholder &&
              (cat.get(c).geAreas || []).some(a => want.includes(a)));
          }
          if (cover) { used.add(cover); have += unitsOf(p); } else missing.push(p);
        });
        statusById[g.id] = { groupId: g.id, title: g.title, satisfied: !missing.length, missingCourseIds: missing, unitsHave: have, unitsNeed: g.unitsRequired };
      } else if (isFree(g)) {
        let have = 0;
        for (const c of pos.keys()) if (!used.has(c) && cat.has(c) && (!cat.get(c).isPlaceholder || g.courseIds.includes(c))) have += unitsOf(c);
        have += Math.max(0, completedUnits - (plan.completedCourseIds || []).reduce((t, c) => t + unitsOf(c), 0)); // transfer units outside the catalog
        statusById[g.id] = { groupId: g.id, title: g.title, satisfied: have >= g.unitsRequired, missingCourseIds: [], unitsHave: have, unitsNeed: g.unitsRequired };
      } else {
        const counted = g.courseIds.filter(c => pos.has(c) && !(g.excludedCourseIds || []).includes(c));
        counted.forEach(c => used.add(c));
        const have = counted.reduce((t, c) => t + unitsOf(c), 0);
        const subjectShort = Object.entries(g.minUnitsInSubject || {}).filter(([subj, min]) =>
          counted.filter(c => c.startsWith(subj + " ")).reduce((t, c) => t + unitsOf(c), 0) < min);
        statusById[g.id] = { groupId: g.id, title: g.title, satisfied: have >= g.unitsRequired && !subjectShort.length, missingCourseIds: [], unitsHave: have, unitsNeed: g.unitsRequired };
      }
    });
    const requirementStatus = program.requirementGroups.map(g => statusById[g.id]);
    requirementStatus.filter(r => !r.satisfied).forEach(r => add("warning", "REQ_GROUP_INCOMPLETE",
      `${r.title}: ${r.missingCourseIds.length ? "missing " + r.missingCourseIds.join(", ") : `${r.unitsHave} of ${r.unitsNeed} units`}.`, r.missingCourseIds, { sourceUrl: program.sourceUrl }));

    const totalUnitsPlanned = semesterStats.reduce((t, s) => t + s.units, 0);
    if (completedUnits + totalUnitsPlanned < program.totalUnitsRequired) {
      add("warning", "TOTAL_UNITS_SHORT", `${completedUnits + totalUnitsPlanned} units done or planned; the degree needs ${program.totalUnitsRequired}.`, [], { sourceUrl: program.sourceUrl });
    }
    const unverified = [...pos.keys()].filter(c => cat.has(c) && !cat.get(c).isPlaceholder && !cat.get(c).verified);
    if (unverified.length) add("info", "UNVERIFIED_DATA", `${unverified.length} courses in this plan come from the Bulletin scrape and haven't been checked by a person yet.`, []);
    const graduationReady = !issues.some(x => x.severity === "error") && requirementStatus.every(r => r.satisfied) &&
      completedUnits + totalUnitsPlanned >= program.totalUnitsRequired;
    return { issues, semesterStats, requirementStatus, totalUnitsPlanned, graduationReady };
  }

  // ================================================================== deterministic fallback planner
  // buildFallbackPlan: major courses from plan() (critical-path order), then GE and free-elective
  // placeholders in the remaining seats. No AI. Returns a Plan (architecture.md §6, D-016).

  function directionElectives(dag, catalog, direction) {
    if (!direction) return [];
    const cat = indexCatalog(catalog);
    const pool = electivePool(dag);
    const byTag = pool.filter(c => cat.has(c) && (cat.get(c).tags || []).some(t => direction.signalTags.includes(t)));
    return [...new Set([...direction.signalCourseIds.filter(c => pool.includes(c)), ...byTag])];
  }

  function buildFallbackPlan(input) {
    const { dag, catalog, program, policies, profile, startTerm, direction } = input;
    const cat = indexCatalog(catalog);
    const maxUnits = input.maxUnits || policies.heavyLoadUnits.value;
    const nTerms = input.terms || 8;
    const track = input.track || null;
    const keep = input.electives || directionElectives(dag, catalog, direction);
    const electives = pickElectives(dag, profile, track, keep);
    const base = plan(dag, profile, { start: startTerm, maxUnits, electives, offerings: input.offerings || {} });
    const { passed, inProgress } = profileSets(dag, profile);
    const done = new Set([...passed, ...inProgress]);
    profile.courses.forEach(r => { if (r.include !== false && (r.grade === "IP" || passes(r.grade, null))) done.add(r.code); });
    const completedIds = [...done].filter(c => cat.has(c));
    const completedUnits = profile.courses.filter(r => r.include !== false && (r.grade === "IP" || passes(r.grade, null)))
      .reduce((t, r) => t + Number(r.units || 0), 0);

    const semesters = [];
    for (let i = 0; i < nTerms; i++) {
      const t = termAt(startTerm, i);
      semesters.push({ index: i + 1, label: t.label, season: t.season.toLowerCase(), courseIds: [] });
    }
    Object.entries(base.placedTerm).forEach(([c, t]) => semesters[Math.min(t, nTerms - 1)].courseIds.push(c));
    const unitsOf = c => cat.has(c) ? Number(cat.get(c).units) || 0 : 0;

    // GE placeholders not already covered by finished or planned real courses
    const geGroup = program.requirementGroups.find(g => g.type === "units" && g.courseIds.length && g.courseIds.every(c => cat.has(c) && cat.get(c).isPlaceholder && (cat.get(c).geAreas || []).length));
    const freeGroup = program.requirementGroups.find(g => g.type === "units" && g.courseIds.every(c => cat.has(c) && cat.get(c).isPlaceholder && !(cat.get(c).geAreas || []).length));
    const majorIds = new Set(program.requirementGroups.filter(g => g !== geGroup && g !== freeGroup).flatMap(g => g.courseIds));
    const coverers = [...done].filter(c => cat.has(c) && !majorIds.has(c));
    const usedCover = new Set();
    const geNeeded = (geGroup ? geGroup.courseIds : []).filter(p => {
      const want = cat.get(p).geAreas;
      const c = coverers.find(x => !usedCover.has(x) && (cat.get(x).geAreas || []).some(a => want.includes(a)));
      if (c) { usedCover.add(c); return false; }
      return true;
    });
    const plannedMajor = Object.keys(base.placedTerm).reduce((t, c) => t + unitsOf(c), 0);
    const geUnits = geNeeded.reduce((t, p) => t + unitsOf(p), 0);
    let freeNeed = Math.max(0, program.totalUnitsRequired - completedUnits - plannedMajor - geUnits);
    const freeIds = [];
    for (const p of (freeGroup ? freeGroup.courseIds : [])) {
      if (freeNeed <= 0) break;
      freeIds.push(p);
      freeNeed -= unitsOf(p);
    }

    // seat placeholders: lower-division GE first, upper-division GE once its prerequisites and 60 units are met
    const queue = [...geNeeded.filter(p => !/UD/.test(p)), ...geNeeded.filter(p => /UD/.test(p)), ...freeIds];
    let unitsBefore = completedUnits;
    const placedPos = new Map(completedIds.map(c => [c, 0]));
    semesters.forEach(s => s.courseIds.forEach(c => placedPos.set(c, s.index)));
    const areas = {};
    for (const c of cat.keys()) { const a = cat.get(c).geAreas; if (a && a.length) areas[c] = a; }
    semesters.forEach(s => {
      let load = s.courseIds.reduce((t, c) => t + unitsOf(c), 0);
      for (let k = 0; k < queue.length; k++) {
        const p = queue[k];
        if (load + unitsOf(p) > maxUnits) continue;
        const before = new Set([...placedPos].filter(([, at]) => at < s.index).map(([c]) => c));
        if (/UD/.test(p) && (unitsBefore < policies.upperDivisionStandingUnits.value ||
            !evaluate(cat.get(p).prereq, { before, now: new Set(), areas }))) continue;
        s.courseIds.push(p);
        placedPos.set(p, s.index);
        load += unitsOf(p);
        queue.splice(k, 1);
        k -= 1;
      }
      unitsBefore += load;
    });
    queue.forEach(p => semesters[nTerms - 1].courseIds.push(p));  // overflow is left visible; evaluatePlan flags it
    const draft = {
      id: input.id || "plan_fallback",
      name: input.name || "Deterministic plan",
      programId: program.id,
      goalText: input.goalText || "",
      createdAt: input.createdAt || new Date(0).toISOString(),
      startTerm,
      semesters,
      completedCourseIds: completedIds,
      completedUnits,
      placement: profile.placement || {},
      source: "fallback",
      electiveChoices: electives.map(c => ({ courseId: c, reason: direction && direction.signalCourseIds.includes(c) ? `Signals ${direction.label}` : "Fills the elective units" })),
    };
    return repairPlan(draft, catalog, program, policies, { maxUnits }).plan;
  }

  /**
   * Deterministic repair: move a course that breaks prerequisite order or standing one term later,
   * and move a placeholder out of an overloaded term. Stops when nothing movable is left.
   */
  function repairPlan(planIn, catalog, program, policies, opts) {
    const plan = JSON.parse(JSON.stringify(planIn));
    const cat = indexCatalog(catalog);
    const maxUnits = (opts && opts.maxUnits) || policies.heavyLoadUnits.value;
    const unitsOf = c => cat.has(c) ? Number(cat.get(c).units) || 0 : 0;
    const load = s => s.courseIds.reduce((t, c) => t + unitsOf(c), 0);
    const moves = [];
    const limit = (opts && opts.maxMoves) || 60;
    for (let iter = 0; iter < limit; iter++) {
      const r = evaluatePlan(plan, catalog, program, policies);
      const bad = r.issues.find(x => ["PREREQ_ORDER", "COREQ_ORDER", "STANDING_NOT_MET"].includes(x.code) &&
        x.semesterIndex && x.semesterIndex < plan.semesters.length);
      if (bad) {
        const c = bad.courseIds[0];
        const from = plan.semesters[bad.semesterIndex - 1];
        const to = plan.semesters[bad.semesterIndex];
        from.courseIds = from.courseIds.filter(x => x !== c);
        to.courseIds.push(c);
        moves.push({ courseId: c, from: from.index, to: to.index, reason: bad.code });
        continue;
      }
      // rebalance: pull placeholders into earlier gaps, then shift leaf courses out of overloaded terms
      if (!plan.semesters.some(s2 => load(s2) > maxUnits)) break;
      const tryMove = (fromIdx, toIdx, c) => {
        if (load(plan.semesters[toIdx]) + unitsOf(c) > maxUnits) return false;
        const trial = JSON.parse(JSON.stringify(plan));
        trial.semesters[fromIdx].courseIds = trial.semesters[fromIdx].courseIds.filter(x => x !== c);
        trial.semesters[toIdx].courseIds.push(c);
        const rr = evaluatePlan(trial, catalog, program, policies);
        const broken = rr.issues.some(x => ["PREREQ_ORDER", "PREREQ_MISSING", "COREQ_ORDER", "STANDING_NOT_MET"].includes(x.code) &&
          !r.issues.some(y => y.code === x.code && y.message === x.message));
        if (broken) return false;
        plan.semesters = trial.semesters;
        moves.push({ courseId: c, from: fromIdx + 1, to: toIdx + 1, reason: "UNITS_HEAVY" });
        return true;
      };
      const dependents = (idx, c) => plan.semesters.slice(idx + 1).some(s2 => s2.courseIds.some(d =>
        cat.has(d) && leaves(cat.get(d).prereq).some(l => l.code === c)));
      const isPh = c => cat.has(c) && cat.get(c).isPlaceholder;
      const n = plan.semesters.length;
      let done = false;
      // 1) an overloaded term sends a placeholder anywhere it fits
      for (let i = 0; i < n && !done; i++) {
        if (load(plan.semesters[i]) <= maxUnits) continue;
        for (const c of plan.semesters[i].courseIds.filter(isPh)) {
          for (let k = 0; k < n && !done; k++) if (k !== i && tryMove(i, k, c)) done = true;
          if (done) break;
        }
        // 2) or a course nothing later depends on moves to a later term with room
        for (const c of plan.semesters[i].courseIds.filter(x => !isPh(x) && !dependents(i, x))) {
          if (done) break;
          for (let k = i + 1; k < n && !done; k++) if (tryMove(i, k, c)) done = true;
        }
      }
      // 3) make room: pull a placeholder from a later term into an earlier gap
      for (let i = n - 1; i > 0 && !done; i--) {
        for (const c of plan.semesters[i].courseIds.filter(isPh)) {
          for (let k = 0; k < i && !done; k++) if (tryMove(i, k, c)) done = true;
          if (done) break;
        }
      }
      if (!done) break;
    }
    return { plan, moves };
  }

  // ================================================================== career direction scores (code, not AI)
  function directionScores(plan, catalog, careerTags) {
    const cat = indexCatalog(catalog);
    const ids = new Set([...(plan.completedCourseIds || []), ...plan.semesters.flatMap(s => s.courseIds)]);
    return careerTags.directions.map(d => {
      let s = 0;
      ids.forEach(c => {
        if (d.signalCourseIds.includes(c)) s += 2;
        else if (cat.has(c) && (cat.get(c).tags || []).some(t => d.signalTags.includes(t))) s += 1;
      });
      const max = 2 * d.signalCourseIds.length;
      return { directionId: d.id, label: d.label, score: Math.round(100 * Math.min(1, s / max)) };
    }).sort((a, b) => b.score - a.score);
  }

  return { plan, bottlenecks, evaluate, explain, leaves, expand, passes, termAt, pickElectives,
    electivePool, electiveRuleCheck, extraUnitsFor, profileSets, GRADE_POINTS,
    evaluatePlan, buildFallbackPlan, repairPlan, directionScores, directionElectives, indexCatalog, unmet };
});
