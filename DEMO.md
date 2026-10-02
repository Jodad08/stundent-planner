# DEMO (3 minutes)

Start: `npm run dev` → http://localhost:5173 (or `npm run build && npm start` → http://localhost:3000).

1. Problem (20s): blurred screenshots of SFSU's Degree Planner and the 12-page Degree Progress Report (a business student's; say so). "This is what students see. No prerequisites anywhere."
2. Map (30s): GatorGraph on B.S. CS. Semesters left to right, prerequisite lines.
3. Break it (30s): drag CSC 340 before CSC 220. Bold animated line, red semester, engine names the rule + Bulletin link.
4. Chain (20s): click a course, its whole chain lights up; bottleneck badge "delaying this costs N semesters".
5. AI Plan (40s): "Machine learning engineer". Show attempts/repairs count and "Checked by rules engine".
6. Proof (30s): Evaluate panel + evals table: Gemini vs deterministic vs official roadmap vs empty.
7. Close (10s): every rule cites the Bulletin; advisor still confirms.

Backup: saved runs replay with no model call (Runs menu). Screen recording.

Judge Qs: "Wrapper?" → engine + fallback planner work with no AI. "Hallucination?" → unknown IDs rejected, engine re-checks, repair ×2, fallback. "Data accuracy?" → scraped 2026-27 Bulletin, every course links its page; not human-verified (badge).
