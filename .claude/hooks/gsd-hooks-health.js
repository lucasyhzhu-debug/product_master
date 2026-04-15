#!/usr/bin/env node
/**
 * SessionStart hook: validates that all hooks in settings.json reference
 * existing files or installed commands. Flags broken hooks immediately.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const settingsPath = path.join(__dirname, "..", "settings.json");

function checkCommandExists(cmd) {
  try {
    execSync(`which ${cmd} 2>/dev/null || where ${cmd} 2>NUL`, {
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

function checkFileRef(command, projectRoot) {
  // Extract file paths from common patterns
  const patterns = [
    /^node\s+(.+?)(?:\s|$)/, // node path/to/file.js
    /^bash\s+(.+?)(?:\s|$)/, // bash path/to/file.sh
    /^(?:\.[\\/])?(\.claude[\\/].+\.sh)/, // .claude\hooks\something.sh
  ];

  for (const pattern of patterns) {
    const match = command.match(pattern);
    if (match) {
      const filePath = match[1].trim();
      const abs = path.isAbsolute(filePath)
        ? filePath
        : path.join(projectRoot, filePath.replace(/\\/g, "/"));
      if (!fs.existsSync(abs)) {
        return { missing: true, file: filePath };
      }
      return { missing: false };
    }
  }

  // Bare command (not a file path) — check if it's installed
  const bare = command.split(/\s/)[0];
  // Skip shell builtins and inline scripts
  if (["[", "true", "echo", "test", "if"].includes(bare) || bare.startsWith("[")) {
    return { missing: false };
  }
  // Only flag known problematic commands, not every bare command
  const knownBroken = ["caliber"];
  if (knownBroken.includes(bare) && !checkCommandExists(bare)) {
    return { missing: true, file: `${bare} (command not installed)` };
  }

  return { missing: false };
}

try {
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  const hooks = settings.hooks || {};
  const projectRoot = path.resolve(__dirname, "../..");
  const broken = [];

  for (const [event, entries] of Object.entries(hooks)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!Array.isArray(entry.hooks)) continue;
      for (const hook of entry.hooks) {
        if (hook.type !== "command" || !hook.command) continue;
        const result = checkFileRef(hook.command, projectRoot);
        if (result.missing) {
          broken.push({ event, command: hook.command, file: result.file });
        }
      }
    }
  }

  if (broken.length > 0) {
    const list = broken
      .map((b) => `  - [${b.event}] ${b.file}`)
      .join("\n");
    const output = {
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: [
          "BROKEN HOOKS DETECTED in .claude/settings.json!",
          `Found ${broken.length} hook(s) referencing missing files or uninstalled commands:`,
          list,
          "",
          "These cause errors every session. Remove the hook ENTRIES from .claude/settings.json (not just the files).",
          "See memory: feedback_broken_hooks.md for the known-good hook list.",
        ].join("\n"),
      },
    };
    console.log(JSON.stringify(output));
  }
} catch (e) {
  // Don't block session start on hook-health errors
}
