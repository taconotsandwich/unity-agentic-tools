// @bun @bun-cjs
(function(exports, require, module, __filename, __dirname) {var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __toESM = (mod, isNodeMode, target) => {
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: () => mod[key],
        enumerable: true
      });
  return to;
};
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
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: (newValue) => all[name] = () => newValue
    });
};

// ../rust-core/unity-agentic-core.darwin-arm64.node
var require_unity_agentic_core_darwin_arm64 = __commonJS((exports2, module2) => {
  module2.exports = require("./unity-agentic-core.darwin-arm64-eb5qd13r.node");
});

// ../rust-core/index.js
var require_rust_core = __commonJS((exports2, module2) => {
  var __dirname = "/Users/taco/Documents/Projects/unity-agentic-tools/rust-core";
  var { existsSync: existsSync2, readFileSync } = require("fs");
  var { join: join2 } = require("path");
  var { platform, arch } = process;
  var nativeBinding = null;
  var localFileExisted = false;
  var loadError = null;
  function isMusl() {
    if (!process.report || typeof process.report.getReport !== "function") {
      try {
        const lddPath = require("child_process").execSync("which ldd").toString().trim();
        return readFileSync(lddPath, "utf8").includes("musl");
      } catch (e) {
        return true;
      }
    } else {
      const { glibcVersionRuntime } = process.report.getReport().header;
      return !glibcVersionRuntime;
    }
  }
  switch (platform) {
    case "android":
      switch (arch) {
        case "arm64":
          localFileExisted = existsSync2(join2(__dirname, "unity-agentic-core.android-arm64.node"));
          try {
            if (localFileExisted) {
              nativeBinding = (()=>{throw new Error("Cannot require module "+"./unity-agentic-core.android-arm64.node");})();
            } else {
              nativeBinding = (()=>{throw new Error("Cannot require module "+"unity-agentic-core-android-arm64");})();
            }
          } catch (e) {
            loadError = e;
          }
          break;
        case "arm":
          localFileExisted = existsSync2(join2(__dirname, "unity-agentic-core.android-arm-eabi.node"));
          try {
            if (localFileExisted) {
              nativeBinding = (()=>{throw new Error("Cannot require module "+"./unity-agentic-core.android-arm-eabi.node");})();
            } else {
              nativeBinding = (()=>{throw new Error("Cannot require module "+"unity-agentic-core-android-arm-eabi");})();
            }
          } catch (e) {
            loadError = e;
          }
          break;
        default:
          throw new Error(`Unsupported architecture on Android ${arch}`);
      }
      break;
    case "win32":
      switch (arch) {
        case "x64":
          localFileExisted = existsSync2(join2(__dirname, "unity-agentic-core.win32-x64-msvc.node"));
          try {
            if (localFileExisted) {
              nativeBinding = (()=>{throw new Error("Cannot require module "+"./unity-agentic-core.win32-x64-msvc.node");})();
            } else {
              nativeBinding = (()=>{throw new Error("Cannot require module "+"unity-agentic-core-win32-x64-msvc");})();
            }
          } catch (e) {
            loadError = e;
          }
          break;
        case "ia32":
          localFileExisted = existsSync2(join2(__dirname, "unity-agentic-core.win32-ia32-msvc.node"));
          try {
            if (localFileExisted) {
              nativeBinding = (()=>{throw new Error("Cannot require module "+"./unity-agentic-core.win32-ia32-msvc.node");})();
            } else {
              nativeBinding = (()=>{throw new Error("Cannot require module "+"unity-agentic-core-win32-ia32-msvc");})();
            }
          } catch (e) {
            loadError = e;
          }
          break;
        case "arm64":
          localFileExisted = existsSync2(join2(__dirname, "unity-agentic-core.win32-arm64-msvc.node"));
          try {
            if (localFileExisted) {
              nativeBinding = (()=>{throw new Error("Cannot require module "+"./unity-agentic-core.win32-arm64-msvc.node");})();
            } else {
              nativeBinding = (()=>{throw new Error("Cannot require module "+"unity-agentic-core-win32-arm64-msvc");})();
            }
          } catch (e) {
            loadError = e;
          }
          break;
        default:
          throw new Error(`Unsupported architecture on Windows: ${arch}`);
      }
      break;
    case "darwin":
      localFileExisted = existsSync2(join2(__dirname, "unity-agentic-core.darwin-universal.node"));
      try {
        if (localFileExisted) {
          nativeBinding = (()=>{throw new Error("Cannot require module "+"./unity-agentic-core.darwin-universal.node");})();
        } else {
          nativeBinding = (()=>{throw new Error("Cannot require module "+"unity-agentic-core-darwin-universal");})();
        }
        break;
      } catch {}
      switch (arch) {
        case "x64":
          localFileExisted = existsSync2(join2(__dirname, "unity-agentic-core.darwin-x64.node"));
          try {
            if (localFileExisted) {
              nativeBinding = (()=>{throw new Error("Cannot require module "+"./unity-agentic-core.darwin-x64.node");})();
            } else {
              nativeBinding = (()=>{throw new Error("Cannot require module "+"unity-agentic-core-darwin-x64");})();
            }
          } catch (e) {
            loadError = e;
          }
          break;
        case "arm64":
          localFileExisted = existsSync2(join2(__dirname, "unity-agentic-core.darwin-arm64.node"));
          try {
            if (localFileExisted) {
              nativeBinding = require_unity_agentic_core_darwin_arm64();
            } else {
              nativeBinding = (()=>{throw new Error("Cannot require module "+"unity-agentic-core-darwin-arm64");})();
            }
          } catch (e) {
            loadError = e;
          }
          break;
        default:
          throw new Error(`Unsupported architecture on macOS: ${arch}`);
      }
      break;
    case "freebsd":
      if (arch !== "x64") {
        throw new Error(`Unsupported architecture on FreeBSD: ${arch}`);
      }
      localFileExisted = existsSync2(join2(__dirname, "unity-agentic-core.freebsd-x64.node"));
      try {
        if (localFileExisted) {
          nativeBinding = (()=>{throw new Error("Cannot require module "+"./unity-agentic-core.freebsd-x64.node");})();
        } else {
          nativeBinding = (()=>{throw new Error("Cannot require module "+"unity-agentic-core-freebsd-x64");})();
        }
      } catch (e) {
        loadError = e;
      }
      break;
    case "linux":
      switch (arch) {
        case "x64":
          if (isMusl()) {
            localFileExisted = existsSync2(join2(__dirname, "unity-agentic-core.linux-x64-musl.node"));
            try {
              if (localFileExisted) {
                nativeBinding = (()=>{throw new Error("Cannot require module "+"./unity-agentic-core.linux-x64-musl.node");})();
              } else {
                nativeBinding = (()=>{throw new Error("Cannot require module "+"unity-agentic-core-linux-x64-musl");})();
              }
            } catch (e) {
              loadError = e;
            }
          } else {
            localFileExisted = existsSync2(join2(__dirname, "unity-agentic-core.linux-x64-gnu.node"));
            try {
              if (localFileExisted) {
                nativeBinding = (()=>{throw new Error("Cannot require module "+"./unity-agentic-core.linux-x64-gnu.node");})();
              } else {
                nativeBinding = (()=>{throw new Error("Cannot require module "+"unity-agentic-core-linux-x64-gnu");})();
              }
            } catch (e) {
              loadError = e;
            }
          }
          break;
        case "arm64":
          if (isMusl()) {
            localFileExisted = existsSync2(join2(__dirname, "unity-agentic-core.linux-arm64-musl.node"));
            try {
              if (localFileExisted) {
                nativeBinding = (()=>{throw new Error("Cannot require module "+"./unity-agentic-core.linux-arm64-musl.node");})();
              } else {
                nativeBinding = (()=>{throw new Error("Cannot require module "+"unity-agentic-core-linux-arm64-musl");})();
              }
            } catch (e) {
              loadError = e;
            }
          } else {
            localFileExisted = existsSync2(join2(__dirname, "unity-agentic-core.linux-arm64-gnu.node"));
            try {
              if (localFileExisted) {
                nativeBinding = (()=>{throw new Error("Cannot require module "+"./unity-agentic-core.linux-arm64-gnu.node");})();
              } else {
                nativeBinding = (()=>{throw new Error("Cannot require module "+"unity-agentic-core-linux-arm64-gnu");})();
              }
            } catch (e) {
              loadError = e;
            }
          }
          break;
        case "arm":
          if (isMusl()) {
            localFileExisted = existsSync2(join2(__dirname, "unity-agentic-core.linux-arm-musleabihf.node"));
            try {
              if (localFileExisted) {
                nativeBinding = (()=>{throw new Error("Cannot require module "+"./unity-agentic-core.linux-arm-musleabihf.node");})();
              } else {
                nativeBinding = (()=>{throw new Error("Cannot require module "+"unity-agentic-core-linux-arm-musleabihf");})();
              }
            } catch (e) {
              loadError = e;
            }
          } else {
            localFileExisted = existsSync2(join2(__dirname, "unity-agentic-core.linux-arm-gnueabihf.node"));
            try {
              if (localFileExisted) {
                nativeBinding = (()=>{throw new Error("Cannot require module "+"./unity-agentic-core.linux-arm-gnueabihf.node");})();
              } else {
                nativeBinding = (()=>{throw new Error("Cannot require module "+"unity-agentic-core-linux-arm-gnueabihf");})();
              }
            } catch (e) {
              loadError = e;
            }
          }
          break;
        case "riscv64":
          if (isMusl()) {
            localFileExisted = existsSync2(join2(__dirname, "unity-agentic-core.linux-riscv64-musl.node"));
            try {
              if (localFileExisted) {
                nativeBinding = (()=>{throw new Error("Cannot require module "+"./unity-agentic-core.linux-riscv64-musl.node");})();
              } else {
                nativeBinding = (()=>{throw new Error("Cannot require module "+"unity-agentic-core-linux-riscv64-musl");})();
              }
            } catch (e) {
              loadError = e;
            }
          } else {
            localFileExisted = existsSync2(join2(__dirname, "unity-agentic-core.linux-riscv64-gnu.node"));
            try {
              if (localFileExisted) {
                nativeBinding = (()=>{throw new Error("Cannot require module "+"./unity-agentic-core.linux-riscv64-gnu.node");})();
              } else {
                nativeBinding = (()=>{throw new Error("Cannot require module "+"unity-agentic-core-linux-riscv64-gnu");})();
              }
            } catch (e) {
              loadError = e;
            }
          }
          break;
        case "s390x":
          localFileExisted = existsSync2(join2(__dirname, "unity-agentic-core.linux-s390x-gnu.node"));
          try {
            if (localFileExisted) {
              nativeBinding = (()=>{throw new Error("Cannot require module "+"./unity-agentic-core.linux-s390x-gnu.node");})();
            } else {
              nativeBinding = (()=>{throw new Error("Cannot require module "+"unity-agentic-core-linux-s390x-gnu");})();
            }
          } catch (e) {
            loadError = e;
          }
          break;
        default:
          throw new Error(`Unsupported architecture on Linux: ${arch}`);
      }
      break;
    default:
      throw new Error(`Unsupported OS: ${platform}, architecture: ${arch}`);
  }
  if (!nativeBinding) {
    if (loadError) {
      throw loadError;
    }
    throw new Error(`Failed to load native binding`);
  }
  var { ChunkType, Scanner, Indexer, getVersion, isNativeAvailable } = nativeBinding;
  module2.exports.ChunkType = ChunkType;
  module2.exports.Scanner = Scanner;
  module2.exports.Indexer = Indexer;
  module2.exports.getVersion = getVersion;
  module2.exports.isNativeAvailable = isNativeAvailable;
});

