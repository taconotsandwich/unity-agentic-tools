#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";

const errors = [];
const warnings = [];
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
        "unity-agentic-tools binary not found on PATH. For source development, run bun run setup-dev in the repo and ensure Bun's global bin is on PATH. For public installs, use npm install -g unity-agentic-tools."
    );
}

// Check 2: report which binary actually answers, and flag any other copies
// further down PATH. A stale install shadowing a dev link answers every other
// check in this file correctly while running entirely different code.
const installs = resolve_binaries();
if (installs.length > 0) {
    const [active, ...shadowed] = installs;
    const version = read_version();
    const target = read_link_target(active);
    console.log(`[ok] resolves to ${active}${version ? ` (v${version})` : ""}`);
    if (target) {
        console.log(`[info] runs ${target}`);
    }

    if (shadowed.length > 0) {
        warnings.push(
            `${installs.length} unity-agentic-tools installs are on PATH; ${active} wins and these are shadowed: ${shadowed.join(", ")}. ` +
            "Remove the ones you do not want (npm rm -g unity-agentic-tools for a global npm copy) so you are not testing stale code."
        );
    }
}

// Check 3: command runner status works
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

function resolve_binaries() {
    try {
        const found = execFileSync("which", ["-a", "unity-agentic-tools"], {
            encoding: "utf8",
            timeout: 5000,
            stdio: ["pipe", "pipe", "pipe"],
        });
        return [...new Set(found.split("\n").map(line => line.trim()).filter(Boolean))];
    } catch {
        return [];
    }
}

function read_link_target(binary_path) {
    try {
        const real = realpathSync(binary_path);
        return real === binary_path ? null : real;
    } catch {
        return null;
    }
}

function read_version() {
    try {
        return execFileSync("unity-agentic-tools", ["--version"], {
            encoding: "utf8",
            timeout: 5000,
            stdio: ["pipe", "pipe", "pipe"],
        }).trim();
    } catch {
        return null;
    }
}

if (warnings.length > 0) {
    console.warn("\nWarnings:");
    for (const warning of warnings) {
        console.warn(`  - ${warning}`);
    }
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
