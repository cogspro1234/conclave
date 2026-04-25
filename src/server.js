#!/usr/bin/env node
// conclave - MCP server for multi-model AI deliberation
// Copyright (C) 2026 Çağan Öncül
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const isWindows = process.platform === "win32";
const CODEX_CMD = process.env.CONCLAVE_CODEX_CMD ?? (isWindows ? "codex.cmd" : "codex");
const GEMINI_CMD = process.env.CONCLAVE_GEMINI_CMD ?? (isWindows ? "gemini.cmd" : "gemini");
const TIMEOUT_MS = Number.parseInt(process.env.CONCLAVE_TIMEOUT_MS ?? "300000", 10);
const DEFAULT_CODEX_MODEL = process.env.CONCLAVE_CODEX_MODEL ?? null;
const DEFAULT_GEMINI_MODEL = process.env.CONCLAVE_GEMINI_MODEL ?? null;
// Codex refuses to start in a directory that isn't on its trust list. The MCP server inherits
// cwd from Claude Code, which can be any project. Force a stable, predictable cwd that the user
// can trust once.
const TRUST_DIR = process.env.CONCLAVE_TRUST_DIR ?? homedir();

// User config: ~/.conclave.json, written by `conclave-config`. Per-tier model picks live here so
// users can adjust defaults without touching env vars. Read once at startup; restart Claude Code
// to reload.
const CONFIG_PATH = join(homedir(), ".conclave.json");
let userConfig = {};
if (existsSync(CONFIG_PATH)) {
  try {
    userConfig = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch (err) {
    console.error(`conclave: ignoring malformed ${CONFIG_PATH}: ${err.message}`);
  }
}

// Hardcoded last-resort tier mappings, used only if the user has no ~/.conclave.json entry for
// the requested tier. Conservative picks that should work across most subscriptions.
const FALLBACK_TIERS = {
  codex: { strong: "gpt-5.5", fast: "gpt-5.4-mini" },
  gemini: { strong: "gemini-3-flash-preview", fast: "gemini-2.5-flash-lite" },
};

function resolveModel(provider, { model, tier }) {
  if (model) return model;
  const cfg = userConfig[provider] ?? {};
  if (tier && tier !== "default") {
    if (cfg[tier] !== undefined) return cfg[tier];
    return FALLBACK_TIERS[provider]?.[tier] ?? null;
  }
  if (cfg.default !== undefined) return cfg.default;
  return provider === "codex" ? DEFAULT_CODEX_MODEL : DEFAULT_GEMINI_MODEL;
}

function quoteForCmd(arg) {
  // Wrap every arg in double quotes; escape internal " as \".
  // Sufficient for our flags + literal markers (prompts use stdin, never the command line).
  return `"${String(arg).replace(/"/g, '\\"')}"`;
}

function runCli({ command, args, stdin }) {
  return new Promise((resolve, reject) => {
    let proc;
    if (isWindows) {
      // Node ≥ 18.20.2 / 20.12.2 blocks spawning .cmd/.bat shims directly (CVE-2024-27980).
      // Wrap in cmd.exe ourselves and pass the assembled command line verbatim.
      const cmdLine = [command, ...args.map(quoteForCmd)].join(" ");
      proc = spawn("cmd.exe", ["/d", "/s", "/c", cmdLine], {
        stdio: ["pipe", "pipe", "pipe"],
        windowsVerbatimArguments: true,
        cwd: TRUST_DIR,
      });
    } else {
      proc = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], cwd: TRUST_DIR });
    }

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`${command} timed out after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn ${command}: ${err.message}. Is it installed and on PATH?`));
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`${command} exited with code ${code}. stderr: ${stderr.trim() || "(empty)"}`));
      }
    });

    if (stdin !== undefined) proc.stdin.write(stdin);
    proc.stdin.end();
  });
}

async function askCodex(prompt, model, tier) {
  const m = resolveModel("codex", { model, tier });
  // --skip-git-repo-check: codex exec otherwise requires the cwd to be a git repo (or a
  // pre-trusted dir, but headless mode appears to ignore the trust list anyway). The conclave
  // never has Codex touch files, so the git-repo guard is pure friction here.
  const args = ["exec", "--skip-git-repo-check"];
  if (m) args.push("-c", `model="${m}"`);
  args.push("-");
  return runCli({ command: CODEX_CMD, args, stdin: prompt });
}

async function askGemini(prompt, model, tier) {
  // -p is required to enter non-interactive mode but rejects empty strings ("Not enough arguments following: p"),
  // so pass a one-char placeholder and put the real prompt on stdin (Gemini appends stdin to -p's value).
  // --skip-trust trusts the current workspace for the session, mirroring askCodex's --skip-git-repo-check.
  const m = resolveModel("gemini", { model, tier });
  const args = ["-p", ".", "--skip-trust"];
  if (m) args.push("-m", m);
  args.push("-o", "text");
  return runCli({ command: GEMINI_CMD, args, stdin: prompt });
}

const server = new Server(
  { name: "conclave", version: "0.6.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "ask_codex",
      description:
        "Send a prompt to OpenAI's Codex CLI (using the user's logged-in ChatGPT session) and return the response. " +
        "Use this to gather Codex's perspective during multi-model deliberation. " +
        "Codex has no memory across calls — include all needed context in each prompt.",
      inputSchema: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "The full prompt for Codex, including any context from prior rounds of deliberation.",
          },
          model: {
            type: "string",
            description:
              "Optional. Explicit Codex model identifier — overrides any tier/config setting. " +
              "Passed via Codex's '-c model=\"<value>\"' override. Examples: 'gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex'.",
          },
          tier: {
            type: "string",
            enum: ["default", "strong", "fast"],
            description:
              "Optional. Tier alias — server resolves to a model via ~/.conclave.json (run `npx conclave-config` to set), " +
              "falling back to built-in picks if unset. 'strong' = highest quality, 'fast' = cheapest. " +
              "Ignored if 'model' is also passed.",
          },
        },
        required: ["prompt"],
      },
    },
    {
      name: "ask_gemini",
      description:
        "Send a prompt to Google's Gemini CLI (using the user's logged-in Gemini session) and return the response. " +
        "Use this to gather Gemini's perspective during multi-model deliberation. " +
        "Gemini has no memory across calls — include all needed context in each prompt.",
      inputSchema: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "The full prompt for Gemini, including any context from prior rounds of deliberation.",
          },
          model: {
            type: "string",
            description:
              "Optional. Explicit Gemini model identifier — overrides any tier/config setting. " +
              "Passed via Gemini's '-m <value>' flag. Examples: 'gemini-3-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'.",
          },
          tier: {
            type: "string",
            enum: ["default", "strong", "fast"],
            description:
              "Optional. Tier alias — server resolves to a model via ~/.conclave.json (run `npx conclave-config` to set), " +
              "falling back to built-in picks if unset. 'strong' = highest quality, 'fast' = cheapest. " +
              "Ignored if 'model' is also passed.",
          },
        },
        required: ["prompt"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    let output;
    if (name === "ask_codex") output = await askCodex(args.prompt, args.model, args.tier);
    else if (name === "ask_gemini") output = await askGemini(args.prompt, args.model, args.tier);
    else throw new Error(`Unknown tool: ${name}`);
    return { content: [{ type: "text", text: output }] };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
