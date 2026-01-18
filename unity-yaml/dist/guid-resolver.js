"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GuidResolver = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
class GuidResolver {
    constructor(projectRoot) {
        this.guidMap = {};
        this.initialized = false;
        this.projectRoot = projectRoot || process.cwd();
    }
    /**
     * Build GUID map by scanning all .meta files in the project
     */
    buildGuidMap() {
        if (!(0, fs_1.existsSync)(this.projectRoot)) {
            console.warn(`Project root does not exist: ${this.projectRoot}`);
            return;
        }
        const assetsDir = (0, path_1.join)(this.projectRoot, 'Assets');
        if (!(0, fs_1.existsSync)(assetsDir)) {
            console.warn(`Assets directory not found: ${assetsDir}`);
            return;
        }
        this.guidMap = {};
        this.scanDirectory(assetsDir);
        this.initialized = true;
    }
    /**
     * Recursively scan directory for .meta files
     */
    scanDirectory(dir) {
        try {
            const entries = (0, fs_1.readdirSync)(dir);
            for (const entry of entries) {
                const fullPath = (0, path_1.join)(dir, entry);
                const stat = (0, fs_1.statSync)(fullPath);
                if (stat.isDirectory()) {
                    this.scanDirectory(fullPath);
                }
                else if (entry.endsWith('.meta')) {
                    this.parseMetaFile(fullPath);
                }
            }
        }
        catch (error) {
            // Skip directories we can't access
        }
    }
    /**
     * Parse a .meta file and extract GUID
     */
    parseMetaFile(metaPath) {
        try {
            const content = (0, fs_1.readFileSync)(metaPath, 'utf-8');
            const guidMatch = content.match(/^guid:\s*([a-f0-9]{32})/m);
            if (guidMatch) {
                const guid = guidMatch[1];
                // Remove .meta extension to get actual asset path
                const assetPath = metaPath.slice(0, -5);
                // Convert to relative path from project root
                const relativePath = (0, path_1.relative)(this.projectRoot, assetPath);
                this.guidMap[guid] = relativePath;
            }
        }
        catch (error) {
            // Skip files we can't read
        }
    }
    /**
     * Resolve a GUID to its asset path
     */
    resolve(guid) {
        if (!this.initialized) {
            this.buildGuidMap();
        }
        return this.guidMap[guid];
    }
    /**
     * Get the entire GUID map
     */
    getGuidMap() {
        if (!this.initialized) {
            this.buildGuidMap();
        }
        return { ...this.guidMap };
    }
    /**
     * Clear the GUID map cache
     */
    clear() {
        this.guidMap = {};
        this.initialized = false;
    }
    /**
     * Find the Unity project root by looking for Assets folder
     */
    static findProjectRoot(startPath) {
        let currentPath = startPath;
        // Go up the directory tree looking for Assets folder
        while (currentPath !== (0, path_1.dirname)(currentPath)) {
            const assetsPath = (0, path_1.join)(currentPath, 'Assets');
            if ((0, fs_1.existsSync)(assetsPath) && (0, fs_1.statSync)(assetsPath).isDirectory()) {
                return currentPath;
            }
            currentPath = (0, path_1.dirname)(currentPath);
        }
        return null;
    }
}
exports.GuidResolver = GuidResolver;
//# sourceMappingURL=guid-resolver.js.map