import { readFileSync, existsSync } from 'fs';
import { dirname } from 'path';
import { GameObject, Component, GameObjectWithComponents, GameObjectDetail, SceneInspection, InspectOptions, ScanOptions } from './types';
import { GuidResolver } from './guid-resolver';

const GAMEOBJECT_PATTERN = /--- !u!1 &(\d+)\s*\nGameObject:\s*\n.*?m_Name:\s*([^\n]+).*?m_IsActive:\s*(\d)/gs;
const COMPONENT_REF_PATTERN = /component:\s*{fileID:\s*(\d+)}/g;
const TAG_PATTERN = /m_TagString:\s*([^\n]+)/;
const LAYER_PATTERN = /m_Layer:\s*(\d+)/;
const TRANSFORM_PATTERN = /m_Father:\s*{fileID:\s*(\d+)}/g;
const CHILDREN_PATTERN = /m_Children:\s*\[\s*(\{fileID:\s*\d+}(\s*,?\s*)*\s*)]/g;

export class UnityScanner {
  private guidResolver: GuidResolver | null = null;

  /**
   * Initialize GUID resolver for a Unity project
   */
  private ensureGuidResolver(file: string): void {
    if (!this.guidResolver) {
      const projectRoot = GuidResolver.findProjectRoot(dirname(file));
      if (projectRoot) {
        this.guidResolver = new GuidResolver(projectRoot);
        this.guidResolver.buildGuidMap();
      }
    }
  }

  scan_scene_minimal(file: string): GameObject[] {
    if (!existsSync(file)) {
      return [];
    }

    const content = readFileSync(file, 'utf-8');
    const gameobjects: GameObject[] = [];

    for (const match of content.matchAll(GAMEOBJECT_PATTERN)) {
      gameobjects.push({
        name: match[2].trim(),
        file_id: match[1],
        active: match[3] === '1',
      });
    }

    return gameobjects;
  }

  scan_scene_with_components(file: string, options?: ScanOptions): any[] {
    const content = readFileSync(file, 'utf-8');
    const gameobjects = this.scan_scene_minimal(file);
    const withComponents: any[] = [];
    const verbose = options?.verbose || false;

    for (const obj of gameobjects) {
      const newObj: any = {
        name: obj.name,
        active: obj.active,
      };

      // Add verbose fields
      if (verbose) {
        newObj.file_id = obj.file_id;
      }

      const go_pattern = new RegExp(`--- !u!1 &${obj.file_id}\\s*\\nGameObject:.*?(?=--- !u!1|$)`, 'gs');
      const go_match = content.match(go_pattern);

      const components: Component[] = [];
      if (go_match) {
        const comp_refs = Array.from(go_match[0].matchAll(COMPONENT_REF_PATTERN));

        if (verbose) {
          newObj.component_count = comp_refs.length;
        }

        for (const ref of comp_refs) {
          const comp_type = this.get_component_type(content, ref[1], file);
          if (comp_type) {
            components.push(comp_type);
          }
        }
      }

      // Format components based on verbose flag
      if (verbose) {
        newObj.components = components.map((c) => this.verboseComponent(c, false));
      } else {
        newObj.components = components.map((c) => this.cleanComponent(c, false));
      }

      withComponents.push(newObj);
    }

    return withComponents;
  }

  find_by_name(file: string, pattern: string, fuzzy: boolean = true): GameObject[] {
    const gameobjects = this.scan_scene_minimal(file);
    const matches: GameObject[] = [];

    if (fuzzy) {
      const lower_pattern = pattern.toLowerCase();
      for (const obj of gameobjects) {
        const lower_name = obj.name.toLowerCase();
        if (lower_name.includes(lower_pattern)) {
          matches.push({
            ...obj,
            match_score: this.calculate_fuzzy_score(lower_pattern, lower_name),
          });
        }
      }
      matches.sort((a, b) => (b.match_score || 0) - (a.match_score || 0));
    } else {
      for (const obj of gameobjects) {
        if (obj.name === pattern) {
          matches.push(obj);
        }
      }
    }

    return matches;
  }

