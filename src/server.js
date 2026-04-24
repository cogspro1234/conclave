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

const isWindows = process.platform === "win32";
const CODEX_CMD = process.env.CONCLAVE_CODEX_CMD ?? (isWindows ? "codex.cmd" : "codex");
const GEMINI_CMD = process.env.CONCLAVE_GEMINI_CMD ?? (isWindows ? "gemini.cmd" : "gemini");
const TIMEOUT_MS = Number.parseInt(process.env.CONCLAVE_TIMEOUT_MS ?? "300000", 10);

function quoteForCmd(arg) {
  // Wrap every arg in double quotes; escape internal " as \".
  // Sufficient for our flags + literal markers (no user content goes through args — prompts use stdin).
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
      });
    } else {
      proc = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
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

async function askCodex(prompt) {
  return runCli({
    command: CODEX_CMD,
    args: ["exec", "-"],
    stdin: prompt,
  });
}

async function askGemini(prompt) {
  // -p is required to enter non-interactive mode but rejects empty strings ("Not enough arguments following: p"),
  // so pass a one-char placeholder and put the real prompt on stdin (which Gemini appends to -p's value).
  // This keeps multiline / quoted prompts off the command line where they'd require fragile shell escaping.
  return runCli({
    command: GEMINI_CMD,
    args: ["-p", ".", "-o", "text"],
    stdin: prompt,
  });
}

const server = new Server(
  { name: "conclave", version: "0.1.2" },
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
    if (name === "ask_codex") output = await askCodex(args.prompt);
    else if (name === "ask_gemini") output = await askGemini(args.prompt);
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
