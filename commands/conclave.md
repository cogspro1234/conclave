---
description: Send a topic to the conclave (Codex + Gemini) for multi-model deliberation
argument-hint: [--strong | --fast] <topic>
---

The user invoked the conclave on:

$ARGUMENTS

**Parse $ARGUMENTS for an optional tier flag at the very start:**

- `--strong` (or natural-language equivalents like "en güçlü", "strongest", "kritik karar", "best models") → pass `model: "gpt-5.5"` to `ask_codex` and `model: "gemini-3-flash-preview"` to `ask_gemini`
- `--fast` (or "hızlı", "fast", "quickly", "ucuz", "cheap") → pass `model: "gpt-5.4-mini"` to `ask_codex` and `model: "gemini-2.5-flash-lite"` to `ask_gemini`
- no flag → omit the `model` parameter entirely, let each CLI use its default

Strip the flag/intent words from the topic before sending the question to the council members.

---

Convene the conclave — your council of Codex and Gemini, reachable via the `mcp__conclave__ask_codex` and `mcp__conclave__ask_gemini` tools.

**Round 1 — initial positions (parallel):**
Send the topic to both `ask_codex` and `ask_gemini` simultaneously. Frame the prompt clearly: state the question, give any context the user provided, and ask each for their reasoned position with the strongest argument behind it. Each tool call is stateless, so include all needed context in the prompt itself.

**Round 2 — rebuttal:**
Read both responses. Then send each model a faithful paraphrase of the other's position and ask: where do you agree, where do you disagree, and does anything in their argument make you update your view? If the two essentially agreed in round 1, you can skip this round and say so.

**Synthesis — your verdict:**
Write the final answer in the user's language (match the language of the topic). Structure:
- **Verdict:** your recommendation in one or two sentences
- **Where they agreed:** the convergent points
- **Where they disagreed:** the genuine tensions, not smoothed over
- **Why you landed here:** your own reasoning, informed by both but not just averaging them

Do not parrot the models — your job is judgment, not transcription.
