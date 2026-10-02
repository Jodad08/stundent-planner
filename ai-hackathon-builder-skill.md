---
name: ai-hackathon-builder
description: Use when building, planning, reviewing, or rescuing an AI hackathon project. Forces thesis clarity, scoped planning, harnessed model use, mock mode, replayable evidence, meaningful evaluation, and demo-first execution. Do not use for ordinary non-AI CRUD apps unless the user wants hackathon/project strategy.
metadata:
  short-description: Build AI hackathon projects without slop
---

# AI Hackathon Builder Skill

## Mission

Build a clear, specific, demoable AI project that can survive judge questions. Do not optimize for making the user feel productive. Optimize for a sharp thesis, controlled AI behavior, replayable evidence, and a reliable demo.

The project is successful only if a judge can answer these in under one minute:

1. What is the claim?
2. Where is AI used?
3. What did the AI do?
4. How do we know it worked?
5. What happens when the AI is wrong?

## Invocation Behavior

When this skill is active:

- Push back on vague project ideas before coding.
- Prefer a small proven system over a large unfinished feature set.
- Convert vague requests into explicit thesis, demo, architecture, eval, and build steps.
- Do not directly scatter model calls across the app.
- Do not let the model mutate trusted state without validation.
- Do not build decorative UI that fails to explain cause and effect.
- Do not accept "AI magic" as evidence.

## First Response Protocol

If the user has not provided a clear thesis, ask or infer these:

```text
Project thesis:
Target user:
Hackathon/judging criteria:
Killer demo moment:
Deadline:
Available APIs/tools:
Must-use sponsors:
```

If enough is known, proceed without waiting. Make reasonable assumptions and state them briefly.

## Non-Negotiable Project Artifacts

Create or maintain these files early:

```text
VISION.md          Product claim, user, pain, demo moment, non-goals.
PLAN.md            Build order, decisions log, risks, cut list, submission checklist.
ARCHITECTURE.md    Modules, data flow, trust boundaries, AI boundaries.
EVALS.md           Metrics, baselines, controls, anti-cheating rules.
DEMO.md            Exact demo script, backup path, judge questions.
.env.example       Required env vars with no secrets.
README.md          Thesis, setup, demo, architecture, evaluation, limitations.
```

If time is short, create compressed versions of these sections in `PLAN.md` rather than skipping planning.

## One-Sentence Thesis Gate

Before implementation, produce a one-sentence thesis.

Good form:

```text
Same <input/context>, different <AI loop/strategy>; watch which one improves <measurable outcome>.
```

Other acceptable forms:

```text
Turn <messy human intent> into <verified action> with every step auditable.
```

```text
Let users simulate <high-stakes decision> before acting, then show the tradeoffs.
```

Reject theses like:

```text
An AI-powered platform for productivity.
```

```text
A dashboard that uses AI to help users.
```

If the thesis is generic, stop and rewrite it before coding.

## Build Order

Use this order unless the user explicitly overrides it:

1. Thesis and demo moment.
2. Deterministic core or smallest real workflow.
3. Model client with mock mode.
4. AI harness with schema validation.
5. Saved/replayable run output.
6. Minimal UI from saved data.
7. Baseline/evaluator/control.
8. Real model call.
9. Demo polish.
10. README, recording, submission.

Do not start with landing pages, auth, dashboards, large settings panels, or decorative visuals unless they are the product.

## Architecture Requirements

Default structure:

```text
core/       deterministic domain logic
ai/         model client, harness, prompts, memory
evals/      scoring, baselines, judges, controls
server/     API-key and background-job boundary
web/        frontend
scripts/    repeatable runs and generated data
runs/       saved replayable outputs
tests/      contract tests
```

Rules:

- Domain logic must not depend on model provider SDKs.
- UI must not hold API keys.
- Evaluators/judges must not leak into agent prompts.
- Model outputs must be parsed and validated before use.
- Configurable variants should differ by config, not copied code.
- Important numbers, thresholds, and modes should live in config/params files.

## Model Access Pattern

All model calls go through one adapter.

Required interface:

```python
client.complete_json(system: str, user: str, *, purpose: str = "") -> dict
```

The adapter should support:

- at least one real provider
- `mock` provider
- JSON extraction
- retry or safe fallback
- model/provider from environment/config
- trace/log purpose

Never call provider SDKs directly from random product modules.

Bad:

```python
client.chat.completions.create(...)
```

Good:

