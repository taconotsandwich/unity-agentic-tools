"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reorder_scenes = exports.move_scene = exports.disable_scene = exports.enable_scene = exports.remove_scene = exports.add_scene = exports.get_build_settings = exports.list_build_profiles = exports.parse_build_profile = exports.parse_editor_build_settings = exports.get_project_info = exports.has_build_profiles = exports.read_project_version = exports.is_unity6_or_later = exports.parse_version = void 0;
// Version detection
var version_1 = require("./version");
Object.defineProperty(exports, "parse_version", { enumerable: true, get: function () { return version_1.parse_version; } });
Object.defineProperty(exports, "is_unity6_or_later", { enumerable: true, get: function () { return version_1.is_unity6_or_later; } });
Object.defineProperty(exports, "read_project_version", { enumerable: true, get: function () { return version_1.read_project_version; } });
Object.defineProperty(exports, "has_build_profiles", { enumerable: true, get: function () { return version_1.has_build_profiles; } });
Object.defineProperty(exports, "get_project_info", { enumerable: true, get: function () { return version_1.get_project_info; } });
// Build settings reading
var build_settings_1 = require("./build-settings");
Object.defineProperty(exports, "parse_editor_build_settings", { enumerable: true, get: function () { return build_settings_1.parse_editor_build_settings; } });
Object.defineProperty(exports, "parse_build_profile", { enumerable: true, get: function () { return build_settings_1.parse_build_profile; } });
Object.defineProperty(exports, "list_build_profiles", { enumerable: true, get: function () { return build_settings_1.list_build_profiles; } });
Object.defineProperty(exports, "get_build_settings", { enumerable: true, get: function () { return build_settings_1.get_build_settings; } });
// Build settings editing
var editor_1 = require("./editor");
Object.defineProperty(exports, "add_scene", { enumerable: true, get: function () { return editor_1.add_scene; } });
Object.defineProperty(exports, "remove_scene", { enumerable: true, get: function () { return editor_1.remove_scene; } });
Object.defineProperty(exports, "enable_scene", { enumerable: true, get: function () { return editor_1.enable_scene; } });
Object.defineProperty(exports, "disable_scene", { enumerable: true, get: function () { return editor_1.disable_scene; } });
Object.defineProperty(exports, "move_scene", { enumerable: true, get: function () { return editor_1.move_scene; } });
Object.defineProperty(exports, "reorder_scenes", { enumerable: true, get: function () { return editor_1.reorder_scenes; } });
//# sourceMappingURL=index.js.map