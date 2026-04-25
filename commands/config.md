---
description: Configure conclave's per-tier model defaults via an interactive picker
---

Walk the user through configuring `~/.conclave.json` — which model the conclave uses for the no-flag default, `--strong`, and `--fast` tiers, for both Codex and Gemini.

**1. Read the current config.**
Read `~/.conclave.json` (use the Read tool). If it doesn't exist, treat the current state as empty `{}` — don't surface the file-not-found error to the user, just note "no config yet" if it's their first time.

**2. Ask the user to pick Codex models** in one `AskUserQuestion` call with these three questions. For each question, mention the existing value in the question text if one is set (e.g. "Codex default model? (current: gpt-5.4)").

Question 1 — header `"Codex def"`, multiSelect: false, options:
- `gpt-5.4 (Recommended)` — Default everyday model
- `gpt-5.5` — Frontier (requires Plus/Pro)
- `gpt-5.4-mini` — Fast / cheap
- `(none)` — Let Codex CLI pick its own default

Question 2 — header `"Codex strong"`, multiSelect: false, options:
- `gpt-5.5 (Recommended)` — Frontier (requires Plus/Pro)
- `gpt-5.4` — Default everyday
- `gpt-5.3-codex` — Coding-tuned
- `(none)` — Let Codex CLI pick its own default

Question 3 — header `"Codex fast"`, multiSelect: false, options:
- `gpt-5.4-mini (Recommended)` — Fast / cheap
- `gpt-5.4` — Default everyday
- `gpt-5.3-codex` — Coding-tuned
- `(none)` — Let Codex CLI pick its own default

**3. Ask the user to pick Gemini models** in a second `AskUserQuestion` call.

Question 1 — header `"Gem def"`, multiSelect: false, options:
- `gemini-2.5-flash (Recommended)` — Stable, free tier
- `gemini-3-flash-preview` — Newest flash
- `gemini-3-pro-preview` — Requires Gemini Pro subscription
- `(none)` — Let Gemini CLI pick its own default

Question 2 — header `"Gem strong"`, multiSelect: false, options:
- `gemini-3-flash-preview (Recommended)` — Newest flash
- `gemini-3-pro-preview` — Requires Gemini Pro subscription
- `gemini-2.5-flash` — Stable, free tier
- `(none)` — Let Gemini CLI pick its own default

Question 3 — header `"Gem fast"`, multiSelect: false, options:
- `gemini-2.5-flash-lite (Recommended)` — Smallest, free tier
- `gemini-2.5-flash` — Stable, free tier
- `gemini-3-flash-preview` — Newest flash
- `(none)` — Let Gemini CLI pick its own default

**4. Map answers to config values.** For each answer:
- If the label is a model name (strip the trailing ` (Recommended)` if present) → use that model name as the string value
- If the label is `(none)` → use `null` (the JSON null, not the string "null")
- If the user picked "Other" and typed a custom string → use that string verbatim

**5. Write `~/.conclave.json`.** Use the Write tool with exactly this shape:

```json
{
  "codex":  { "default": "...", "strong": "...", "fast": "..." },
  "gemini": { "default": "...", "strong": "...", "fast": "..." }
}
```

**6. Confirm.** Show the final JSON to the user and remind them: the conclave MCP server reads `~/.conclave.json` once at startup, so they need to **restart Claude Code** for the change to take effect. No re-registration is needed — the file is picked up automatically on the next launch.