// src/index.ts
var exports_src = {};
__export(exports_src, {
  walk_project_files: () => walk_project_files,
  setup: () => setup,
  search_project: () => search_project,
  read_settings: () => read_settings,
  isNativeModuleAvailable: () => isNativeModuleAvailable,
  grep_project: () => grep_project,
  getNativeModuleError: () => getNativeModuleError,
  generateGuid: () => generateGuid,
  edit_tag: () => edit_tag,
  edit_sorting_layer: () => edit_sorting_layer,
  edit_settings: () => edit_settings,
  edit_layer: () => edit_layer,
  createScene: () => createScene,
  cleanup: () => cleanup,
  atomicWrite: () => atomicWrite,
  UnityScanner: () => UnityScanner
});
module.exports = __toCommonJS(exports_src);

// src/scanner.ts
var import_module = require("module");
var import_fs = require("fs");

// src/binary-path.ts
var import_os = require("os");
var import_path = require("path");
var BINARY_NAME = "unity-agentic-core";
function getBinaryDir() {
  return import_path.join(import_os.homedir(), ".claude", "unity-agentic-tools", "bin");
}
function getBinaryFilename() {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === "darwin" && arch === "arm64") {
    return `${BINARY_NAME}.darwin-arm64.node`;
  } else if (platform === "darwin" && arch === "x64") {
    return `${BINARY_NAME}.darwin-x64.node`;
  } else if (platform === "linux" && arch === "x64") {
    return `${BINARY_NAME}.linux-x64-gnu.node`;
  } else if (platform === "win32" && arch === "x64") {
    return `${BINARY_NAME}.win32-x64-msvc.node`;
  } else {
    throw new Error(`Unsupported platform: ${platform}-${arch}`);
  }
}
function getBinaryPath() {
  return import_path.join(getBinaryDir(), getBinaryFilename());
}

// src/scanner.ts
var RustScanner = null;
var nativeModuleError = null;
try {
  const binaryPath = getBinaryPath();
  if (!import_fs.existsSync(binaryPath)) {
    throw new Error(`Binary not found at: ${binaryPath}`);
  }
  const customRequire = import_module.createRequire("file:///Users/taco/Documents/Projects/unity-agentic-tools/unity-yaml/src/scanner.ts");
  const rustModule = customRequire(binaryPath);
  RustScanner = rustModule.Scanner;
} catch (err) {
  const binaryDir = getBinaryDir();
  nativeModuleError = `Failed to load native Rust module from host location.
` + `Expected location: ${binaryDir}
` + `Run: /initial-install (if using as Claude Code plugin)
` + `Or download from: https://github.com/taconotsandwich/unity-agentic-tools/releases
` + `Original error: ${err.message}`;
}
function isNativeModuleAvailable() {
  return RustScanner !== null;
}
function getNativeModuleError() {
  return nativeModuleError;
}

