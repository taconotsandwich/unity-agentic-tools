#!/usr/bin/env node

import { execSync } from "node:child_process";

let errors = [];

// Check 1: unity-agentic-tools binary on PATH
try {
    execSync("unity-agentic-tools version --help", {
        encoding: "utf8",
        timeout: 10000,
        stdio: ["pipe", "pipe", "pipe"],
    });
    console.log("[ok] unity-agentic-tools binary found");
} catch {
    errors.push(
        "unity-agentic-tools binary not found on PATH. Install with: npm install -g unity-agentic-tools"
    );
}

// Check 2: Native Rust module available
try {
    const output = execSync("unity-agentic-tools status", {
        encoding: "utf8",
        timeout: 10000,
        stdio: ["pipe", "pipe", "pipe"],
    });
    const status = JSON.parse(output);
    if (status.native_module === true) {
        console.log("[ok] Native Rust module loaded");
    } else {
        const reason = status.native_module_error || "unknown error";
        errors.push(
            `Native Rust module not available (${reason}). Rebuild with: bun run build:rust`
        );
    }
} catch (e) {
    errors.push(
        "Could not run unity-agentic-tools status. Ensure the binary is installed and working."
    );
}

if (errors.length > 0) {
    console.error("\nSetup issues found:");
    for (const err of errors) {
        console.error(`  - ${err}`);
    }
    process.exit(1);
} else {
    console.log("\nAll checks passed. unity-agentic-tools is ready.");
    process.exit(0);
}
