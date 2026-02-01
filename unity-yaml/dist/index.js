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
  module2.exports = require("./unity-agentic-core.darwin-arm64-x8b2vckr.node");
});

// ../rust-core/index.js
var require_rust_core = __commonJS((exports2, module2) => {
  var __dirname = "/Users/taco/Documents/Projects/unity-agentic-tools/rust-core";
  var { existsSync, readFileSync } = require("fs");
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
          localFileExisted = existsSync(join2(__dirname, "unity-agentic-core.android-arm64.node"));
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
          localFileExisted = existsSync(join2(__dirname, "unity-agentic-core.android-arm-eabi.node"));
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
          localFileExisted = existsSync(join2(__dirname, "unity-agentic-core.win32-x64-msvc.node"));
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
          localFileExisted = existsSync(join2(__dirname, "unity-agentic-core.win32-ia32-msvc.node"));
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
          localFileExisted = existsSync(join2(__dirname, "unity-agentic-core.win32-arm64-msvc.node"));
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
      localFileExisted = existsSync(join2(__dirname, "unity-agentic-core.darwin-universal.node"));
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
          localFileExisted = existsSync(join2(__dirname, "unity-agentic-core.darwin-x64.node"));
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
          localFileExisted = existsSync(join2(__dirname, "unity-agentic-core.darwin-arm64.node"));
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
      localFileExisted = existsSync(join2(__dirname, "unity-agentic-core.freebsd-x64.node"));
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
            localFileExisted = existsSync(join2(__dirname, "unity-agentic-core.linux-x64-musl.node"));
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
            localFileExisted = existsSync(join2(__dirname, "unity-agentic-core.linux-x64-gnu.node"));
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
            localFileExisted = existsSync(join2(__dirname, "unity-agentic-core.linux-arm64-musl.node"));
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
            localFileExisted = existsSync(join2(__dirname, "unity-agentic-core.linux-arm64-gnu.node"));
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
            localFileExisted = existsSync(join2(__dirname, "unity-agentic-core.linux-arm-musleabihf.node"));
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
            localFileExisted = existsSync(join2(__dirname, "unity-agentic-core.linux-arm-gnueabihf.node"));
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
            localFileExisted = existsSync(join2(__dirname, "unity-agentic-core.linux-riscv64-musl.node"));
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
            localFileExisted = existsSync(join2(__dirname, "unity-agentic-core.linux-riscv64-gnu.node"));
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
          localFileExisted = existsSync(join2(__dirname, "unity-agentic-core.linux-s390x-gnu.node"));
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
  setup: () => setup,
  cleanup: () => cleanup,
  UnityScanner: () => UnityScanner
});
module.exports = __toCommonJS(exports_src);

// src/scanner.ts
var import_module = require("module");
var import_path = require("path");
var __filename = "/Users/taco/Documents/Projects/unity-agentic-tools/unity-yaml/src/scanner.ts";
var RustScanner;
try {
  const customRequire = import_module.createRequire("file:///Users/taco/Documents/Projects/unity-agentic-tools/unity-yaml/src/scanner.ts");
  const rustCorePath = import_path.join(import_path.dirname(__filename), "..", "..", "rust-core");
  const rustModule = customRequire(rustCorePath);
  RustScanner = rustModule.Scanner;
} catch (err) {
  throw new Error(`Failed to load native Rust module. Please install the pre-built binary for your platform.
` + `Download from: https://github.com/anthropics/unity-agentic-tools/releases
` + `Original error: ${err.message}`);
}

class UnityScanner {
  scanner;
  constructor() {
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
}
// src/setup.ts
var import_fs = require("fs");
var import_path2 = require("path");
var CONFIG_DIR = ".unity-agentic";
var CONFIG_FILE = "config.json";
var GUID_CACHE_FILE = "guid-cache.json";
var DOC_INDEX_FILE = "doc-index.json";
function setup(options = {}) {
  const projectPath = import_path2.resolve(options.project || process.cwd());
  const assetsPath = import_path2.join(projectPath, "Assets");
  if (!import_fs.existsSync(assetsPath)) {
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
  if (!import_fs.existsSync(configPath)) {
    import_fs.mkdirSync(configPath, { recursive: true });
  }
  const config = {
    version: "1.0.0",
    project_path: projectPath,
    created_at: new Date().toISOString(),
    rust_enabled: isRustAvailable()
  };
  import_fs.writeFileSync(import_path2.join(configPath, CONFIG_FILE), JSON.stringify(config, null, 2));
  const guidCache = buildGuidCache(projectPath);
  const guidCachePath = import_path2.join(configPath, GUID_CACHE_FILE);
  import_fs.writeFileSync(guidCachePath, JSON.stringify(guidCache, null, 2));
  let docIndexCreated = false;
  if (options.indexDocs) {
    const docIndex = { chunks: {}, last_updated: Date.now() };
    import_fs.writeFileSync(import_path2.join(configPath, DOC_INDEX_FILE), JSON.stringify(docIndex, null, 2));
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
  if (!import_fs.existsSync(assetsDir)) {
    return cache;
  }
  scanMetaFiles(assetsDir, projectRoot, cache);
  return cache;
}
function scanMetaFiles(dir, projectRoot, cache) {
  try {
    const entries = import_fs.readdirSync(dir);
    for (const entry of entries) {
      const fullPath = import_path2.join(dir, entry);
      const stat = import_fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scanMetaFiles(fullPath, projectRoot, cache);
      } else if (entry.endsWith(".meta")) {
        try {
          const content = import_fs.readFileSync(fullPath, "utf-8");
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
var import_fs2 = require("fs");
var import_path3 = require("path");
var CONFIG_DIR2 = ".unity-agentic";
var CONFIG_FILE2 = "config.json";
var GUID_CACHE_FILE2 = "guid-cache.json";
var DOC_INDEX_FILE2 = "doc-index.json";
function cleanup(options = {}) {
  const projectPath = import_path3.resolve(options.project || process.cwd());
  const configPath = import_path3.join(projectPath, CONFIG_DIR2);
  if (!import_fs2.existsSync(configPath)) {
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
      if (import_fs2.existsSync(filePath)) {
        try {
          import_fs2.unlinkSync(filePath);
          filesRemoved.push(file);
        } catch {}
      }
    }
    const remaining = import_fs2.readdirSync(configPath);
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
  if (!import_fs2.existsSync(dir)) {
    return;
  }
  const entries = import_fs2.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = import_path3.join(dir, entry.name);
    if (entry.isDirectory()) {
      removeDirectoryRecursive(fullPath);
    } else {
      import_fs2.unlinkSync(fullPath);
    }
  }
  import_fs2.rmdirSync(dir);
}
})
