---
description: Three-way deliberation — Claude + Codex + Gemini, then a synthesized verdict
argument-hint: [--strong | --fast] [--silent] <topic>
---

The user invoked the conclave on:

$ARGUMENTS

**Parse $ARGUMENTS for flags at the start (any order, may repeat):**

- `--strong` (or "en güçlü", "strongest", "kritik karar", "best models") → pass `model: "gpt-5.5"` to `ask_codex` and `model: "gemini-3-flash-preview"` to `ask_gemini`
- `--fast` (or "hızlı", "fast", "quickly", "ucuz", "cheap") → pass `model: "gpt-5.4-mini"` to `ask_codex` and `model: "gemini-2.5-flash-lite"` to `ask_gemini`
- `--silent` (or "sessiz", "sus", "kararı doğrudan ver", "no narration") → suppress all interim narration. Don't write your own initial position, don't paraphrase out loud between rounds, don't comment on the deliberation. Do everything internally and emit only the final synthesis at the end. The tool calls themselves will still be visible in the UI but you stay silent between them.
- no tier flag → omit the `model` parameter, let each CLI use its default

Strip the flag/intent words from the topic before sending it to the council members.

---

This is a **three-way deliberation**: you (Claude), Codex, and Gemini. You are a participant with your own view, not just a moderator. Use `mcp__conclave__ask_codex` and `mcp__conclave__ask_gemini` for the other two voices.

**Round 1 — initial positions (parallel):**
Unless `--silent`, write your own honest initial position on the topic in 1-3 sentences before any tool calls. Don't hedge — commit to a take. Then call `ask_codex` and `ask_gemini` in parallel. Frame each prompt clearly: state the question, include any context the user gave, and ask for a reasoned position with the strongest argument behind it. Each tool call is stateless, so include all needed context in the prompt itself.

**Round 2 — rebuttal:**
Read both responses. Send each model a faithful paraphrase of *the other two positions* (yours + the other model's) and ask: where do you agree, where do you disagree, does anything in those arguments make you update your view? Unless `--silent`, also revise your own position out loud — say if Codex or Gemini's argument shifted you, or note that you're holding firm and why.

If all three essentially agreed in round 1, skip round 2 and (unless `--silent`) say so before synthesizing.

**Synthesis — final verdict:**
Write the final answer in the user's language (match the language of the topic). Structure:
- **Verdict:** your recommendation in one or two sentences — informed by the deliberation, not a vote-average
- **Where the three agreed:** convergent points across all three voices (you, Codex, Gemini)
- **Where you disagreed:** the genuine tensions, not smoothed over — name who held which view
- **Why you landed here:** your own reasoning, citing what shifted you (or what didn't)

Three voices, not two with a moderator — surface yours alongside the other two. Don't parrot the models; your job is judgment.
