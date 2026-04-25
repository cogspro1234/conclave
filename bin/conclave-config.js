#!/usr/bin/env node
// conclave - MCP server for multi-model AI deliberation
// Copyright (C) 2026 Çağan Öncül
// Licensed under GPL-3.0-or-later. See LICENSE.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

const CONFIG_PATH = join(homedir(), ".conclave.json");

const CODEX_PRESETS = [
  { value: "gpt-5.5", label: "gpt-5.5         frontier (requires Plus/Pro)" },
  { value: "gpt-5.4", label: "gpt-5.4         default everyday" },
  { value: "gpt-5.4-mini", label: "gpt-5.4-mini    fast / cheap" },
  { value: "gpt-5.3-codex", label: "gpt-5.3-codex   coding-tuned" },
];

const GEMINI_PRESETS = [
  { value: "gemini-3-pro-preview", label: "gemini-3-pro-preview     requires Gemini Pro subscription" },
  { value: "gemini-3-flash-preview", label: "gemini-3-flash-preview   newest flash" },
  { value: "gemini-2.5-flash", label: "gemini-2.5-flash         stable, free tier" },
  { value: "gemini-2.5-flash-lite", label: "gemini-2.5-flash-lite    smallest, free tier" },
];

// Hand-rolled line reader: readline/promises' question() hangs after the first prompt when stdin
// isn't a TTY (Node 22). Queueing lines from the 'line' event works in both interactive and
// piped modes.
function makeLineReader() {
  const rl = createInterface({ input: process.stdin });
  const queue = [];
  const waiters = [];
  let closed = false;

  rl.on("line", (line) => {
    if (waiters.length) waiters.shift().resolve(line);
    else queue.push(line);
  });
  rl.on("close", () => {
    closed = true;
    while (waiters.length) waiters.shift().resolve(null);
  });

  return {
    next() {
      if (queue.length) return Promise.resolve(queue.shift());
      if (closed) return Promise.resolve(null);
      return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
    },
    close() {
      rl.close();
    },
  };
}

function formatCurrent(value) {
  if (value === undefined) return "";
  if (value === null) return "  [current: (CLI default)]";
  return `  [current: ${value}]`;
}

async function ask(reader, prompt) {
  process.stdout.write(prompt);
  const line = await reader.next();
  return line === null ? "" : line.trim();
}

async function pickModel(reader, label, currentValue, presets) {
  console.log(`\n${label}${formatCurrent(currentValue)}`);
  presets.forEach((p, i) => {
    const marker = p.value === currentValue ? "*" : " ";
    console.log(`  ${marker} ${i + 1}) ${p.label}`);
  });
  console.log(`    ${presets.length + 1}) custom...`);
  console.log(`    ${presets.length + 2}) (none — let CLI pick its own default)`);
  console.log(`    Enter) keep current`);

  const answer = await ask(reader, "> ");

  if (!answer) return currentValue;

  const num = Number.parseInt(answer, 10);
  if (Number.isInteger(num) && String(num) === answer) {
    if (num >= 1 && num <= presets.length) return presets[num - 1].value;
    if (num === presets.length + 1) {
      const custom = await ask(reader, "Model name: ");
      return custom || currentValue;
    }
    if (num === presets.length + 2) return null;
    console.log("Out of range, keeping current.");
    return currentValue;
  }

  return answer;
}

async function main() {
  const existing = existsSync(CONFIG_PATH)
    ? JSON.parse(readFileSync(CONFIG_PATH, "utf8"))
    : {};

  console.log(`conclave-config — set per-tier model defaults

Config file: ${CONFIG_PATH}
${existsSync(CONFIG_PATH) ? "Loaded existing config." : "No config yet — creating one."}

Each prompt offers a preset list. Type a number, type a model name directly,
or press Enter to keep the current value. Picking 'none' lets the CLI choose
its own default for that tier.`);

  const reader = makeLineReader();

  let result;
  try {
    console.log("\n=== Codex ===");
    const codexDefault = await pickModel(reader, "Default model (no tier flag):", existing.codex?.default, CODEX_PRESETS);
    const codexStrong = await pickModel(reader, "--strong tier model:", existing.codex?.strong, CODEX_PRESETS);
    const codexFast = await pickModel(reader, "--fast tier model:", existing.codex?.fast, CODEX_PRESETS);

    console.log("\n=== Gemini ===");
    const geminiDefault = await pickModel(reader, "Default model (no tier flag):", existing.gemini?.default, GEMINI_PRESETS);
    const geminiStrong = await pickModel(reader, "--strong tier model:", existing.gemini?.strong, GEMINI_PRESETS);
    const geminiFast = await pickModel(reader, "--fast tier model:", existing.gemini?.fast, GEMINI_PRESETS);

    result = {
      codex: { default: codexDefault, strong: codexStrong, fast: codexFast },
      gemini: { default: geminiDefault, strong: geminiStrong, fast: geminiFast },
    };
  } finally {
    reader.close();
  }

  writeFileSync(CONFIG_PATH, JSON.stringify(result, null, 2) + "\n", "utf8");

  console.log(`\n✓ Saved to ${CONFIG_PATH}\n`);
  console.log(JSON.stringify(result, null, 2));
  console.log(`
Restart Claude Code so the conclave MCP server reloads the config.
(Re-registration is not needed — the server reads the file on startup.)
`);
}

main().catch((err) => {
  console.error(`conclave-config: ${err.message}`);
  process.exit(1);
});
