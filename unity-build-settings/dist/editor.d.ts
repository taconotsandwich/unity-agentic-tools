import { SceneEntry } from './build-settings';
export interface EditResult {
    success: boolean;
    message: string;
    scenes?: SceneEntry[];
}
/**
 * Add a scene to the build settings
 */
export declare function add_scene(projectPath: string, scenePath: string, options?: {
    enabled?: boolean;
    position?: number;
}): EditResult;
/**
 * Remove a scene from the build settings
 */
export declare function remove_scene(projectPath: string, scenePath: string): EditResult;
/**
 * Enable a scene in the build settings
 */
export declare function enable_scene(projectPath: string, scenePath: string): EditResult;
/**
 * Disable a scene in the build settings
 */
export declare function disable_scene(projectPath: string, scenePath: string): EditResult;
/**
 * Move a scene to a new position in the build order
 */
export declare function move_scene(projectPath: string, scenePath: string, newPosition: number): EditResult;
/**
 * Reorder all scenes by providing a new order
 */
export declare function reorder_scenes(projectPath: string, scenePaths: string[]): EditResult;
//# sourceMappingURL=editor.d.ts.map