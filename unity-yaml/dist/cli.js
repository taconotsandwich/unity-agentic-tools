#!/usr/bin/env bun
// @bun @bun-cjs
(function(exports, require, module, __filename, __dirname) {var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);

// node_modules/commander/lib/error.js
var require_error = __commonJS((exports2) => {
  class CommanderError extends Error {
    constructor(exitCode, code, message) {
      super(message);
      Error.captureStackTrace(this, this.constructor);
      this.name = this.constructor.name;
      this.code = code;
      this.exitCode = exitCode;
      this.nestedError = undefined;
    }
  }

  class InvalidArgumentError extends CommanderError {
    constructor(message) {
      super(1, "commander.invalidArgument", message);
      Error.captureStackTrace(this, this.constructor);
      this.name = this.constructor.name;
    }
  }
  exports2.CommanderError = CommanderError;
  exports2.InvalidArgumentError = InvalidArgumentError;
});

// node_modules/commander/lib/argument.js
var require_argument = __commonJS((exports2) => {
  var { InvalidArgumentError } = require_error();

  class Argument {
    constructor(name, description) {
      this.description = description || "";
      this.variadic = false;
      this.parseArg = undefined;
      this.defaultValue = undefined;
      this.defaultValueDescription = undefined;
      this.argChoices = undefined;
      switch (name[0]) {
        case "<":
          this.required = true;
          this._name = name.slice(1, -1);
          break;
        case "[":
          this.required = false;
          this._name = name.slice(1, -1);
          break;
        default:
          this.required = true;
          this._name = name;
          break;
      }
      if (this._name.endsWith("...")) {
        this.variadic = true;
        this._name = this._name.slice(0, -3);
      }
    }
    name() {
      return this._name;
    }
    _collectValue(value, previous) {
      if (previous === this.defaultValue || !Array.isArray(previous)) {
        return [value];
      }
      previous.push(value);
      return previous;
    }
    default(value, description) {
      this.defaultValue = value;
      this.defaultValueDescription = description;
      return this;
    }
    argParser(fn) {
      this.parseArg = fn;
      return this;
    }
    choices(values) {
      this.argChoices = values.slice();
      this.parseArg = (arg, previous) => {
        if (!this.argChoices.includes(arg)) {
          throw new InvalidArgumentError(`Allowed choices are ${this.argChoices.join(", ")}.`);
        }
        if (this.variadic) {
          return this._collectValue(arg, previous);
        }
        return arg;
      };
      return this;
    }
    argRequired() {
      this.required = true;
      return this;
    }
    argOptional() {
      this.required = false;
      return this;
    }
  }
  function humanReadableArgName(arg) {
    const nameOutput = arg.name() + (arg.variadic === true ? "..." : "");
    return arg.required ? "<" + nameOutput + ">" : "[" + nameOutput + "]";
  }
  exports2.Argument = Argument;
  exports2.humanReadableArgName = humanReadableArgName;
});

// node_modules/commander/lib/help.js
var require_help = __commonJS((exports2) => {
  var { humanReadableArgName } = require_argument();

  class Help {
    constructor() {
      this.helpWidth = undefined;
      this.minWidthToWrap = 40;
      this.sortSubcommands = false;
      this.sortOptions = false;
      this.showGlobalOptions = false;
    }
    prepareContext(contextOptions) {
      this.helpWidth = this.helpWidth ?? contextOptions.helpWidth ?? 80;
    }
    visibleCommands(cmd) {
      const visibleCommands = cmd.commands.filter((cmd2) => !cmd2._hidden);
      const helpCommand = cmd._getHelpCommand();
      if (helpCommand && !helpCommand._hidden) {
        visibleCommands.push(helpCommand);
      }
      if (this.sortSubcommands) {
        visibleCommands.sort((a, b) => {
          return a.name().localeCompare(b.name());
        });
      }
      return visibleCommands;
    }
    compareOptions(a, b) {
      const getSortKey = (option) => {
        return option.short ? option.short.replace(/^-/, "") : option.long.replace(/^--/, "");
      };
      return getSortKey(a).localeCompare(getSortKey(b));
    }
    visibleOptions(cmd) {
      const visibleOptions = cmd.options.filter((option) => !option.hidden);
      const helpOption = cmd._getHelpOption();
      if (helpOption && !helpOption.hidden) {
        const removeShort = helpOption.short && cmd._findOption(helpOption.short);
        const removeLong = helpOption.long && cmd._findOption(helpOption.long);
        if (!removeShort && !removeLong) {
          visibleOptions.push(helpOption);
        } else if (helpOption.long && !removeLong) {
          visibleOptions.push(cmd.createOption(helpOption.long, helpOption.description));
        } else if (helpOption.short && !removeShort) {
          visibleOptions.push(cmd.createOption(helpOption.short, helpOption.description));
        }
      }
      if (this.sortOptions) {
        visibleOptions.sort(this.compareOptions);
      }
      return visibleOptions;
    }
    visibleGlobalOptions(cmd) {
      if (!this.showGlobalOptions)
        return [];
      const globalOptions = [];
      for (let ancestorCmd = cmd.parent;ancestorCmd; ancestorCmd = ancestorCmd.parent) {
        const visibleOptions = ancestorCmd.options.filter((option) => !option.hidden);
        globalOptions.push(...visibleOptions);
      }
      if (this.sortOptions) {
        globalOptions.sort(this.compareOptions);
      }
      return globalOptions;
    }
    visibleArguments(cmd) {
      if (cmd._argsDescription) {
        cmd.registeredArguments.forEach((argument) => {
          argument.description = argument.description || cmd._argsDescription[argument.name()] || "";
        });
      }
      if (cmd.registeredArguments.find((argument) => argument.description)) {
        return cmd.registeredArguments;
      }
      return [];
    }
    subcommandTerm(cmd) {
      const args = cmd.registeredArguments.map((arg) => humanReadableArgName(arg)).join(" ");
      return cmd._name + (cmd._aliases[0] ? "|" + cmd._aliases[0] : "") + (cmd.options.length ? " [options]" : "") + (args ? " " + args : "");
    }
    optionTerm(option) {
      return option.flags;
    }
    argumentTerm(argument) {
      return argument.name();
    }
    longestSubcommandTermLength(cmd, helper) {
      return helper.visibleCommands(cmd).reduce((max, command) => {
        return Math.max(max, this.displayWidth(helper.styleSubcommandTerm(helper.subcommandTerm(command))));
      }, 0);
    }
    longestOptionTermLength(cmd, helper) {
      return helper.visibleOptions(cmd).reduce((max, option) => {
        return Math.max(max, this.displayWidth(helper.styleOptionTerm(helper.optionTerm(option))));
      }, 0);
    }
    longestGlobalOptionTermLength(cmd, helper) {
      return helper.visibleGlobalOptions(cmd).reduce((max, option) => {
        return Math.max(max, this.displayWidth(helper.styleOptionTerm(helper.optionTerm(option))));
      }, 0);
    }
    longestArgumentTermLength(cmd, helper) {
      return helper.visibleArguments(cmd).reduce((max, argument) => {
        return Math.max(max, this.displayWidth(helper.styleArgumentTerm(helper.argumentTerm(argument))));
      }, 0);
    }
    commandUsage(cmd) {
      let cmdName = cmd._name;
      if (cmd._aliases[0]) {
        cmdName = cmdName + "|" + cmd._aliases[0];
      }
      let ancestorCmdNames = "";
      for (let ancestorCmd = cmd.parent;ancestorCmd; ancestorCmd = ancestorCmd.parent) {
        ancestorCmdNames = ancestorCmd.name() + " " + ancestorCmdNames;
      }
      return ancestorCmdNames + cmdName + " " + cmd.usage();
    }
    commandDescription(cmd) {
      return cmd.description();
    }
    subcommandDescription(cmd) {
      return cmd.summary() || cmd.description();
    }
    optionDescription(option) {
      const extraInfo = [];
      if (option.argChoices) {
        extraInfo.push(`choices: ${option.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`);
      }
      if (option.defaultValue !== undefined) {
        const showDefault = option.required || option.optional || option.isBoolean() && typeof option.defaultValue === "boolean";
        if (showDefault) {
          extraInfo.push(`default: ${option.defaultValueDescription || JSON.stringify(option.defaultValue)}`);
        }
      }
      if (option.presetArg !== undefined && option.optional) {
        extraInfo.push(`preset: ${JSON.stringify(option.presetArg)}`);
      }
      if (option.envVar !== undefined) {
        extraInfo.push(`env: ${option.envVar}`);
      }
      if (extraInfo.length > 0) {
        const extraDescription = `(${extraInfo.join(", ")})`;
        if (option.description) {
          return `${option.description} ${extraDescription}`;
        }
        return extraDescription;
      }
      return option.description;
    }
    argumentDescription(argument) {
      const extraInfo = [];
      if (argument.argChoices) {
        extraInfo.push(`choices: ${argument.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`);
      }
      if (argument.defaultValue !== undefined) {
        extraInfo.push(`default: ${argument.defaultValueDescription || JSON.stringify(argument.defaultValue)}`);
      }
      if (extraInfo.length > 0) {
        const extraDescription = `(${extraInfo.join(", ")})`;
        if (argument.description) {
          return `${argument.description} ${extraDescription}`;
        }
        return extraDescription;
      }
      return argument.description;
    }
    formatItemList(heading, items, helper) {
      if (items.length === 0)
        return [];
      return [helper.styleTitle(heading), ...items, ""];
    }
    groupItems(unsortedItems, visibleItems, getGroup) {
      const result = new Map;
      unsortedItems.forEach((item) => {
        const group = getGroup(item);
        if (!result.has(group))
          result.set(group, []);
      });
      visibleItems.forEach((item) => {
        const group = getGroup(item);
        if (!result.has(group)) {
          result.set(group, []);
        }
        result.get(group).push(item);
      });
      return result;
    }
    formatHelp(cmd, helper) {
      const termWidth = helper.padWidth(cmd, helper);
      const helpWidth = helper.helpWidth ?? 80;
      function callFormatItem(term, description) {
        return helper.formatItem(term, termWidth, description, helper);
      }
      let output = [
        `${helper.styleTitle("Usage:")} ${helper.styleUsage(helper.commandUsage(cmd))}`,
        ""
      ];
      const commandDescription = helper.commandDescription(cmd);
      if (commandDescription.length > 0) {
        output = output.concat([
          helper.boxWrap(helper.styleCommandDescription(commandDescription), helpWidth),
          ""
        ]);
      }
      const argumentList = helper.visibleArguments(cmd).map((argument) => {
        return callFormatItem(helper.styleArgumentTerm(helper.argumentTerm(argument)), helper.styleArgumentDescription(helper.argumentDescription(argument)));
      });
      output = output.concat(this.formatItemList("Arguments:", argumentList, helper));
      const optionGroups = this.groupItems(cmd.options, helper.visibleOptions(cmd), (option) => option.helpGroupHeading ?? "Options:");
      optionGroups.forEach((options, group) => {
        const optionList = options.map((option) => {
          return callFormatItem(helper.styleOptionTerm(helper.optionTerm(option)), helper.styleOptionDescription(helper.optionDescription(option)));
        });
        output = output.concat(this.formatItemList(group, optionList, helper));
      });
      if (helper.showGlobalOptions) {
        const globalOptionList = helper.visibleGlobalOptions(cmd).map((option) => {
          return callFormatItem(helper.styleOptionTerm(helper.optionTerm(option)), helper.styleOptionDescription(helper.optionDescription(option)));
        });
        output = output.concat(this.formatItemList("Global Options:", globalOptionList, helper));
      }
      const commandGroups = this.groupItems(cmd.commands, helper.visibleCommands(cmd), (sub) => sub.helpGroup() || "Commands:");
      commandGroups.forEach((commands, group) => {
        const commandList = commands.map((sub) => {
          return callFormatItem(helper.styleSubcommandTerm(helper.subcommandTerm(sub)), helper.styleSubcommandDescription(helper.subcommandDescription(sub)));
        });
        output = output.concat(this.formatItemList(group, commandList, helper));
      });
      return output.join(`
`);
    }
    displayWidth(str) {
      return stripColor(str).length;
    }
    styleTitle(str) {
      return str;
    }
    styleUsage(str) {
      return str.split(" ").map((word) => {
        if (word === "[options]")
          return this.styleOptionText(word);
        if (word === "[command]")
          return this.styleSubcommandText(word);
        if (word[0] === "[" || word[0] === "<")
          return this.styleArgumentText(word);
        return this.styleCommandText(word);
      }).join(" ");
    }
    styleCommandDescription(str) {
      return this.styleDescriptionText(str);
    }
    styleOptionDescription(str) {
      return this.styleDescriptionText(str);
    }
    styleSubcommandDescription(str) {
      return this.styleDescriptionText(str);
    }
    styleArgumentDescription(str) {
      return this.styleDescriptionText(str);
    }
    styleDescriptionText(str) {
      return str;
    }
    styleOptionTerm(str) {
      return this.styleOptionText(str);
    }
    styleSubcommandTerm(str) {
      return str.split(" ").map((word) => {
        if (word === "[options]")
          return this.styleOptionText(word);
        if (word[0] === "[" || word[0] === "<")
          return this.styleArgumentText(word);
        return this.styleSubcommandText(word);
      }).join(" ");
    }
    styleArgumentTerm(str) {
      return this.styleArgumentText(str);
    }
    styleOptionText(str) {
      return str;
    }
    styleArgumentText(str) {
      return str;
    }
    styleSubcommandText(str) {
      return str;
    }
    styleCommandText(str) {
      return str;
    }
    padWidth(cmd, helper) {
      return Math.max(helper.longestOptionTermLength(cmd, helper), helper.longestGlobalOptionTermLength(cmd, helper), helper.longestSubcommandTermLength(cmd, helper), helper.longestArgumentTermLength(cmd, helper));
    }
    preformatted(str) {
      return /\n[^\S\r\n]/.test(str);
    }
    formatItem(term, termWidth, description, helper) {
      const itemIndent = 2;
      const itemIndentStr = " ".repeat(itemIndent);
      if (!description)
        return itemIndentStr + term;
      const paddedTerm = term.padEnd(termWidth + term.length - helper.displayWidth(term));
      const spacerWidth = 2;
      const helpWidth = this.helpWidth ?? 80;
      const remainingWidth = helpWidth - termWidth - spacerWidth - itemIndent;
      let formattedDescription;
      if (remainingWidth < this.minWidthToWrap || helper.preformatted(description)) {
        formattedDescription = description;
      } else {
        const wrappedDescription = helper.boxWrap(description, remainingWidth);
        formattedDescription = wrappedDescription.replace(/\n/g, `
` + " ".repeat(termWidth + spacerWidth));
      }
      return itemIndentStr + paddedTerm + " ".repeat(spacerWidth) + formattedDescription.replace(/\n/g, `
${itemIndentStr}`);
    }
    boxWrap(str, width) {
      if (width < this.minWidthToWrap)
        return str;
      const rawLines = str.split(/\r\n|\n/);
      const chunkPattern = /[\s]*[^\s]+/g;
      const wrappedLines = [];
      rawLines.forEach((line) => {
        const chunks = line.match(chunkPattern);
        if (chunks === null) {
          wrappedLines.push("");
          return;
        }
        let sumChunks = [chunks.shift()];
        let sumWidth = this.displayWidth(sumChunks[0]);
        chunks.forEach((chunk) => {
          const visibleWidth = this.displayWidth(chunk);
          if (sumWidth + visibleWidth <= width) {
            sumChunks.push(chunk);
            sumWidth += visibleWidth;
            return;
          }
          wrappedLines.push(sumChunks.join(""));
          const nextChunk = chunk.trimStart();
          sumChunks = [nextChunk];
          sumWidth = this.displayWidth(nextChunk);
        });
        wrappedLines.push(sumChunks.join(""));
      });
      return wrappedLines.join(`
`);
    }
  }
  function stripColor(str) {
    const sgrPattern = /\x1b\[\d*(;\d*)*m/g;
    return str.replace(sgrPattern, "");
  }
  exports2.Help = Help;
  exports2.stripColor = stripColor;
});

// node_modules/commander/lib/option.js
var require_option = __commonJS((exports2) => {
  var { InvalidArgumentError } = require_error();

  class Option {
    constructor(flags, description) {
      this.flags = flags;
      this.description = description || "";
      this.required = flags.includes("<");
      this.optional = flags.includes("[");
      this.variadic = /\w\.\.\.[>\]]$/.test(flags);
      this.mandatory = false;
      const optionFlags = splitOptionFlags(flags);
      this.short = optionFlags.shortFlag;
      this.long = optionFlags.longFlag;
      this.negate = false;
      if (this.long) {
        this.negate = this.long.startsWith("--no-");
      }
      this.defaultValue = undefined;
      this.defaultValueDescription = undefined;
      this.presetArg = undefined;
      this.envVar = undefined;
      this.parseArg = undefined;
      this.hidden = false;
      this.argChoices = undefined;
      this.conflictsWith = [];
      this.implied = undefined;
      this.helpGroupHeading = undefined;
    }
    default(value, description) {
      this.defaultValue = value;
      this.defaultValueDescription = description;
      return this;
    }
    preset(arg) {
      this.presetArg = arg;
      return this;
    }
    conflicts(names) {
      this.conflictsWith = this.conflictsWith.concat(names);
      return this;
    }
    implies(impliedOptionValues) {
      let newImplied = impliedOptionValues;
      if (typeof impliedOptionValues === "string") {
        newImplied = { [impliedOptionValues]: true };
      }
      this.implied = Object.assign(this.implied || {}, newImplied);
      return this;
    }
    env(name) {
      this.envVar = name;
      return this;
    }
    argParser(fn) {
      this.parseArg = fn;
      return this;
    }
    makeOptionMandatory(mandatory = true) {
      this.mandatory = !!mandatory;
      return this;
    }
    hideHelp(hide = true) {
      this.hidden = !!hide;
      return this;
    }
    _collectValue(value, previous) {
      if (previous === this.defaultValue || !Array.isArray(previous)) {
        return [value];
      }
      previous.push(value);
      return previous;
    }
    choices(values) {
      this.argChoices = values.slice();
      this.parseArg = (arg, previous) => {
        if (!this.argChoices.includes(arg)) {
          throw new InvalidArgumentError(`Allowed choices are ${this.argChoices.join(", ")}.`);
        }
        if (this.variadic) {
          return this._collectValue(arg, previous);
        }
        return arg;
      };
      return this;
    }
    name() {
      if (this.long) {
        return this.long.replace(/^--/, "");
      }
      return this.short.replace(/^-/, "");
    }
    attributeName() {
      if (this.negate) {
        return camelcase(this.name().replace(/^no-/, ""));
      }
      return camelcase(this.name());
    }
    helpGroup(heading) {
      this.helpGroupHeading = heading;
      return this;
    }
    is(arg) {
      return this.short === arg || this.long === arg;
    }
    isBoolean() {
      return !this.required && !this.optional && !this.negate;
    }
  }

  class DualOptions {
    constructor(options) {
      this.positiveOptions = new Map;
      this.negativeOptions = new Map;
      this.dualOptions = new Set;
      options.forEach((option) => {
        if (option.negate) {
          this.negativeOptions.set(option.attributeName(), option);
        } else {
          this.positiveOptions.set(option.attributeName(), option);
        }
      });
      this.negativeOptions.forEach((value, key) => {
        if (this.positiveOptions.has(key)) {
          this.dualOptions.add(key);
        }
      });
    }
    valueFromOption(value, option) {
      const optionKey = option.attributeName();
      if (!this.dualOptions.has(optionKey))
        return true;
      const preset = this.negativeOptions.get(optionKey).presetArg;
      const negativeValue = preset !== undefined ? preset : false;
      return option.negate === (negativeValue === value);
    }
  }
  function camelcase(str) {
    return str.split("-").reduce((str2, word) => {
      return str2 + word[0].toUpperCase() + word.slice(1);
    });
  }
  function splitOptionFlags(flags) {
    let shortFlag;
    let longFlag;
    const shortFlagExp = /^-[^-]$/;
    const longFlagExp = /^--[^-]/;
    const flagParts = flags.split(/[ |,]+/).concat("guard");
    if (shortFlagExp.test(flagParts[0]))
      shortFlag = flagParts.shift();
    if (longFlagExp.test(flagParts[0]))
      longFlag = flagParts.shift();
    if (!shortFlag && shortFlagExp.test(flagParts[0]))
      shortFlag = flagParts.shift();
    if (!shortFlag && longFlagExp.test(flagParts[0])) {
      shortFlag = longFlag;
      longFlag = flagParts.shift();
    }
    if (flagParts[0].startsWith("-")) {
      const unsupportedFlag = flagParts[0];
      const baseError = `option creation failed due to '${unsupportedFlag}' in option flags '${flags}'`;
      if (/^-[^-][^-]/.test(unsupportedFlag))
        throw new Error(`${baseError}
- a short flag is a single dash and a single character
  - either use a single dash and a single character (for a short flag)
  - or use a double dash for a long option (and can have two, like '--ws, --workspace')`);
      if (shortFlagExp.test(unsupportedFlag))
        throw new Error(`${baseError}
- too many short flags`);
      if (longFlagExp.test(unsupportedFlag))
        throw new Error(`${baseError}
- too many long flags`);
      throw new Error(`${baseError}
- unrecognised flag format`);
    }
    if (shortFlag === undefined && longFlag === undefined)
      throw new Error(`option creation failed due to no flags found in '${flags}'.`);
    return { shortFlag, longFlag };
  }
  exports2.Option = Option;
  exports2.DualOptions = DualOptions;
});

// node_modules/commander/lib/suggestSimilar.js
var require_suggestSimilar = __commonJS((exports2) => {
  var maxDistance = 3;
  function editDistance(a, b) {
    if (Math.abs(a.length - b.length) > maxDistance)
      return Math.max(a.length, b.length);
    const d = [];
    for (let i = 0;i <= a.length; i++) {
      d[i] = [i];
    }
    for (let j = 0;j <= b.length; j++) {
      d[0][j] = j;
    }
    for (let j = 1;j <= b.length; j++) {
      for (let i = 1;i <= a.length; i++) {
        let cost = 1;
        if (a[i - 1] === b[j - 1]) {
          cost = 0;
        } else {
          cost = 1;
        }
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }
    return d[a.length][b.length];
  }
  function suggestSimilar(word, candidates) {
    if (!candidates || candidates.length === 0)
      return "";
    candidates = Array.from(new Set(candidates));
    const searchingOptions = word.startsWith("--");
    if (searchingOptions) {
      word = word.slice(2);
      candidates = candidates.map((candidate) => candidate.slice(2));
    }
    let similar = [];
    let bestDistance = maxDistance;
    const minSimilarity = 0.4;
    candidates.forEach((candidate) => {
      if (candidate.length <= 1)
        return;
      const distance = editDistance(word, candidate);
      const length = Math.max(word.length, candidate.length);
      const similarity = (length - distance) / length;
      if (similarity > minSimilarity) {
        if (distance < bestDistance) {
          bestDistance = distance;
          similar = [candidate];
        } else if (distance === bestDistance) {
          similar.push(candidate);
        }
      }
    });
    similar.sort((a, b) => a.localeCompare(b));
    if (searchingOptions) {
      similar = similar.map((candidate) => `--${candidate}`);
    }
    if (similar.length > 1) {
      return `
(Did you mean one of ${similar.join(", ")}?)`;
    }
    if (similar.length === 1) {
      return `
(Did you mean ${similar[0]}?)`;
    }
    return "";
  }
  exports2.suggestSimilar = suggestSimilar;
});

// node_modules/commander/lib/command.js
var require_command = __commonJS((exports2) => {
  var EventEmitter = require("events").EventEmitter;
  var childProcess = require("child_process");
  var path = require("path");
  var fs = require("fs");
  var process2 = require("process");
  var { Argument, humanReadableArgName } = require_argument();
  var { CommanderError } = require_error();
  var { Help, stripColor } = require_help();
  var { Option, DualOptions } = require_option();
  var { suggestSimilar } = require_suggestSimilar();

  class Command extends EventEmitter {
    constructor(name) {
      super();
      this.commands = [];
      this.options = [];
      this.parent = null;
      this._allowUnknownOption = false;
      this._allowExcessArguments = false;
      this.registeredArguments = [];
      this._args = this.registeredArguments;
      this.args = [];
      this.rawArgs = [];
      this.processedArgs = [];
      this._scriptPath = null;
      this._name = name || "";
      this._optionValues = {};
      this._optionValueSources = {};
      this._storeOptionsAsProperties = false;
      this._actionHandler = null;
      this._executableHandler = false;
      this._executableFile = null;
      this._executableDir = null;
      this._defaultCommandName = null;
      this._exitCallback = null;
      this._aliases = [];
      this._combineFlagAndOptionalValue = true;
      this._description = "";
      this._summary = "";
      this._argsDescription = undefined;
      this._enablePositionalOptions = false;
      this._passThroughOptions = false;
      this._lifeCycleHooks = {};
      this._showHelpAfterError = false;
      this._showSuggestionAfterError = true;
      this._savedState = null;
      this._outputConfiguration = {
        writeOut: (str) => process2.stdout.write(str),
        writeErr: (str) => process2.stderr.write(str),
        outputError: (str, write) => write(str),
        getOutHelpWidth: () => process2.stdout.isTTY ? process2.stdout.columns : undefined,
        getErrHelpWidth: () => process2.stderr.isTTY ? process2.stderr.columns : undefined,
        getOutHasColors: () => useColor() ?? (process2.stdout.isTTY && process2.stdout.hasColors?.()),
        getErrHasColors: () => useColor() ?? (process2.stderr.isTTY && process2.stderr.hasColors?.()),
        stripColor: (str) => stripColor(str)
      };
      this._hidden = false;
      this._helpOption = undefined;
      this._addImplicitHelpCommand = undefined;
      this._helpCommand = undefined;
      this._helpConfiguration = {};
      this._helpGroupHeading = undefined;
      this._defaultCommandGroup = undefined;
      this._defaultOptionGroup = undefined;
    }
    copyInheritedSettings(sourceCommand) {
      this._outputConfiguration = sourceCommand._outputConfiguration;
      this._helpOption = sourceCommand._helpOption;
      this._helpCommand = sourceCommand._helpCommand;
      this._helpConfiguration = sourceCommand._helpConfiguration;
      this._exitCallback = sourceCommand._exitCallback;
      this._storeOptionsAsProperties = sourceCommand._storeOptionsAsProperties;
      this._combineFlagAndOptionalValue = sourceCommand._combineFlagAndOptionalValue;
      this._allowExcessArguments = sourceCommand._allowExcessArguments;
      this._enablePositionalOptions = sourceCommand._enablePositionalOptions;
      this._showHelpAfterError = sourceCommand._showHelpAfterError;
      this._showSuggestionAfterError = sourceCommand._showSuggestionAfterError;
      return this;
    }
    _getCommandAndAncestors() {
      const result = [];
      for (let command = this;command; command = command.parent) {
        result.push(command);
      }
      return result;
    }
    command(nameAndArgs, actionOptsOrExecDesc, execOpts) {
      let desc = actionOptsOrExecDesc;
      let opts = execOpts;
      if (typeof desc === "object" && desc !== null) {
        opts = desc;
        desc = null;
      }
      opts = opts || {};
      const [, name, args] = nameAndArgs.match(/([^ ]+) *(.*)/);
      const cmd = this.createCommand(name);
      if (desc) {
        cmd.description(desc);
        cmd._executableHandler = true;
      }
      if (opts.isDefault)
        this._defaultCommandName = cmd._name;
      cmd._hidden = !!(opts.noHelp || opts.hidden);
      cmd._executableFile = opts.executableFile || null;
      if (args)
        cmd.arguments(args);
      this._registerCommand(cmd);
      cmd.parent = this;
      cmd.copyInheritedSettings(this);
      if (desc)
        return this;
      return cmd;
    }
    createCommand(name) {
      return new Command(name);
    }
    createHelp() {
      return Object.assign(new Help, this.configureHelp());
    }
    configureHelp(configuration) {
      if (configuration === undefined)
        return this._helpConfiguration;
      this._helpConfiguration = configuration;
      return this;
    }
    configureOutput(configuration) {
      if (configuration === undefined)
        return this._outputConfiguration;
      this._outputConfiguration = {
        ...this._outputConfiguration,
        ...configuration
      };
      return this;
    }
    showHelpAfterError(displayHelp = true) {
      if (typeof displayHelp !== "string")
        displayHelp = !!displayHelp;
      this._showHelpAfterError = displayHelp;
      return this;
    }
    showSuggestionAfterError(displaySuggestion = true) {
      this._showSuggestionAfterError = !!displaySuggestion;
      return this;
    }
    addCommand(cmd, opts) {
      if (!cmd._name) {
        throw new Error(`Command passed to .addCommand() must have a name
- specify the name in Command constructor or using .name()`);
      }
      opts = opts || {};
      if (opts.isDefault)
        this._defaultCommandName = cmd._name;
      if (opts.noHelp || opts.hidden)
        cmd._hidden = true;
      this._registerCommand(cmd);
      cmd.parent = this;
      cmd._checkForBrokenPassThrough();
      return this;
    }
    createArgument(name, description) {
      return new Argument(name, description);
    }
    argument(name, description, parseArg, defaultValue) {
      const argument = this.createArgument(name, description);
      if (typeof parseArg === "function") {
        argument.default(defaultValue).argParser(parseArg);
      } else {
        argument.default(parseArg);
      }
      this.addArgument(argument);
      return this;
    }
    arguments(names) {
      names.trim().split(/ +/).forEach((detail) => {
        this.argument(detail);
      });
      return this;
    }
    addArgument(argument) {
      const previousArgument = this.registeredArguments.slice(-1)[0];
      if (previousArgument?.variadic) {
        throw new Error(`only the last argument can be variadic '${previousArgument.name()}'`);
      }
      if (argument.required && argument.defaultValue !== undefined && argument.parseArg === undefined) {
        throw new Error(`a default value for a required argument is never used: '${argument.name()}'`);
      }
      this.registeredArguments.push(argument);
      return this;
    }
    helpCommand(enableOrNameAndArgs, description) {
      if (typeof enableOrNameAndArgs === "boolean") {
        this._addImplicitHelpCommand = enableOrNameAndArgs;
        if (enableOrNameAndArgs && this._defaultCommandGroup) {
          this._initCommandGroup(this._getHelpCommand());
        }
        return this;
      }
      const nameAndArgs = enableOrNameAndArgs ?? "help [command]";
      const [, helpName, helpArgs] = nameAndArgs.match(/([^ ]+) *(.*)/);
      const helpDescription = description ?? "display help for command";
      const helpCommand = this.createCommand(helpName);
      helpCommand.helpOption(false);
      if (helpArgs)
        helpCommand.arguments(helpArgs);
      if (helpDescription)
        helpCommand.description(helpDescription);
      this._addImplicitHelpCommand = true;
      this._helpCommand = helpCommand;
      if (enableOrNameAndArgs || description)
        this._initCommandGroup(helpCommand);
      return this;
    }
    addHelpCommand(helpCommand, deprecatedDescription) {
      if (typeof helpCommand !== "object") {
        this.helpCommand(helpCommand, deprecatedDescription);
        return this;
      }
      this._addImplicitHelpCommand = true;
      this._helpCommand = helpCommand;
      this._initCommandGroup(helpCommand);
      return this;
    }
    _getHelpCommand() {
      const hasImplicitHelpCommand = this._addImplicitHelpCommand ?? (this.commands.length && !this._actionHandler && !this._findCommand("help"));
      if (hasImplicitHelpCommand) {
        if (this._helpCommand === undefined) {
          this.helpCommand(undefined, undefined);
        }
        return this._helpCommand;
      }
      return null;
    }
    hook(event, listener) {
      const allowedValues = ["preSubcommand", "preAction", "postAction"];
      if (!allowedValues.includes(event)) {
        throw new Error(`Unexpected value for event passed to hook : '${event}'.
Expecting one of '${allowedValues.join("', '")}'`);
      }
      if (this._lifeCycleHooks[event]) {
        this._lifeCycleHooks[event].push(listener);
      } else {
        this._lifeCycleHooks[event] = [listener];
      }
      return this;
    }
    exitOverride(fn) {
      if (fn) {
        this._exitCallback = fn;
      } else {
        this._exitCallback = (err) => {
          if (err.code !== "commander.executeSubCommandAsync") {
            throw err;
          } else {}
        };
      }
      return this;
    }
    _exit(exitCode, code, message) {
      if (this._exitCallback) {
        this._exitCallback(new CommanderError(exitCode, code, message));
      }
      process2.exit(exitCode);
    }
    action(fn) {
      const listener = (args) => {
        const expectedArgsCount = this.registeredArguments.length;
        const actionArgs = args.slice(0, expectedArgsCount);
        if (this._storeOptionsAsProperties) {
          actionArgs[expectedArgsCount] = this;
        } else {
          actionArgs[expectedArgsCount] = this.opts();
        }
        actionArgs.push(this);
        return fn.apply(this, actionArgs);
      };
      this._actionHandler = listener;
      return this;
    }
    createOption(flags, description) {
      return new Option(flags, description);
    }
    _callParseArg(target, value, previous, invalidArgumentMessage) {
      try {
        return target.parseArg(value, previous);
      } catch (err) {
        if (err.code === "commander.invalidArgument") {
          const message = `${invalidArgumentMessage} ${err.message}`;
          this.error(message, { exitCode: err.exitCode, code: err.code });
        }
        throw err;
      }
    }
    _registerOption(option) {
      const matchingOption = option.short && this._findOption(option.short) || option.long && this._findOption(option.long);
      if (matchingOption) {
        const matchingFlag = option.long && this._findOption(option.long) ? option.long : option.short;
        throw new Error(`Cannot add option '${option.flags}'${this._name && ` to command '${this._name}'`} due to conflicting flag '${matchingFlag}'
-  already used by option '${matchingOption.flags}'`);
      }
      this._initOptionGroup(option);
      this.options.push(option);
    }
    _registerCommand(command) {
      const knownBy = (cmd) => {
        return [cmd.name()].concat(cmd.aliases());
      };
      const alreadyUsed = knownBy(command).find((name) => this._findCommand(name));
      if (alreadyUsed) {
        const existingCmd = knownBy(this._findCommand(alreadyUsed)).join("|");
        const newCmd = knownBy(command).join("|");
        throw new Error(`cannot add command '${newCmd}' as already have command '${existingCmd}'`);
      }
      this._initCommandGroup(command);
      this.commands.push(command);
    }
    addOption(option) {
      this._registerOption(option);
      const oname = option.name();
      const name = option.attributeName();
      if (option.negate) {
        const positiveLongFlag = option.long.replace(/^--no-/, "--");
        if (!this._findOption(positiveLongFlag)) {
          this.setOptionValueWithSource(name, option.defaultValue === undefined ? true : option.defaultValue, "default");
        }
      } else if (option.defaultValue !== undefined) {
        this.setOptionValueWithSource(name, option.defaultValue, "default");
      }
      const handleOptionValue = (val, invalidValueMessage, valueSource) => {
        if (val == null && option.presetArg !== undefined) {
          val = option.presetArg;
        }
        const oldValue = this.getOptionValue(name);
        if (val !== null && option.parseArg) {
          val = this._callParseArg(option, val, oldValue, invalidValueMessage);
        } else if (val !== null && option.variadic) {
          val = option._collectValue(val, oldValue);
        }
        if (val == null) {
          if (option.negate) {
            val = false;
          } else if (option.isBoolean() || option.optional) {
            val = true;
          } else {
            val = "";
          }
        }
        this.setOptionValueWithSource(name, val, valueSource);
      };
      this.on("option:" + oname, (val) => {
        const invalidValueMessage = `error: option '${option.flags}' argument '${val}' is invalid.`;
        handleOptionValue(val, invalidValueMessage, "cli");
      });
      if (option.envVar) {
        this.on("optionEnv:" + oname, (val) => {
          const invalidValueMessage = `error: option '${option.flags}' value '${val}' from env '${option.envVar}' is invalid.`;
          handleOptionValue(val, invalidValueMessage, "env");
        });
      }
      return this;
    }
    _optionEx(config, flags, description, fn, defaultValue) {
      if (typeof flags === "object" && flags instanceof Option) {
        throw new Error("To add an Option object use addOption() instead of option() or requiredOption()");
      }
      const option = this.createOption(flags, description);
      option.makeOptionMandatory(!!config.mandatory);
      if (typeof fn === "function") {
        option.default(defaultValue).argParser(fn);
      } else if (fn instanceof RegExp) {
        const regex = fn;
        fn = (val, def) => {
          const m = regex.exec(val);
          return m ? m[0] : def;
        };
        option.default(defaultValue).argParser(fn);
      } else {
        option.default(fn);
      }
      return this.addOption(option);
    }
    option(flags, description, parseArg, defaultValue) {
      return this._optionEx({}, flags, description, parseArg, defaultValue);
    }
    requiredOption(flags, description, parseArg, defaultValue) {
      return this._optionEx({ mandatory: true }, flags, description, parseArg, defaultValue);
    }
    combineFlagAndOptionalValue(combine = true) {
      this._combineFlagAndOptionalValue = !!combine;
      return this;
    }
    allowUnknownOption(allowUnknown = true) {
      this._allowUnknownOption = !!allowUnknown;
      return this;
    }
    allowExcessArguments(allowExcess = true) {
      this._allowExcessArguments = !!allowExcess;
      return this;
    }
    enablePositionalOptions(positional = true) {
      this._enablePositionalOptions = !!positional;
      return this;
    }
    passThroughOptions(passThrough = true) {
      this._passThroughOptions = !!passThrough;
      this._checkForBrokenPassThrough();
      return this;
    }
    _checkForBrokenPassThrough() {
      if (this.parent && this._passThroughOptions && !this.parent._enablePositionalOptions) {
        throw new Error(`passThroughOptions cannot be used for '${this._name}' without turning on enablePositionalOptions for parent command(s)`);
      }
    }
    storeOptionsAsProperties(storeAsProperties = true) {
      if (this.options.length) {
        throw new Error("call .storeOptionsAsProperties() before adding options");
      }
      if (Object.keys(this._optionValues).length) {
        throw new Error("call .storeOptionsAsProperties() before setting option values");
      }
      this._storeOptionsAsProperties = !!storeAsProperties;
      return this;
    }
    getOptionValue(key) {
      if (this._storeOptionsAsProperties) {
        return this[key];
      }
      return this._optionValues[key];
    }
    setOptionValue(key, value) {
      return this.setOptionValueWithSource(key, value, undefined);
    }
    setOptionValueWithSource(key, value, source) {
      if (this._storeOptionsAsProperties) {
        this[key] = value;
      } else {
        this._optionValues[key] = value;
      }
      this._optionValueSources[key] = source;
      return this;
    }
    getOptionValueSource(key) {
      return this._optionValueSources[key];
    }
    getOptionValueSourceWithGlobals(key) {
      let source;
      this._getCommandAndAncestors().forEach((cmd) => {
        if (cmd.getOptionValueSource(key) !== undefined) {
          source = cmd.getOptionValueSource(key);
        }
      });
      return source;
    }
    _prepareUserArgs(argv, parseOptions) {
      if (argv !== undefined && !Array.isArray(argv)) {
        throw new Error("first parameter to parse must be array or undefined");
      }
      parseOptions = parseOptions || {};
      if (argv === undefined && parseOptions.from === undefined) {
        if (process2.versions?.electron) {
          parseOptions.from = "electron";
        }
        const execArgv = process2.execArgv ?? [];
        if (execArgv.includes("-e") || execArgv.includes("--eval") || execArgv.includes("-p") || execArgv.includes("--print")) {
          parseOptions.from = "eval";
        }
      }
      if (argv === undefined) {
        argv = process2.argv;
      }
      this.rawArgs = argv.slice();
      let userArgs;
      switch (parseOptions.from) {
        case undefined:
        case "node":
          this._scriptPath = argv[1];
          userArgs = argv.slice(2);
          break;
        case "electron":
          if (process2.defaultApp) {
            this._scriptPath = argv[1];
            userArgs = argv.slice(2);
          } else {
            userArgs = argv.slice(1);
          }
          break;
        case "user":
          userArgs = argv.slice(0);
          break;
        case "eval":
          userArgs = argv.slice(1);
          break;
        default:
          throw new Error(`unexpected parse option { from: '${parseOptions.from}' }`);
      }
      if (!this._name && this._scriptPath)
        this.nameFromFilename(this._scriptPath);
      this._name = this._name || "program";
      return userArgs;
    }
    parse(argv, parseOptions) {
      this._prepareForParse();
      const userArgs = this._prepareUserArgs(argv, parseOptions);
      this._parseCommand([], userArgs);
      return this;
    }
    async parseAsync(argv, parseOptions) {
      this._prepareForParse();
      const userArgs = this._prepareUserArgs(argv, parseOptions);
      await this._parseCommand([], userArgs);
      return this;
    }
    _prepareForParse() {
      if (this._savedState === null) {
        this.saveStateBeforeParse();
      } else {
        this.restoreStateBeforeParse();
      }
    }
    saveStateBeforeParse() {
      this._savedState = {
        _name: this._name,
        _optionValues: { ...this._optionValues },
        _optionValueSources: { ...this._optionValueSources }
      };
    }
    restoreStateBeforeParse() {
      if (this._storeOptionsAsProperties)
        throw new Error(`Can not call parse again when storeOptionsAsProperties is true.
- either make a new Command for each call to parse, or stop storing options as properties`);
      this._name = this._savedState._name;
      this._scriptPath = null;
      this.rawArgs = [];
      this._optionValues = { ...this._savedState._optionValues };
      this._optionValueSources = { ...this._savedState._optionValueSources };
      this.args = [];
      this.processedArgs = [];
    }
    _checkForMissingExecutable(executableFile, executableDir, subcommandName) {
      if (fs.existsSync(executableFile))
        return;
      const executableDirMessage = executableDir ? `searched for local subcommand relative to directory '${executableDir}'` : "no directory for search for local subcommand, use .executableDir() to supply a custom directory";
      const executableMissing = `'${executableFile}' does not exist
 - if '${subcommandName}' is not meant to be an executable command, remove description parameter from '.command()' and use '.description()' instead
 - if the default executable name is not suitable, use the executableFile option to supply a custom name or path
 - ${executableDirMessage}`;
      throw new Error(executableMissing);
    }
    _executeSubCommand(subcommand, args) {
      args = args.slice();
      let launchWithNode = false;
      const sourceExt = [".js", ".ts", ".tsx", ".mjs", ".cjs"];
      function findFile(baseDir, baseName) {
        const localBin = path.resolve(baseDir, baseName);
        if (fs.existsSync(localBin))
          return localBin;
        if (sourceExt.includes(path.extname(baseName)))
          return;
        const foundExt = sourceExt.find((ext) => fs.existsSync(`${localBin}${ext}`));
        if (foundExt)
          return `${localBin}${foundExt}`;
        return;
      }
      this._checkForMissingMandatoryOptions();
      this._checkForConflictingOptions();
      let executableFile = subcommand._executableFile || `${this._name}-${subcommand._name}`;
      let executableDir = this._executableDir || "";
      if (this._scriptPath) {
        let resolvedScriptPath;
        try {
          resolvedScriptPath = fs.realpathSync(this._scriptPath);
        } catch {
          resolvedScriptPath = this._scriptPath;
        }
        executableDir = path.resolve(path.dirname(resolvedScriptPath), executableDir);
      }
      if (executableDir) {
        let localFile = findFile(executableDir, executableFile);
        if (!localFile && !subcommand._executableFile && this._scriptPath) {
          const legacyName = path.basename(this._scriptPath, path.extname(this._scriptPath));
          if (legacyName !== this._name) {
            localFile = findFile(executableDir, `${legacyName}-${subcommand._name}`);
          }
        }
        executableFile = localFile || executableFile;
      }
      launchWithNode = sourceExt.includes(path.extname(executableFile));
      let proc;
      if (process2.platform !== "win32") {
        if (launchWithNode) {
          args.unshift(executableFile);
          args = incrementNodeInspectorPort(process2.execArgv).concat(args);
          proc = childProcess.spawn(process2.argv[0], args, { stdio: "inherit" });
        } else {
          proc = childProcess.spawn(executableFile, args, { stdio: "inherit" });
        }
      } else {
        this._checkForMissingExecutable(executableFile, executableDir, subcommand._name);
        args.unshift(executableFile);
        args = incrementNodeInspectorPort(process2.execArgv).concat(args);
        proc = childProcess.spawn(process2.execPath, args, { stdio: "inherit" });
      }
      if (!proc.killed) {
        const signals = ["SIGUSR1", "SIGUSR2", "SIGTERM", "SIGINT", "SIGHUP"];
        signals.forEach((signal) => {
          process2.on(signal, () => {
            if (proc.killed === false && proc.exitCode === null) {
              proc.kill(signal);
            }
          });
        });
      }
      const exitCallback = this._exitCallback;
      proc.on("close", (code) => {
        code = code ?? 1;
        if (!exitCallback) {
          process2.exit(code);
        } else {
          exitCallback(new CommanderError(code, "commander.executeSubCommandAsync", "(close)"));
        }
      });
      proc.on("error", (err) => {
        if (err.code === "ENOENT") {
          this._checkForMissingExecutable(executableFile, executableDir, subcommand._name);
        } else if (err.code === "EACCES") {
          throw new Error(`'${executableFile}' not executable`);
        }
        if (!exitCallback) {
          process2.exit(1);
        } else {
          const wrappedError = new CommanderError(1, "commander.executeSubCommandAsync", "(error)");
          wrappedError.nestedError = err;
          exitCallback(wrappedError);
        }
      });
      this.runningCommand = proc;
    }
    _dispatchSubcommand(commandName, operands, unknown) {
      const subCommand = this._findCommand(commandName);
      if (!subCommand)
        this.help({ error: true });
      subCommand._prepareForParse();
      let promiseChain;
      promiseChain = this._chainOrCallSubCommandHook(promiseChain, subCommand, "preSubcommand");
      promiseChain = this._chainOrCall(promiseChain, () => {
        if (subCommand._executableHandler) {
          this._executeSubCommand(subCommand, operands.concat(unknown));
        } else {
          return subCommand._parseCommand(operands, unknown);
        }
      });
      return promiseChain;
    }
    _dispatchHelpCommand(subcommandName) {
      if (!subcommandName) {
        this.help();
      }
      const subCommand = this._findCommand(subcommandName);
      if (subCommand && !subCommand._executableHandler) {
        subCommand.help();
      }
      return this._dispatchSubcommand(subcommandName, [], [this._getHelpOption()?.long ?? this._getHelpOption()?.short ?? "--help"]);
    }
    _checkNumberOfArguments() {
      this.registeredArguments.forEach((arg, i) => {
        if (arg.required && this.args[i] == null) {
          this.missingArgument(arg.name());
        }
      });
      if (this.registeredArguments.length > 0 && this.registeredArguments[this.registeredArguments.length - 1].variadic) {
        return;
      }
      if (this.args.length > this.registeredArguments.length) {
        this._excessArguments(this.args);
      }
    }
    _processArguments() {
      const myParseArg = (argument, value, previous) => {
        let parsedValue = value;
        if (value !== null && argument.parseArg) {
          const invalidValueMessage = `error: command-argument value '${value}' is invalid for argument '${argument.name()}'.`;
          parsedValue = this._callParseArg(argument, value, previous, invalidValueMessage);
        }
        return parsedValue;
      };
      this._checkNumberOfArguments();
      const processedArgs = [];
      this.registeredArguments.forEach((declaredArg, index) => {
        let value = declaredArg.defaultValue;
        if (declaredArg.variadic) {
          if (index < this.args.length) {
            value = this.args.slice(index);
            if (declaredArg.parseArg) {
              value = value.reduce((processed, v) => {
                return myParseArg(declaredArg, v, processed);
              }, declaredArg.defaultValue);
            }
          } else if (value === undefined) {
            value = [];
          }
        } else if (index < this.args.length) {
          value = this.args[index];
          if (declaredArg.parseArg) {
            value = myParseArg(declaredArg, value, declaredArg.defaultValue);
          }
        }
        processedArgs[index] = value;
      });
      this.processedArgs = processedArgs;
    }
    _chainOrCall(promise, fn) {
      if (promise?.then && typeof promise.then === "function") {
        return promise.then(() => fn());
      }
      return fn();
    }
    _chainOrCallHooks(promise, event) {
      let result = promise;
      const hooks = [];
      this._getCommandAndAncestors().reverse().filter((cmd) => cmd._lifeCycleHooks[event] !== undefined).forEach((hookedCommand) => {
        hookedCommand._lifeCycleHooks[event].forEach((callback) => {
          hooks.push({ hookedCommand, callback });
        });
      });
      if (event === "postAction") {
        hooks.reverse();
      }
      hooks.forEach((hookDetail) => {
        result = this._chainOrCall(result, () => {
          return hookDetail.callback(hookDetail.hookedCommand, this);
        });
      });
      return result;
    }
    _chainOrCallSubCommandHook(promise, subCommand, event) {
      let result = promise;
      if (this._lifeCycleHooks[event] !== undefined) {
        this._lifeCycleHooks[event].forEach((hook) => {
          result = this._chainOrCall(result, () => {
            return hook(this, subCommand);
          });
        });
      }
      return result;
    }
    _parseCommand(operands, unknown) {
      const parsed = this.parseOptions(unknown);
      this._parseOptionsEnv();
      this._parseOptionsImplied();
      operands = operands.concat(parsed.operands);
      unknown = parsed.unknown;
      this.args = operands.concat(unknown);
      if (operands && this._findCommand(operands[0])) {
        return this._dispatchSubcommand(operands[0], operands.slice(1), unknown);
      }
      if (this._getHelpCommand() && operands[0] === this._getHelpCommand().name()) {
        return this._dispatchHelpCommand(operands[1]);
      }
      if (this._defaultCommandName) {
        this._outputHelpIfRequested(unknown);
        return this._dispatchSubcommand(this._defaultCommandName, operands, unknown);
      }
      if (this.commands.length && this.args.length === 0 && !this._actionHandler && !this._defaultCommandName) {
        this.help({ error: true });
      }
      this._outputHelpIfRequested(parsed.unknown);
      this._checkForMissingMandatoryOptions();
      this._checkForConflictingOptions();
      const checkForUnknownOptions = () => {
        if (parsed.unknown.length > 0) {
          this.unknownOption(parsed.unknown[0]);
        }
      };
      const commandEvent = `command:${this.name()}`;
      if (this._actionHandler) {
        checkForUnknownOptions();
        this._processArguments();
        let promiseChain;
        promiseChain = this._chainOrCallHooks(promiseChain, "preAction");
        promiseChain = this._chainOrCall(promiseChain, () => this._actionHandler(this.processedArgs));
        if (this.parent) {
          promiseChain = this._chainOrCall(promiseChain, () => {
            this.parent.emit(commandEvent, operands, unknown);
          });
        }
        promiseChain = this._chainOrCallHooks(promiseChain, "postAction");
        return promiseChain;
      }
      if (this.parent?.listenerCount(commandEvent)) {
        checkForUnknownOptions();
        this._processArguments();
        this.parent.emit(commandEvent, operands, unknown);
      } else if (operands.length) {
        if (this._findCommand("*")) {
          return this._dispatchSubcommand("*", operands, unknown);
        }
        if (this.listenerCount("command:*")) {
          this.emit("command:*", operands, unknown);
        } else if (this.commands.length) {
          this.unknownCommand();
        } else {
          checkForUnknownOptions();
          this._processArguments();
        }
      } else if (this.commands.length) {
        checkForUnknownOptions();
        this.help({ error: true });
      } else {
        checkForUnknownOptions();
        this._processArguments();
      }
    }
    _findCommand(name) {
      if (!name)
        return;
      return this.commands.find((cmd) => cmd._name === name || cmd._aliases.includes(name));
    }
    _findOption(arg) {
      return this.options.find((option) => option.is(arg));
    }
    _checkForMissingMandatoryOptions() {
      this._getCommandAndAncestors().forEach((cmd) => {
        cmd.options.forEach((anOption) => {
          if (anOption.mandatory && cmd.getOptionValue(anOption.attributeName()) === undefined) {
            cmd.missingMandatoryOptionValue(anOption);
          }
        });
      });
    }
    _checkForConflictingLocalOptions() {
      const definedNonDefaultOptions = this.options.filter((option) => {
        const optionKey = option.attributeName();
        if (this.getOptionValue(optionKey) === undefined) {
          return false;
        }
        return this.getOptionValueSource(optionKey) !== "default";
      });
      const optionsWithConflicting = definedNonDefaultOptions.filter((option) => option.conflictsWith.length > 0);
      optionsWithConflicting.forEach((option) => {
        const conflictingAndDefined = definedNonDefaultOptions.find((defined) => option.conflictsWith.includes(defined.attributeName()));
        if (conflictingAndDefined) {
          this._conflictingOption(option, conflictingAndDefined);
        }
      });
    }
    _checkForConflictingOptions() {
      this._getCommandAndAncestors().forEach((cmd) => {
        cmd._checkForConflictingLocalOptions();
      });
    }
    parseOptions(args) {
      const operands = [];
      const unknown = [];
      let dest = operands;
      function maybeOption(arg) {
        return arg.length > 1 && arg[0] === "-";
      }
      const negativeNumberArg = (arg) => {
        if (!/^-(\d+|\d*\.\d+)(e[+-]?\d+)?$/.test(arg))
          return false;
        return !this._getCommandAndAncestors().some((cmd) => cmd.options.map((opt) => opt.short).some((short) => /^-\d$/.test(short)));
      };
      let activeVariadicOption = null;
      let activeGroup = null;
      let i = 0;
      while (i < args.length || activeGroup) {
        const arg = activeGroup ?? args[i++];
        activeGroup = null;
        if (arg === "--") {
          if (dest === unknown)
            dest.push(arg);
          dest.push(...args.slice(i));
          break;
        }
        if (activeVariadicOption && (!maybeOption(arg) || negativeNumberArg(arg))) {
          this.emit(`option:${activeVariadicOption.name()}`, arg);
          continue;
        }
        activeVariadicOption = null;
        if (maybeOption(arg)) {
          const option = this._findOption(arg);
          if (option) {
            if (option.required) {
              const value = args[i++];
              if (value === undefined)
                this.optionMissingArgument(option);
              this.emit(`option:${option.name()}`, value);
            } else if (option.optional) {
              let value = null;
              if (i < args.length && (!maybeOption(args[i]) || negativeNumberArg(args[i]))) {
                value = args[i++];
              }
              this.emit(`option:${option.name()}`, value);
            } else {
              this.emit(`option:${option.name()}`);
            }
            activeVariadicOption = option.variadic ? option : null;
            continue;
          }
        }
        if (arg.length > 2 && arg[0] === "-" && arg[1] !== "-") {
          const option = this._findOption(`-${arg[1]}`);
          if (option) {
            if (option.required || option.optional && this._combineFlagAndOptionalValue) {
              this.emit(`option:${option.name()}`, arg.slice(2));
            } else {
              this.emit(`option:${option.name()}`);
              activeGroup = `-${arg.slice(2)}`;
            }
            continue;
          }
        }
        if (/^--[^=]+=/.test(arg)) {
          const index = arg.indexOf("=");
          const option = this._findOption(arg.slice(0, index));
          if (option && (option.required || option.optional)) {
            this.emit(`option:${option.name()}`, arg.slice(index + 1));
            continue;
          }
        }
        if (dest === operands && maybeOption(arg) && !(this.commands.length === 0 && negativeNumberArg(arg))) {
          dest = unknown;
        }
        if ((this._enablePositionalOptions || this._passThroughOptions) && operands.length === 0 && unknown.length === 0) {
          if (this._findCommand(arg)) {
            operands.push(arg);
            unknown.push(...args.slice(i));
            break;
          } else if (this._getHelpCommand() && arg === this._getHelpCommand().name()) {
            operands.push(arg, ...args.slice(i));
            break;
          } else if (this._defaultCommandName) {
            unknown.push(arg, ...args.slice(i));
            break;
          }
        }
        if (this._passThroughOptions) {
          dest.push(arg, ...args.slice(i));
          break;
        }
        dest.push(arg);
      }
      return { operands, unknown };
    }
    opts() {
      if (this._storeOptionsAsProperties) {
        const result = {};
        const len = this.options.length;
        for (let i = 0;i < len; i++) {
          const key = this.options[i].attributeName();
          result[key] = key === this._versionOptionName ? this._version : this[key];
        }
        return result;
      }
      return this._optionValues;
    }
    optsWithGlobals() {
      return this._getCommandAndAncestors().reduce((combinedOptions, cmd) => Object.assign(combinedOptions, cmd.opts()), {});
    }
    error(message, errorOptions) {
      this._outputConfiguration.outputError(`${message}
`, this._outputConfiguration.writeErr);
      if (typeof this._showHelpAfterError === "string") {
        this._outputConfiguration.writeErr(`${this._showHelpAfterError}
`);
      } else if (this._showHelpAfterError) {
        this._outputConfiguration.writeErr(`
`);
        this.outputHelp({ error: true });
      }
      const config = errorOptions || {};
      const exitCode = config.exitCode || 1;
      const code = config.code || "commander.error";
      this._exit(exitCode, code, message);
    }
    _parseOptionsEnv() {
      this.options.forEach((option) => {
        if (option.envVar && option.envVar in process2.env) {
          const optionKey = option.attributeName();
          if (this.getOptionValue(optionKey) === undefined || ["default", "config", "env"].includes(this.getOptionValueSource(optionKey))) {
            if (option.required || option.optional) {
              this.emit(`optionEnv:${option.name()}`, process2.env[option.envVar]);
            } else {
              this.emit(`optionEnv:${option.name()}`);
            }
          }
        }
      });
    }
    _parseOptionsImplied() {
      const dualHelper = new DualOptions(this.options);
      const hasCustomOptionValue = (optionKey) => {
        return this.getOptionValue(optionKey) !== undefined && !["default", "implied"].includes(this.getOptionValueSource(optionKey));
      };
      this.options.filter((option) => option.implied !== undefined && hasCustomOptionValue(option.attributeName()) && dualHelper.valueFromOption(this.getOptionValue(option.attributeName()), option)).forEach((option) => {
        Object.keys(option.implied).filter((impliedKey) => !hasCustomOptionValue(impliedKey)).forEach((impliedKey) => {
          this.setOptionValueWithSource(impliedKey, option.implied[impliedKey], "implied");
        });
      });
    }
    missingArgument(name) {
      const message = `error: missing required argument '${name}'`;
      this.error(message, { code: "commander.missingArgument" });
    }
    optionMissingArgument(option) {
      const message = `error: option '${option.flags}' argument missing`;
      this.error(message, { code: "commander.optionMissingArgument" });
    }
    missingMandatoryOptionValue(option) {
      const message = `error: required option '${option.flags}' not specified`;
      this.error(message, { code: "commander.missingMandatoryOptionValue" });
    }
    _conflictingOption(option, conflictingOption) {
      const findBestOptionFromValue = (option2) => {
        const optionKey = option2.attributeName();
        const optionValue = this.getOptionValue(optionKey);
        const negativeOption = this.options.find((target) => target.negate && optionKey === target.attributeName());
        const positiveOption = this.options.find((target) => !target.negate && optionKey === target.attributeName());
        if (negativeOption && (negativeOption.presetArg === undefined && optionValue === false || negativeOption.presetArg !== undefined && optionValue === negativeOption.presetArg)) {
          return negativeOption;
        }
        return positiveOption || option2;
      };
      const getErrorMessage = (option2) => {
        const bestOption = findBestOptionFromValue(option2);
        const optionKey = bestOption.attributeName();
        const source = this.getOptionValueSource(optionKey);
        if (source === "env") {
          return `environment variable '${bestOption.envVar}'`;
        }
        return `option '${bestOption.flags}'`;
      };
      const message = `error: ${getErrorMessage(option)} cannot be used with ${getErrorMessage(conflictingOption)}`;
      this.error(message, { code: "commander.conflictingOption" });
    }
    unknownOption(flag) {
      if (this._allowUnknownOption)
        return;
      let suggestion = "";
      if (flag.startsWith("--") && this._showSuggestionAfterError) {
        let candidateFlags = [];
        let command = this;
        do {
          const moreFlags = command.createHelp().visibleOptions(command).filter((option) => option.long).map((option) => option.long);
          candidateFlags = candidateFlags.concat(moreFlags);
          command = command.parent;
        } while (command && !command._enablePositionalOptions);
        suggestion = suggestSimilar(flag, candidateFlags);
      }
      const message = `error: unknown option '${flag}'${suggestion}`;
      this.error(message, { code: "commander.unknownOption" });
    }
    _excessArguments(receivedArgs) {
      if (this._allowExcessArguments)
        return;
      const expected = this.registeredArguments.length;
      const s = expected === 1 ? "" : "s";
      const forSubcommand = this.parent ? ` for '${this.name()}'` : "";
      const message = `error: too many arguments${forSubcommand}. Expected ${expected} argument${s} but got ${receivedArgs.length}.`;
      this.error(message, { code: "commander.excessArguments" });
    }
    unknownCommand() {
      const unknownName = this.args[0];
      let suggestion = "";
      if (this._showSuggestionAfterError) {
        const candidateNames = [];
        this.createHelp().visibleCommands(this).forEach((command) => {
          candidateNames.push(command.name());
          if (command.alias())
            candidateNames.push(command.alias());
        });
        suggestion = suggestSimilar(unknownName, candidateNames);
      }
      const message = `error: unknown command '${unknownName}'${suggestion}`;
      this.error(message, { code: "commander.unknownCommand" });
    }
    version(str, flags, description) {
      if (str === undefined)
        return this._version;
      this._version = str;
      flags = flags || "-V, --version";
      description = description || "output the version number";
      const versionOption = this.createOption(flags, description);
      this._versionOptionName = versionOption.attributeName();
      this._registerOption(versionOption);
      this.on("option:" + versionOption.name(), () => {
        this._outputConfiguration.writeOut(`${str}
`);
        this._exit(0, "commander.version", str);
      });
      return this;
    }
    description(str, argsDescription) {
      if (str === undefined && argsDescription === undefined)
        return this._description;
      this._description = str;
      if (argsDescription) {
        this._argsDescription = argsDescription;
      }
      return this;
    }
    summary(str) {
      if (str === undefined)
        return this._summary;
      this._summary = str;
      return this;
    }
    alias(alias) {
      if (alias === undefined)
        return this._aliases[0];
      let command = this;
      if (this.commands.length !== 0 && this.commands[this.commands.length - 1]._executableHandler) {
        command = this.commands[this.commands.length - 1];
      }
      if (alias === command._name)
        throw new Error("Command alias can't be the same as its name");
      const matchingCommand = this.parent?._findCommand(alias);
      if (matchingCommand) {
        const existingCmd = [matchingCommand.name()].concat(matchingCommand.aliases()).join("|");
        throw new Error(`cannot add alias '${alias}' to command '${this.name()}' as already have command '${existingCmd}'`);
      }
      command._aliases.push(alias);
      return this;
    }
    aliases(aliases) {
      if (aliases === undefined)
        return this._aliases;
      aliases.forEach((alias) => this.alias(alias));
      return this;
    }
    usage(str) {
      if (str === undefined) {
        if (this._usage)
          return this._usage;
        const args = this.registeredArguments.map((arg) => {
          return humanReadableArgName(arg);
        });
        return [].concat(this.options.length || this._helpOption !== null ? "[options]" : [], this.commands.length ? "[command]" : [], this.registeredArguments.length ? args : []).join(" ");
      }
      this._usage = str;
      return this;
    }
    name(str) {
      if (str === undefined)
        return this._name;
      this._name = str;
      return this;
    }
    helpGroup(heading) {
      if (heading === undefined)
        return this._helpGroupHeading ?? "";
      this._helpGroupHeading = heading;
      return this;
    }
    commandsGroup(heading) {
      if (heading === undefined)
        return this._defaultCommandGroup ?? "";
      this._defaultCommandGroup = heading;
      return this;
    }
    optionsGroup(heading) {
      if (heading === undefined)
        return this._defaultOptionGroup ?? "";
      this._defaultOptionGroup = heading;
      return this;
    }
    _initOptionGroup(option) {
      if (this._defaultOptionGroup && !option.helpGroupHeading)
        option.helpGroup(this._defaultOptionGroup);
    }
    _initCommandGroup(cmd) {
      if (this._defaultCommandGroup && !cmd.helpGroup())
        cmd.helpGroup(this._defaultCommandGroup);
    }
    nameFromFilename(filename) {
      this._name = path.basename(filename, path.extname(filename));
      return this;
    }
    executableDir(path2) {
      if (path2 === undefined)
        return this._executableDir;
      this._executableDir = path2;
      return this;
    }
    helpInformation(contextOptions) {
      const helper = this.createHelp();
      const context = this._getOutputContext(contextOptions);
      helper.prepareContext({
        error: context.error,
        helpWidth: context.helpWidth,
        outputHasColors: context.hasColors
      });
      const text = helper.formatHelp(this, helper);
      if (context.hasColors)
        return text;
      return this._outputConfiguration.stripColor(text);
    }
    _getOutputContext(contextOptions) {
      contextOptions = contextOptions || {};
      const error = !!contextOptions.error;
      let baseWrite;
      let hasColors;
      let helpWidth;
      if (error) {
        baseWrite = (str) => this._outputConfiguration.writeErr(str);
        hasColors = this._outputConfiguration.getErrHasColors();
        helpWidth = this._outputConfiguration.getErrHelpWidth();
      } else {
        baseWrite = (str) => this._outputConfiguration.writeOut(str);
        hasColors = this._outputConfiguration.getOutHasColors();
        helpWidth = this._outputConfiguration.getOutHelpWidth();
      }
      const write = (str) => {
        if (!hasColors)
          str = this._outputConfiguration.stripColor(str);
        return baseWrite(str);
      };
      return { error, write, hasColors, helpWidth };
    }
    outputHelp(contextOptions) {
      let deprecatedCallback;
      if (typeof contextOptions === "function") {
        deprecatedCallback = contextOptions;
        contextOptions = undefined;
      }
      const outputContext = this._getOutputContext(contextOptions);
      const eventContext = {
        error: outputContext.error,
        write: outputContext.write,
        command: this
      };
      this._getCommandAndAncestors().reverse().forEach((command) => command.emit("beforeAllHelp", eventContext));
      this.emit("beforeHelp", eventContext);
      let helpInformation = this.helpInformation({ error: outputContext.error });
      if (deprecatedCallback) {
        helpInformation = deprecatedCallback(helpInformation);
        if (typeof helpInformation !== "string" && !Buffer.isBuffer(helpInformation)) {
          throw new Error("outputHelp callback must return a string or a Buffer");
        }
      }
      outputContext.write(helpInformation);
      if (this._getHelpOption()?.long) {
        this.emit(this._getHelpOption().long);
      }
      this.emit("afterHelp", eventContext);
      this._getCommandAndAncestors().forEach((command) => command.emit("afterAllHelp", eventContext));
    }
    helpOption(flags, description) {
      if (typeof flags === "boolean") {
        if (flags) {
          if (this._helpOption === null)
            this._helpOption = undefined;
          if (this._defaultOptionGroup) {
            this._initOptionGroup(this._getHelpOption());
          }
        } else {
          this._helpOption = null;
        }
        return this;
      }
      this._helpOption = this.createOption(flags ?? "-h, --help", description ?? "display help for command");
      if (flags || description)
        this._initOptionGroup(this._helpOption);
      return this;
    }
    _getHelpOption() {
      if (this._helpOption === undefined) {
        this.helpOption(undefined, undefined);
      }
      return this._helpOption;
    }
    addHelpOption(option) {
      this._helpOption = option;
      this._initOptionGroup(option);
      return this;
    }
    help(contextOptions) {
      this.outputHelp(contextOptions);
      let exitCode = Number(process2.exitCode ?? 0);
      if (exitCode === 0 && contextOptions && typeof contextOptions !== "function" && contextOptions.error) {
        exitCode = 1;
      }
      this._exit(exitCode, "commander.help", "(outputHelp)");
    }
    addHelpText(position, text) {
      const allowedValues = ["beforeAll", "before", "after", "afterAll"];
      if (!allowedValues.includes(position)) {
        throw new Error(`Unexpected value for position to addHelpText.
Expecting one of '${allowedValues.join("', '")}'`);
      }
      const helpEvent = `${position}Help`;
      this.on(helpEvent, (context) => {
        let helpStr;
        if (typeof text === "function") {
          helpStr = text({ error: context.error, command: context.command });
        } else {
          helpStr = text;
        }
        if (helpStr) {
          context.write(`${helpStr}
`);
        }
      });
      return this;
    }
    _outputHelpIfRequested(args) {
      const helpOption = this._getHelpOption();
      const helpRequested = helpOption && args.find((arg) => helpOption.is(arg));
      if (helpRequested) {
        this.outputHelp();
        this._exit(0, "commander.helpDisplayed", "(outputHelp)");
      }
    }
  }
  function incrementNodeInspectorPort(args) {
    return args.map((arg) => {
      if (!arg.startsWith("--inspect")) {
        return arg;
      }
      let debugOption;
      let debugHost = "127.0.0.1";
      let debugPort = "9229";
      let match;
      if ((match = arg.match(/^(--inspect(-brk)?)$/)) !== null) {
        debugOption = match[1];
      } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+)$/)) !== null) {
        debugOption = match[1];
        if (/^\d+$/.test(match[3])) {
          debugPort = match[3];
        } else {
          debugHost = match[3];
        }
      } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+):(\d+)$/)) !== null) {
        debugOption = match[1];
        debugHost = match[3];
        debugPort = match[4];
      }
      if (debugOption && debugPort !== "0") {
        return `${debugOption}=${debugHost}:${parseInt(debugPort) + 1}`;
      }
      return arg;
    });
  }
  function useColor() {
    if (process2.env.NO_COLOR || process2.env.FORCE_COLOR === "0" || process2.env.FORCE_COLOR === "false")
      return false;
    if (process2.env.FORCE_COLOR || process2.env.CLICOLOR_FORCE !== undefined)
      return true;
    return;
  }
  exports2.Command = Command;
  exports2.useColor = useColor;
});

