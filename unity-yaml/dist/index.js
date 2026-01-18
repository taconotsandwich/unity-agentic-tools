// @bun @bun-cjs
(function(exports, require, module, __filename, __dirname) {var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __moduleCache = /* @__PURE__ */ new WeakMap;
var __toCommonJS = (from) => {
  var entry = __moduleCache.get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function")
    __getOwnPropNames(from).map((key) => !__hasOwnProp.call(entry, key) && __defProp(entry, key, {
      get: () => from[key],
      enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
    }));
  __moduleCache.set(from, entry);
  return entry;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: (newValue) => all[name] = () => newValue
    });
};

// src/index.ts
var exports_src = {};
__export(exports_src, {
  UnityScanner: () => UnityScanner
});
module.exports = __toCommonJS(exports_src);

// src/scanner.ts
var import_fs2 = require("fs");
var import_path2 = require("path");

// src/guid-resolver.ts
var import_fs = require("fs");
var import_path = require("path");

class GuidResolver {
  guidMap = {};
  projectRoot;
  initialized = false;
  constructor(projectRoot) {
    this.projectRoot = projectRoot || process.cwd();
  }
  buildGuidMap() {
    if (!import_fs.existsSync(this.projectRoot)) {
      console.warn(`Project root does not exist: ${this.projectRoot}`);
      return;
    }
    const assetsDir = import_path.join(this.projectRoot, "Assets");
    if (!import_fs.existsSync(assetsDir)) {
      console.warn(`Assets directory not found: ${assetsDir}`);
      return;
    }
    this.guidMap = {};
    this.scanDirectory(assetsDir);
    this.initialized = true;
  }
  scanDirectory(dir) {
    try {
      const entries = import_fs.readdirSync(dir);
      for (const entry of entries) {
        const fullPath = import_path.join(dir, entry);
        const stat = import_fs.statSync(fullPath);
        if (stat.isDirectory()) {
          this.scanDirectory(fullPath);
        } else if (entry.endsWith(".meta")) {
          this.parseMetaFile(fullPath);
        }
      }
    } catch (error) {}
  }
  parseMetaFile(metaPath) {
    try {
      const content = import_fs.readFileSync(metaPath, "utf-8");
      const guidMatch = content.match(/^guid:\s*([a-f0-9]{32})/m);
      if (guidMatch) {
        const guid = guidMatch[1];
        const assetPath = metaPath.slice(0, -5);
        const relativePath = import_path.relative(this.projectRoot, assetPath);
        this.guidMap[guid] = relativePath;
      }
    } catch (error) {}
  }
  resolve(guid) {
    if (!this.initialized) {
      this.buildGuidMap();
    }
    return this.guidMap[guid];
  }
  getGuidMap() {
    if (!this.initialized) {
      this.buildGuidMap();
    }
    return { ...this.guidMap };
  }
  clear() {
    this.guidMap = {};
    this.initialized = false;
  }
  static findProjectRoot(startPath) {
    let currentPath = startPath;
    while (currentPath !== import_path.dirname(currentPath)) {
      const assetsPath = import_path.join(currentPath, "Assets");
      if (import_fs.existsSync(assetsPath) && import_fs.statSync(assetsPath).isDirectory()) {
        return currentPath;
      }
      currentPath = import_path.dirname(currentPath);
    }
    return null;
  }
}

// src/scanner.ts
var GAMEOBJECT_PATTERN = /--- !u!1 &(\d+)\s*\nGameObject:\s*\n.*?m_Name:\s*([^\n]+).*?m_IsActive:\s*(\d)/gs;
var COMPONENT_REF_PATTERN = /component:\s*{fileID:\s*(\d+)}/g;
var TAG_PATTERN = /m_TagString:\s*([^\n]+)/;
var LAYER_PATTERN = /m_Layer:\s*(\d+)/;
var TRANSFORM_PATTERN = /m_Father:\s*{fileID:\s*(\d+)}/g;
var CHILDREN_PATTERN = /m_Children:\s*\[\s*(\{fileID:\s*\d+}(\s*,?\s*)*\s*)]/g;

