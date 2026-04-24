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
import { homedir } from "node:os";

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

async function askCodex(prompt, model) {
  const m = model ?? DEFAULT_CODEX_MODEL;
  const args = ["exec"];
  if (m) args.push("-c", `model="${m}"`);
  args.push("-");
  return runCli({ command: CODEX_CMD, args, stdin: prompt });
}

async function askGemini(prompt, model) {
  // -p is required to enter non-interactive mode but rejects empty strings ("Not enough arguments following: p"),
  // so pass a one-char placeholder and put the real prompt on stdin (Gemini appends stdin to -p's value).
  const m = model ?? DEFAULT_GEMINI_MODEL;
  const args = ["-p", "."];
  if (m) args.push("-m", m);
  args.push("-o", "text");
  return runCli({ command: GEMINI_CMD, args, stdin: prompt });
}

const server = new Server(
  { name: "conclave", version: "0.2.1" },
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
              "Optional. Codex model identifier — passed via Codex's '-c model=\"<value>\"' override. " +
              "Examples: 'gpt-5.5' (frontier), 'gpt-5.4' (default everyday), 'gpt-5.4-mini' (fast/cheap), " +
              "'gpt-5.3-codex' (coding-tuned). Omit to use Codex's own default, or the CONCLAVE_CODEX_MODEL env var if set.",
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
              "Optional. Gemini model identifier — passed via Gemini's '-m <value>' flag. " +
              "Examples: 'gemini-3-flash-preview' (newest full flash), 'gemini-2.5-flash' (stable), " +
              "'gemini-2.5-flash-lite' (smallest). Omit to use Gemini's own default, or the CONCLAVE_GEMINI_MODEL env var if set.",
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
    if (name === "ask_codex") output = await askCodex(args.prompt, args.model);
    else if (name === "ask_gemini") output = await askGemini(args.prompt, args.model);
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