// node_modules/commander/index.js
var require_commander = __commonJS((exports2) => {
  var { Argument } = require_argument();
  var { Command } = require_command();
  var { CommanderError, InvalidArgumentError } = require_error();
  var { Help } = require_help();
  var { Option } = require_option();
  exports2.program = new Command;
  exports2.createCommand = (name) => new Command(name);
  exports2.createOption = (flags, description) => new Option(flags, description);
  exports2.createArgument = (name, description) => new Argument(name, description);
  exports2.Command = Command;
  exports2.Option = Option;
  exports2.Argument = Argument;
  exports2.Help = Help;
  exports2.CommanderError = CommanderError;
  exports2.InvalidArgumentError = InvalidArgumentError;
  exports2.InvalidOptionArgumentError = InvalidArgumentError;
});

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

// node_modules/commander/esm.mjs
var import__ = __toESM(require_commander(), 1);
var {
  program,
  createCommand,
  createArgument,
  createOption,
  CommanderError,
  InvalidArgumentError,
  InvalidOptionArgumentError,
  Command,
  Argument,
  Option,
  Help
} = import__.default;

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

// src/cli.ts
var path7 = __toESM(require("path"));

// src/editor.ts
var import_fs5 = require("fs");
var path = __toESM(require("path"));

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
function get_class_id(component_name) {
  if (UNITY_CLASS_NAMES[component_name] !== undefined) {
    return UNITY_CLASS_NAMES[component_name];
  }
  const lowerName = component_name.toLowerCase();
  for (const [name, id] of Object.entries(UNITY_CLASS_NAMES)) {
    if (name.toLowerCase() === lowerName) {
      return id;
    }
  }
  return null;
}

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

