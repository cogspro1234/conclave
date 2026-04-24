# conclave

> A small MCP server that lets one AI orchestrate a council of others. Claude convenes Codex and Gemini via their CLIs, asks them, paraphrases responses back into the discussion, and pushes toward consensus — like cardinals in a papal conclave deliberating until white smoke.

```
   you
    ↓
   Claude  (orchestrator)
    ├── ask_codex   → spawns `codex` CLI
    └── ask_gemini  → spawns `gemini` CLI
```

## Why

You probably have ChatGPT Plus and Gemini Pro subscriptions sitting around. Their CLIs already authenticate against your account. Why pay for separate API keys to hear what they think?

`conclave` is a thin MCP (Model Context Protocol) server that exposes each CLI as a tool. Plug it into Claude Code (or any MCP client) and the orchestrator can poll the council, paraphrase responses, run multiple rounds of deliberation, and synthesize a final answer.

## Prerequisites

Before you start, make sure you have:

- **Node.js ≥ 18** — [nodejs.org](https://nodejs.org/) (LTS is fine).
- **An OpenAI account** with access to the Codex CLI (any ChatGPT plan that supports Codex login).
- **A Google account** with access to the Gemini CLI (a free Google account works; paid Gemini plans get higher limits).
- **[Claude Code](https://claude.com/claude-code)** installed and working (`claude --version` should print a version).
- **Git**, for cloning the repo.

> **Platform support:** Developed and tested on Windows. The server is written to be cross-platform and *should* work on macOS and Linux, but those haven't been runtime-tested yet. If you hit a snag, please [open an issue](https://github.com/cogspro1234/conclave/issues).

## Installation

### 1. Install the Codex CLI and log in

```bash
npm install -g @openai/codex
codex
```

The first run opens a browser to log in with your OpenAI account. Sign in, close the tab when done, and exit `codex` (`Ctrl+C` or type `/exit`). Verify:

```bash
codex --version
```

### 2. Install the Gemini CLI and log in

```bash
npm install -g @google/gemini-cli
gemini
```

Same idea: first run prompts a browser login with your Google account. Sign in, exit, verify:

```bash
gemini --version
```

### 3. Install the conclave plugin

Since v0.5.0 conclave is a Claude Code plugin — the MCP server, slash command, and helpers all install in one shot:

```bash
claude plugin add github:cogspro1234/conclave
```

Then restart Claude Code so the MCP server and slash command load.

### 4. Verify

Inside Claude Code:

```bash
claude mcp list
```

You should see `conclave: ✓ Connected`. Then try the slash command:

```
/conclave say hello in one short sentence
```

Claude commits to its own initial position, calls Codex and Gemini in parallel, runs a rebuttal round, and synthesizes a verdict. If you see three distinct voices in the synthesis, you're done.

### Manual install (advanced / pre-v0.5.0)

If you don't want to use Claude Code's plugin system — or you're on a version of Claude Code without it — clone the repo and wire the components manually:

<details>
<summary>Click to expand manual install instructions</summary>

```bash
git clone https://github.com/cogspro1234/conclave.git
cd conclave
npm install
```

Register the MCP server (use `--scope user` so it works from every project):

```bash
# macOS / Linux
claude mcp add --scope user conclave -- node "$(pwd)/src/server.js"

# Windows (Git Bash)
claude mcp add --scope user conclave -- node "$(pwd -W)/src/server.js"

# Windows (PowerShell)
claude mcp add --scope user conclave -- node "$((Get-Location).Path -replace '\\','/')/src/server.js"
```

Copy the slash command into user scope:

```bash
# macOS / Linux
mkdir -p ~/.claude/commands && cp commands/conclave.md ~/.claude/commands/

# Windows (Git Bash)
mkdir -p "$USERPROFILE/.claude/commands" && cp commands/conclave.md "$USERPROFILE/.claude/commands/"

# Windows (PowerShell)
New-Item -ItemType Directory -Force "$env:USERPROFILE\.claude\commands" | Out-Null; Copy-Item commands\conclave.md "$env:USERPROFILE\.claude\commands\"
```

Restart Claude Code, then run `claude mcp list` to verify.

</details>

## Usage

The recommended way is the `/conclave` slash command:

```
/conclave should we use Postgres or SQLite for this side project?
```

Claude will call `ask_codex` and `ask_gemini` in parallel, paraphrase each response back to the other model for a rebuttal round, then synthesize a final answer that surfaces real disagreements rather than papering over them.

Claude may also invoke the conclave when "conclave" comes up naturally in conversation (e.g. "let's take this to the conclave") — the slash command is just the explicit, documented entry point.

### Three voices, not two

Since v0.4.0, the conclave is genuinely **three-way** — Claude (the orchestrator) commits to its own initial position, then deliberates alongside Codex and Gemini, revising as it hears them out. The synthesis names who held which view rather than presenting a moderator's verdict from above.

### Flags

You can prefix the topic with optional flags (any order, can combine):

```
/conclave --strong is this caching strategy correct?
/conclave --fast quick sanity check on this regex
/conclave --silent should we drop SQLite for Postgres
/conclave --strong --silent fundamental architecture call: monolith or services
/conclave just deliberate normally on whether to add a CI step
```

| Flag        | Effect                                                                        |
| ----------- | ----------------------------------------------------------------------------- |
| `--strong`  | Codex `gpt-5.5`, Gemini `gemini-3-flash-preview` — high-stakes calls.         |
| `--fast`    | Codex `gpt-5.4-mini`, Gemini `gemini-2.5-flash-lite` — quick sanity checks.   |
| `--silent`  | Suppress all interim narration. Tool calls still happen; you only see the final verdict. |
| _(none)_    | Each CLI's default model, full deliberation transcript shown.                 |

Natural-language phrasing works too — `/conclave en güçlü modellerle: ...`, `/conclave hızlı bir check: ...`, `/conclave kararı doğrudan ver: ...`.

The exact model strings above are baked into the slash command's body. To change them, edit `~/.claude/commands/conclave.md` after install. To pin a different default at the MCP-server level (so even calls with no flag use a specific model), see the `CONCLAVE_CODEX_MODEL` / `CONCLAVE_GEMINI_MODEL` env vars in [Configuration](#configuration).

## Configuration

Optional environment variables:

| Variable                 | Default                                  | Purpose                                              |
| ------------------------ | ---------------------------------------- | ---------------------------------------------------- |
| `CONCLAVE_CODEX_CMD`     | `codex.cmd` on Windows, `codex` else     | Path/name of the Codex CLI binary.                   |
| `CONCLAVE_GEMINI_CMD`    | `gemini.cmd` on Windows, `gemini` else   | Path/name of the Gemini CLI binary.                  |
| `CONCLAVE_TIMEOUT_MS`    | `300000` (5 min)                         | Per-call timeout. Long deliberations may need more.  |
| `CONCLAVE_CODEX_MODEL`   | _(unset → CLI default)_                  | Default Codex model when the tool is called without `model`. Per-call `model` arg still wins. |
| `CONCLAVE_GEMINI_MODEL`  | _(unset → CLI default)_                  | Default Gemini model when the tool is called without `model`. Per-call `model` arg still wins. |
| `CONCLAVE_TRUST_DIR`     | user's home directory (`~`)              | Working directory for spawned CLIs. Codex refuses to start in untrusted dirs; this should point at a directory you've already trusted via `codex` (run `cd ~/<dir> && codex` once and accept the trust prompt). |

Set them in the MCP server entry. Example (`claude mcp add` supports `-e`):

```bash
claude mcp add --scope user conclave \
  -e CONCLAVE_TIMEOUT_MS=600000 \
  -- node "/abs/path/to/conclave/src/server.js"
```

## Tools

### `ask_codex(prompt, model?)`

Forwards a prompt to `codex exec -` (stdin mode). Returns the CLI's stdout.

If `model` is provided, the server adds `-c model="<value>"` to override Codex's default. Otherwise it falls back to the `CONCLAVE_CODEX_MODEL` env var, then to whatever Codex itself defaults to.

### `ask_gemini(prompt, model?)`

Forwards a prompt to `gemini -p . -o text` with the prompt piped on stdin. Returns the CLI's stdout.

If `model` is provided, the server adds `-m <value>`. Otherwise it falls back to `CONCLAVE_GEMINI_MODEL`, then to Gemini's default.

Both tools are stateless — each call is a fresh session. The orchestrator must pass any conversation history in the prompt itself.

## Troubleshooting

**`command not found: codex` (or `gemini`)**
The npm global bin directory isn't on your `PATH`. Run `npm config get prefix` to find it; on Windows that's usually `%APPDATA%\npm`. Add it to `PATH` and restart your shell.

**`claude mcp list` shows `conclave: ✗ Failed to connect`**
Run the server manually to see the error:

```bash
node /abs/path/to/conclave/src/server.js < /dev/null
```

It should exit cleanly with no output. If it crashes, the stack trace will tell you what's wrong (usually a missing `node_modules` from skipping `npm install`, or a Node version below 18).

**`/conclave` doesn't show up in the slash-command picker**
You forgot to restart Claude Code after copying the command file, or you copied it to the wrong directory. The exact path must be `~/.claude/commands/conclave.md` (user scope) — not inside a project's `.claude/commands/`.

**Tool call fails with "Codex/Gemini timed out"**
Long deliberations can exceed the 5-minute default. Bump `CONCLAVE_TIMEOUT_MS` (see [Configuration](#configuration)).

**Codex or Gemini asks to re-authenticate**
Their session tokens expired. Run `codex` or `gemini` once interactively to refresh, then retry the conclave.

**Codex errors with "directory is not trusted" / "Not inside a trusted directory"**
Conclave passes `--skip-git-repo-check` to Codex by default (since v0.3.1), so this should not normally happen. If you're still seeing it, your Codex version may have stricter trust enforcement. Use the bundled helper to mark a directory as trusted:

```bash
npx conclave-trust ~                # trust your home directory
npx conclave-trust C:\              # trust the entire C: drive (Windows)
npx conclave-trust /your/preferred/dir
```

It writes a `[projects.'<dir>']` entry into `~/.codex/config.toml` and prints the exact `claude mcp add` line that sets `CONCLAVE_TRUST_DIR` for you. Re-register conclave with that command and restart Claude Code.

**Gemini errors with `Please set an Auth method in your ~/.gemini/settings.json`**
You launched `gemini` once but quit before picking an auth method, so headless mode has nothing to use. Run `gemini` interactively again, choose **"Login with Google"** (or whichever auth applies to your account) on the first prompt, complete the browser flow, and let it land on the chat screen — that step writes `~/.gemini/settings.json`. Exit (`Ctrl+C` or `/exit`) and retry the conclave.

**"Rate limit exceeded" from Codex or Gemini**
You've hit your subscription's per-window quota. Wait it out or upgrade the plan. Conclave deliberations are 2× more expensive than a normal chat (one call per model per round), so they burn quota faster than you'd expect.

**Windows: `EINVAL` or `spawn codex ENOENT`**
Node's `spawn` on Windows needs the `.cmd` extension for npm-installed shims. The server already handles this, but if you've installed Codex/Gemini in a non-standard way, override with `CONCLAVE_CODEX_CMD` / `CONCLAVE_GEMINI_CMD` pointing at the full path.

## Limitations

- Subscription CLIs may apply rate limits. A long deliberation can burn through them quickly.
- The CLIs may emit non-prompt output (status lines, ANSI codes). Most of this is filtered by `-o text` for Gemini; Codex output is passed through as-is.
- This is a stdio MCP server — it inherits Claude Code's lifecycle. If Claude Code dies, so does the server.
- Each tool call is stateless. Multi-round deliberation works because the *orchestrator* (Claude) keeps state, not the council members.

## License

GNU General Public License v3.0 or later — see [LICENSE](./LICENSE).

Copyright © 2026 Çağan Öncül.