class UnityScanner {
  scanner;
  constructor() {
    if (!RustScanner) {
      throw new Error(nativeModuleError || "Native module not available");
    }
    this.scanner = new RustScanner;
  }
  setProjectRoot(path) {
    this.scanner.setProjectRoot(path);
  }
  scan_scene_minimal(file) {
    return this.scanner.scanSceneMinimal(file);
  }
  scan_scene_with_components(file, options) {
    return this.scanner.scanSceneWithComponents(file, options);
  }
  find_by_name(file, pattern, fuzzy = true) {
    return this.scanner.findByName(file, pattern, fuzzy);
  }
  inspect(options) {
    return this.scanner.inspect({
      file: options.file,
      identifier: options.identifier,
      includeProperties: options.include_properties,
      verbose: options.verbose
    });
  }
  inspect_all(file, include_properties = false, verbose = false) {
    return this.scanner.inspectAll(file, include_properties, verbose);
  }
  inspect_all_paginated(options) {
    return this.scanner.inspectAllPaginated({
      file: options.file,
      includeProperties: options.include_properties,
      verbose: options.verbose,
      pageSize: options.page_size,
      cursor: options.cursor,
      maxDepth: options.max_depth
    });
  }
}
// src/setup.ts
var import_fs2 = require("fs");
var import_path2 = require("path");
var CONFIG_DIR = ".unity-agentic";
var CONFIG_FILE = "config.json";
var GUID_CACHE_FILE = "guid-cache.json";
var DOC_INDEX_FILE = "doc-index.json";
function setup(options = {}) {
  const projectPath = import_path2.resolve(options.project || process.cwd());
  const assetsPath = import_path2.join(projectPath, "Assets");
  if (!import_fs2.existsSync(assetsPath)) {
    return {
      success: false,
      project_path: projectPath,
      config_path: "",
      guid_cache_created: false,
      doc_index_created: false,
      error: `Not a Unity project: Assets folder not found at ${assetsPath}`
    };
  }
  const configPath = import_path2.join(projectPath, CONFIG_DIR);
  if (!import_fs2.existsSync(configPath)) {
    import_fs2.mkdirSync(configPath, { recursive: true });
  }
  const config = {
    version: "1.0.0",
    project_path: projectPath,
    created_at: new Date().toISOString(),
    rust_enabled: isRustAvailable()
  };
  import_fs2.writeFileSync(import_path2.join(configPath, CONFIG_FILE), JSON.stringify(config, null, 2));
  const guidCache = buildGuidCache(projectPath);
  const guidCachePath = import_path2.join(configPath, GUID_CACHE_FILE);
  import_fs2.writeFileSync(guidCachePath, JSON.stringify(guidCache, null, 2));
  let docIndexCreated = false;
  if (options.indexDocs) {
    const docIndex = { chunks: {}, last_updated: Date.now() };
    import_fs2.writeFileSync(import_path2.join(configPath, DOC_INDEX_FILE), JSON.stringify(docIndex, null, 2));
    docIndexCreated = true;
  }
  return {
    success: true,
    project_path: projectPath,
    config_path: configPath,
    guid_cache_created: true,
    doc_index_created: docIndexCreated,
    guid_count: Object.keys(guidCache).length
  };
}
function buildGuidCache(projectRoot) {
  const cache = {};
  const assetsDir = import_path2.join(projectRoot, "Assets");
  if (!import_fs2.existsSync(assetsDir)) {
    return cache;
  }
  scanMetaFiles(assetsDir, projectRoot, cache);
  return cache;
}
function scanMetaFiles(dir, projectRoot, cache) {
  try {
    const entries = import_fs2.readdirSync(dir);
    for (const entry of entries) {
      const fullPath = import_path2.join(dir, entry);
      const stat = import_fs2.statSync(fullPath);
      if (stat.isDirectory()) {
        scanMetaFiles(fullPath, projectRoot, cache);
      } else if (entry.endsWith(".meta")) {
        try {
          const content = import_fs2.readFileSync(fullPath, "utf-8");
          const guidMatch = content.match(/^guid:\s*([a-f0-9]{32})/m);
          if (guidMatch) {
            const guid = guidMatch[1];
            const assetPath = fullPath.slice(0, -5);
            const relativePath = import_path2.relative(projectRoot, assetPath);
            cache[guid] = relativePath;
          }
        } catch {}
      }
    }
  } catch {}
}
function isRustAvailable() {
  try {
    require_rust_core();
    return true;
  } catch {
    return false;
  }
}
// src/cleanup.ts
var import_fs3 = require("fs");
var import_path3 = require("path");
var CONFIG_DIR2 = ".unity-agentic";
var CONFIG_FILE2 = "config.json";
var GUID_CACHE_FILE2 = "guid-cache.json";
var DOC_INDEX_FILE2 = "doc-index.json";
function cleanup(options = {}) {
  const projectPath = import_path3.resolve(options.project || process.cwd());
  const configPath = import_path3.join(projectPath, CONFIG_DIR2);
  if (!import_fs3.existsSync(configPath)) {
    return {
      success: true,
      project_path: projectPath,
      files_removed: [],
      directory_removed: false,
      error: `No ${CONFIG_DIR2} directory found`
    };
  }
  const filesRemoved = [];
  let directoryRemoved = false;
  if (options.all) {
    try {
      removeDirectoryRecursive(configPath);
      directoryRemoved = true;
      filesRemoved.push(CONFIG_DIR2);
    } catch (err) {
      return {
        success: false,
        project_path: projectPath,
        files_removed: filesRemoved,
        directory_removed: false,
        error: `Failed to remove directory: ${err}`
      };
    }
  } else {
    const filesToRemove = [GUID_CACHE_FILE2, DOC_INDEX_FILE2];
    for (const file of filesToRemove) {
      const filePath = import_path3.join(configPath, file);
      if (import_fs3.existsSync(filePath)) {
        try {
          import_fs3.unlinkSync(filePath);
          filesRemoved.push(file);
        } catch {}
      }
    }
    const remaining = import_fs3.readdirSync(configPath);
    if (remaining.length === 0 || remaining.length === 1 && remaining[0] === CONFIG_FILE2) {}
  }
  return {
    success: true,
    project_path: projectPath,
    files_removed: filesRemoved,
    directory_removed: directoryRemoved
  };
}
function removeDirectoryRecursive(dir) {
  if (!import_fs3.existsSync(dir)) {
    return;
  }
  const entries = import_fs3.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = import_path3.join(dir, entry.name);
    if (entry.isDirectory()) {
      removeDirectoryRecursive(fullPath);
    } else {
      import_fs3.unlinkSync(fullPath);
    }
  }
  import_fs3.rmdirSync(dir);
}
// src/settings.ts
var import_fs5 = require("fs");
var path = __toESM(require("path"));

