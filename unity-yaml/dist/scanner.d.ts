import { GameObject, SceneInspection, InspectOptions, ScanOptions } from './types';
export declare class UnityScanner {
    private guidResolver;
    /**
     * Initialize GUID resolver for a Unity project
     */
    private ensureGuidResolver;
    scan_scene_minimal(file: string): GameObject[];
    scan_scene_with_components(file: string, options?: ScanOptions): any[];
    find_by_name(file: string, pattern: string, fuzzy?: boolean): GameObject[];
    inspect(options: InspectOptions): any | null;
    inspect_all(file: string, include_properties?: boolean, verbose?: boolean): SceneInspection;
    private get_component_type;
    /**
     * Strip internal Unity IDs from component for clean output
     */
    private cleanComponent;
    /**
     * Strip internal Unity IDs from component but keep essential info
     */
    private verboseComponent;
    private calculate_fuzzy_score;
    private extract_gameobject_details;
    private get_component_section;
}
//# sourceMappingURL=scanner.d.ts.map