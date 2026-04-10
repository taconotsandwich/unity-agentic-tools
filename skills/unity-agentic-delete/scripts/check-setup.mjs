#!/usr/bin/env node

import { execSync } from "node:child_process";

let errors = [];

try {
    execSync("unity-agentic-tools delete --help", {
        encoding: "utf8",
        timeout: 10000,
        stdio: ["pipe", "pipe", "pipe"],
    });
    console.log("[ok] delete commands available");
} catch {
    errors.push("delete commands unavailable. Ensure unity-agentic-tools is installed globally.");
}

if (errors.length > 0) {
    console.error("\nSetup issues found:");
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
}

console.log("\nAll checks passed.");