// src/utils.ts
var import_fs4 = require("fs");
function atomicWrite(filePath, content) {
  const tmpPath = `${filePath}.tmp`;
  try {
    import_fs4.writeFileSync(tmpPath, content, "utf-8");
    if (import_fs4.existsSync(filePath)) {
      import_fs4.renameSync(filePath, `${filePath}.bak`);
    }
    import_fs4.renameSync(tmpPath, filePath);
    try {
      if (import_fs4.existsSync(`${filePath}.bak`)) {
        import_fs4.unlinkSync(`${filePath}.bak`);
      }
    } catch {}
    return {
      success: true,
      file_path: filePath,
      bytes_written: Buffer.byteLength(content, "utf-8")
    };
  } catch (error) {
    if (import_fs4.existsSync(`${filePath}.bak`)) {
      try {
        import_fs4.renameSync(`${filePath}.bak`, filePath);
      } catch (restoreError) {
        console.error("Failed to restore backup:", restoreError);
      }
    }
    return {
      success: false,
      file_path: filePath,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
function generateGuid() {
  const hex = "0123456789abcdef";
  let guid = "";
  for (let i = 0;i < 32; i++) {
    guid += hex[Math.floor(Math.random() * 16)];
  }
  return guid;
}

// src/settings.ts
var SETTING_ALIASES = {
  tags: "TagManager",
  tagmanager: "TagManager",
  physics: "DynamicsManager",
  dynamicsmanager: "DynamicsManager",
  quality: "QualitySettings",
  qualitysettings: "QualitySettings",
  time: "TimeManager",
  timemanager: "TimeManager",
  input: "InputManager",
  inputmanager: "InputManager",
  audio: "AudioManager",
  audiomanager: "AudioManager",
  editor: "EditorSettings",
  editorsettings: "EditorSettings",
  graphics: "GraphicsSettings",
  graphicssettings: "GraphicsSettings",
  physics2d: "Physics2DSettings",
  physics2dsettings: "Physics2DSettings",
  player: "ProjectSettings",
  projectsettings: "ProjectSettings",
  navmesh: "NavMeshAreas",
  navmeshareas: "NavMeshAreas"
};
function resolve_setting_name(setting) {
  const lower = setting.toLowerCase();
  return SETTING_ALIASES[lower] || setting;
}
function resolve_setting_path(project_path, setting) {
  const canonical = resolve_setting_name(setting);
  return path.join(project_path, "ProjectSettings", `${canonical}.asset`);
}
function parse_tag_manager(content) {
  const tags = [];
  const layers = [];
  const sorting_layers = [];
  const tagsMatch = content.match(/tags:\s*\n((?:\s*-\s*.+\n)*)/);
  if (tagsMatch) {
    const tagLines = tagsMatch[1].matchAll(/^\s*-\s*(.+)$/gm);
    for (const m of tagLines) {
      tags.push(m[1].trim());
    }
  }
  const layersMatch = content.match(/layers:\s*\n([\s\S]*?)(?=\s*m_SortingLayers:)/);
  if (layersMatch) {
    const layerLines = layersMatch[1].split(`
`).filter((l) => l.match(/^\s*-/));
    for (let i = 0;i < layerLines.length; i++) {
      const nameMatch = layerLines[i].match(/^\s*-\s*(.*)$/);
      const name = nameMatch ? nameMatch[1].trim() : "";
      if (name) {
        layers.push({ index: i, name });
      }
    }
  }
  const sortingMatch = content.match(/m_SortingLayers:\s*\n([\s\S]*?)(?=\n[^\s]|\n*$)/);
  if (sortingMatch) {
    const entryPattern = /- name:\s*(.+)\n\s*uniqueID:\s*(\d+)\n\s*locked:\s*(\d+)/g;
    let m;
    while ((m = entryPattern.exec(sortingMatch[1])) !== null) {
      sorting_layers.push({
        name: m[1].trim(),
        unique_id: parseInt(m[2], 10),
        locked: parseInt(m[3], 10)
      });
    }
  }
  return { tags, layers, sorting_layers };
}
function parse_dynamics_manager(content) {
  const parse_vector = (str) => {
    const m = str.match(/\{x:\s*([-\d.]+),\s*y:\s*([-\d.]+),\s*z:\s*([-\d.]+)\}/);
    return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]), z: parseFloat(m[3]) } : { x: 0, y: 0, z: 0 };
  };
  const get_float = (key) => {
    const m = content.match(new RegExp(`${key}:\\s*([-\\d.]+)`));
    return m ? parseFloat(m[1]) : 0;
  };
  const get_int = (key) => {
    const m = content.match(new RegExp(`${key}:\\s*(\\d+)`));
    return m ? parseInt(m[1], 10) : 0;
  };
  const gravity_match = content.match(/m_Gravity:\s*(\{[^}]+\})/);
  const gravity = gravity_match ? parse_vector(gravity_match[1]) : { x: 0, y: -9.81, z: 0 };
  return {
    gravity,
    default_contact_offset: get_float("m_DefaultContactOffset"),
    default_solver_iterations: get_int("m_DefaultSolverIterations"),
    default_solver_velocity_iterations: get_int("m_DefaultSolverVelocityIterations"),
    bounce_threshold: get_float("m_BounceThreshold"),
    sleep_threshold: get_float("m_SleepThreshold"),
    queries_hit_triggers: get_int("m_QueriesHitTriggers") === 1,
    auto_simulation: get_int("m_AutoSimulation") === 1
  };
}
function parse_quality_settings(content) {
  const current_match = content.match(/m_CurrentQuality:\s*(\d+)/);
  const current_quality = current_match ? parseInt(current_match[1], 10) : 0;
  const quality_levels = [];
  const levels_section = content.match(/m_QualitySettings:\s*\n([\s\S]*?)(?=\n\s*m_PerPlatformDefaultQuality:|\n*$)/);
  if (levels_section) {
    const entries = levels_section[1].split(/\n\s*-\s*serializedVersion:\s*\d+\n/).filter((s) => s.trim());
    for (const entry of entries) {
      const get = (key) => {
        const m = entry.match(new RegExp(`${key}:\\s*(.+)`));
        return m ? m[1].trim() : "";
      };
      const name = get("name");
      if (!name)
        continue;
      quality_levels.push({
        name,
        pixel_light_count: parseInt(get("pixelLightCount") || "0", 10),
        shadows: parseInt(get("shadows") || "0", 10),
        shadow_resolution: parseInt(get("shadowResolution") || "0", 10),
        shadow_distance: parseFloat(get("shadowDistance") || "0"),
        anti_aliasing: parseInt(get("antiAliasing") || "0", 10),
        vsync_count: parseInt(get("vSyncCount") || "0", 10),
        lod_bias: parseFloat(get("lodBias") || "0")
      });
    }
  }
  return { current_quality, quality_levels };
}
function parse_time_manager(content) {
  const get_float = (key) => {
    const m = content.match(new RegExp(`${key}:\\s*([-\\d.]+)`));
    return m ? parseFloat(m[1]) : 0;
  };
  return {
    fixed_timestep: get_float("Fixed Timestep"),
    max_timestep: get_float("Maximum Allowed Timestep"),
    time_scale: get_float("m_TimeScale"),
    max_particle_timestep: get_float("Maximum Particle Timestep")
  };
}
function parse_generic_asset(content) {
  const result = {};
  const lines = content.split(`
`);
  for (const line of lines) {
    const match = line.match(/^\s{2}(\w[\w\s]*\w|\w+):\s*(.+)$/);
    if (match) {
      const key = match[1];
      let value = match[2].trim();
      if (/^-?\d+(\.\d+)?$/.test(value)) {
        value = parseFloat(value);
      } else if (value === "0" || value === "1") {
        value = parseInt(value, 10);
      }
      result[key] = value;
    }
  }
  return result;
}
function read_settings(options) {
  const { project_path, setting } = options;
  const file_path = resolve_setting_path(project_path, setting);
  if (!import_fs5.existsSync(file_path)) {
    return {
      success: false,
      project_path,
      setting,
      error: `Settings file not found: ${file_path}`
    };
  }
  let content;
  try {
    content = import_fs5.readFileSync(file_path, "utf-8");
  } catch (err) {
    return {
      success: false,
      project_path,
      setting,
      error: `Failed to read settings file: ${err instanceof Error ? err.message : String(err)}`
    };
  }
  const canonical = resolve_setting_name(setting);
  let data;
  switch (canonical) {
    case "TagManager":
      data = parse_tag_manager(content);
      break;
    case "DynamicsManager":
      data = parse_dynamics_manager(content);
      break;
    case "QualitySettings":
      data = parse_quality_settings(content);
      break;
    case "TimeManager":
      data = parse_time_manager(content);
      break;
    default:
      data = parse_generic_asset(content);
      break;
  }
  return {
    success: true,
    project_path,
    setting: canonical,
    file_path,
    data
  };
}
function edit_settings(options) {
  const { project_path, setting, property, value } = options;
  const file_path = resolve_setting_path(project_path, setting);
  if (!import_fs5.existsSync(file_path)) {
    return {
      success: false,
      project_path,
      setting,
      error: `Settings file not found: ${file_path}`
    };
  }
  let content;
  try {
    content = import_fs5.readFileSync(file_path, "utf-8");
  } catch (err) {
    return {
      success: false,
      project_path,
      setting,
      error: `Failed to read settings file: ${err instanceof Error ? err.message : String(err)}`
    };
  }
  const propPattern = new RegExp(`(^\\s*${property}:\\s*)(.*)$`, "m");
  if (!propPattern.test(content)) {
    const prefixedPattern = new RegExp(`(^\\s*m_${property}:\\s*)(.*)$`, "m");
    if (!prefixedPattern.test(content)) {
      return {
        success: false,
        project_path,
        setting,
        error: `Property "${property}" not found in ${setting}`
      };
    }
    content = content.replace(prefixedPattern, `$1${value}`);
  } else {
    content = content.replace(propPattern, `$1${value}`);
  }
  const result = atomicWrite(file_path, content);
  if (!result.success) {
    return {
      success: false,
      project_path,
      setting,
      error: result.error
    };
  }
  return {
    success: true,
    project_path,
    setting: resolve_setting_name(setting),
    file_path,
    bytes_written: result.bytes_written
  };
}
function edit_tag(options) {
  const { project_path, action, tag } = options;
  const file_path = resolve_setting_path(project_path, "TagManager");
  if (!import_fs5.existsSync(file_path)) {
    return {
      success: false,
      project_path,
      setting: "TagManager",
      error: `TagManager not found: ${file_path}`
    };
  }
  let content;
  try {
    content = import_fs5.readFileSync(file_path, "utf-8");
  } catch (err) {
    return {
      success: false,
      project_path,
      setting: "TagManager",
      error: `Failed to read TagManager: ${err instanceof Error ? err.message : String(err)}`
    };
  }
  if (action === "add") {
    const existing = parse_tag_manager(content);
    if (existing.tags.includes(tag)) {
      return {
        success: false,
        project_path,
        setting: "TagManager",
        error: `Tag "${tag}" already exists`
      };
    }
    content = content.replace(/(tags:\s*\n(?:\s*-\s*.+\n)*)/, `$1  - ${tag}
`);
  } else {
    const tagPattern = new RegExp(`^\\s*-\\s*${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$\\n?`, "m");
    if (!tagPattern.test(content)) {
      return {
        success: false,
        project_path,
        setting: "TagManager",
        error: `Tag "${tag}" not found`
      };
    }
    content = content.replace(tagPattern, "");
  }
  const result = atomicWrite(file_path, content);
  if (!result.success) {
    return {
      success: false,
      project_path,
      setting: "TagManager",
      error: result.error
    };
  }
  return {
    success: true,
    project_path,
    setting: "TagManager",
    file_path,
    bytes_written: result.bytes_written
  };
}
function edit_layer(options) {
  const { project_path, index, name } = options;
  const file_path = resolve_setting_path(project_path, "TagManager");
  if (!import_fs5.existsSync(file_path)) {
    return {
      success: false,
      project_path,
      setting: "TagManager",
      error: `TagManager not found: ${file_path}`
    };
  }
  const RESERVED_LAYERS = {
    0: "Default",
    1: "TransparentFX",
    2: "Ignore Raycast",
    4: "Water",
    5: "UI"
  };
  if (index < 0 || index > 31) {
    return {
      success: false,
      project_path,
      setting: "TagManager",
      error: `Layer index must be between 0 and 31`
    };
  }
  if (RESERVED_LAYERS[index]) {
    return {
      success: false,
      project_path,
      setting: "TagManager",
      error: `Cannot modify reserved layer "${RESERVED_LAYERS[index]}" at index ${index}`
    };
  }
  let content;
  try {
    content = import_fs5.readFileSync(file_path, "utf-8");
  } catch (err) {
    return {
      success: false,
      project_path,
      setting: "TagManager",
      error: `Failed to read TagManager: ${err instanceof Error ? err.message : String(err)}`
    };
  }
  const layersMatch = content.match(/(layers:\s*\n)([\s\S]*?)(?=\s*m_SortingLayers:)/);
  if (!layersMatch) {
    return {
      success: false,
      project_path,
      setting: "TagManager",
      error: "Could not find layers section in TagManager"
    };
  }
  const layerLines = layersMatch[2].split(`
`).filter((l) => l.match(/^\s*-/));
  if (index >= layerLines.length) {
    return {
      success: false,
      project_path,
      setting: "TagManager",
      error: `Layer index ${index} is out of range (file has ${layerLines.length} layers)`
    };
  }
  layerLines[index] = `  - ${name}`;
  const newLayersSection = layerLines.join(`
`) + `
`;
  content = content.replace(layersMatch[2], newLayersSection);
  const result = atomicWrite(file_path, content);
  if (!result.success) {
    return {
      success: false,
      project_path,
      setting: "TagManager",
      error: result.error
    };
  }
  return {
    success: true,
    project_path,
    setting: "TagManager",
    file_path,
    bytes_written: result.bytes_written
  };
}
function edit_sorting_layer(options) {
  const { project_path, action, name } = options;
  const file_path = resolve_setting_path(project_path, "TagManager");
  if (!import_fs5.existsSync(file_path)) {
    return {
      success: false,
      project_path,
      setting: "TagManager",
      error: `TagManager not found: ${file_path}`
    };
  }
  let content;
  try {
    content = import_fs5.readFileSync(file_path, "utf-8");
  } catch (err) {
    return {
      success: false,
      project_path,
      setting: "TagManager",
      error: `Failed to read TagManager: ${err instanceof Error ? err.message : String(err)}`
    };
  }
  if (action === "add") {
    const existing = parse_tag_manager(content);
    if (existing.sorting_layers.some((sl) => sl.name === name)) {
      return {
        success: false,
        project_path,
        setting: "TagManager",
        error: `Sorting layer "${name}" already exists`
      };
    }
    const unique_id = Math.floor(Math.random() * 4294967295);
    const newEntry = `  - name: ${name}
    uniqueID: ${unique_id}
    locked: 0
`;
    const sortingEnd = content.match(/(m_SortingLayers:\s*\n(?:\s+-\s+name:[\s\S]*?(?=\n[^\s]|\n*$)))/);
    if (sortingEnd) {
      content = content.replace(sortingEnd[1], sortingEnd[1] + newEntry);
    } else {
      content = content.trimEnd() + `
` + newEntry;
    }
  } else {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const slPattern = new RegExp(`\\s*-\\s*name:\\s*${escapedName}\\n\\s*uniqueID:\\s*\\d+\\n\\s*locked:\\s*\\d+\\n?`, "m");
    if (!slPattern.test(content)) {
      return {
        success: false,
        project_path,
        setting: "TagManager",
        error: `Sorting layer "${name}" not found`
      };
    }
    content = content.replace(slPattern, `
`);
  }
  const result = atomicWrite(file_path, content);
  if (!result.success) {
    return {
      success: false,
      project_path,
      setting: "TagManager",
      error: result.error
    };
  }
  return {
    success: true,
    project_path,
    setting: "TagManager",
    file_path,
    bytes_written: result.bytes_written
  };
}
// src/project-search.ts
var import_fs6 = require("fs");
var path2 = __toESM(require("path"));
var BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".tga",
  ".psd",
  ".tif",
  ".tiff",
  ".fbx",
  ".obj",
  ".dae",
  ".blend",
  ".3ds",
  ".max",
  ".dll",
  ".so",
  ".dylib",
  ".exe",
  ".a",
  ".lib",
  ".mp3",
  ".wav",
  ".ogg",
  ".aif",
  ".aiff",
  ".mp4",
  ".mov",
  ".avi",
  ".wmv",
  ".zip",
  ".gz",
  ".tar",
  ".rar",
  ".7z",
  ".ttf",
  ".otf",
  ".woff",
  ".woff2",
  ".bank",
  ".bytes",
  ".db"
]);
var SKIP_DIRS = new Set(["Library", "Temp", "obj", "Logs", ".git", ".unity-agentic", "node_modules"]);
function walk_project_files(project_path, extensions, exclude_dirs) {
  const result = [];
  const skipSet = new Set([...SKIP_DIRS, ...exclude_dirs || []]);
  const extSet = new Set(extensions.map((e) => e.startsWith(".") ? e : `.${e}`));
  function walk(dir) {
    let entries;
    try {
      entries = import_fs6.readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path2.join(dir, entry);
      let stat;
      try {
        stat = import_fs6.statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        if (!skipSet.has(entry)) {
          walk(full);
        }
      } else if (stat.isFile()) {
        const ext = path2.extname(entry).toLowerCase();
        if (extSet.has(ext)) {
          result.push(full);
        }
      }
    }
  }
  const assetsDir = path2.join(project_path, "Assets");
  if (import_fs6.existsSync(assetsDir)) {
    walk(assetsDir);
  }
  if (extSet.has(".asset")) {
    const settingsDir = path2.join(project_path, "ProjectSettings");
    if (import_fs6.existsSync(settingsDir)) {
      walk(settingsDir);
    }
  }
  return result;
}
function search_project(options) {
  const {
    project_path,
    name,
    component,
    tag,
    layer,
    file_type = "all",
    page_size = 50,
    cursor = 0
  } = options;
  if (!import_fs6.existsSync(project_path)) {
    return {
      success: false,
      project_path,
      total_files_scanned: 0,
      total_matches: 0,
      cursor: 0,
      truncated: false,
      matches: [],
      error: `Project path not found: ${project_path}`
    };
  }
  if (!isNativeModuleAvailable()) {
    return {
      success: false,
      project_path,
      total_files_scanned: 0,
      total_matches: 0,
      cursor: 0,
      truncated: false,
      matches: [],
      error: "Native scanner module not available. Run /initial-install first."
    };
  }
  const extensions = [];
  if (file_type === "scene" || file_type === "all")
    extensions.push(".unity");
  if (file_type === "prefab" || file_type === "all")
    extensions.push(".prefab");
  const files = walk_project_files(project_path, extensions);
  const paginatedFiles = files.slice(cursor, cursor + page_size);
  const truncated = cursor + page_size < files.length;
  const next_cursor = truncated ? cursor + page_size : undefined;
  const scanner = new UnityScanner;
  const matches = [];
  for (const file of paginatedFiles) {
    try {
      let gameObjects;
      if (name) {
        gameObjects = scanner.find_by_name(file, name, true);
      } else {
        if (component) {
          gameObjects = scanner.scan_scene_with_components(file);
        } else {
          gameObjects = scanner.scan_scene_minimal(file);
        }
      }
      for (const go of gameObjects) {
        if (component) {
          const goWithComps = go;
          if (goWithComps.components) {
            const hasComponent = goWithComps.components.some((c) => c.type.toLowerCase() === component.toLowerCase());
            if (!hasComponent)
              continue;
          } else {
            continue;
          }
        }
        if (tag && go.tag !== tag)
          continue;
        if (layer !== undefined && go.layer !== layer)
          continue;
        const relPath = path2.relative(project_path, file);
        const match = {
          file: relPath,
          game_object: go.name,
          file_id: go.file_id,
          tag: go.tag,
          layer: go.layer
        };
        const goAny = go;
        if (goAny.components) {
          match.components = goAny.components.map((c) => c.type);
        }
        matches.push(match);
      }
    } catch {
      continue;
    }
  }
  return {
    success: true,
    project_path,
    total_files_scanned: paginatedFiles.length,
    total_matches: matches.length,
    cursor,
    next_cursor,
    truncated,
    matches
  };
}
function grep_project(options) {
  const {
    project_path,
    pattern,
    file_type = "all",
    max_results = 100,
    context_lines = 0
  } = options;
  if (!import_fs6.existsSync(project_path)) {
    return {
      success: false,
      project_path,
      pattern,
      total_files_scanned: 0,
      total_matches: 0,
      truncated: false,
      matches: [],
      error: `Project path not found: ${project_path}`
    };
  }
  let regex;
  try {
    regex = new RegExp(pattern, "i");
  } catch (err) {
    return {
      success: false,
      project_path,
      pattern,
      total_files_scanned: 0,
      total_matches: 0,
      truncated: false,
      matches: [],
      error: `Invalid regex pattern: ${err instanceof Error ? err.message : String(err)}`
    };
  }
  const EXTENSION_MAP = {
    cs: [".cs"],
    yaml: [".yaml", ".yml"],
    unity: [".unity"],
    prefab: [".prefab"],
    asset: [".asset"],
    all: [".cs", ".unity", ".prefab", ".asset", ".yaml", ".yml", ".txt", ".json", ".xml", ".shader", ".cginc", ".hlsl", ".compute", ".asmdef", ".asmref"]
  };
  const extensions = EXTENSION_MAP[file_type] || EXTENSION_MAP.all;
  const files = walk_project_files(project_path, extensions);
  const matches = [];
  let totalFilesScanned = 0;
  let truncated = false;
  for (const file of files) {
    const ext = path2.extname(file).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext))
      continue;
    totalFilesScanned++;
    let content;
    try {
      content = import_fs6.readFileSync(file, "utf-8");
    } catch {
      continue;
    }
    const lines = content.split(`
`);
    const relPath = path2.relative(project_path, file);
    for (let i = 0;i < lines.length; i++) {
      if (regex.test(lines[i])) {
        let line = lines[i];
        if (line.length > 200) {
          line = line.substring(0, 200) + "...";
        }
        const match = {
          file: relPath,
          line_number: i + 1,
          line
        };
        if (context_lines > 0) {
          match.context_before = [];
          match.context_after = [];
          for (let j = Math.max(0, i - context_lines);j < i; j++) {
            let ctxLine = lines[j];
            if (ctxLine.length > 200)
              ctxLine = ctxLine.substring(0, 200) + "...";
            match.context_before.push(ctxLine);
          }
          for (let j = i + 1;j <= Math.min(lines.length - 1, i + context_lines); j++) {
            let ctxLine = lines[j];
            if (ctxLine.length > 200)
              ctxLine = ctxLine.substring(0, 200) + "...";
            match.context_after.push(ctxLine);
          }
        }
        matches.push(match);
        if (matches.length >= max_results) {
          truncated = true;
          break;
        }
      }
    }
    if (truncated)
      break;
  }
  return {
    success: true,
    project_path,
    pattern,
    total_files_scanned: totalFilesScanned,
    total_matches: matches.length,
    truncated,
    matches
  };
}
// src/editor.ts
var import_fs7 = require("fs");

