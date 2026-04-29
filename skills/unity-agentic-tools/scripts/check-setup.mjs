#!/usr/bin/env bun

import { execFileSync } from "node:child_process";

const errors = [];
const project = process.argv[2] || process.env.UNITY_PROJECT || process.cwd();

// Check 1: unity-agentic-tools binary on PATH
try {
    execFileSync("unity-agentic-tools", ["--help"], {
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

// Check 2: command runner status works
try {
    const output = execFileSync("unity-agentic-tools", ["status", "-p", project], {
        encoding: "utf8",
        timeout: 10000,
        stdio: ["pipe", "pipe", "pipe"],
    });
    const status = JSON.parse(output);
    if (status.runtime === "bun" && status.bridge) {
        console.log("[ok] command runner status available");
        if (status.bridge.reachable === true) {
            console.log("[ok] Unity Editor bridge reachable");
        } else {
            console.log(`[info] Unity Editor bridge is not reachable for ${project}`);
        }
    } else {
        errors.push("unity-agentic-tools status returned unexpected JSON.");
    }
} catch {
    errors.push(
        `Could not run unity-agentic-tools status for ${project}. Ensure the binary is installed and working.`
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