  inspect(options: InspectOptions): any | null {
    const content = readFileSync(options.file, 'utf-8');
    let target_file_id: string | null = null;

    if (/^\d+$/.test(options.identifier || '')) {
      target_file_id = options.identifier || null;
    } else if (options.identifier) {
      const matches = this.find_by_name(options.file, options.identifier, true);
      if (matches.length > 0) {
        target_file_id = matches[0].file_id;
      }
    } else {
      return null;
    }

    if (!target_file_id) return null;

    // Get full component details
    const all_gameobjects = this.scan_scene_minimal(options.file);
    const target_obj = all_gameobjects.find((o) => o.file_id === target_file_id);
    if (!target_obj) return null;

    // Build GameObjectWithComponents for extract_gameobject_details
    const go_pattern = new RegExp(`--- !u!1 &${target_file_id}\\s*\\nGameObject:.*?(?=--- !u!1|$)`, 'gs');
    const go_match = content.match(go_pattern);

    const components: Component[] = [];
    if (go_match) {
      const comp_refs = Array.from(go_match[0].matchAll(COMPONENT_REF_PATTERN));
      for (const ref of comp_refs) {
        const comp_type = this.get_component_type(content, ref[1], options.file);
        if (comp_type) {
          components.push(comp_type);
        }
      }
    }

    const target_with_components: GameObjectWithComponents = {
      ...target_obj,
      components,
    };

    const details = this.extract_gameobject_details(content, target_with_components);
    const verbose = options.verbose || false;
    const include_properties = options.include_properties || false;

    // Build clean or verbose output
    const outputObj: any = {
      name: details.name,
      file_id: details.file_id,
      active: details.active,
    };

    // Add verbose fields
    if (verbose) {
      outputObj.tag = details.tag;
      outputObj.layer = details.layer;
    }

    // Process components
    if (verbose) {
      outputObj.components = details.components.map((c) => this.verboseComponent(c, include_properties));
    } else {
      outputObj.components = details.components.map((c) => this.cleanComponent(c, include_properties));
    }

    // Add hierarchy info if verbose
    if (verbose) {
      outputObj.children = details.children;
      if (details.parent_transform_id) {
        outputObj.parent_transform_id = details.parent_transform_id;
      }
    }

    return outputObj;
  }

  inspect_all(file: string, include_properties: boolean = false, verbose: boolean = false): SceneInspection {
    const content = readFileSync(file, 'utf-8');
    const gameobjects = this.scan_scene_with_components(file);
    const detailed_objects: any[] = [];

    for (const obj of gameobjects) {
      const details = this.extract_gameobject_details(content, obj);

      // Build clean or verbose output
      const outputObj: any = {
        name: details.name,
        active: details.active,
      };

      // Add verbose fields
      if (verbose) {
        outputObj.file_id = details.file_id;
        outputObj.tag = details.tag;
        outputObj.layer = details.layer;
      }

      // Process components
      if (verbose) {
        outputObj.components = details.components.map((c) => this.verboseComponent(c, include_properties));
      } else {
        outputObj.components = details.components.map((c) => this.cleanComponent(c, include_properties));
      }

      // Add hierarchy info if verbose
      if (verbose) {
        outputObj.children = details.children;
        if (details.parent_transform_id) {
          outputObj.parent_transform_id = details.parent_transform_id;
        }
      }

      detailed_objects.push(outputObj);
    }

    return {
      file,
      count: detailed_objects.length,
      gameobjects: detailed_objects,
    };
  }

  private get_component_type(content: string, file_id: string, file: string): Component | null {
    const comp_pattern = new RegExp(`--- !u!\\d+ &${file_id}\\s*\\n.*?([A-Za-z][A-Za-z0-9_]*):`, 's');
    const match = comp_pattern.exec(content);
    if (!match) return null;

    const type_name = match[1];
    const class_id_match = content.match(new RegExp(`--- !u!(\\d+) &${file_id}`));
    const class_id = class_id_match ? parseInt(class_id_match[1]) : 0;

    const component: Component = {
      type: type_name,
      class_id,
      file_id,
    };

    const script_guid_match = content.match(
      new RegExp(`--- !u!114 &${file_id}.*?m_Script:\\s*\\{fileID:\\s*\\d+,\\s*guid:\\s*([a-f0-9]{32})`, 's')
    );
    if (script_guid_match) {
      const guid = script_guid_match[1];
      component.script_guid = guid;

      // Resolve GUID to path
      this.ensureGuidResolver(file);
      if (this.guidResolver) {
        const path = this.guidResolver.resolve(guid);
        if (path) {
          component.script_path = path;
        }
      }
    }

    return component;
  }