// src/class-ids.ts
var UNITY_CLASS_IDS = {
  1: "GameObject",
  2: "Component",
  3: "LevelGameManager",
  4: "Transform",
  5: "TimeManager",
  6: "GlobalGameManager",
  8: "Behaviour",
  9: "GameManager",
  11: "AudioManager",
  13: "InputManager",
  18: "EditorExtension",
  19: "Physics2DSettings",
  20: "Camera",
  21: "Material",
  23: "MeshRenderer",
  25: "Renderer",
  27: "Texture",
  28: "Texture2D",
  29: "OcclusionCullingSettings",
  30: "GraphicsSettings",
  33: "MeshFilter",
  41: "OcclusionPortal",
  43: "Mesh",
  45: "Skybox",
  47: "QualitySettings",
  48: "Shader",
  49: "TextAsset",
  50: "Rigidbody2D",
  53: "Collider2D",
  54: "Rigidbody",
  55: "PhysicsManager",
  56: "Collider",
  57: "Joint",
  58: "CircleCollider2D",
  59: "HingeJoint",
  60: "PolygonCollider2D",
  61: "BoxCollider2D",
  62: "PhysicsMaterial2D",
  64: "MeshCollider",
  65: "BoxCollider",
  66: "CompositeCollider2D",
  68: "EdgeCollider2D",
  70: "CapsuleCollider2D",
  72: "ComputeShader",
  74: "AnimationClip",
  75: "ConstantForce",
  78: "TagManager",
  81: "AudioListener",
  82: "AudioSource",
  83: "AudioClip",
  84: "RenderTexture",
  86: "CustomRenderTexture",
  89: "Cubemap",
  90: "Avatar",
  91: "AnimatorController",
  93: "RuntimeAnimatorController",
  94: "ScriptMapper",
  95: "Animator",
  96: "TrailRenderer",
  98: "DelayedCallManager",
  102: "TextMesh",
  104: "RenderSettings",
  108: "Light",
  109: "CGProgram",
  110: "BaseAnimationTrack",
  111: "Animation",
  114: "MonoBehaviour",
  115: "MonoScript",
  117: "Texture3D",
  119: "NewAnimationTrack",
  120: "Projector",
  121: "LineRenderer",
  122: "Flare",
  123: "Halo",
  124: "LensFlare",
  125: "FlareLayer",
  126: "HaloLayer",
  127: "NavMeshProjectSettings",
  128: "Font",
  129: "PlayerSettings",
  130: "NamedObject",
  134: "PhysicMaterial",
  135: "SphereCollider",
  136: "CapsuleCollider",
  137: "SkinnedMeshRenderer",
  138: "FixedJoint",
  141: "BuildSettings",
  142: "AssetBundle",
  143: "CharacterController",
  144: "CharacterJoint",
  145: "SpringJoint",
  146: "WheelCollider",
  147: "ResourceManager",
  150: "PreloadData",
  153: "ConfigurableJoint",
  154: "TerrainCollider",
  156: "TerrainData",
  157: "LightmapSettings",
  158: "WebCamTexture",
  159: "EditorSettings",
  162: "EditorUserSettings",
  164: "AudioReverbFilter",
  165: "AudioHighPassFilter",
  166: "AudioChorusFilter",
  167: "AudioReverbZone",
  168: "AudioEchoFilter",
  169: "AudioLowPassFilter",
  170: "AudioDistortionFilter",
  171: "SparseTexture",
  180: "AudioBehaviour",
  181: "AudioFilter",
  182: "WindZone",
  183: "Cloth",
  184: "SubstanceArchive",
  185: "ProceduralMaterial",
  186: "ProceduralTexture",
  187: "Texture2DArray",
  188: "CubemapArray",
  191: "OffMeshLink",
  192: "OcclusionArea",
  193: "Tree",
  195: "NavMeshAgent",
  196: "NavMeshSettings",
  198: "ParticleSystem",
  199: "ParticleSystemRenderer",
  200: "ShaderVariantCollection",
  205: "LODGroup",
  206: "BlendTree",
  207: "Motion",
  208: "NavMeshObstacle",
  210: "SortingGroup",
  212: "SpriteRenderer",
  213: "Sprite",
  214: "CachedSpriteAtlas",
  215: "ReflectionProbe",
  218: "Terrain",
  220: "LightProbeGroup",
  221: "AnimatorOverrideController",
  222: "CanvasRenderer",
  223: "Canvas",
  224: "RectTransform",
  225: "CanvasGroup",
  226: "BillboardAsset",
  227: "BillboardRenderer",
  228: "SpeedTreeWindAsset",
  229: "AnchoredJoint2D",
  230: "Joint2D",
  231: "SpringJoint2D",
  232: "DistanceJoint2D",
  233: "HingeJoint2D",
  234: "SliderJoint2D",
  235: "WheelJoint2D",
  236: "ClusterInputManager",
  237: "BaseVideoTexture",
  238: "NavMeshData",
  240: "AudioMixer",
  241: "AudioMixerController",
  243: "AudioMixerGroupController",
  244: "AudioMixerEffectController",
  245: "AudioMixerSnapshotController",
  246: "PhysicsUpdateBehaviour2D",
  247: "ConstantForce2D",
  248: "Effector2D",
  249: "AreaEffector2D",
  250: "PointEffector2D",
  251: "PlatformEffector2D",
  252: "SurfaceEffector2D",
  253: "BuoyancyEffector2D",
  254: "RelativeJoint2D",
  255: "FixedJoint2D",
  256: "FrictionJoint2D",
  257: "TargetJoint2D",
  258: "LightProbes",
  259: "LightProbeProxyVolume",
  260: "SampleClip",
  261: "AudioMixerSnapshot",
  262: "AudioMixerGroup",
  265: "NScreenBridge",
  271: "AssetBundleManifest",
  272: "UnityAdsManager",
  273: "RuntimeInitializeOnLoadManager",
  280: "UnityConnectSettings",
  281: "AvatarMask",
  290: "PlayableDirector",
  292: "VideoPlayer",
  293: "VideoClip",
  294: "ParticleSystemForceField",
  298: "SpriteMask",
  300: "WorldAnchor",
  301: "OcclusionCullingData",
  310: "PrefabInstance",
  319: "TextureImporter",
  363: "Preset",
  687078895: "SpriteAtlas",
  1839735485: "Tilemap",
  1839735486: "TilemapCollider2D",
  1839735487: "TilemapRenderer"
};
var UNITY_CLASS_NAMES = Object.fromEntries(Object.entries(UNITY_CLASS_IDS).map(([id, name]) => [name, parseInt(id, 10)]));