// src/editor.ts
function safeUnityYAMLEdit(filePath, objectName, propertyName, newValue) {
  if (!import_fs5.existsSync(filePath)) {
    return {
      success: false,
      file_path: filePath,
      error: `File not found: ${filePath}`
    };
  }
  let content;
  try {
    content = import_fs5.readFileSync(filePath, "utf-8");
  } catch (err) {
    return {
      success: false,
      file_path: filePath,
      error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`
    };
  }
  const normalizedProperty = propertyName.startsWith("m_") ? propertyName.slice(2) : propertyName;
  const blocks = content.split(/(?=--- !u!)/);
  const escapedName = objectName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const namePattern = new RegExp(`^\\s*m_Name:\\s*${escapedName}\\s*$`, "m");
  let targetBlockIndex = -1;
  for (let i = 0;i < blocks.length; i++) {
    const block = blocks[i];
    if (block.startsWith("--- !u!1 ") && namePattern.test(block)) {
      targetBlockIndex = i;
      break;
    }
  }
  if (targetBlockIndex === -1) {
    return {
      success: false,
      file_path: filePath,
      error: `GameObject "${objectName}" not found in file`
    };
  }
  const targetBlock = blocks[targetBlockIndex];
  const propertyPattern = new RegExp(`(^\\s*m_${normalizedProperty}:\\s*)([^\\n]*)`, "m");
  let updatedBlock;
  if (propertyPattern.test(targetBlock)) {
    updatedBlock = targetBlock.replace(propertyPattern, `$1${newValue}`);
  } else {
    updatedBlock = targetBlock.replace(/(\n)(--- !u!|$)/, `
  m_${normalizedProperty}: ${newValue}$1$2`);
  }
  blocks[targetBlockIndex] = updatedBlock;
  const finalContent = blocks.join("");
  return atomicWrite(filePath, finalContent);
}
function editProperty(options) {
  const result = safeUnityYAMLEdit(options.file_path, options.object_name, options.property, options.new_value);
  if (!result.success) {
    return result;
  }
  return result;
}
function editComponentByFileId(options) {
  const { file_path, file_id, property, new_value } = options;
  if (!import_fs5.existsSync(file_path)) {
    return {
      success: false,
      file_path,
      error: `File not found: ${file_path}`
    };
  }
  let content;
  try {
    content = import_fs5.readFileSync(file_path, "utf-8");
  } catch (err) {
    return {
      success: false,
      file_path,
      error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`
    };
  }
  let normalizedProperty;
  if (property.includes(".") || property.includes("Array")) {
    const rootSegment = property.split(".")[0];
    if (rootSegment.startsWith("m_")) {
      normalizedProperty = property;
    } else {
      normalizedProperty = "m_" + property;
    }
  } else {
    normalizedProperty = property.startsWith("m_") ? property : "m_" + property;
  }
  const blockPattern = new RegExp(`--- !u!(\\d+) &${file_id}\\b`);
  const blockMatch = content.match(blockPattern);
  if (!blockMatch) {
    return {
      success: false,
      file_path,
      error: `Component with file ID ${file_id} not found`
    };
  }
  const classId = parseInt(blockMatch[1], 10);
  const blocks = content.split(/(?=--- !u!)/);
  const targetBlockPattern = new RegExp(`^--- !u!${classId} &${file_id}\\b`);
  let targetBlockIndex = -1;
  for (let i = 0;i < blocks.length; i++) {
    if (targetBlockPattern.test(blocks[i])) {
      targetBlockIndex = i;
      break;
    }
  }
  if (targetBlockIndex === -1) {
    return {
      success: false,
      file_path,
      error: `Component block with file ID ${file_id} not found`
    };
  }
  const targetBlock = blocks[targetBlockIndex];
  let updatedBlock = applyModification(targetBlock, normalizedProperty, new_value, "{fileID: 0}");
  if (updatedBlock === targetBlock) {
    const withoutPrefix = property.startsWith("m_") ? property.slice(2) : property;
    updatedBlock = applyModification(targetBlock, withoutPrefix, new_value, "{fileID: 0}");
  }
  if (updatedBlock === targetBlock && !property.includes(".") && !property.includes("Array")) {
    const addProp = property.startsWith("m_") ? property : "m_" + property;
    updatedBlock = targetBlock.replace(/(\n)(--- !u!|$)/, `
  ${addProp}: ${new_value}$1$2`);
  }
  blocks[targetBlockIndex] = updatedBlock;
  const finalContent = blocks.join("");
  const writeResult = atomicWrite(file_path, finalContent);
  if (!writeResult.success) {
    return {
      success: false,
      file_path,
      error: writeResult.error
    };
  }
  return {
    success: true,
    file_path,
    file_id,
    class_id: classId,
    bytes_written: writeResult.bytes_written
  };
}
function validateUnityYAML(content) {
  if (!content.startsWith("%YAML 1.1")) {
    console.error("Missing or invalid YAML header");
    return false;
  }
  const invalidGuids = content.match(/guid:\s*[a-f0-9]{1,29}\b/g);
  if (invalidGuids) {
    console.error("Found invalid GUID format (missing characters)");
    return false;
  }
  const blockOpens = (content.match(/--- !u!/g) || []).length;
  const blockCloses = (content.match(/\n---(?!u!)/g) || []).length;
  if (Math.abs(blockOpens - blockCloses) > 1) {
    console.error("Unbalanced YAML block markers");
    return false;
  }
  return true;
}
function extractExistingFileIds(content) {
  const ids = new Set;
  const matches = content.matchAll(/--- !u!\d+ &(\d+)/g);
  for (const match of matches) {
    ids.add(parseInt(match[1], 10));
  }
  return ids;
}
function generateFileId(existingIds) {
  let id;
  do {
    id = Math.floor(Math.random() * 9000000000) + 1e9;
  } while (existingIds.has(id) || id === 0);
  return id;
}
function createGameObjectYAML(gameObjectId, transformId, name, parentTransformId = 0) {
  return `--- !u!1 &${gameObjectId}
GameObject:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  serializedVersion: 6
  m_Component:
  - component: {fileID: ${transformId}}
  m_Layer: 0
  m_Name: ${name}
  m_TagString: Untagged
  m_Icon: {fileID: 0}
  m_NavMeshLayer: 0
  m_StaticEditorFlags: 0
  m_IsActive: 1
--- !u!4 &${transformId}
Transform:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: ${gameObjectId}}
  serializedVersion: 2
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalPosition: {x: 0, y: 0, z: 0}
  m_LocalScale: {x: 1, y: 1, z: 1}
  m_ConstrainProportionsScale: 0
  m_Children: []
  m_Father: {fileID: ${parentTransformId}}
  m_LocalEulerAnglesHint: {x: 0, y: 0, z: 0}
`;
}
function findTransformIdByName(content, objectName) {
  const blocks = content.split(/(?=--- !u!)/);
  const escapedName = objectName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const namePattern = new RegExp(`^\\s*m_Name:\\s*${escapedName}\\s*$`, "m");
  for (const block of blocks) {
    if (block.startsWith("--- !u!1 ") && namePattern.test(block)) {
      const componentMatch = block.match(/m_Component:\s*\n\s*-\s*component:\s*\{fileID:\s*(\d+)\}/);
      if (componentMatch) {
        return parseInt(componentMatch[1], 10);
      }
    }
  }
  return null;
}
function addChildToParent(content, parentTransformId, childTransformId) {
  const blocks = content.split(/(?=--- !u!)/);
  const transformPattern = new RegExp(`^--- !u!4 &${parentTransformId}\\b`);
  for (let i = 0;i < blocks.length; i++) {
    if (transformPattern.test(blocks[i])) {
      blocks[i] = blocks[i].replace(/m_Children:\s*\[(.*?)\]/, (match, children) => {
        const trimmed = children.trim();
        if (trimmed === "") {
          return `m_Children:
  - {fileID: ${childTransformId}}`;
        } else {
          return match.replace("]", "") + `
  - {fileID: ${childTransformId}}]`;
        }
      });
      if (blocks[i].includes("m_Children:") && !blocks[i].includes(`fileID: ${childTransformId}`)) {
        blocks[i] = blocks[i].replace(/(m_Children:\s*\n(?:\s*-\s*\{fileID:\s*\d+\}\s*\n)*)/, `$1  - {fileID: ${childTransformId}}
`);
      }
      break;
    }
  }
  return blocks.join("");
}
function createGameObject(options) {
  const { file_path, name, parent } = options;
  if (!name || name.trim() === "") {
    return {
      success: false,
      file_path,
      error: "GameObject name cannot be empty"
    };
  }
  if (!import_fs5.existsSync(file_path)) {
    return {
      success: false,
      file_path,
      error: `File not found: ${file_path}`
    };
  }
  let content;
  try {
    content = import_fs5.readFileSync(file_path, "utf-8");
  } catch (err) {
    return {
      success: false,
      file_path,
      error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`
    };
  }
  if (!content.startsWith("%YAML 1.1")) {
    return {
      success: false,
      file_path,
      error: "File is not a valid Unity YAML file (missing header)"
    };
  }
  let parentTransformId = 0;
  if (parent !== undefined) {
    if (typeof parent === "number") {
      parentTransformId = parent;
      const transformPattern = new RegExp(`--- !u!4 &${parentTransformId}\\b`);
      if (!transformPattern.test(content)) {
        return {
          success: false,
          file_path,
          error: `Parent Transform with fileID ${parentTransformId} not found`
        };
      }
    } else {
      const foundId = findTransformIdByName(content, parent);
      if (foundId === null) {
        return {
          success: false,
          file_path,
          error: `Parent GameObject "${parent}" not found`
        };
      }
      parentTransformId = foundId;
    }
  }
  const existingIds = extractExistingFileIds(content);
  const gameObjectId = generateFileId(existingIds);
  existingIds.add(gameObjectId);
  const transformId = generateFileId(existingIds);
  const newBlocks = createGameObjectYAML(gameObjectId, transformId, name.trim(), parentTransformId);
  let finalContent = content.endsWith(`
`) ? content + newBlocks : content + `
` + newBlocks;
  if (parentTransformId !== 0) {
    finalContent = addChildToParent(finalContent, parentTransformId, transformId);
  }
  const writeResult = atomicWrite(file_path, finalContent);
  if (!writeResult.success) {
    return {
      success: false,
      file_path,
      error: writeResult.error
    };
  }
  return {
    success: true,
    file_path,
    game_object_id: gameObjectId,
    transform_id: transformId
  };
}
function eulerToQuaternion(euler) {
  const deg2rad = Math.PI / 180;
  const x = euler.x * deg2rad;
  const y = euler.y * deg2rad;
  const z = euler.z * deg2rad;
  const cx = Math.cos(x / 2);
  const sx = Math.sin(x / 2);
  const cy = Math.cos(y / 2);
  const sy = Math.sin(y / 2);
  const cz = Math.cos(z / 2);
  const sz = Math.sin(z / 2);
  return {
    x: sx * cy * cz + cx * sy * sz,
    y: cx * sy * cz - sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz,
    w: cx * cy * cz + sx * sy * sz
  };
}
function editTransform(options) {
  const { file_path, transform_id, position, rotation, scale } = options;
  if (!import_fs5.existsSync(file_path)) {
    return {
      success: false,
      file_path,
      error: `File not found: ${file_path}`
    };
  }
  let content;
  try {
    content = import_fs5.readFileSync(file_path, "utf-8");
  } catch (err) {
    return {
      success: false,
      file_path,
      error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`
    };
  }
  const blocks = content.split(/(?=--- !u!)/);
  const transformPattern = new RegExp(`^--- !u!4 &${transform_id}\\b`);
  let targetBlockIndex = -1;
  for (let i = 0;i < blocks.length; i++) {
    if (transformPattern.test(blocks[i])) {
      targetBlockIndex = i;
      break;
    }
  }
  if (targetBlockIndex === -1) {
    return {
      success: false,
      file_path,
      error: `Transform with fileID ${transform_id} not found`
    };
  }
  let block = blocks[targetBlockIndex];
  if (position) {
    block = block.replace(/m_LocalPosition:\s*\{[^}]+\}/, `m_LocalPosition: {x: ${position.x}, y: ${position.y}, z: ${position.z}}`);
  }
  if (rotation) {
    const quat = eulerToQuaternion(rotation);
    block = block.replace(/m_LocalRotation:\s*\{[^}]+\}/, `m_LocalRotation: {x: ${quat.x}, y: ${quat.y}, z: ${quat.z}, w: ${quat.w}}`);
    block = block.replace(/m_LocalEulerAnglesHint:\s*\{[^}]+\}/, `m_LocalEulerAnglesHint: {x: ${rotation.x}, y: ${rotation.y}, z: ${rotation.z}}`);
  }
  if (scale) {
    block = block.replace(/m_LocalScale:\s*\{[^}]+\}/, `m_LocalScale: {x: ${scale.x}, y: ${scale.y}, z: ${scale.z}}`);
  }
  blocks[targetBlockIndex] = block;
  const finalContent = blocks.join("");
  return atomicWrite(file_path, finalContent);
}
function createGenericComponentYAML(componentName, classId, componentId, gameObjectId) {
  return `--- !u!${classId} &${componentId}
${componentName}:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: ${gameObjectId}}
  m_Enabled: 1
`;
}
function findGameObjectIdByName(content, objectName) {
  const blocks = content.split(/(?=--- !u!)/);
  const escapedName = objectName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const namePattern = new RegExp(`^\\s*m_Name:\\s*${escapedName}\\s*$`, "m");
  for (const block of blocks) {
    if (block.startsWith("--- !u!1 ") && namePattern.test(block)) {
      const idMatch = block.match(/^--- !u!1 &(\d+)/);
      if (idMatch) {
        return parseInt(idMatch[1], 10);
      }
    }
  }
  return null;
}
function addComponentToGameObject(content, gameObjectId, componentId) {
  const blocks = content.split(/(?=--- !u!)/);
  const goPattern = new RegExp(`^--- !u!1 &${gameObjectId}\\b`);
  for (let i = 0;i < blocks.length; i++) {
    if (goPattern.test(blocks[i])) {
      blocks[i] = blocks[i].replace(/(m_Component:\s*\n(?:\s*-\s*component:\s*\{fileID:\s*\d+\}\s*\n)*)/, `$1  - component: {fileID: ${componentId}}
`);
      break;
    }
  }
  return blocks.join("");
}
function resolveScriptGuid(script, projectPath) {
  if (/^[a-f0-9]{32}$/i.test(script)) {
    return { guid: script.toLowerCase(), path: null };
  }
  if (script.endsWith(".cs")) {
    const metaPath = script + ".meta";
    if (import_fs5.existsSync(metaPath)) {
      const guid = extractGuidFromMeta(metaPath);
      if (guid) {
        return { guid, path: script };
      }
    }
    if (projectPath) {
      const fullPath = path.join(projectPath, script);
      const fullMetaPath = fullPath + ".meta";
      if (import_fs5.existsSync(fullMetaPath)) {
        const guid = extractGuidFromMeta(fullMetaPath);
        if (guid) {
          return { guid, path: script };
        }
      }
    }
  }
  if (projectPath) {
    const cachePath = path.join(projectPath, ".unity-agentic", "guid-cache.json");
    if (import_fs5.existsSync(cachePath)) {
      try {
        const cache = JSON.parse(import_fs5.readFileSync(cachePath, "utf-8"));
        const scriptNameLower = script.toLowerCase().replace(/\.cs$/, "");
        for (const [guid, assetPath] of Object.entries(cache)) {
          if (!assetPath.endsWith(".cs"))
            continue;
          const fileName = path.basename(assetPath, ".cs").toLowerCase();
          const pathLower = assetPath.toLowerCase();
          if (fileName === scriptNameLower) {
            return { guid, path: assetPath };
          }
          if (pathLower.includes(scriptNameLower)) {
            return { guid, path: assetPath };
          }
        }
      } catch {}
    }
  }
  return null;
}
function createMonoBehaviourYAML(componentId, gameObjectId, scriptGuid) {
  return `--- !u!114 &${componentId}
MonoBehaviour:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: ${gameObjectId}}
  m_Enabled: 1
  m_EditorHideFlags: 0
  m_Script: {fileID: 11500000, guid: ${scriptGuid}, type: 3}
  m_Name:
  m_EditorClassIdentifier:
`;
}
function addComponent(options) {
  const { file_path, game_object_name, component_type, project_path } = options;
  if (!import_fs5.existsSync(file_path)) {
    return {
      success: false,
      file_path,
      error: `File not found: ${file_path}`
    };
  }
  let content;
  try {
    content = import_fs5.readFileSync(file_path, "utf-8");
  } catch (err) {
    return {
      success: false,
      file_path,
      error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`
    };
  }
  const gameObjectId = findGameObjectIdByName(content, game_object_name);
  if (gameObjectId === null) {
    return {
      success: false,
      file_path,
      error: `GameObject "${game_object_name}" not found`
    };
  }
  const existingIds = extractExistingFileIds(content);
  const componentId = generateFileId(existingIds);
  let componentYAML;
  let scriptGuid;
  let scriptPath;
  const classId = get_class_id(component_type);
  if (classId !== null) {
    const componentName = UNITY_CLASS_IDS[classId] || component_type;
    componentYAML = createGenericComponentYAML(componentName, classId, componentId, gameObjectId);
  } else {
    const resolved = resolveScriptGuid(component_type, project_path);
    if (!resolved) {
      return {
        success: false,
        file_path,
        error: `Component or script not found: "${component_type}". Use a Unity component name (e.g., "MeshRenderer", "Animator") or provide a script name, path (Assets/Scripts/Foo.cs), or GUID.`
      };
    }
    componentYAML = createMonoBehaviourYAML(componentId, gameObjectId, resolved.guid);
    scriptGuid = resolved.guid;
    scriptPath = resolved.path || undefined;
  }
  content = addComponentToGameObject(content, gameObjectId, componentId);
  const finalContent = content.endsWith(`
`) ? content + componentYAML : content + `
` + componentYAML;
  const writeResult = atomicWrite(file_path, finalContent);
  if (!writeResult.success) {
    return {
      success: false,
      file_path,
      error: writeResult.error
    };
  }
  return {
    success: true,
    file_path,
    component_id: componentId,
    script_guid: scriptGuid,
    script_path: scriptPath
  };
}
function extractGuidFromMeta(metaPath) {
  if (!import_fs5.existsSync(metaPath)) {
    return null;
  }
  try {
    const content = import_fs5.readFileSync(metaPath, "utf-8");
    const match = content.match(/guid:\s*([a-f0-9]{32})/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
function findPrefabRootInfo(content) {
  const blocks = content.split(/(?=--- !u!)/);
  for (const block of blocks) {
    if (block.startsWith("--- !u!4 ") && /m_Father:\s*\{fileID:\s*0\}/.test(block)) {
      const transformIdMatch = block.match(/^--- !u!4 &(\d+)/);
      const gameObjectIdMatch = block.match(/m_GameObject:\s*\{fileID:\s*(\d+)\}/);
      if (transformIdMatch && gameObjectIdMatch) {
        const transformId = parseInt(transformIdMatch[1], 10);
        const gameObjectId = parseInt(gameObjectIdMatch[1], 10);
        for (const goBlock of blocks) {
          if (goBlock.startsWith(`--- !u!1 &${gameObjectId}`)) {
            const nameMatch = goBlock.match(/m_Name:\s*(.+)/);
            const name = nameMatch ? nameMatch[1].trim() : "Prefab";
            return { gameObjectId, transformId, name };
          }
        }
      }
    }
  }
  return null;
}
function createPrefabVariant(options) {
  const { source_prefab, output_path, variant_name } = options;
  if (!import_fs5.existsSync(source_prefab)) {
    return {
      success: false,
      output_path,
      error: `Source prefab not found: ${source_prefab}`
    };
  }
  if (!source_prefab.endsWith(".prefab")) {
    return {
      success: false,
      output_path,
      error: "Source file must be a .prefab file"
    };
  }
  if (!output_path.endsWith(".prefab")) {
    return {
      success: false,
      output_path,
      error: "Output path must have .prefab extension"
    };
  }
  const metaPath = source_prefab + ".meta";
  const sourceGuid = extractGuidFromMeta(metaPath);
  if (!sourceGuid) {
    return {
      success: false,
      output_path,
      error: `Could not find or read .meta file for source prefab: ${metaPath}`
    };
  }
  let sourceContent;
  try {
    sourceContent = import_fs5.readFileSync(source_prefab, "utf-8");
  } catch (err) {
    return {
      success: false,
      output_path,
      error: `Failed to read source prefab: ${err instanceof Error ? err.message : String(err)}`
    };
  }
  const rootInfo = findPrefabRootInfo(sourceContent);
  if (!rootInfo) {
    return {
      success: false,
      output_path,
      error: "Could not find root GameObject in source prefab"
    };
  }
  const prefabInstanceId = generateFileId(new Set);
  const strippedGoId = generateFileId(new Set([prefabInstanceId]));
  const strippedTransformId = generateFileId(new Set([prefabInstanceId, strippedGoId]));
  const finalName = variant_name || `${rootInfo.name} Variant`;
  const variantYaml = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!1 &${strippedGoId} stripped
GameObject:
  m_CorrespondingSourceObject: {fileID: ${rootInfo.gameObjectId}, guid: ${sourceGuid}, type: 3}
  m_PrefabInstance: {fileID: ${prefabInstanceId}}
  m_PrefabAsset: {fileID: 0}
--- !u!4 &${strippedTransformId} stripped
Transform:
  m_CorrespondingSourceObject: {fileID: ${rootInfo.transformId}, guid: ${sourceGuid}, type: 3}
  m_PrefabInstance: {fileID: ${prefabInstanceId}}
  m_PrefabAsset: {fileID: 0}
--- !u!1001 &${prefabInstanceId}
PrefabInstance:
  m_ObjectHideFlags: 0
  serializedVersion: 2
  m_Modification:
    m_TransformParent: {fileID: 0}
    m_Modifications:
    - target: {fileID: ${rootInfo.gameObjectId}, guid: ${sourceGuid}, type: 3}
      propertyPath: m_Name
      value: ${finalName}
      objectReference: {fileID: 0}
    m_RemovedComponents: []
    m_RemovedGameObjects: []
    m_AddedGameObjects: []
    m_AddedComponents: []
  m_SourcePrefab: {fileID: 100100000, guid: ${sourceGuid}, type: 3}
`;
  try {
    import_fs5.writeFileSync(output_path, variantYaml, "utf-8");
  } catch (err) {
    return {
      success: false,
      output_path,
      error: `Failed to write variant prefab: ${err instanceof Error ? err.message : String(err)}`
    };
  }
  const variantGuid = generateGuid();
  const variantMetaContent = `fileFormatVersion: 2
guid: ${variantGuid}
PrefabImporter:
  externalObjects: {}
  userData:
  assetBundleName:
  assetBundleVariant:
`;
  try {
    import_fs5.writeFileSync(output_path + ".meta", variantMetaContent, "utf-8");
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
    source_guid: sourceGuid,
    prefab_instance_id: prefabInstanceId
  };
}
function findBlockByFileId(content, fileId) {
  const blocks = content.split(/(?=--- !u!)/);
  const pattern = new RegExp(`^--- !u!(\\d+) &${fileId}\\b`);
  for (let i = 0;i < blocks.length; i++) {
    const match = blocks[i].match(pattern);
    if (match) {
      return { block: blocks[i], classId: parseInt(match[1], 10), index: i };
    }
  }
  return null;
}
function removeBlocks(content, fileIdsToRemove) {
  const blocks = content.split(/(?=--- !u!)/);
  const kept = [];
  for (let i = 0;i < blocks.length; i++) {
    if (i === 0 && !blocks[i].startsWith("--- !u!")) {
      kept.push(blocks[i]);
      continue;
    }
    const idMatch = blocks[i].match(/^--- !u!\d+ &(\d+)/);
    if (idMatch) {
      const blockId = parseInt(idMatch[1], 10);
      if (fileIdsToRemove.has(blockId)) {
        continue;
      }
    }
    kept.push(blocks[i]);
  }
  return kept.join("");
}
function removeComponentFromGameObject(content, goFileId, compFileId) {
  const blocks = content.split(/(?=--- !u!)/);
  const goPattern = new RegExp(`^--- !u!1 &${goFileId}\\b`);
  for (let i = 0;i < blocks.length; i++) {
    if (goPattern.test(blocks[i])) {
      const compLinePattern = new RegExp(`\\s*- component: \\{fileID: ${compFileId}\\}\\n?`);
      blocks[i] = blocks[i].replace(compLinePattern, "");
      break;
    }
  }
  return blocks.join("");
}
function removeChildFromParent(content, parentTransformId, childTransformId) {
  const blocks = content.split(/(?=--- !u!)/);
  const transformPattern = new RegExp(`^--- !u!4 &${parentTransformId}\\b`);
  for (let i = 0;i < blocks.length; i++) {
    if (transformPattern.test(blocks[i])) {
      const childLinePattern = new RegExp(`\\s*- \\{fileID: ${childTransformId}\\}\\n?`);
      blocks[i] = blocks[i].replace(childLinePattern, "");
      if (/m_Children:\s*\n\s*m_Father:/.test(blocks[i]) || /m_Children:\s*\n\s*m_RootOrder:/.test(blocks[i])) {
        blocks[i] = blocks[i].replace(/m_Children:\s*\n/, `m_Children: []
`);
      }
      break;
    }
  }
  return blocks.join("");
}
function collectHierarchy(content, transformFileId) {
  const result = new Set;
  const blocks = content.split(/(?=--- !u!)/);
  const transformPattern = new RegExp(`^--- !u!4 &${transformFileId}\\b`);
  let transformBlock = "";
  for (const block of blocks) {
    if (transformPattern.test(block)) {
      transformBlock = block;
      break;
    }
  }
  if (!transformBlock)
    return result;
  const childMatches = transformBlock.matchAll(/m_Children:[\s\S]*?(?=\s*m_Father:)/g);
  const childrenSection = childMatches.next().value;
  if (!childrenSection)
    return result;
  const childIds = [];
  const childIdMatches = childrenSection[0].matchAll(/\{fileID:\s*(\d+)\}/g);
  for (const m of childIdMatches) {
    const childId = parseInt(m[1], 10);
    if (childId !== 0)
      childIds.push(childId);
  }
  for (const childTransformId of childIds) {
    result.add(childTransformId);
    const childTransformPattern = new RegExp(`^--- !u!4 &${childTransformId}\\b`);
    for (const block of blocks) {
      if (childTransformPattern.test(block)) {
        const goMatch = block.match(/m_GameObject:\s*\{fileID:\s*(\d+)\}/);
        if (goMatch) {
          const goId = parseInt(goMatch[1], 10);
          result.add(goId);
          const goPattern = new RegExp(`^--- !u!1 &${goId}\\b`);
          for (const goBlock of blocks) {
            if (goPattern.test(goBlock)) {
              const compMatches = goBlock.matchAll(/component:\s*\{fileID:\s*(\d+)\}/g);
              for (const cm of compMatches) {
                result.add(parseInt(cm[1], 10));
              }
              break;
            }
          }
        }
        break;
      }
    }
    const subIds = collectHierarchy(content, childTransformId);
    for (const id of subIds) {
      result.add(id);
    }
  }
  return result;
}
function remapFileIds(blockText, idMap) {
  let result = blockText;
  result = result.replace(/^(--- !u!\d+ &)(\d+)/, (match, prefix, oldId) => {
    const id = parseInt(oldId, 10);
    return idMap.has(id) ? `${prefix}${idMap.get(id)}` : match;
  });
  result = result.replace(/(\{fileID:\s*)(\d+)(\})/g, (match, prefix, oldId, suffix) => {
    const id = parseInt(oldId, 10);
    if (id === 0)
      return match;
    return idMap.has(id) ? `${prefix}${idMap.get(id)}${suffix}` : match;
  });
  return result;
}
function applyModification(block, propertyPath, value, objectReference) {
  if (!propertyPath.includes(".") && !propertyPath.includes("Array")) {
    const propPattern = new RegExp(`(^\\s*${propertyPath}:\\s*)(.*)$`, "m");
    if (propPattern.test(block)) {
      if (objectReference && objectReference !== "{fileID: 0}") {
        return block.replace(propPattern, `$1${objectReference}`);
      }
      return block.replace(propPattern, `$1${value}`);
    }
    return block;
  }
  if (propertyPath.includes(".") && !propertyPath.includes("Array")) {
    const parts = propertyPath.split(".");
    const parentProp = parts[0];
    const subField = parts[1];
    const inlinePattern = new RegExp(`(${parentProp}:\\s*\\{)([^}]*)(\\})`, "m");
    const inlineMatch = block.match(inlinePattern);
    if (inlineMatch) {
      const fields = inlineMatch[2];
      const fieldPattern = new RegExp(`(${subField}:\\s*)([^,}]+)`);
      const updatedFields = fields.replace(fieldPattern, `$1${value}`);
      return block.replace(inlinePattern, `$1${updatedFields}$3`);
    }
    return block;
  }
  if (propertyPath.includes("Array.data[")) {
    const arrayMatch = propertyPath.match(/^(.+)\.Array\.data\[(\d+)\]$/);
    if (arrayMatch) {
      const arrayProp = arrayMatch[1];
      const index = parseInt(arrayMatch[2], 10);
      const arrayPattern = new RegExp(`${arrayProp}:\\s*\\n((?:\\s*-\\s*[^\\n]+\\n)*)`, "m");
      const arrayBlockMatch = block.match(arrayPattern);
      if (arrayBlockMatch) {
        const lines = arrayBlockMatch[1].split(`
`).filter((l) => l.trim().startsWith("-"));
        if (index < lines.length) {
          const refValue = objectReference && objectReference !== "{fileID: 0}" ? objectReference : value;
          const oldLine = lines[index];
          const newLine = oldLine.replace(/-\s*.*/, `- ${refValue}`);
          return block.replace(oldLine, newLine);
        }
      }
    }
    return block;
  }
  return block;
}
function removeComponent(options) {
  const { file_path, file_id } = options;
  const fileIdNum = parseInt(file_id, 10);
  if (!import_fs5.existsSync(file_path)) {
    return { success: false, file_path, error: `File not found: ${file_path}` };
  }
  let content;
  try {
    content = import_fs5.readFileSync(file_path, "utf-8");
  } catch (err) {
    return { success: false, file_path, error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` };
  }
  const found = findBlockByFileId(content, fileIdNum);
  if (!found) {
    return { success: false, file_path, error: `Component with file ID ${file_id} not found` };
  }
  if (found.classId === 1) {
    return { success: false, file_path, error: "Cannot remove a GameObject with remove-component. Use delete instead." };
  }
  if (found.classId === 4) {
    return { success: false, file_path, error: "Cannot remove a Transform with remove-component. Use delete to remove the entire GameObject." };
  }
  const goMatch = found.block.match(/m_GameObject:\s*\{fileID:\s*(\d+)\}/);
  if (goMatch) {
    const parentGoId = parseInt(goMatch[1], 10);
    content = removeComponentFromGameObject(content, parentGoId, fileIdNum);
  }
  content = removeBlocks(content, new Set([fileIdNum]));
  if (!validateUnityYAML(content)) {
    return { success: false, file_path, error: "Validation failed after removing component" };
  }
  const writeResult = atomicWrite(file_path, content);
  if (!writeResult.success) {
    return { success: false, file_path, error: writeResult.error };
  }
  return {
    success: true,
    file_path,
    removed_file_id: file_id,
    removed_class_id: found.classId
  };
}
function deleteGameObject(options) {
  const { file_path, object_name } = options;
  if (!import_fs5.existsSync(file_path)) {
    return { success: false, file_path, error: `File not found: ${file_path}` };
  }
  let content;
  try {
    content = import_fs5.readFileSync(file_path, "utf-8");
  } catch (err) {
    return { success: false, file_path, error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` };
  }
  const goId = findGameObjectIdByName(content, object_name);
  if (goId === null) {
    return { success: false, file_path, error: `GameObject "${object_name}" not found` };
  }
  const goFound = findBlockByFileId(content, goId);
  if (!goFound) {
    return { success: false, file_path, error: `GameObject block not found` };
  }
  const componentIds = new Set;
  const compMatches = goFound.block.matchAll(/component:\s*\{fileID:\s*(\d+)\}/g);
  for (const cm of compMatches) {
    componentIds.add(parseInt(cm[1], 10));
  }
  let transformId = null;
  let fatherId = 0;
  const blocks = content.split(/(?=--- !u!)/);
  for (const compId of componentIds) {
    const transformPattern = new RegExp(`^--- !u!4 &${compId}\\b`);
    for (const block of blocks) {
      if (transformPattern.test(block)) {
        transformId = compId;
        const fatherMatch = block.match(/m_Father:\s*\{fileID:\s*(\d+)\}/);
        if (fatherMatch) {
          fatherId = parseInt(fatherMatch[1], 10);
        }
        break;
      }
    }
    if (transformId !== null)
      break;
  }
  const allIds = new Set([goId]);
  for (const id of componentIds) {
    allIds.add(id);
  }
  if (transformId !== null) {
    const descendants = collectHierarchy(content, transformId);
    for (const id of descendants) {
      allIds.add(id);
    }
  }
  if (fatherId !== 0 && transformId !== null) {
    content = removeChildFromParent(content, fatherId, transformId);
  }
  content = removeBlocks(content, allIds);
  if (!validateUnityYAML(content)) {
    return { success: false, file_path, error: "Validation failed after deleting GameObject" };
  }
  const writeResult = atomicWrite(file_path, content);
  if (!writeResult.success) {
    return { success: false, file_path, error: writeResult.error };
  }
  return {
    success: true,
    file_path,
    deleted_count: allIds.size
  };
}
function copyComponent(options) {
  const { file_path, source_file_id, target_game_object_name } = options;
  const sourceIdNum = parseInt(source_file_id, 10);
  if (!import_fs5.existsSync(file_path)) {
    return { success: false, file_path, error: `File not found: ${file_path}` };
  }
  let content;
  try {
    content = import_fs5.readFileSync(file_path, "utf-8");
  } catch (err) {
    return { success: false, file_path, error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` };
  }
  const found = findBlockByFileId(content, sourceIdNum);
  if (!found) {
    return { success: false, file_path, error: `Component with file ID ${source_file_id} not found` };
  }
  if (found.classId === 1) {
    return { success: false, file_path, error: "Cannot copy a GameObject. Use duplicate instead." };
  }
  if (found.classId === 4) {
    return { success: false, file_path, error: "Cannot copy a Transform component." };
  }
  const targetGoId = findGameObjectIdByName(content, target_game_object_name);
  if (targetGoId === null) {
    return { success: false, file_path, error: `Target GameObject "${target_game_object_name}" not found` };
  }
  const existingIds = extractExistingFileIds(content);
  const newId = generateFileId(existingIds);
  let clonedBlock = found.block.replace(new RegExp(`^(--- !u!${found.classId} &)${sourceIdNum}`), `$1${newId}`);
  clonedBlock = clonedBlock.replace(/m_GameObject:\s*\{fileID:\s*\d+\}/, `m_GameObject: {fileID: ${targetGoId}}`);
  content = addComponentToGameObject(content, targetGoId, newId);
  content = content.endsWith(`
`) ? content + clonedBlock : content + `
` + clonedBlock;
  if (!validateUnityYAML(content)) {
    return { success: false, file_path, error: "Validation failed after copying component" };
  }
  const writeResult = atomicWrite(file_path, content);
  if (!writeResult.success) {
    return { success: false, file_path, error: writeResult.error };
  }
  return {
    success: true,
    file_path,
    source_file_id,
    new_component_id: newId,
    target_game_object: target_game_object_name
  };
}
function duplicateGameObject(options) {
  const { file_path, object_name, new_name } = options;
  if (!import_fs5.existsSync(file_path)) {
    return { success: false, file_path, error: `File not found: ${file_path}` };
  }
  let content;
  try {
    content = import_fs5.readFileSync(file_path, "utf-8");
  } catch (err) {
    return { success: false, file_path, error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` };
  }
  const goId = findGameObjectIdByName(content, object_name);
  if (goId === null) {
    return { success: false, file_path, error: `GameObject "${object_name}" not found` };
  }
  const goFound = findBlockByFileId(content, goId);
  if (!goFound) {
    return { success: false, file_path, error: `GameObject block not found` };
  }
  const componentIds = [];
  const compMatches = goFound.block.matchAll(/component:\s*\{fileID:\s*(\d+)\}/g);
  for (const cm of compMatches) {
    componentIds.push(parseInt(cm[1], 10));
  }
  let transformId = null;
  let fatherId = 0;
  const blocks = content.split(/(?=--- !u!)/);
  for (const compId of componentIds) {
    const transformPattern = new RegExp(`^--- !u!4 &${compId}\\b`);
    for (const block of blocks) {
      if (transformPattern.test(block)) {
        transformId = compId;
        const fatherMatch = block.match(/m_Father:\s*\{fileID:\s*(\d+)\}/);
        if (fatherMatch) {
          fatherId = parseInt(fatherMatch[1], 10);
        }
        break;
      }
    }
    if (transformId !== null)
      break;
  }
  const allOldIds = new Set([goId, ...componentIds]);
  if (transformId !== null) {
    const descendants = collectHierarchy(content, transformId);
    for (const id of descendants) {
      allOldIds.add(id);
    }
  }
  const existingIds = extractExistingFileIds(content);
  const idMap = new Map;
  for (const oldId of allOldIds) {
    const newId = generateFileId(existingIds);
    existingIds.add(newId);
    idMap.set(oldId, newId);
  }
  const clonedBlocks = [];
  for (const block of blocks) {
    const idMatch = block.match(/^--- !u!\d+ &(\d+)/);
    if (idMatch) {
      const blockId = parseInt(idMatch[1], 10);
      if (allOldIds.has(blockId)) {
        clonedBlocks.push(remapFileIds(block, idMap));
      }
    }
  }
  const finalName = new_name || `${object_name} (1)`;
  const escapedOldName = object_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (let i = 0;i < clonedBlocks.length; i++) {
    if (clonedBlocks[i].startsWith(`--- !u!1 &${idMap.get(goId)}`)) {
      clonedBlocks[i] = clonedBlocks[i].replace(new RegExp(`(m_Name:\\s*)${escapedOldName}`), `$1${finalName}`);
      break;
    }
  }
  const newTransformId = transformId !== null ? idMap.get(transformId) : null;
  let finalContent = content.endsWith(`
`) ? content + clonedBlocks.join("") : content + `
` + clonedBlocks.join("");
  if (fatherId !== 0 && newTransformId !== null) {
    finalContent = addChildToParent(finalContent, fatherId, newTransformId);
  }
  if (!validateUnityYAML(finalContent)) {
    return { success: false, file_path, error: "Validation failed after duplicating GameObject" };
  }
  const writeResult = atomicWrite(file_path, finalContent);
  if (!writeResult.success) {
    return { success: false, file_path, error: writeResult.error };
  }
  return {
    success: true,
    file_path,
    game_object_id: idMap.get(goId),
    transform_id: newTransformId ?? undefined,
    total_duplicated: allOldIds.size
  };
}
function createScriptableObject(options) {
  const { output_path, script, project_path } = options;
  if (!output_path.endsWith(".asset")) {
    return { success: false, output_path, error: "Output path must have .asset extension" };
  }
  const resolved = resolveScriptGuid(script, project_path);
  if (!resolved) {
    return { success: false, output_path, error: `Script not found: "${script}". Provide a GUID, script path, or script name with --project.` };
  }
  const baseName = path.basename(output_path, ".asset");
  const assetYaml = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!114 &11400000
MonoBehaviour:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: 0}
  m_Enabled: 1
  m_EditorHideFlags: 0
  m_Script: {fileID: 11500000, guid: ${resolved.guid}, type: 3}
  m_Name: ${baseName}
  m_EditorClassIdentifier:
`;
  try {
    import_fs5.writeFileSync(output_path, assetYaml, "utf-8");
  } catch (err) {
    return { success: false, output_path, error: `Failed to write asset file: ${err instanceof Error ? err.message : String(err)}` };
  }
  const assetGuid = generateGuid();
  const metaContent = `fileFormatVersion: 2
guid: ${assetGuid}
NativeFormatImporter:
  externalObjects: {}
  mainObjectFileID: 11400000
  userData:
  assetBundleName:
  assetBundleVariant:
`;
  try {
    import_fs5.writeFileSync(output_path + ".meta", metaContent, "utf-8");
  } catch (err) {
    try {
      const fs = require("fs");
      fs.unlinkSync(output_path);
    } catch {}
    return { success: false, output_path, error: `Failed to write .meta file: ${err instanceof Error ? err.message : String(err)}` };
  }
  return {
    success: true,
    output_path,
    script_guid: resolved.guid,
    asset_guid: assetGuid
  };
}
function unpackPrefab(options) {
  const { file_path, prefab_instance, project_path } = options;
  if (!import_fs5.existsSync(file_path)) {
    return { success: false, file_path, error: `File not found: ${file_path}` };
  }
  let content;
  try {
    content = import_fs5.readFileSync(file_path, "utf-8");
  } catch (err) {
    return { success: false, file_path, error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` };
  }
  const blocks = content.split(/(?=--- !u!)/);
  let prefabInstanceBlock = null;
  let prefabInstanceId = null;
  const asNumber = parseInt(prefab_instance, 10);
  if (!isNaN(asNumber)) {
    for (const block of blocks) {
      if (new RegExp(`^--- !u!1001 &${asNumber}\\b`).test(block)) {
        prefabInstanceBlock = block;
        prefabInstanceId = asNumber;
        break;
      }
    }
  }
  if (!prefabInstanceBlock) {
    for (const block of blocks) {
      if (block.startsWith("--- !u!1001 ")) {
        const nameModPattern = new RegExp(`propertyPath: m_Name\\s*\\n\\s*value: ${prefab_instance.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m");
        if (nameModPattern.test(block)) {
          prefabInstanceBlock = block;
          const idMatch = block.match(/^--- !u!1001 &(\d+)/);
          if (idMatch)
            prefabInstanceId = parseInt(idMatch[1], 10);
          break;
        }
      }
    }
  }
  if (!prefabInstanceBlock || prefabInstanceId === null) {
    return { success: false, file_path, error: `PrefabInstance "${prefab_instance}" not found` };
  }
  const sourcePrefabMatch = prefabInstanceBlock.match(/m_SourcePrefab:\s*\{fileID:\s*\d+,\s*guid:\s*([a-f0-9]+)/);
  if (!sourcePrefabMatch) {
    return { success: false, file_path, error: "Could not find m_SourcePrefab in PrefabInstance" };
  }
  const sourcePrefabGuid = sourcePrefabMatch[1];
  let sourcePrefabPath = null;
  if (project_path) {
    const cachePath = path.join(project_path, ".unity-agentic", "guid-cache.json");
    if (import_fs5.existsSync(cachePath)) {
      try {
        const cache = JSON.parse(import_fs5.readFileSync(cachePath, "utf-8"));
        if (cache[sourcePrefabGuid]) {
          const cachedPath = cache[sourcePrefabGuid];
          sourcePrefabPath = path.isAbsolute(cachedPath) ? cachedPath : path.join(project_path, cachedPath);
        }
      } catch {}
    }
  }
  if (!sourcePrefabPath || !import_fs5.existsSync(sourcePrefabPath)) {
    return { success: false, file_path, error: `Could not resolve source prefab with GUID ${sourcePrefabGuid}. Provide --project path with GUID cache.` };
  }
  let prefabContent;
  try {
    prefabContent = import_fs5.readFileSync(sourcePrefabPath, "utf-8");
  } catch (err) {
    return { success: false, file_path, error: `Failed to read source prefab: ${err instanceof Error ? err.message : String(err)}` };
  }
  const prefabBlocks = prefabContent.split(/(?=--- !u!)/);
  const prefabIds = [];
  for (const block of prefabBlocks) {
    const idMatch = block.match(/^--- !u!\d+ &(\d+)/);
    if (idMatch) {
      prefabIds.push(parseInt(idMatch[1], 10));
    }
  }
  const existingIds = extractExistingFileIds(content);
  const idMap = new Map;
  for (const oldId of prefabIds) {
    const newId = generateFileId(existingIds);
    existingIds.add(newId);
    idMap.set(oldId, newId);
  }
  const removedComponents = new Set;
  const removedSection = prefabInstanceBlock.match(/m_RemovedComponents:\s*\n((?:\s*-\s*\{[^}]+\}\s*\n)*)/);
  if (removedSection) {
    const removedMatches = removedSection[1].matchAll(/fileID:\s*(\d+)/g);
    for (const rm of removedMatches) {
      removedComponents.add(parseInt(rm[1], 10));
    }
  }
  const clonedBlocks = [];
  for (const block of prefabBlocks) {
    if (!block.startsWith("--- !u!"))
      continue;
    const idMatch = block.match(/^--- !u!\d+ &(\d+)/);
    if (!idMatch)
      continue;
    const blockId = parseInt(idMatch[1], 10);
    if (removedComponents.has(blockId))
      continue;
    let cloned = remapFileIds(block, idMap);
    cloned = cloned.replace(/\s*m_CorrespondingSourceObject:\s*\{[^}]+\}\n?/, `
  m_CorrespondingSourceObject: {fileID: 0}
`);
    cloned = cloned.replace(/\s*m_PrefabInstance:\s*\{[^}]+\}\n?/, `
  m_PrefabInstance: {fileID: 0}
`);
    cloned = cloned.replace(/\s*m_PrefabAsset:\s*\{[^}]+\}\n?/, `
  m_PrefabAsset: {fileID: 0}
`);
    clonedBlocks.push(cloned);
  }
  const modificationsSection = prefabInstanceBlock.match(/m_Modifications:\s*\n((?:\s*-\s*target:[\s\S]*?(?=\s*m_RemovedComponents:|\s*m_RemovedGameObjects:|\s*m_AddedGameObjects:|\s*m_AddedComponents:|\s*m_SourcePrefab:))?)/);
  if (modificationsSection) {
    const modEntries = modificationsSection[1].split(/\n\s*-\s*target:/).filter((s) => s.trim());
    for (const entry of modEntries) {
      const targetIdMatch = entry.match(/\{fileID:\s*(\d+)/);
      const propPathMatch = entry.match(/propertyPath:\s*(.+)/);
      const valueMatch = entry.match(/value:\s*(.*)/);
      const objRefMatch = entry.match(/objectReference:\s*(\{[^}]*\})/);
      if (targetIdMatch && propPathMatch) {
        const targetOldId = parseInt(targetIdMatch[1], 10);
        const targetNewId = idMap.get(targetOldId);
        if (targetNewId === undefined)
          continue;
        const propertyPath = propPathMatch[1].trim();
        const value = valueMatch ? valueMatch[1].trim() : "";
        const objectReference = objRefMatch ? objRefMatch[1].trim() : "{fileID: 0}";
        let remappedObjRef = objectReference;
        if (objectReference !== "{fileID: 0}") {
          remappedObjRef = objectReference.replace(/(\{fileID:\s*)(\d+)/g, (match, prefix, oldId) => {
            const id = parseInt(oldId, 10);
            if (id === 0)
              return match;
            return idMap.has(id) ? `${prefix}${idMap.get(id)}` : match;
          });
        }
        for (let i = 0;i < clonedBlocks.length; i++) {
          if (clonedBlocks[i].match(new RegExp(`^--- !u!\\d+ &${targetNewId}\\b`))) {
            clonedBlocks[i] = applyModification(clonedBlocks[i], propertyPath, value, remappedObjRef);
            break;
          }
        }
      }
    }
  }
  const transformParentMatch = prefabInstanceBlock.match(/m_TransformParent:\s*\{fileID:\s*(\d+)\}/);
  const transformParentId = transformParentMatch ? parseInt(transformParentMatch[1], 10) : 0;
  const rootInfo = findPrefabRootInfo(prefabContent);
  if (rootInfo && idMap.has(rootInfo.transformId)) {
    const newRootTransformId = idMap.get(rootInfo.transformId);
    for (let i = 0;i < clonedBlocks.length; i++) {
      if (clonedBlocks[i].match(new RegExp(`^--- !u!4 &${newRootTransformId}\\b`))) {
        clonedBlocks[i] = clonedBlocks[i].replace(/m_Father:\s*\{fileID:\s*\d+\}/, `m_Father: {fileID: ${transformParentId}}`);
        break;
      }
    }
  }
  const strippedBlockIds = new Set;
  for (const block of blocks) {
    if (block.includes("stripped") && block.includes(`m_PrefabInstance: {fileID: ${prefabInstanceId}}`)) {
      const idMatch = block.match(/^--- !u!\d+ &(\d+)/);
      if (idMatch) {
        strippedBlockIds.add(parseInt(idMatch[1], 10));
      }
    }
  }
  for (const block of blocks) {
    if (block.includes(`m_PrefabInstance: {fileID: 0}`) || !block.startsWith("--- !u!"))
      continue;
    const idMatch = block.match(/^--- !u!\d+ &(\d+)/);
    if (!idMatch)
      continue;
    const blockId = parseInt(idMatch[1], 10);
    if (strippedBlockIds.has(blockId) || blockId === prefabInstanceId)
      continue;
    if (block.includes(`m_PrefabInstance: {fileID: ${prefabInstanceId}}`)) {}
  }
  const blocksToRemove = new Set([prefabInstanceId, ...strippedBlockIds]);
  content = removeBlocks(content, blocksToRemove);
  content = content.endsWith(`
`) ? content + clonedBlocks.join("") : content + `
` + clonedBlocks.join("");
  if (transformParentId !== 0 && rootInfo && idMap.has(rootInfo.transformId)) {
    content = addChildToParent(content, transformParentId, idMap.get(rootInfo.transformId));
  }
  if (!validateUnityYAML(content)) {
    return { success: false, file_path, error: "Validation failed after unpacking prefab" };
  }
  const writeResult = atomicWrite(file_path, content);
  if (!writeResult.success) {
    return { success: false, file_path, error: writeResult.error };
  }
  const newRootGoId = rootInfo ? idMap.get(rootInfo.gameObjectId) : undefined;
  return {
    success: true,
    file_path,
    unpacked_count: clonedBlocks.length,
    root_game_object_id: newRootGoId
  };
}
function isAncestor(content, childTransformId, candidateAncestorTransformId) {
  const blocks = content.split(/(?=--- !u!)/);
  let currentId = candidateAncestorTransformId;
  const visited = new Set;
  while (currentId !== 0) {
    if (currentId === childTransformId)
      return true;
    if (visited.has(currentId))
      return false;
    visited.add(currentId);
    const pattern = new RegExp(`^--- !u!4 &${currentId}\\b`);
    let fatherId = 0;
    for (const block of blocks) {
      if (pattern.test(block)) {
        const fatherMatch = block.match(/m_Father:\s*\{fileID:\s*(\d+)\}/);
        if (fatherMatch) {
          fatherId = parseInt(fatherMatch[1], 10);
        }
        break;
      }
    }
    currentId = fatherId;
  }
  return false;
}
function reparentGameObject(options) {
  const { file_path, object_name, new_parent } = options;
  if (!import_fs5.existsSync(file_path)) {
    return { success: false, file_path, error: `File not found: ${file_path}` };
  }
  let content;
  try {
    content = import_fs5.readFileSync(file_path, "utf-8");
  } catch (err) {
    return { success: false, file_path, error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` };
  }
  const childTransformId = findTransformIdByName(content, object_name);
  if (childTransformId === null) {
    return { success: false, file_path, error: `GameObject "${object_name}" not found` };
  }
  const blocks = content.split(/(?=--- !u!)/);
  const childTransformPattern = new RegExp(`^--- !u!4 &${childTransformId}\\b`);
  let oldParentTransformId = 0;
  for (const block of blocks) {
    if (childTransformPattern.test(block)) {
      const fatherMatch = block.match(/m_Father:\s*\{fileID:\s*(\d+)\}/);
      if (fatherMatch) {
        oldParentTransformId = parseInt(fatherMatch[1], 10);
      }
      break;
    }
  }
  let newParentTransformId = 0;
  if (new_parent.toLowerCase() !== "root") {
    const foundId = findTransformIdByName(content, new_parent);
    if (foundId === null) {
      return { success: false, file_path, error: `New parent GameObject "${new_parent}" not found` };
    }
    newParentTransformId = foundId;
    if (newParentTransformId === childTransformId) {
      return { success: false, file_path, error: "Cannot reparent a GameObject under itself" };
    }
    if (isAncestor(content, childTransformId, newParentTransformId)) {
      return { success: false, file_path, error: "Cannot reparent: would create circular hierarchy" };
    }
  }
  if (oldParentTransformId !== 0) {
    content = removeChildFromParent(content, oldParentTransformId, childTransformId);
  }
  const fatherPattern = new RegExp(`(--- !u!4 &${childTransformId}\\b[\\s\\S]*?m_Father:\\s*)\\{fileID:\\s*\\d+\\}`);
  content = content.replace(fatherPattern, `$1{fileID: ${newParentTransformId}}`);
  if (newParentTransformId !== 0) {
    content = addChildToParent(content, newParentTransformId, childTransformId);
  }
  if (!validateUnityYAML(content)) {
    return { success: false, file_path, error: "Validation failed after reparent" };
  }
  const writeResult = atomicWrite(file_path, content);
  if (!writeResult.success) {
    return { success: false, file_path, error: writeResult.error };
  }
  return {
    success: true,
    file_path,
    child_transform_id: childTransformId,
    old_parent_transform_id: oldParentTransformId,
    new_parent_transform_id: newParentTransformId
  };
}
function createMetaFile(options) {
  const { script_path } = options;
  const metaPath = script_path + ".meta";
  if (import_fs5.existsSync(metaPath)) {
    return {
      success: false,
      meta_path: metaPath,
      error: `.meta file already exists: ${metaPath}`
    };
  }
  const guid = generateGuid();
  const metaContent = `fileFormatVersion: 2
guid: ${guid}
MonoImporter:
  externalObjects: {}
  serializedVersion: 2
  defaultReferences: []
  executionOrder: 0
  icon: {instanceID: 0}
  userData:
  assetBundleName:
  assetBundleVariant:
`;
  try {
    import_fs5.writeFileSync(metaPath, metaContent, "utf-8");
  } catch (err) {
    return {
      success: false,
      meta_path: metaPath,
      error: `Failed to write .meta file: ${err instanceof Error ? err.message : String(err)}`
    };
  }
  return {
    success: true,
    meta_path: metaPath,
    guid
  };
}
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
    import_fs5.writeFileSync(output_path, yaml, "utf-8");
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
    import_fs5.writeFileSync(metaPath, metaContent, "utf-8");
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

// src/settings.ts
var import_fs6 = require("fs");
var path2 = __toESM(require("path"));
function read_setting_file(file_path) {
  return import_fs6.readFileSync(file_path, "utf-8").replace(/\r\n/g, `
`);
}
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
  return path2.join(project_path, "ProjectSettings", `${canonical}.asset`);
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
  if (!import_fs6.existsSync(file_path)) {
    return {
      success: false,
      project_path,
      setting,
      error: `Settings file not found: ${file_path}`
    };
  }
  let content;
  try {
    content = read_setting_file(file_path);
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
  if (!import_fs6.existsSync(file_path)) {
    return {
      success: false,
      project_path,
      setting,
      error: `Settings file not found: ${file_path}`
    };
  }
  let content;
  try {
    content = read_setting_file(file_path);
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
  if (!import_fs6.existsSync(file_path)) {
    return {
      success: false,
      project_path,
      setting: "TagManager",
      error: `TagManager not found: ${file_path}`
    };
  }
  let content;
  try {
    content = read_setting_file(file_path);
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
  if (!import_fs6.existsSync(file_path)) {
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
    content = read_setting_file(file_path);
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
  if (!import_fs6.existsSync(file_path)) {
    return {
      success: false,
      project_path,
      setting: "TagManager",
      error: `TagManager not found: ${file_path}`
    };
  }
  let content;
  try {
    content = read_setting_file(file_path);
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
var import_fs7 = require("fs");
var path3 = __toESM(require("path"));
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
      entries = import_fs7.readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path3.join(dir, entry);
      let stat;
      try {
        stat = import_fs7.statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        if (!skipSet.has(entry)) {
          walk(full);
        }
      } else if (stat.isFile()) {
        const ext = path3.extname(entry).toLowerCase();
        if (extSet.has(ext)) {
          result.push(full);
        }
      }
    }
  }
  const assetsDir = path3.join(project_path, "Assets");
  if (import_fs7.existsSync(assetsDir)) {
    walk(assetsDir);
  }
  if (extSet.has(".asset")) {
    const settingsDir = path3.join(project_path, "ProjectSettings");
    if (import_fs7.existsSync(settingsDir)) {
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
  if (!import_fs7.existsSync(project_path)) {
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
        const relPath = path3.relative(project_path, file);
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
  if (!import_fs7.existsSync(project_path)) {
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
    const ext = path3.extname(file).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext))
      continue;
    totalFilesScanned++;
    let content;
    try {
      content = import_fs7.readFileSync(file, "utf-8");
    } catch {
      continue;
    }
    const lines = content.split(`
`);
    const relPath = path3.relative(project_path, file);
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

// ../unity-build-settings/src/version.ts
var fs = __toESM(require("fs"));
var path4 = __toESM(require("path"));
function parse_version(versionString) {
  const match = versionString.match(/^(\d+)\.(\d+)\.(\d+)([abfp])(\d+)$/);
  if (!match) {
    throw new Error(`Invalid Unity version format: ${versionString}`);
  }
  return {
    raw: versionString,
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    releaseType: match[4],
    revision: parseInt(match[5], 10)
  };
}
function is_unity6_or_later(version) {
  return version.major >= 6000;
}
function read_project_version(projectPath) {
  const versionFile = path4.join(projectPath, "ProjectSettings", "ProjectVersion.txt");
  if (!fs.existsSync(versionFile)) {
    throw new Error(`ProjectVersion.txt not found at: ${versionFile}`);
  }
  const content = fs.readFileSync(versionFile, "utf-8").replace(/\r\n/g, `
`);
  const versionMatch = content.match(/m_EditorVersion:\s*(.+)/);
  if (!versionMatch) {
    throw new Error("Could not parse m_EditorVersion from ProjectVersion.txt");
  }
  const version = parse_version(versionMatch[1].trim());
  const revisionMatch = content.match(/m_EditorVersionWithRevision:\s*(.+)/);
  if (revisionMatch) {
    version.fullRevision = revisionMatch[1].trim();
  }
  return version;
}
function has_build_profiles(projectPath) {
  const profilesPath = path4.join(projectPath, "Assets", "Settings", "Build Profiles");
  return {
    exists: fs.existsSync(profilesPath),
    path: profilesPath
  };
}
function get_project_info(projectPath) {
  const version = read_project_version(projectPath);
  const buildProfiles = has_build_profiles(projectPath);
  return {
    projectPath,
    version,
    isUnity6OrLater: is_unity6_or_later(version),
    hasBuildProfiles: buildProfiles.exists,
    buildProfilesPath: buildProfiles.exists ? buildProfiles.path : undefined
  };
}
// ../unity-build-settings/src/build-settings.ts
var fs2 = __toESM(require("fs"));
var path5 = __toESM(require("path"));
function parse_editor_build_settings(filePath) {
  if (!fs2.existsSync(filePath)) {
    throw new Error(`EditorBuildSettings.asset not found: ${filePath}`);
  }
  const content = fs2.readFileSync(filePath, "utf-8").replace(/\r\n/g, `
`);
  const scenes = [];
  const scenePattern = /-\s*enabled:\s*(\d+)\n\s+path:\s*([^\n]+)\n\s+guid:\s*([a-f0-9]+)/g;
  let match;
  let buildIndex = 0;
  while ((match = scenePattern.exec(content)) !== null) {
    const enabled = match[1] === "1";
    const scenePath = match[2].trim();
    const guid = match[3].trim();
    if (scenePath) {
      scenes.push({
        enabled,
        path: scenePath,
        guid,
        buildIndex: enabled ? buildIndex++ : -1
      });
    }
  }
  return { scenes };
}
function parse_build_profile(filePath) {
  if (!fs2.existsSync(filePath)) {
    throw new Error(`Build profile not found: ${filePath}`);
  }
  const content = fs2.readFileSync(filePath, "utf-8");
  const name = path5.basename(filePath, ".asset");
  const profile = {
    name,
    path: filePath
  };
  const platformMatch = content.match(/m_BuildTarget:\s*(\d+)/);
  if (platformMatch) {
    profile.platform = get_platform_name(parseInt(platformMatch[1], 10));
  }
  const definesMatch = content.match(/m_ScriptingDefines:\s*([^\n]+)/);
  if (definesMatch && definesMatch[1].trim()) {
    profile.scriptingDefines = definesMatch[1].trim().split(";").filter((d) => d);
  }
  const scenes = [];
  const scenePattern = /-\s*enabled:\s*(\d+)\n\s+path:\s*([^\n]+)\n\s+guid:\s*([a-f0-9]+)/g;
  let match;
  let buildIndex = 0;
  while ((match = scenePattern.exec(content)) !== null) {
    const enabled = match[1] === "1";
    const scenePath = match[2].trim();
    const guid = match[3].trim();
    if (scenePath) {
      scenes.push({
        enabled,
        path: scenePath,
        guid,
        buildIndex: enabled ? buildIndex++ : -1
      });
    }
  }
  if (scenes.length > 0) {
    profile.scenes = scenes;
  }
  return profile;
}
function get_platform_name(buildTarget) {
  const platforms = {
    1: "StandaloneOSX",
    2: "StandaloneWindows",
    5: "iOS",
    9: "Android",
    13: "StandaloneWindows64",
    19: "WebGL",
    21: "StandaloneLinux64",
    24: "PS4",
    25: "XboxOne",
    27: "tvOS",
    31: "Switch",
    38: "PS5"
  };
  return platforms[buildTarget] || `Unknown(${buildTarget})`;
}
function list_build_profiles(projectPath) {
  const profilesPath = path5.join(projectPath, "Assets", "Settings", "Build Profiles");
  if (!fs2.existsSync(profilesPath)) {
    return [];
  }
  const profiles = [];
  const files = fs2.readdirSync(profilesPath);
  for (const file of files) {
    if (file.endsWith(".asset")) {
      const filePath = path5.join(profilesPath, file);
      try {
        profiles.push(parse_build_profile(filePath));
      } catch (e) {}
    }
  }
  return profiles;
}
function get_build_settings(projectPath) {
  const projectInfo = get_project_info(projectPath);
  const editorBuildSettingsPath = path5.join(projectPath, "ProjectSettings", "EditorBuildSettings.asset");
  const editorBuildSettings = parse_editor_build_settings(editorBuildSettingsPath);
  const buildProfiles = list_build_profiles(projectPath);
  return {
    projectInfo,
    editorBuildSettings,
    buildProfiles
  };
}
// ../unity-build-settings/src/editor.ts
var fs3 = __toESM(require("fs"));
var path6 = __toESM(require("path"));
function get_build_settings_path(projectPath) {
  return path6.join(projectPath, "ProjectSettings", "EditorBuildSettings.asset");
}
function read_build_settings_content(projectPath) {
  const filePath = get_build_settings_path(projectPath);
  if (!fs3.existsSync(filePath)) {
    throw new Error(`EditorBuildSettings.asset not found: ${filePath}`);
  }
  return fs3.readFileSync(filePath, "utf-8").replace(/\r\n/g, `
`);
}
function scene_to_yaml(scene) {
  return `  - enabled: ${scene.enabled ? 1 : 0}
    path: ${scene.path}
    guid: ${scene.guid}`;
}
function write_scenes(projectPath, scenes) {
  const filePath = get_build_settings_path(projectPath);
  const content = read_build_settings_content(projectPath);
  const scenesYaml = scenes.map(scene_to_yaml).join(`
`);
  const newContent = content.replace(/m_Scenes:[\s\S]*?(?=\s+m_configObjects:|$)/, `m_Scenes:
${scenesYaml}
  `);
  const tempPath = filePath + ".tmp";
  fs3.writeFileSync(tempPath, newContent, "utf-8");
  fs3.renameSync(tempPath, filePath);
}
function get_scene_guid(projectPath, scenePath) {
  const fullPath = path6.join(projectPath, scenePath);
  const metaPath = fullPath + ".meta";
  if (!fs3.existsSync(metaPath)) {
    return null;
  }
  const content = fs3.readFileSync(metaPath, "utf-8");
  const match = content.match(/guid:\s*([a-f0-9]+)/);
  return match ? match[1] : null;
}
function add_scene(projectPath, scenePath, options) {
  const enabled = options?.enabled ?? true;
  const position = options?.position;
  const fullScenePath = path6.join(projectPath, scenePath);
  if (!fs3.existsSync(fullScenePath)) {
    return { success: false, message: `Scene file not found: ${scenePath}` };
  }
  const guid = get_scene_guid(projectPath, scenePath);
  if (!guid) {
    return { success: false, message: `Could not find GUID for scene: ${scenePath}. Missing .meta file?` };
  }
  const buildSettingsPath = get_build_settings_path(projectPath);
  const current = parse_editor_build_settings(buildSettingsPath);
  if (current.scenes.some((s) => s.path === scenePath)) {
    return { success: false, message: `Scene already in build settings: ${scenePath}` };
  }
  const newScene = { enabled, path: scenePath, guid };
  const scenes = current.scenes.map((s) => ({
    enabled: s.enabled,
    path: s.path,
    guid: s.guid || ""
  }));
  if (position !== undefined && position >= 0 && position <= scenes.length) {
    scenes.splice(position, 0, newScene);
  } else {
    scenes.push(newScene);
  }
  write_scenes(projectPath, scenes);
  const updated = parse_editor_build_settings(buildSettingsPath);
  return {
    success: true,
    message: `Added scene: ${scenePath}`,
    scenes: updated.scenes
  };
}
function remove_scene(projectPath, scenePath) {
  const buildSettingsPath = get_build_settings_path(projectPath);
  const current = parse_editor_build_settings(buildSettingsPath);
  const sceneIndex = current.scenes.findIndex((s) => s.path === scenePath);
  if (sceneIndex === -1) {
    return { success: false, message: `Scene not found in build settings: ${scenePath}` };
  }
  const scenes = current.scenes.filter((s) => s.path !== scenePath).map((s) => ({
    enabled: s.enabled,
    path: s.path,
    guid: s.guid || ""
  }));
  write_scenes(projectPath, scenes);
  const updated = parse_editor_build_settings(buildSettingsPath);
  return {
    success: true,
    message: `Removed scene: ${scenePath}`,
    scenes: updated.scenes
  };
}
function enable_scene(projectPath, scenePath) {
  return set_scene_enabled(projectPath, scenePath, true);
}
function disable_scene(projectPath, scenePath) {
  return set_scene_enabled(projectPath, scenePath, false);
}
function set_scene_enabled(projectPath, scenePath, enabled) {
  const buildSettingsPath = get_build_settings_path(projectPath);
  const current = parse_editor_build_settings(buildSettingsPath);
  const sceneIndex = current.scenes.findIndex((s) => s.path === scenePath);
  if (sceneIndex === -1) {
    return { success: false, message: `Scene not found in build settings: ${scenePath}` };
  }
  const scene = current.scenes[sceneIndex];
  if (scene.enabled === enabled) {
    return {
      success: true,
      message: `Scene already ${enabled ? "enabled" : "disabled"}: ${scenePath}`,
      scenes: current.scenes
    };
  }
  const scenes = current.scenes.map((s) => ({
    enabled: s.path === scenePath ? enabled : s.enabled,
    path: s.path,
    guid: s.guid || ""
  }));
  write_scenes(projectPath, scenes);
  const updated = parse_editor_build_settings(buildSettingsPath);
  return {
    success: true,
    message: `${enabled ? "Enabled" : "Disabled"} scene: ${scenePath}`,
    scenes: updated.scenes
  };
}
function move_scene(projectPath, scenePath, newPosition) {
  const buildSettingsPath = get_build_settings_path(projectPath);
  const current = parse_editor_build_settings(buildSettingsPath);
  const sceneIndex = current.scenes.findIndex((s) => s.path === scenePath);
  if (sceneIndex === -1) {
    return { success: false, message: `Scene not found in build settings: ${scenePath}` };
  }
  if (newPosition < 0 || newPosition >= current.scenes.length) {
    return {
      success: false,
      message: `Invalid position: ${newPosition}. Must be 0-${current.scenes.length - 1}`
    };
  }
  if (sceneIndex === newPosition) {
    return {
      success: true,
      message: `Scene already at position ${newPosition}: ${scenePath}`,
      scenes: current.scenes
    };
  }
  const scenes = current.scenes.map((s) => ({
    enabled: s.enabled,
    path: s.path,
    guid: s.guid || ""
  }));
  const [movedScene] = scenes.splice(sceneIndex, 1);
  scenes.splice(newPosition, 0, movedScene);
  write_scenes(projectPath, scenes);
  const updated = parse_editor_build_settings(buildSettingsPath);
  return {
    success: true,
    message: `Moved scene to position ${newPosition}: ${scenePath}`,
    scenes: updated.scenes
  };
}
// src/cli.ts
var __dirname = "/Users/taco/Documents/Projects/unity-agentic-tools/unity-yaml/src";
var { exec } = require("child_process");
if (!process.versions.bun) {
  console.error("CRITICAL ERROR: This tool MUST be run with BUN.");
  console.error("You are currently using: Node.js");
  console.error("Please run with: bun unity-yaml/dist/cli.js <command>");
  process.exit(1);
}
var _scanner = null;
function getScanner() {
  if (!_scanner) {
    if (!isNativeModuleAvailable()) {
      console.error(getNativeModuleError());
      process.exit(1);
    }
    _scanner = new UnityScanner;
  }
  return _scanner;
}
program.name("unity-yaml").description("Fast, token-efficient Unity YAML parser").version("1.0.0");
program.command("list <file>").description("List GameObject hierarchy in Unity file").option("-j, --json", "Output as JSON").option("-v, --verbose", "Show internal Unity IDs").option("--page-size <n>", "Max objects per page (default 200, max 1000)", "200").option("--cursor <n>", "Start offset for pagination (default 0)", "0").option("--max-depth <n>", "Max hierarchy depth (default 10, max 50)", "10").action((file, options) => {
  const pageSize = Math.min(parseInt(options.pageSize, 10) || 200, 1000);
  const cursor = parseInt(options.cursor, 10) || 0;
  const maxDepth = Math.min(parseInt(options.maxDepth, 10) || 10, 50);
  const result = getScanner().inspect_all_paginated({
    file,
    verbose: options.verbose === true,
    page_size: pageSize,
    cursor,
    max_depth: maxDepth
  });
  console.log(JSON.stringify(result, null, 2));
});
program.command("find <file> <pattern>").description("Find GameObjects by name pattern").option("-e, --exact", "Use exact matching").option("-j, --json", "Output as JSON").action((file, pattern, options) => {
  const fuzzy = options.exact !== true;
  const result = getScanner().find_by_name(file, pattern, fuzzy);
  const output = {
    file,
    pattern,
    fuzzy,
    count: result.length,
    matches: result
  };
  console.log(JSON.stringify(output, null, 2));
});
program.command("get <file> <object_id>").description("Get GameObject details by ID").option("-c, --component <type>", "Get specific component type").option("-p, --properties", "Include component properties").option("-j, --json", "Output as JSON").option("-v, --verbose", "Show internal Unity IDs").action((file, object_id, options) => {
  const result = getScanner().inspect({
    file,
    identifier: object_id,
    include_properties: options.properties === true,
    verbose: options.verbose
  });
  if (!result) {
    console.log(JSON.stringify({ error: `GameObject with ID ${object_id} not found` }, null, 2));
    return;
  }
  if (options.component) {
    const comp = result.components.find((c) => c.type === options.component);
    if (comp) {
      console.log(JSON.stringify({ file, component: comp }, null, 2));
      return;
    }
  }
  console.log(JSON.stringify({ file, object: result }, null, 2));
});
program.command("inspect <file> [identifier]").description("Inspect Unity file or specific GameObject").option("-p, --properties", "Include component properties").option("-j, --json", "Output as JSON").option("-v, --verbose", "Show internal Unity IDs").option("--page-size <n>", "Max objects per page when no identifier (default 200)").option("--cursor <n>", "Start offset for pagination (default 0)").option("--max-depth <n>", "Max hierarchy depth (default 10)").action((file, identifier, options) => {
  if (!identifier) {
    const result2 = getScanner().inspect_all_paginated({
      file,
      include_properties: options.properties === true,
      verbose: options.verbose === true,
      page_size: options.pageSize ? Math.min(parseInt(options.pageSize, 10), 1000) : undefined,
      cursor: options.cursor ? parseInt(options.cursor, 10) : undefined,
      max_depth: options.maxDepth ? Math.min(parseInt(options.maxDepth, 10), 50) : undefined
    });
    console.log(JSON.stringify(result2, null, 2));
    return;
  }
  const result = getScanner().inspect({
    file,
    identifier,
    include_properties: options.properties === true,
    verbose: options.verbose
  });
  if (!result) {
    console.log(JSON.stringify({ error: `GameObject '${identifier}' not found` }, null, 2));
    return;
  }
  console.log(JSON.stringify(result, null, 2));
});
program.command("inspect-all <file>").description("Inspect entire Unity file with all details").option("-p, --properties", "Include component properties").option("-j, --json", "Output as JSON").option("-v, --verbose", "Show internal Unity IDs").option("--page-size <n>", "Max objects per page (default 200, max 1000)").option("--cursor <n>", "Start offset for pagination (default 0)").option("--max-depth <n>", "Max hierarchy depth (default 10, max 50)").action((file, options) => {
  const result = getScanner().inspect_all_paginated({
    file,
    include_properties: options.properties === true,
    verbose: options.verbose === true,
    page_size: options.pageSize ? Math.min(parseInt(options.pageSize, 10), 1000) : undefined,
    cursor: options.cursor ? parseInt(options.cursor, 10) : undefined,
    max_depth: options.maxDepth ? Math.min(parseInt(options.maxDepth, 10), 50) : undefined
  });
  console.log(JSON.stringify(result, null, 2));
});
program.command("edit <file> <object_name> <property> <value>").description("Edit GameObject property value safely").option("-j, --json", "Output as JSON").action((file, object_name, property, value, _options) => {
  const result = editProperty({
    file_path: file,
    object_name,
    property,
    new_value: value
  });
  console.log(JSON.stringify(result, null, 2));
});
program.command("create <file> <name>").description("Create a new GameObject in a Unity file").option("-p, --parent <name|id>", "Parent GameObject name or Transform fileID").option("-j, --json", "Output as JSON").action((file, name, options) => {
  let parent;
  if (options.parent) {
    const asNumber = parseInt(options.parent, 10);
    parent = isNaN(asNumber) ? options.parent : asNumber;
  }
  const result = createGameObject({
    file_path: file,
    name,
    parent
  });
  console.log(JSON.stringify(result, null, 2));
});
program.command("edit-transform <file> <transform_id>").description("Edit Transform component properties by fileID").option("-p, --position <x,y,z>", "Set local position").option("-r, --rotation <x,y,z>", "Set local rotation (Euler angles in degrees)").option("-s, --scale <x,y,z>", "Set local scale").option("-j, --json", "Output as JSON").action((file, transform_id, options) => {
  const parseVector = (str) => {
    const parts = str.split(",").map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
      console.error("Invalid vector format. Use: x,y,z (e.g., 1,2,3)");
      process.exit(1);
    }
    return { x: parts[0], y: parts[1], z: parts[2] };
  };
  const result = editTransform({
    file_path: file,
    transform_id: parseInt(transform_id, 10),
    position: options.position ? parseVector(options.position) : undefined,
    rotation: options.rotation ? parseVector(options.rotation) : undefined,
    scale: options.scale ? parseVector(options.scale) : undefined
  });
  console.log(JSON.stringify(result, null, 2));
});
program.command("add-component <file> <object_name> <component>").description("Add any Unity component (e.g., MeshRenderer, Animator, Rigidbody) or custom script").option("-p, --project <path>", "Unity project path (for script GUID lookup)").option("-j, --json", "Output as JSON").action((file, object_name, component, options) => {
  const result = addComponent({
    file_path: file,
    game_object_name: object_name,
    component_type: component,
    project_path: options.project
  });
  console.log(JSON.stringify(result, null, 2));
});
program.command("edit-component <file> <file_id> <property> <value>").description("Edit any component property by file ID. Supports dotted paths (m_LocalPosition.x) and array paths (m_Materials.Array.data[0])").option("-j, --json", "Output as JSON").action((file, file_id, property, value, _options) => {
  const result = editComponentByFileId({
    file_path: file,
    file_id,
    property,
    new_value: value
  });
  console.log(JSON.stringify(result, null, 2));
});
program.command("create-variant <source_prefab> <output_path>").description("Create a Prefab Variant from a source prefab").option("-n, --name <name>", "Override variant name").option("-j, --json", "Output as JSON").action((source_prefab, output_path, options) => {
  const result = createPrefabVariant({
    source_prefab,
    output_path,
    variant_name: options.name
  });
  console.log(JSON.stringify(result, null, 2));
});
program.command("remove-component <file> <file_id>").description("Remove a component from a Unity file by file ID").option("-j, --json", "Output as JSON").action((file, file_id, _options) => {
  const result = removeComponent({
    file_path: file,
    file_id
  });
  console.log(JSON.stringify(result, null, 2));
});
program.command("delete <file> <object_name>").description("Delete a GameObject and its hierarchy from a Unity file").option("-j, --json", "Output as JSON").action((file, object_name, _options) => {
  const result = deleteGameObject({
    file_path: file,
    object_name
  });
  console.log(JSON.stringify(result, null, 2));
});
program.command("copy-component <file> <source_file_id> <target_object_name>").description("Copy a component to a target GameObject").option("-j, --json", "Output as JSON").action((file, source_file_id, target_object_name, _options) => {
  const result = copyComponent({
    file_path: file,
    source_file_id,
    target_game_object_name: target_object_name
  });
  console.log(JSON.stringify(result, null, 2));
});
program.command("duplicate <file> <object_name>").description("Duplicate a GameObject and its hierarchy").option("-n, --name <new_name>", "Name for the duplicated object").option("-j, --json", "Output as JSON").action((file, object_name, options) => {
  const result = duplicateGameObject({
    file_path: file,
    object_name,
    new_name: options.name
  });
  console.log(JSON.stringify(result, null, 2));
});
program.command("create-scriptable-object <output_path> <script>").description("Create a new ScriptableObject .asset file").option("-p, --project <path>", "Unity project path (for script GUID lookup)").option("-j, --json", "Output as JSON").action((output_path, script, options) => {
  const result = createScriptableObject({
    output_path,
    script,
    project_path: options.project
  });
  console.log(JSON.stringify(result, null, 2));
});
program.command("unpack-prefab <file> <prefab_instance>").description("Unpack a PrefabInstance into standalone GameObjects").option("-p, --project <path>", "Unity project path (for GUID cache lookup)").option("-j, --json", "Output as JSON").action((file, prefab_instance, options) => {
  const result = unpackPrefab({
    file_path: file,
    prefab_instance,
    project_path: options.project
  });
  console.log(JSON.stringify(result, null, 2));
});
program.command("reparent <file> <object_name> <new_parent>").description('Move a GameObject under a new parent. Use "root" to move to scene root').option("-j, --json", "Output as JSON").action((file, object_name, new_parent, _options) => {
  const result = reparentGameObject({
    file_path: file,
    object_name,
    new_parent
  });
  console.log(JSON.stringify(result, null, 2));
});
program.command("create-meta <script_path>").description("Generate a Unity .meta file for a script (MonoImporter)").option("-j, --json", "Output as JSON").action((script_path, _options) => {
  const result = createMetaFile({
    script_path
  });
  console.log(JSON.stringify(result, null, 2));
});
program.command("read-settings <project_path>").description("Read Unity project settings (TagManager, DynamicsManager, QualitySettings, TimeManager, etc.)").option("-s, --setting <name>", "Setting name or alias (tags, physics, quality, time)", "TagManager").option("-j, --json", "Output as JSON").action((project_path, options) => {
  const result = read_settings({
    project_path,
    setting: options.setting
  });
  console.log(JSON.stringify(result, null, 2));
});
program.command("edit-settings <project_path>").description("Edit a property in any ProjectSettings/*.asset file").option("-s, --setting <name>", "Setting name or alias").option("--property <name>", "Property name to edit").option("--value <value>", "New value").option("-j, --json", "Output as JSON").action((project_path, options) => {
  if (!options.setting || !options.property || !options.value) {
    console.error(JSON.stringify({ success: false, error: "Required: --setting, --property, --value" }, null, 2));
    process.exit(1);
  }
  const result = edit_settings({
    project_path,
    setting: options.setting,
    property: options.property,
    value: options.value
  });
  console.log(JSON.stringify(result, null, 2));
});
program.command("edit-tag <project_path> <action> <tag>").description("Add or remove a tag in the TagManager").option("-j, --json", "Output as JSON").action((project_path, action, tag, _options) => {
  if (action !== "add" && action !== "remove") {
    console.error(JSON.stringify({ success: false, error: 'Action must be "add" or "remove"' }, null, 2));
    process.exit(1);
  }
  const result = edit_tag({
    project_path,
    action,
    tag
  });
  console.log(JSON.stringify(result, null, 2));
});
program.command("edit-layer <project_path> <index> <name>").description("Set a named layer at a specific index (3-31)").option("-j, --json", "Output as JSON").action((project_path, index, name, _options) => {
  const result = edit_layer({
    project_path,
    index: parseInt(index, 10),
    name
  });
  console.log(JSON.stringify(result, null, 2));
});
program.command("edit-sorting-layer <project_path> <action> <name>").description("Add or remove a sorting layer").option("-j, --json", "Output as JSON").action((project_path, action, name, _options) => {
  if (action !== "add" && action !== "remove") {
    console.error(JSON.stringify({ success: false, error: 'Action must be "add" or "remove"' }, null, 2));
    process.exit(1);
  }
  const result = edit_sorting_layer({
    project_path,
    action,
    name
  });
  console.log(JSON.stringify(result, null, 2));
});
program.command("create-scene <output_path>").description("Create a new Unity scene file with required global blocks").option("-d, --defaults", "Include default Main Camera and Directional Light").option("-j, --json", "Output as JSON").action((output_path, options) => {
  const result = createScene({
    output_path,
    include_defaults: options.defaults === true
  });
  console.log(JSON.stringify(result, null, 2));
});
program.command("search <project_path>").description("Search across all scene/prefab files in a Unity project").option("-n, --name <pattern>", "Search by GameObject name (supports wildcards)").option("-c, --component <type>", "Filter by component type").option("-t, --tag <tag>", "Filter by tag").option("-l, --layer <index>", "Filter by layer index").option("--type <type>", "File type filter: scene, prefab, all", "all").option("--page-size <n>", "Max files per page", "50").option("--cursor <n>", "Start offset for pagination", "0").option("-j, --json", "Output as JSON").action((project_path, options) => {
  const result = search_project({
    project_path,
    name: options.name,
    component: options.component,
    tag: options.tag,
    layer: options.layer !== undefined ? parseInt(options.layer, 10) : undefined,
    file_type: options.type,
    page_size: parseInt(options.pageSize, 10) || 50,
    cursor: parseInt(options.cursor, 10) || 0
  });
  console.log(JSON.stringify(result, null, 2));
});
program.command("grep <project_path> <pattern>").description("Search for a regex pattern across project files").option("--type <type>", "File type filter: cs, yaml, unity, prefab, asset, all", "all").option("-m, --max <n>", "Max results", "100").option("-C, --context <n>", "Context lines around matches", "0").option("-j, --json", "Output as JSON").action((project_path, pattern, options) => {
  const result = grep_project({
    project_path,
    pattern,
    file_type: options.type,
    max_results: parseInt(options.max, 10) || 100,
    context_lines: parseInt(options.context, 10) || 0
  });
  console.log(JSON.stringify(result, null, 2));
});
program.command("search-docs <query>").description("Search Unity documentation").option("--summarize", "-s", "Summarize results").option("--compress", "-c", "Compress results").option("-j, --json", "Output as JSON").action((query, options) => {
  const docIndexerPath = path7.join(__dirname, "..", "..", "doc-indexer", "dist", "cli.js");
  const args = [docIndexerPath, "search", query];
  if (options.summarize)
    args.push("-s");
  if (options.compress)
    args.push("-c");
  if (options.json)
    args.push("-j");
  exec(`bun ${args.join(" ")}`, (error, stdout, _stderr) => {
    if (error) {
      console.error("Error:", error.message);
      process.exit(1);
    }
    console.log(stdout);
  });
});
program.command("index-docs <path>").description("Index Unity documentation").action((pathArg) => {
  const docIndexerPath = path7.join(__dirname, "..", "..", "doc-indexer", "dist", "cli.js");
  const args = [docIndexerPath, "index", pathArg];
  exec(`bun ${args.join(" ")}`, (error, stdout, _stderr) => {
    if (error) {
      console.error("Error:", error.message);
      process.exit(1);
    }
    console.log(stdout);
  });
});
program.command("build-settings <project_path>").description("Read build settings (scene list, build profiles)").option("-j, --json", "Output as JSON").action((project_path, _options) => {
  try {
    const result = get_build_settings(project_path);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.log(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }, null, 2));
  }
});
program.command("build-add-scene <project_path> <scene_path>").description("Add a scene to build settings").option("-j, --json", "Output as JSON").action((project_path, scene_path, _options) => {
  try {
    const result = add_scene(project_path, scene_path);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.log(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }, null, 2));
  }
});
program.command("build-remove-scene <project_path> <scene_path>").description("Remove a scene from build settings").option("-j, --json", "Output as JSON").action((project_path, scene_path, _options) => {
  try {
    const result = remove_scene(project_path, scene_path);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.log(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }, null, 2));
  }
});
program.command("build-enable-scene <project_path> <scene_path>").description("Enable a scene in build settings").option("-j, --json", "Output as JSON").action((project_path, scene_path, _options) => {
  try {
    const result = enable_scene(project_path, scene_path);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.log(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }, null, 2));
  }
});
program.command("build-disable-scene <project_path> <scene_path>").description("Disable a scene in build settings").option("-j, --json", "Output as JSON").action((project_path, scene_path, _options) => {
  try {
    const result = disable_scene(project_path, scene_path);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.log(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }, null, 2));
  }
});
program.command("build-move-scene <project_path> <scene_path> <new_index>").description("Move a scene to a new position in build settings").option("-j, --json", "Output as JSON").action((project_path, scene_path, new_index, _options) => {
  try {
    const result = move_scene(project_path, scene_path, parseInt(new_index, 10));
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.log(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }, null, 2));
  }
});
program.command("project-version <project_path>").description("Read Unity project version").option("-j, --json", "Output as JSON").action((project_path, _options) => {
  try {
    const version = read_project_version(project_path);
    console.log(JSON.stringify(version, null, 2));
  } catch (err) {
    console.log(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }, null, 2));
  }
});
program.command("setup").description("Set up unity-agentic tools for a Unity project").option("-p, --project <path>", "Path to Unity project (defaults to current directory)").option("--index-docs", "Also create documentation index").action((options) => {
  const result = setup({
    project: options.project,
    indexDocs: options.indexDocs
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.success) {
    process.exit(1);
  }
});
program.command("cleanup").description("Clean up unity-agentic files from a Unity project").option("-p, --project <path>", "Path to Unity project (defaults to current directory)").option("--all", "Remove entire .unity-agentic directory").action((options) => {
  const result = cleanup({
    project: options.project,
    all: options.all
  });
  console.log(JSON.stringify(result, null, 2));
});
program.command("status").description("Show current configuration and status").option("-p, --project <path>", "Path to Unity project (defaults to current directory)").action((options) => {
  const projectPath = path7.resolve(options.project || process.cwd());
  const configPath = path7.join(projectPath, ".unity-agentic");
  const configFile = path7.join(configPath, "config.json");
  let config = null;
  let guidCacheCount = 0;
  try {
    const { existsSync: existsSync11, readFileSync: readFileSync8 } = require("fs");
    if (existsSync11(configFile)) {
      config = JSON.parse(readFileSync8(configFile, "utf-8"));
    }
    const guidCachePath = path7.join(configPath, "guid-cache.json");
    if (existsSync11(guidCachePath)) {
      const guidCache = JSON.parse(readFileSync8(guidCachePath, "utf-8"));
      guidCacheCount = Object.keys(guidCache).length;
    }
  } catch {}
  const status = {
    project_path: projectPath,
    configured: config !== null,
    config,
    guid_cache_count: guidCacheCount,
    runtime: "bun",
    version: "1.0.0",
    native_module: isNativeModuleAvailable(),
    native_module_error: isNativeModuleAvailable() ? null : getNativeModuleError()
  };
  console.log(JSON.stringify(status, null, 2));
});
program.parse();
})