  /**
   * Strip internal Unity IDs from component for clean output
   */
  private cleanComponent(comp: Component, includeProperties: boolean = false): any {
    const cleaned: any = {
      type: comp.type,
    };

    // Add script path if available
    if (comp.script_path) {
      cleaned.script = comp.script_path;
    }

    // Add properties if requested
    if (includeProperties && comp.properties) {
      cleaned.properties = comp.properties;
    }

    return cleaned;
  }

  /**
   * Strip internal Unity IDs from component but keep essential info
   */
  private verboseComponent(comp: Component, includeProperties: boolean = false): any {
    const verbose: any = {
      type: comp.type,
      class_id: comp.class_id,
      file_id: comp.file_id,
    };

    if (comp.script_path) {
      verbose.script_path = comp.script_path;
    }

    if (comp.script_guid) {
      verbose.script_guid = comp.script_guid;
    }

    if (comp.script_name) {
      verbose.script_name = comp.script_name;
    }

    if (includeProperties && comp.properties) {
      verbose.properties = comp.properties;
    }

    return verbose;
  }

  private calculate_fuzzy_score(pattern: string, text: string): number {
    if (pattern === text) return 100;
    if (text.startsWith(pattern)) return 85;
    if (text.includes(pattern)) return 70;

    const common_chars = [...pattern].filter((char) => text.includes(char)).length;
    return pattern.length > 0 ? (common_chars / pattern.length) * 50 : 0;
  }

  private extract_gameobject_details(content: string, obj: GameObjectWithComponents): GameObjectDetail {
    const go_pattern = new RegExp(`--- !u!1 &${obj.file_id}\\s*\\nGameObject:.*?(?=--- !u!1|$)`, 'gs');
    const go_match = content.match(go_pattern);

    if (!go_match) {
      return {
        name: obj.name,
        file_id: obj.file_id,
        active: obj.active,
        tag: 'Untagged',
        layer: 0,
        components: obj.components.map((c) => ({
          type: c.type,
          class_id: c.class_id,
          file_id: c.file_id,
          script_path: c.script_path,
          script_guid: c.script_guid,
          script_name: c.script_name,
          properties: {},
        })),
        children: [],
      };
    }

    const go_content = go_match[0];

    const tag_match = go_content.match(TAG_PATTERN);
    const tag = tag_match ? tag_match[1].trim() : 'Untagged';

    const layer_match = go_content.match(LAYER_PATTERN);
    const layer = layer_match ? parseInt(layer_match[1]) : 0;

    const components: Component[] = obj.components.map((comp) => {
      const comp_content = this.get_component_section(content, comp.file_id);
      const properties: Record<string, any> = {};

      if (comp_content) {
        const props = comp_content.matchAll(/^\s*m_([A-Za-z0-9_]+):\s*(.+)$/gm);
        for (const prop of props) {
          const clean_name = prop[1].replace(/^m_/, '');
          properties[clean_name] = prop[2].trim();
        }
      }

      return {
        type: comp.type,
        class_id: comp.class_id,
        file_id: comp.file_id,
        script_path: comp.script_path,
        script_guid: comp.script_guid,
        script_name: comp.script_name,
        properties,
      };
    });

    const transform_match = go_content.match(TRANSFORM_PATTERN);
    const parent_id = transform_match ? transform_match[1] : null;

    const children_match = go_content.match(CHILDREN_PATTERN);
    const children: string[] = [];
    if (children_match) {
      for (const child of children_match[1].matchAll(/{fileID:\s*(\d+)}/g)) {
        children.push(child[1]);
      }
    }

    return {
      name: obj.name,
      file_id: obj.file_id,
      active: obj.active,
      tag,
      layer,
      components,
      parent_transform_id: parent_id,
      children,
    };
  }

  private get_component_section(content: string, file_id: string): string | null {
    const pattern = new RegExp(`--- !u!\\d+ &${file_id}\\s*\\n.*?([A-Za-z][A-Za-z0-9_]*):.*?(?=--- !u!|$)`, 'gs');
    const match = content.match(pattern);
    return match ? match[0] : null;
  }
}