// src/editor.ts
function createScene(options) {
  const { output_path, include_defaults, scene_guid } = options;
  if (!output_path.endsWith(".unity")) {
    return {
      success: false,
      output_path,
      error: "Output path must have .unity extension"
    };
  }
  const guid = scene_guid || generateGuid();
  let yaml = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!29 &1
OcclusionCullingSettings:
  m_ObjectHideFlags: 0
  serializedVersion: 2
  m_OcclusionBakeSettings:
    smallestOccluder: 5
    smallestHole: 0.25
    backfaceThreshold: 100
  m_SceneGUID: 00000000000000000000000000000000
  m_OcclusionCullingData: {fileID: 0}
--- !u!104 &2
RenderSettings:
  m_ObjectHideFlags: 0
  serializedVersion: 9
  m_Fog: 0
  m_FogColor: {r: 0.5, g: 0.5, b: 0.5, a: 1}
  m_FogMode: 3
  m_FogDensity: 0.01
  m_LinearFogStart: 0
  m_LinearFogEnd: 300
  m_AmbientSkyColor: {r: 0.212, g: 0.227, b: 0.259, a: 1}
  m_AmbientEquatorColor: {r: 0.114, g: 0.125, b: 0.133, a: 1}
  m_AmbientGroundColor: {r: 0.047, g: 0.043, b: 0.035, a: 1}
  m_AmbientIntensity: 1
  m_AmbientMode: 0
  m_SubtractiveShadowColor: {r: 0.42, g: 0.478, b: 0.627, a: 1}
  m_SkyboxMaterial: {fileID: 10304, guid: 0000000000000000f000000000000000, type: 0}
  m_HaloStrength: 0.5
  m_FlareStrength: 1
  m_FlareFadeSpeed: 3
  m_HaloTexture: {fileID: 0}
  m_SpotCookie: {fileID: 10001, guid: 0000000000000000e000000000000000, type: 0}
  m_DefaultReflectionMode: 0
  m_DefaultReflectionResolution: 128
  m_ReflectionBounces: 1
  m_ReflectionIntensity: 1
  m_CustomReflection: {fileID: 0}
  m_Sun: {fileID: 0}
  m_IndirectSpecularColor: {r: 0.44657898, g: 0.4964133, b: 0.5748178, a: 1}
  m_UseRadianceAmbientProbe: 0
--- !u!157 &3
LightmapSettings:
  m_ObjectHideFlags: 0
  serializedVersion: 12
  m_GIWorkflowMode: 1
  m_GISettings:
    serializedVersion: 2
    m_BounceScale: 1
    m_IndirectOutputScale: 1
    m_AlbedoBoost: 1
    m_EnvironmentLightingMode: 0
    m_EnableBakedLightmaps: 1
    m_EnableRealtimeLightmaps: 0
  m_LightmapEditorSettings:
    serializedVersion: 12
    m_Resolution: 2
    m_BakeResolution: 40
    m_AtlasSize: 1024
    m_AO: 0
    m_AOMaxDistance: 1
    m_CompAOExponent: 1
    m_CompAOExponentDirect: 0
    m_ExtractAmbientOcclusion: 0
    m_Padding: 2
    m_LightmapParameters: {fileID: 0}
    m_LightmapsBakeMode: 1
    m_TextureCompression: 1
    m_FinalGather: 0
    m_FinalGatherFiltering: 1
    m_FinalGatherRayCount: 256
    m_ReflectionCompression: 2
    m_MixedBakeMode: 2
    m_BakeBackend: 1
    m_PVRSampling: 1
    m_PVRDirectSampleCount: 32
    m_PVRSampleCount: 512
    m_PVRBounces: 2
    m_PVREnvironmentSampleCount: 256
    m_PVREnvironmentReferencePointCount: 2048
    m_PVRFilteringMode: 1
    m_PVRDenoiserTypeDirect: 1
    m_PVRDenoiserTypeIndirect: 1
    m_PVRDenoiserTypeAO: 1
    m_PVRFilterTypeDirect: 0
    m_PVRFilterTypeIndirect: 0
    m_PVRFilterTypeAO: 0
    m_PVREnvironmentMIS: 1
    m_PVRCulling: 1
    m_PVRFilteringGaussRadiusDirect: 1
    m_PVRFilteringGaussRadiusIndirect: 5
    m_PVRFilteringGaussRadiusAO: 2
    m_PVRFilteringAtrousPositionSigmaDirect: 0.5
    m_PVRFilteringAtrousPositionSigmaIndirect: 2
    m_PVRFilteringAtrousPositionSigmaAO: 1
    m_ExportTrainingData: 0
    m_TrainingDataDestination: TrainingData
    m_LightProbeSampleCountMultiplier: 4
  m_LightingDataAsset: {fileID: 0}
  m_LightingSettings: {fileID: 0}
--- !u!196 &4
NavMeshSettings:
  serializedVersion: 2
  m_ObjectHideFlags: 0
  m_BuildSettings:
    serializedVersion: 3
    agentTypeID: 0
    agentRadius: 0.5
    agentHeight: 2
    agentSlope: 45
    agentClimb: 0.4
    ledgeDropHeight: 0
    maxJumpAcrossDistance: 0
    minRegionArea: 2
    manualCellSize: 0
    cellSize: 0.16666667
    manualTileSize: 0
    tileSize: 256
    buildHeightMesh: 0
    maxJobWorkers: 0
    preserveTilesOutsideBounds: 0
    debug:
      m_Flags: 0
  m_NavMeshData: {fileID: 0}
`;
  if (include_defaults) {
    yaml += `--- !u!1 &519420028
GameObject:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  serializedVersion: 6
  m_Component:
  - component: {fileID: 519420032}
  - component: {fileID: 519420031}
  - component: {fileID: 519420029}
  m_Layer: 0
  m_Name: Main Camera
  m_TagString: MainCamera
  m_Icon: {fileID: 0}
  m_NavMeshLayer: 0
  m_StaticEditorFlags: 0
  m_IsActive: 1
--- !u!4 &519420032
Transform:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 519420028}
  serializedVersion: 2
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalPosition: {x: 0, y: 1, z: -10}
  m_LocalScale: {x: 1, y: 1, z: 1}
  m_ConstrainProportionsScale: 0
  m_Children: []
  m_Father: {fileID: 0}
  m_LocalEulerAnglesHint: {x: 0, y: 0, z: 0}
