export interface GuidMap {
    [guid: string]: string;
}
export declare class GuidResolver {
    private guidMap;
    private projectRoot;
    private initialized;
    constructor(projectRoot?: string);
    /**
     * Build GUID map by scanning all .meta files in the project
     */
    buildGuidMap(): void;
    /**
     * Recursively scan directory for .meta files
     */
    private scanDirectory;
    /**
     * Parse a .meta file and extract GUID
     */
    private parseMetaFile;
    /**
     * Resolve a GUID to its asset path
     */
    resolve(guid: string): string | undefined;
    /**
     * Get the entire GUID map
     */
    getGuidMap(): GuidMap;
    /**
     * Clear the GUID map cache
     */
    clear(): void;
    /**
     * Find the Unity project root by looking for Assets folder
     */
    static findProjectRoot(startPath: string): string | null;
}
//# sourceMappingURL=guid-resolver.d.ts.map