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

The full setup is seven steps. Most of them are one-liners.

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

### 3. Clone and install conclave

```bash
git clone https://github.com/cogspro1234/conclave.git
cd conclave
npm install
```

This pulls down the MCP SDK and ~90 transitive deps (~10 seconds).

### 4. Register the MCP server with Claude Code

Use the **absolute path** to `src/server.js` and `--scope user` so it works from every project:

**macOS / Linux:**

```bash
claude mcp add --scope user conclave -- node "$(pwd)/src/server.js"
```

**Windows (Git Bash):**

```bash
claude mcp add --scope user conclave -- node "$(pwd -W)/src/server.js"
```

**Windows (PowerShell):**

```powershell
claude mcp add --scope user conclave -- node "$((Get-Location).Path -replace '\\','/')/src/server.js"
```

If you skip `--scope user`, the server is only visible inside the `conclave/` directory.

### 5. Install the `/conclave` slash command

The slash command file is bundled at [`commands/conclave.md`](./commands/conclave.md). Copy it to Claude Code's user-scope commands folder so it's available in every project:

**macOS / Linux:**

```bash
mkdir -p ~/.claude/commands
cp commands/conclave.md ~/.claude/commands/
```

**Windows (Git Bash):**

```bash
mkdir -p "$USERPROFILE/.claude/commands"
cp commands/conclave.md "$USERPROFILE/.claude/commands/"
```

**Windows (PowerShell):**

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.claude\commands" | Out-Null
Copy-Item commands\conclave.md "$env:USERPROFILE\.claude\commands\"
```

### 6. Restart Claude Code

MCP servers and slash commands are loaded at session start. Quit any running Claude Code session and start a new one.

### 7. Verify

Inside Claude Code, run:

```bash
claude mcp list
```

You should see:

```
conclave: node /…/conclave/src/server.js - ✓ Connected
```

Then try the slash command:

```
/conclave say hello in one short sentence
```

Claude should call both Codex and Gemini, get a one-line greeting from each, and synthesize. If you see two distinct voices in the synthesis, you're done.

## Usage

The recommended way is the `/conclave` slash command:

```
/conclave should we use Postgres or SQLite for this side project?
```

Claude will call `ask_codex` and `ask_gemini` in parallel, paraphrase each response back to the other model for a rebuttal round, then synthesize a final answer that surfaces real disagreements rather than papering over them.

Claude may also invoke the conclave when "conclave" comes up naturally in conversation (e.g. "let's take this to the conclave") — the slash command is just the explicit, documented entry point.

## Configuration

Optional environment variables:

| Variable                 | Default                                  | Purpose                                              |
| ------------------------ | ---------------------------------------- | ---------------------------------------------------- |
| `CONCLAVE_CODEX_CMD`     | `codex.cmd` on Windows, `codex` else     | Path/name of the Codex CLI binary.                   |
| `CONCLAVE_GEMINI_CMD`    | `gemini.cmd` on Windows, `gemini` else   | Path/name of the Gemini CLI binary.                  |
| `CONCLAVE_TIMEOUT_MS`    | `300000` (5 min)                         | Per-call timeout. Long deliberations may need more.  |

Set them in the MCP server entry. Example (`claude mcp add` supports `-e`):

```bash
claude mcp add --scope user conclave \
  -e CONCLAVE_TIMEOUT_MS=600000 \
  -- node "/abs/path/to/conclave/src/server.js"
```

## Tools

### `ask_codex`

Forwards a prompt to `codex exec -` (stdin mode). Returns the CLI's stdout.

### `ask_gemini`

Forwards a prompt to `gemini -p <prompt> -o text`. Returns the CLI's stdout.

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