--- !u!20 &519420031
Camera:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 519420028}
  m_Enabled: 1
  serializedVersion: 2
  m_ClearFlags: 1
  m_BackGroundColor: {r: 0.19215687, g: 0.3019608, b: 0.4745098, a: 0}
  m_projectionMatrixMode: 1
  m_GateFitMode: 2
  m_FOVAxisMode: 0
  m_Iso: 200
  m_ShutterSpeed: 0.005
  m_Aperture: 16
  m_FocusDistance: 10
  m_FocalLength: 50
  m_BladeCount: 5
  m_Curvature: {x: 2, y: 11}
  m_BarrelClipping: 0.25
  m_Anamorphism: 0
  m_SensorSize: {x: 36, y: 24}
  m_LensShift: {x: 0, y: 0}
  m_NormalizedViewPortRect:
    serializedVersion: 2
    x: 0
    y: 0
    width: 1
    height: 1
  near clip plane: 0.3
  far clip plane: 1000
  field of view: 60
  orthographic: 0
  orthographic size: 5
  m_Depth: -1
  m_CullingMask:
    serializedVersion: 2
    m_Bits: 4294967295
  m_RenderingPath: -1
  m_TargetTexture: {fileID: 0}
  m_TargetDisplay: 0
  m_TargetEye: 3
  m_HDR: 1
  m_AllowMSAA: 1
  m_AllowDynamicResolution: 0
  m_ForceIntoRT: 0
  m_OcclusionCulling: 1
  m_StereoConvergence: 10
  m_StereoSeparation: 0.022