class UnityScanner {
  guidResolver = null;
  ensureGuidResolver(file) {
    if (!this.guidResolver) {
      const projectRoot = GuidResolver.findProjectRoot(import_path2.dirname(file));
      if (projectRoot) {
        this.guidResolver = new GuidResolver(projectRoot);
        this.guidResolver.buildGuidMap();
      }
    }
  }
  scan_scene_minimal(file) {
    if (!import_fs2.existsSync(file)) {
      return [];
    }
    const content = import_fs2.readFileSync(file, "utf-8");
    const gameobjects = [];
    for (const match of content.matchAll(GAMEOBJECT_PATTERN)) {
      gameobjects.push({
        name: match[2].trim(),
        file_id: match[1],
        active: match[3] === "1"
      });
    }
    return gameobjects;
  }
  scan_scene_with_components(file, options) {
    const content = import_fs2.readFileSync(file, "utf-8");
    const gameobjects = this.scan_scene_minimal(file);
    const withComponents = [];
    const verbose = options?.verbose || false;
    for (const obj of gameobjects) {
      const newObj = {
        name: obj.name,
        active: obj.active
      };
      if (verbose) {
        newObj.file_id = obj.file_id;
      }
      const go_pattern = new RegExp(`--- !u!1 &${obj.file_id}\\s*\\nGameObject:.*?(?=--- !u!1|$)`, "gs");
      const go_match = content.match(go_pattern);
      const components = [];
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
      if (verbose) {
        newObj.components = components.map((c) => this.verboseComponent(c, false));
      } else {
        newObj.components = components.map((c) => this.cleanComponent(c, false));
      }
      withComponents.push(newObj);
    }
    return withComponents;
  }
  find_by_name(file, pattern, fuzzy = true) {
    const gameobjects = this.scan_scene_minimal(file);
    const matches = [];
    if (fuzzy) {
      const lower_pattern = pattern.toLowerCase();
      for (const obj of gameobjects) {
        const lower_name = obj.name.toLowerCase();
        if (lower_name.includes(lower_pattern)) {
          matches.push({
            ...obj,
            match_score: this.calculate_fuzzy_score(lower_pattern, lower_name)
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
  inspect(options) {
    const content = import_fs2.readFileSync(options.file, "utf-8");
    let target_file_id = null;
    if (/^\d+$/.test(options.identifier || "")) {
      target_file_id = options.identifier || null;
    } else if (options.identifier) {
      const matches = this.find_by_name(options.file, options.identifier, true);
      if (matches.length > 0) {
        target_file_id = matches[0].file_id;
      }
    } else {
      return null;
    }
    if (!target_file_id)
      return null;
    const all_gameobjects = this.scan_scene_minimal(options.file);
    const target_obj = all_gameobjects.find((o) => o.file_id === target_file_id);
    if (!target_obj)
      return null;
    const go_pattern = new RegExp(`--- !u!1 &${target_file_id}\\s*\\nGameObject:.*?(?=--- !u!1|$)`, "gs");
    const go_match = content.match(go_pattern);
    const components = [];
    if (go_match) {
      const comp_refs = Array.from(go_match[0].matchAll(COMPONENT_REF_PATTERN));
      for (const ref of comp_refs) {
        const comp_type = this.get_component_type(content, ref[1], options.file);
        if (comp_type) {
          components.push(comp_type);
        }
      }
    }
    const target_with_components = {
      ...target_obj,
      components
    };
    const details = this.extract_gameobject_details(content, target_with_components);
    const verbose = options.verbose || false;
    const include_properties = options.include_properties || false;
    const outputObj = {
      name: details.name,
      file_id: details.file_id,
      active: details.active
    };
    if (verbose) {
      outputObj.tag = details.tag;
      outputObj.layer = details.layer;
    }
    if (verbose) {
      outputObj.components = details.components.map((c) => this.verboseComponent(c, include_properties));
    } else {
      outputObj.components = details.components.map((c) => this.cleanComponent(c, include_properties));
    }
    if (verbose) {
      outputObj.children = details.children;
      if (details.parent_transform_id) {
        outputObj.parent_transform_id = details.parent_transform_id;
      }
    }
    return outputObj;
  }
  inspect_all(file, include_properties = false, verbose = false) {
    const content = import_fs2.readFileSync(file, "utf-8");
    const gameobjects = this.scan_scene_with_components(file);
    const detailed_objects = [];
    for (const obj of gameobjects) {
      const details = this.extract_gameobject_details(content, obj);
      const outputObj = {
        name: details.name,
        active: details.active
      };
      if (verbose) {
        outputObj.file_id = details.file_id;
        outputObj.tag = details.tag;
        outputObj.layer = details.layer;
      }
      if (verbose) {
        outputObj.components = details.components.map((c) => this.verboseComponent(c, include_properties));
      } else {
        outputObj.components = details.components.map((c) => this.cleanComponent(c, include_properties));
      }
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
      gameobjects: detailed_objects
    };
  }
  get_component_type(content, file_id, file) {
    const comp_pattern = new RegExp(`--- !u!\\d+ &${file_id}\\s*\\n.*?([A-Za-z][A-Za-z0-9_]*):`, "s");
    const match = comp_pattern.exec(content);
    if (!match)
      return null;
    const type_name = match[1];
    const class_id_match = content.match(new RegExp(`--- !u!(\\d+) &${file_id}`));
    const class_id = class_id_match ? parseInt(class_id_match[1]) : 0;
    const component = {
      type: type_name,
      class_id,
      file_id
    };
    const script_guid_match = content.match(new RegExp(`--- !u!114 &${file_id}.*?m_Script:\\s*\\{fileID:\\s*\\d+,\\s*guid:\\s*([a-f0-9]{32})`, "s"));
    if (script_guid_match) {
      const guid = script_guid_match[1];
      component.script_guid = guid;
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
  cleanComponent(comp, includeProperties = false) {
    const cleaned = {
      type: comp.type
    };
    if (comp.script_path) {
      cleaned.script = comp.script_path;
    }
    if (includeProperties && comp.properties) {
      cleaned.properties = comp.properties;
    }
    return cleaned;
  }
  verboseComponent(comp, includeProperties = false) {
    const verbose = {
      type: comp.type,
      class_id: comp.class_id,
      file_id: comp.file_id
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
  calculate_fuzzy_score(pattern, text) {
    if (pattern === text)
      return 100;
    if (text.startsWith(pattern))
      return 85;
    if (text.includes(pattern))
      return 70;
    const common_chars = [...pattern].filter((char) => text.includes(char)).length;
    return pattern.length > 0 ? common_chars / pattern.length * 50 : 0;
  }
  extract_gameobject_details(content, obj) {
    const go_pattern = new RegExp(`--- !u!1 &${obj.file_id}\\s*\\nGameObject:.*?(?=--- !u!1|$)`, "gs");
    const go_match = content.match(go_pattern);
    if (!go_match) {
      return {
        name: obj.name,
        file_id: obj.file_id,
        active: obj.active,
        tag: "Untagged",
        layer: 0,
        components: obj.components.map((c) => ({
          type: c.type,
          class_id: c.class_id,
          file_id: c.file_id,
          script_path: c.script_path,
          script_guid: c.script_guid,
          script_name: c.script_name,
          properties: {}
        })),
        children: []
      };
    }
    const go_content = go_match[0];
    const tag_match = go_content.match(TAG_PATTERN);
    const tag = tag_match ? tag_match[1].trim() : "Untagged";
    const layer_match = go_content.match(LAYER_PATTERN);
    const layer = layer_match ? parseInt(layer_match[1]) : 0;
    const components = obj.components.map((comp) => {
      const comp_content = this.get_component_section(content, comp.file_id);
      const properties = {};
      if (comp_content) {
        const props = comp_content.matchAll(/^\s*m_([A-Za-z0-9_]+):\s*(.+)$/gm);
        for (const prop of props) {
          const clean_name = prop[1].replace(/^m_/, "");
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
        properties
      };
    });
    const transform_match = go_content.match(TRANSFORM_PATTERN);
    const parent_id = transform_match ? transform_match[1] : null;
    const children_match = go_content.match(CHILDREN_PATTERN);
    const children = [];
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
      children
    };
  }
  get_component_section(content, file_id) {
    const pattern = new RegExp(`--- !u!\\d+ &${file_id}\\s*\\n.*?([A-Za-z][A-Za-z0-9_]*):.*?(?=--- !u!|$)`, "gs");
    const match = content.match(pattern);
    return match ? match[0] : null;
  }
}
})
