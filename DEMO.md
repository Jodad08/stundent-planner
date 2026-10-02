# DEMO (about 4 minutes)

Before: ⋯ → **Start over** (clears test data). Run `npm run dev`, open http://localhost:5173. (Or `npm run build && npm start` → http://localhost:3000, with dev stopped: both use port 3000.)

1. **Problem (20s).** Blurred screenshots of SFSU's Degree Planner and the 12-page Degree Progress Report (a business student's; say so). "This is what students use. No prerequisites anywhere, nothing about careers."
2. **Onboarding (45s).** Name → B.S. Computer Science (all SFSU majors listed) → 1 semester done → type `CSC 101, MATH 226` → goal "Machine learning engineer" (recommended electives appear) → **✦ Auto plan it**. Point at the reasoning: goal → track, longest chain, electives, then the engine catches a mistake and the AI repairs it.
3. **The map (40s).** Green cards; "Needs" chips green when satisfied. Drag **CSC 340** into the same semester as CSC 220: the card turns red and names the rule. Drag it back. Flip to **Graph** for the whole chain.
4. **Evaluate (45s).** Reasoning, then: start-to-end chain (Fall 2026 → … ), where it's heading, career paths, rule check.
5. **Justification (30s).** 9 of 9 planted mistakes caught; SFSU's own sample roadmaps pass with zero prerequisite errors; planners compared.
6. **Honesty + close (20s).** "Gemini is integrated (schema-validated JSON, repair loop, fallback). Our free-tier key ran out, so this is simulation mode." ⋯ → **Saved runs** → open a recorded real Gemini run (e.g. "Cybersecurity analyst"). "The AI proposes; the rules engine decides. Always confirm with your advisor."

Backup: screen recording. Judge questions: "Is it a wrapper?" → the engine and fallback planner work with no AI. "What if the AI is wrong?" → unknown IDs rejected, engine re-checks, repair ×2, then fallback. "Data?" → public 2026-27 Bulletin, every course links its page; machine-checked, not yet human-verified.