--- !u!81 &519420029
AudioListener:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 519420028}
  m_Enabled: 1
--- !u!1 &705507993
GameObject:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  serializedVersion: 6
  m_Component:
  - component: {fileID: 705507995}
  - component: {fileID: 705507994}
  m_Layer: 0
  m_Name: Directional Light
  m_TagString: Untagged
  m_Icon: {fileID: 0}
  m_NavMeshLayer: 0
  m_StaticEditorFlags: 0
  m_IsActive: 1
--- !u!4 &705507995
Transform:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 705507993}
  serializedVersion: 2
  m_LocalRotation: {x: 0.40821788, y: -0.23456968, z: 0.10938163, w: 0.8754261}
  m_LocalPosition: {x: 0, y: 3, z: 0}
  m_LocalScale: {x: 1, y: 1, z: 1}
  m_ConstrainProportionsScale: 0
  m_Children: []
  m_Father: {fileID: 0}
  m_LocalEulerAnglesHint: {x: 50, y: -30, z: 0}
--- !u!108 &705507994
Light:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 705507993}
  m_Enabled: 1
  serializedVersion: 10
  m_Type: 1
  m_Shape: 0
  m_Color: {r: 1, g: 0.95686275, b: 0.8392157, a: 1}
  m_Intensity: 1
  m_Range: 10
  m_SpotAngle: 30
  m_InnerSpotAngle: 21.80208
  m_CookieSize: 10
  m_Shadows:
    m_Type: 2
    m_Resolution: -1
    m_CustomResolution: -1
    m_Strength: 1
    m_Bias: 0.05
    m_NormalBias: 0.4
    m_NearPlane: 0.2
    m_CullingMatrixOverride:
      e00: 1
      e01: 0
      e02: 0
      e03: 0
      e10: 0
      e11: 1
      e12: 0
      e13: 0
      e20: 0
      e21: 0
      e22: 1
      e23: 0
      e30: 0
      e31: 0
      e32: 0
      e33: 1
    m_UseCullingMatrixOverride: 0
  m_Cookie: {fileID: 0}
  m_DrawHalo: 0
  m_Flare: {fileID: 0}
  m_RenderMode: 0
  m_CullingMask:
    serializedVersion: 2
    m_Bits: 4294967295
  m_RenderingLayerMask: 1
  m_Lightmapping: 4
  m_LightShadowCasterMode: 0
  m_AreaSize: {x: 1, y: 1}
  m_BounceIntensity: 1
  m_ColorTemperature: 6570
  m_UseColorTemperature: 0
  m_BoundingSphereOverride: {x: 0, y: 0, z: 0, w: 0}
  m_UseBoundingSphereOverride: 0
  m_UseViewFrustumForShadowCasterCull: 1
  m_ShadowRadius: 0
  m_ShadowAngle: 0
`;
  }
  try {
    import_fs7.writeFileSync(output_path, yaml, "utf-8");
  } catch (err) {
    return {
      success: false,
      output_path,
      error: `Failed to write scene file: ${err instanceof Error ? err.message : String(err)}`
    };
  }
  const metaContent = `fileFormatVersion: 2
guid: ${guid}
DefaultImporter:
  externalObjects: {}
  userData:
  assetBundleName:
  assetBundleVariant:
`;
  const metaPath = output_path + ".meta";
  try {
    import_fs7.writeFileSync(metaPath, metaContent, "utf-8");
  } catch (err) {
    try {
      const fs = require("fs");
      fs.unlinkSync(output_path);
    } catch {}
    return {
      success: false,
      output_path,
      error: `Failed to write .meta file: ${err instanceof Error ? err.message : String(err)}`
    };
  }
  return {
    success: true,
    output_path,
    scene_guid: guid,
    meta_path: metaPath
  };
}
})