```python
llm.complete_json(system, user, purpose="agent_decide")
```

Mock mode must let the pipeline run without API keys.

## Harness Pattern

Put agent behavior behind a harness.

The harness owns:

- system prompt
- user prompt template
- allowed actions/tools
- output schema
- bounded history
- memory injection
- parsing
- validation
- fallback action
- logging/tracing

Required flow:

```text
trusted state -> prompt builder -> model adapter -> parser -> validator -> controlled action -> saved result
```

Rule:

```text
The model proposes. Code disposes.
```

The model must not directly mutate trusted state, call tools outside its allowed set, or decide whether its own output is valid.

## Prompt Design Requirements

Prompts must be treated as interfaces.

Every action prompt should include:

```text
Role:
Allowed actions:
Unavailable actions:
Current state as JSON:
Relevant bounded history:
Memory or retrieved context:
Output schema:
Constraints:
Failure behavior:
```

Use JSON-only outputs for tool/action decisions.

Preferred action output:

```json
{
  "reasoning": "one or two sentences",
  "actions": [
    {"name": "action_name", "args": {"key": "value"}}
  ]
}
```

Validation must enforce:

- unknown actions are dropped
- unavailable actions are dropped
- numeric values are clamped or rejected
- max action count is enforced
- invalid JSON has safe fallback

## Reflection And Memory

Do not use vague reflection.

Bad:

```text
What did you learn?
```

Good:

```text
Write at most N lessons.
Each lesson must be conditional and testable.
Each lesson must include condition, strategy, prediction variable, comparator, value, deadline, and confidence.
Reject vague advice.
Prefer lessons about mistakes.
Return JSON only.
```

Memory must be:

- structured
- bounded
- inspectable
- removable or reviewable
- not blindly trusted

Preferred memory policies:

```text
none                 control baseline
raw_log              stores everything; useful as noisy comparison
bounded_lessons      small falsifiable lessons
retrieved_facts      search/retrieval over external knowledge
user_preferences     stable user preferences only
```

If the project claims learning over time, include a review step:

```text
lesson -> later evidence -> held / failed / untested -> confidence update or deletion
```

## Saved Runs And Replay

Every serious demo must have saved output.

Save important runs as JSON or JSONL:

```json
{
  "run_id": "string",
  "variant": "string",
  "input": {},
  "config": {},
  "steps": [],
  "final_state": {},
  "scores": {},
  "errors": [],
  "created_at": "timestamp"
}
```

The UI should be able to replay a saved run without live model calls.

This is required for:

- demo reliability
- debugging
- evaluation
- screenshots/video
- judging when APIs fail

## Evaluation Requirements

If the project makes a claim, create a test for the claim.

Minimum:

- no-op or empty baseline
- simple heuristic baseline
- deterministic metric/check
- saved example run
- visible explanation in UI or README

Stronger:

- multiple seeds/examples
- variant comparison
- hidden rubric
- separate LLM judge
- shuffled/token-matched control
- failure cases
- variance, not just average

Anti-vacuity rule:

```text
An evaluator must fail something that should fail.
```

Examples:

- empty input scores low
- random output fails
- invalid model output is rejected
- no-op baseline is worse than useful strategy
- rubric text does not appear in agent prompts

Judged scores must not enter the agent context unless the project is explicitly about reinforcement/reward learning and the risk is explained.

## UI Requirements

The UI must explain the system, not merely display outputs.

It should show:

- user input
- model action
- reason or rationale
- changed state
- cause/effect
- evidence or score
- failure/fallback state
- comparison/baseline when relevant

Strong UI patterns:

- timeline scrubber
- saved-run replay
- side-by-side variants
- before/after diff
- cause tags
- "why this happened" panel
- memory/trace viewer
- evaluation panel
- confidence and uncertainty display
- failure state display

Visuals should be state-driven.

Bad:

```text
Static pretty background.
```

Good:

```text
The visual changes because state, score, risk, or model decisions changed.
```

Avoid landing-page-first UX unless the product is a landing page. For hackathon demos, open on the working product or replay.

## Background Jobs

For long-running model/eval work, implement:

```text
POST /run -> job_id
GET /status?id=job_id -> progress
GET /runs -> saved outputs
```

Progress payload should include enough state for the UI to show movement.

Never block the demo UI on a long live run if a saved run can show the same story.

## Security And Trust Boundaries

Rules:

