---
description: Multi-model deliberation — Claude + Codex + Gemini, then a synthesized verdict
argument-hint: [--strong | --fast] [--silent] [--rounds N] [--without-codex | --without-gemini] <topic>
---

The user invoked the conclave on:

$ARGUMENTS

**Parse $ARGUMENTS for flags at the start (any order, may repeat):**

- `--strong` (or "en güçlü", "strongest", "kritik karar", "best models") → pass `tier: "strong"` to both `ask_codex` and `ask_gemini`
- `--fast` (or "hızlı", "fast", "quickly", "ucuz", "cheap") → pass `tier: "fast"` to both `ask_codex` and `ask_gemini`
- `--silent` (or "sessiz", "sus", "kararı doğrudan ver", "no narration") → suppress all interim narration. Don't write your own initial position, don't paraphrase out loud between rounds, don't comment on the deliberation. Do everything internally and emit only the final synthesis at the end. The tool calls themselves will still be visible in the UI but you stay silent between them.
- `--rounds N` (or "N round", "N tur") where N is 1, 2, or 3 → control how many deliberation rounds to run. Default is 2 (initial positions + rebuttal). N=1 skips the rebuttal — initial positions only, then synthesize. N=3 adds a third round where each remaining voice sees the rebuttal results and gives its final position. Treat invalid/missing N as 2.
- `--without-codex` (or "Codex'siz", "no codex", "without openai") → don't call `ask_codex`. Run as a 2-way deliberation: Claude + Gemini.
- `--without-gemini` (or "Gemini'siz", "no gemini", "without google") → don't call `ask_gemini`. Run as a 2-way deliberation: Claude + Codex.
- both `--without-codex` AND `--without-gemini` is incoherent (only Claude left, no council to convene) → tell the user that briefly and stop.
- no tier flag → omit both `tier` and `model`, let the server pick its configured default

The actual model strings behind `tier: "strong"` / `tier: "fast"` come from the user's `~/.conclave.json` (set via `/conclave:config` or `npx conclave-config`), with built-in fallbacks if absent. Don't hardcode model names here.

Strip the flag/intent words from the topic before sending it to the council members.

---

This is a deliberation with you (Claude) plus the council members the user hasn't opted out of. By default the council is Codex and Gemini. You are a participant with your own view, not just a moderator. Use `mcp__conclave__ask_codex` and `mcp__conclave__ask_gemini` for the other voices (skip whichever was opted out).

**Round 1 — initial positions (parallel):**
Unless `--silent`, write your own honest initial position on the topic in 1-3 sentences before any tool calls. Don't hedge — commit to a take. Then call the active council members in parallel. Frame each prompt clearly: state the question, include any context the user gave, and ask for a reasoned position with the strongest argument behind it. Each tool call is stateless, so include all needed context in the prompt itself.

**Handling council failures (any round):**
If a tool call comes back with `isError: true` or text starting with `Error:` (auth expired, quota hit, timeout, network), treat that voice as **dropped for the rest of the deliberation**. Don't retry. Continue with whoever is still reachable. If only Claude remains after dropouts, just answer the question directly and tell the user the council was unreachable. Don't pretend a missing voice agreed or disagreed.

**Round 2 — rebuttal (skip if `--rounds 1`, or if only one council voice spoke in round 1):**
Read the responses from voices that did reply. Send each remaining model a faithful paraphrase of *the other voices' positions* (yours + the other model's, minus any that dropped) and ask: where do you agree, where do you disagree, does anything in those arguments make you update your view? Unless `--silent`, revise your own position out loud — say if a model's argument shifted you, or note that you're holding firm and why.

If all remaining voices essentially agreed in round 1, skip round 2 and (unless `--silent`) say so before synthesizing.

**Round 3 — final positions (only if `--rounds 3` and ≥2 voices remain):**
Send each remaining model a faithful paraphrase of the round-2 results and ask for its final position now that it's heard everyone. Same dropout handling. Unless `--silent`, give your own final position too.

**Synthesis — final verdict:**
Write the final answer in the user's language (match the language of the topic). Structure:
- **Verdict:** your recommendation in one or two sentences — informed by the deliberation, not a vote-average
- **Where the council agreed:** convergent points across the voices that participated (skip any that dropped out)
- **Where you disagreed:** the genuine tensions, not smoothed over — name who held which view
- **Why you landed here:** your own reasoning, citing what shifted you (or what didn't)
- **Council status:** if anyone dropped out or was opted out, mention it briefly so the user knows the synthesis is partial

Don't parrot the models; your job is judgment.
