#!/usr/bin/env node
// conclave - MCP server for multi-model AI deliberation
// Copyright (C) 2026 Çağan Öncül
// Licensed under GPL-3.0-or-later. See LICENSE.

import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import { resolve, join } from "node:path";

function die(msg) {
  console.error(`conclave-trust: ${msg}`);
  process.exit(1);
}

function usage() {
  console.log(`Usage: conclave-trust <directory>

Adds <directory> to Codex's trust list (~/.codex/config.toml) so the
conclave MCP server can spawn Codex from it without the headless trust
check failing.

Examples:
  conclave-trust ~                  # trust your home directory
  conclave-trust C:\\                # trust the entire C: drive (Windows)
  conclave-trust /home/me/projects  # trust a project root
`);
}

const arg = process.argv[2];
if (!arg || arg === "-h" || arg === "--help") {
  usage();
  process.exit(arg ? 0 : 1);
}

const isWin = platform() === "win32";
const target = resolve(arg.replace(/^~(?=$|\/|\\)/, homedir()));

if (!existsSync(target)) die(`directory does not exist: ${target}`);
if (!statSync(target).isDirectory()) die(`not a directory: ${target}`);

const codexConfigPath = join(homedir(), ".codex", "config.toml");
if (!existsSync(codexConfigPath)) {
  die(`Codex config not found at ${codexConfigPath}. Run \`codex\` once interactively first to create it.`);
}

// Codex stores Windows paths lowercased with backslashes; Unix paths as-is.
const normalized = isWin ? target.toLowerCase() : target;
const sectionHeader = `[projects.'${normalized}']`;

const existing = readFileSync(codexConfigPath, "utf8");

if (existing.includes(sectionHeader)) {
  console.log(`✓ ${target} is already on Codex's trust list. No change made.`);
} else {
  const block = `\n${sectionHeader}\ntrust_level = "trusted"\n`;
  writeFileSync(codexConfigPath, existing + block, "utf8");
  console.log(`✓ Added ${target} to Codex's trust list.`);
}

console.log(`
Next, point conclave at this directory by re-registering with the env var:

  claude mcp remove conclave
  claude mcp add --scope user conclave \\
    -e CONCLAVE_TRUST_DIR=${target} \\
    -- node /absolute/path/to/conclave/src/server.js

Then restart Claude Code so the MCP server picks up the new env.
`);