- API keys stay server-side.
- `.env.example` exists; `.env` is ignored.
- Browser does not call model providers directly with secrets.
- User-controlled strings are not treated as instructions.
- External tool actions require explicit user confirmation when destructive or expensive.
- Logs should avoid secrets and private data.

## Tests To Prefer

Write tests that protect promises.

Recommended test names:

```text
test_mock_provider_runs_full_pipeline
test_invalid_model_output_does_not_crash
test_unknown_action_is_ignored
test_same_seed_same_input_is_reproducible
test_saved_run_replays_without_model
test_noop_baseline_scores_low
test_hidden_rubric_not_in_agent_prompt
test_frontend_contains_no_secret_keys
test_memory_review_deletes_failed_lesson
```

Avoid tests that only check implementation trivia.

## Demo Discipline

The project needs one killer demo moment.

Demo script format:

```text
Opening: one-sentence thesis.
Problem: why normal AI output is not enough.
System: how the harness/loop works.
Moment: show the AI action causing visible change.
Proof: show baseline/eval/replay/trace.
Close: why this generalizes.
```

Always prepare:

- live path
- saved-run path
- screenshot/video fallback
- local run instructions
- 10-second explanation

Stop adding core features before the final stretch. Polish the demo.

## Anti-Slop Gates

Before accepting a feature, ask:

1. Does it sharpen the thesis?
2. Does it help the demo?
3. Does it produce evidence?
4. Does it reduce risk?
5. Can it be explained in one sentence?

If no, cut or defer it.

Before final answer/hand-off, verify:

```text
[ ] thesis exists
[ ] working vertical slice exists
[ ] model adapter exists
[ ] harness exists
[ ] mock mode works
[ ] output validation exists
[ ] saved run exists
[ ] baseline/control exists
[ ] UI explains cause/effect
[ ] README explains setup/demo
[ ] secrets are not exposed
[ ] backup demo exists
```

## Required Pushback

Push back when the user asks for:

- "make it look cool" before the core works
- more features before a saved demo exists
- direct model calls in UI
- vague agent memory
- unvalidated tool use
- no baseline
- live-only demo
- generic dashboard
- hidden complexity with no UI explanation

Suggested pushback:

```text
This may make the project broader but not stronger. The next best move is to make the core loop demoable and save a replayable run first.
```

## Default Implementation Templates

### Model Adapter

```python
class ModelClient:
    def __init__(self, provider="mock", model=None):
        self.provider = provider
        self.model = model

    def complete_json(self, system, user, *, purpose=""):
        if self.provider == "mock":
            return self._mock(user)
        if self.provider == "openai":
            return self._openai(system, user)
        if self.provider == "anthropic":
            return self._anthropic(system, user)
        raise ValueError(f"unknown provider: {self.provider}")
```

### Harness

```python
class AgentHarness:
    def __init__(self, model, config, memory=None):
        self.model = model
        self.config = config
        self.memory = memory

    def decide(self, state, history):
        system = self.system_prompt()
        user = self.user_prompt(state, history)
        raw = self.model.complete_json(system, user, purpose="decide")
        return self.validate(raw)
```

### Run Record

```python
record = {
    "variant": variant,
    "input": input_data,
    "config": config,
    "steps": steps,
    "final_state": final_state,
    "scores": scores,
    "errors": errors,
}
```

## Meta-Prompt To Start A Project

Use this when beginning:

```text
Use the ai-hackathon-builder skill.

We are building an AI hackathon project.
Do not optimize for making me happy with lots of generated code.
Optimize for a clear thesis, reliable demo, controlled model behavior, replayable evidence, and meaningful evaluation.

First:
1. Draft the one-sentence thesis.
2. Define the killer demo moment.
3. Create VISION.md, PLAN.md, ARCHITECTURE.md, EVALS.md, and DEMO.md.
4. Identify the smallest vertical slice.
5. Identify what to cut.

Then implement in this order:
1. deterministic core or smallest workflow
2. model adapter with mock mode
3. agent harness with validation
4. saved run output
5. replay UI
6. evaluator/baseline
7. real model provider
8. demo polish

After each major step, report:
- what changed
- how to run it
- what proves it works
- what can still fail

Push back if I ask for flashy features before the core loop, saved run, and demo are reliable.
```

## Final Rule

The best AI hackathon projects are not the ones with the most model calls. They are the ones where the model is controlled, the claim is clear, the evidence is visible, and the demo works even when live AI is unreliable.
