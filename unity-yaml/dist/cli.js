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
  module2.exports = require("./unity-agentic-core.darwin-arm64-x8b2vckr.node");
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
var path2 = __toESM(require("path"));

// src/editor.ts
var import_fs4 = require("fs");
var path = __toESM(require("path"));
function safeUnityYAMLEdit(filePath, objectName, propertyName, newValue) {
  if (!import_fs4.existsSync(filePath)) {
    return {
      success: false,
      file_path: filePath,
      error: `File not found: ${filePath}`
    };
  }
  let content;
  try {
    content = import_fs4.readFileSync(filePath, "utf-8");
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
        const fs = require("fs");
        fs.unlinkSync(`${filePath}.bak`);
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
  if (!import_fs4.existsSync(file_path)) {
    return {
      success: false,
      file_path,
      error: `File not found: ${file_path}`
    };
  }
  let content;
  try {
    content = import_fs4.readFileSync(file_path, "utf-8");
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
  if (!import_fs4.existsSync(file_path)) {
    return {
      success: false,
      file_path,
      error: `File not found: ${file_path}`
    };
  }
  let content;
  try {
    content = import_fs4.readFileSync(file_path, "utf-8");
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
var COMPONENT_CLASS_IDS = {
  BoxCollider: 65,
  SphereCollider: 135,
  CapsuleCollider: 136,
  MeshCollider: 64,
  Rigidbody: 54,
  AudioSource: 82,
  Light: 108,
  Camera: 20
};
function createComponentYAML(componentType, componentId, gameObjectId) {
  const classId = COMPONENT_CLASS_IDS[componentType];
  const templates = {
    BoxCollider: `--- !u!${classId} &${componentId}
BoxCollider:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: ${gameObjectId}}
  m_Material: {fileID: 0}
  m_IncludeLayers:
    serializedVersion: 2
    m_Bits: 0
  m_ExcludeLayers:
    serializedVersion: 2
    m_Bits: 0
  m_LayerOverridePriority: 0
  m_IsTrigger: 0
  m_ProvidesContacts: 0
  m_Enabled: 1
  serializedVersion: 3
  m_Size: {x: 1, y: 1, z: 1}
  m_Center: {x: 0, y: 0, z: 0}
`,
    SphereCollider: `--- !u!${classId} &${componentId}
SphereCollider:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: ${gameObjectId}}
  m_Material: {fileID: 0}
  m_IncludeLayers:
    serializedVersion: 2
    m_Bits: 0
  m_ExcludeLayers:
    serializedVersion: 2
    m_Bits: 0
  m_LayerOverridePriority: 0
  m_IsTrigger: 0
  m_ProvidesContacts: 0
  m_Enabled: 1
  serializedVersion: 3
  m_Radius: 0.5
  m_Center: {x: 0, y: 0, z: 0}
`,
    CapsuleCollider: `--- !u!${classId} &${componentId}
CapsuleCollider:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: ${gameObjectId}}
  m_Material: {fileID: 0}
  m_IncludeLayers:
    serializedVersion: 2
    m_Bits: 0
  m_ExcludeLayers:
    serializedVersion: 2
    m_Bits: 0
  m_LayerOverridePriority: 0
  m_IsTrigger: 0
  m_ProvidesContacts: 0
  m_Enabled: 1
  serializedVersion: 3
  m_Radius: 0.5
  m_Height: 2
  m_Direction: 1
  m_Center: {x: 0, y: 0, z: 0}
`,
    MeshCollider: `--- !u!${classId} &${componentId}
MeshCollider:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: ${gameObjectId}}
  m_Material: {fileID: 0}
  m_IncludeLayers:
    serializedVersion: 2
    m_Bits: 0
  m_ExcludeLayers:
    serializedVersion: 2
    m_Bits: 0
  m_LayerOverridePriority: 0
  m_IsTrigger: 0
  m_ProvidesContacts: 0
  m_Enabled: 1
  serializedVersion: 5
  m_Convex: 0
  m_CookingOptions: 30
  m_Mesh: {fileID: 0}
`,
    Rigidbody: `--- !u!${classId} &${componentId}
Rigidbody:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: ${gameObjectId}}
  serializedVersion: 4
  m_Mass: 1
  m_Drag: 0
  m_AngularDrag: 0.05
  m_CenterOfMass: {x: 0, y: 0, z: 0}
  m_InertiaTensor: {x: 1, y: 1, z: 1}
  m_InertiaRotation: {x: 0, y: 0, z: 0, w: 1}
  m_IncludeLayers:
    serializedVersion: 2
    m_Bits: 0
  m_ExcludeLayers:
    serializedVersion: 2
    m_Bits: 0
  m_ImplicitCom: 1
  m_ImplicitTensor: 1
  m_UseGravity: 1
  m_IsKinematic: 0
  m_Interpolate: 0
  m_Constraints: 0
  m_CollisionDetection: 0
`,
    AudioSource: `--- !u!${classId} &${componentId}
AudioSource:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: ${gameObjectId}}
  m_Enabled: 1
  serializedVersion: 4
  OutputAudioMixerGroup: {fileID: 0}
  m_audioClip: {fileID: 0}
  m_PlayOnAwake: 1
  m_Volume: 1
  m_Pitch: 1
  Loop: 0
  Mute: 0
  Spatialize: 0
  SpatializePostEffects: 0
  Priority: 128
  DopplerLevel: 1
  MinDistance: 1
  MaxDistance: 500
  Pan2D: 0
  rolloffMode: 0
  BypassEffects: 0
  BypassListenerEffects: 0
  BypassReverbZones: 0
  rolloffCustomCurve:
    serializedVersion: 2
    m_Curve:
    - serializedVersion: 3
      time: 0
      value: 1
      inSlope: 0
      outSlope: 0
      tangentMode: 0
      weightedMode: 0
      inWeight: 0.33333334
      outWeight: 0.33333334
    - serializedVersion: 3
      time: 1
      value: 0
      inSlope: 0
      outSlope: 0
      tangentMode: 0
      weightedMode: 0
      inWeight: 0.33333334
      outWeight: 0.33333334
    m_PreInfinity: 2
    m_PostInfinity: 2
    m_RotationOrder: 4
  panLevelCustomCurve:
    serializedVersion: 2
    m_Curve:
    - serializedVersion: 3
      time: 0
      value: 1
      inSlope: 0
      outSlope: 0
      tangentMode: 0
      weightedMode: 0
      inWeight: 0.33333334
      outWeight: 0.33333334
    m_PreInfinity: 2
    m_PostInfinity: 2
    m_RotationOrder: 4
  spreadCustomCurve:
    serializedVersion: 2
    m_Curve:
    - serializedVersion: 3
      time: 0
      value: 0
      inSlope: 0
      outSlope: 0
      tangentMode: 0
      weightedMode: 0
      inWeight: 0.33333334
      outWeight: 0.33333334
    m_PreInfinity: 2
    m_PostInfinity: 2
    m_RotationOrder: 4
  reverbZoneMixCustomCurve:
    serializedVersion: 2
    m_Curve:
    - serializedVersion: 3
      time: 0
      value: 1
      inSlope: 0
      outSlope: 0
      tangentMode: 0
      weightedMode: 0
      inWeight: 0.33333334
      outWeight: 0.33333334
    m_PreInfinity: 2
    m_PostInfinity: 2
    m_RotationOrder: 4
`,
    Light: `--- !u!${classId} &${componentId}
Light:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: ${gameObjectId}}
  m_Enabled: 1
  serializedVersion: 10
  m_Type: 2
  m_Shape: 0
  m_Color: {r: 1, g: 1, b: 1, a: 1}
  m_Intensity: 1
  m_Range: 10
  m_SpotAngle: 30
  m_InnerSpotAngle: 21.80208
  m_CookieSize: 10
  m_Shadows:
    m_Type: 0
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
`,
    Camera: `--- !u!${classId} &${componentId}
Camera:
  m_ObjectHideFlags: 0
  m_CorrespondingSourceObject: {fileID: 0}
  m_PrefabInstance: {fileID: 0}
  m_PrefabAsset: {fileID: 0}
  m_GameObject: {fileID: ${gameObjectId}}
  m_Enabled: 1
  serializedVersion: 2
  m_ClearFlags: 1
  m_BackGroundColor: {r: 0.19215687, g: 0.3019608, b: 0.4745098, a: 0}
  m_projectionMatrixMode: 1
  m_GateFitMode: 2
  m_FOVAxisMode: 0
  m_SensorSize: {x: 36, y: 24}
  m_LensShift: {x: 0, y: 0}
  m_FocalLength: 50
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
  m_Depth: 0
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
  m_ForceIntoRenderTexture: 0
  m_OcclusionCulling: 1
  m_StereoConvergence: 10
  m_StereoSeparation: 0.022
`
  };
  return templates[componentType];
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
var BUILTIN_COMPONENTS = [
  "BoxCollider",
  "SphereCollider",
  "CapsuleCollider",
  "MeshCollider",
  "Rigidbody",
  "AudioSource",
  "Light",
  "Camera"
];
function resolveScriptGuid(script, projectPath) {
  if (/^[a-f0-9]{32}$/i.test(script)) {
    return { guid: script.toLowerCase(), path: null };
  }
  if (script.endsWith(".cs")) {
    const metaPath = script + ".meta";
    if (import_fs4.existsSync(metaPath)) {
      const guid = extractGuidFromMeta(metaPath);
      if (guid) {
        return { guid, path: script };
      }
    }
    if (projectPath) {
      const fullPath = path.join(projectPath, script);
      const fullMetaPath = fullPath + ".meta";
      if (import_fs4.existsSync(fullMetaPath)) {
        const guid = extractGuidFromMeta(fullMetaPath);
        if (guid) {
          return { guid, path: script };
        }
      }
    }
  }
  if (projectPath) {
    const cachePath = path.join(projectPath, ".unity-agentic", "guid-cache.json");
    if (import_fs4.existsSync(cachePath)) {
      try {
        const cache = JSON.parse(import_fs4.readFileSync(cachePath, "utf-8"));
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
  if (!import_fs4.existsSync(file_path)) {
    return {
      success: false,
      file_path,
      error: `File not found: ${file_path}`
    };
  }
  let content;
  try {
    content = import_fs4.readFileSync(file_path, "utf-8");
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
  if (BUILTIN_COMPONENTS.includes(component_type)) {
    componentYAML = createComponentYAML(component_type, componentId, gameObjectId);
  } else {
    const resolved = resolveScriptGuid(component_type, project_path);
    if (!resolved) {
      return {
        success: false,
        file_path,
        error: `Script not found: "${component_type}". Provide a script name, path (Assets/Scripts/Foo.cs), or GUID. Run 'setup' first to build the GUID cache.`
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
  if (!import_fs4.existsSync(metaPath)) {
    return null;
  }
  try {
    const content = import_fs4.readFileSync(metaPath, "utf-8");
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
function generateGuid() {
  const hex = "0123456789abcdef";
  let guid = "";
  for (let i = 0;i < 32; i++) {
    guid += hex[Math.floor(Math.random() * 16)];
  }
  return guid;
}
function createPrefabVariant(options) {
  const { source_prefab, output_path, variant_name } = options;
  if (!import_fs4.existsSync(source_prefab)) {
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
    sourceContent = import_fs4.readFileSync(source_prefab, "utf-8");
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
    import_fs4.writeFileSync(output_path, variantYaml, "utf-8");
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
    import_fs4.writeFileSync(output_path + ".meta", variantMetaContent, "utf-8");
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
program.command("list <file>").description("List GameObject hierarchy in Unity file").option("-j, --json", "Output as JSON").option("-v, --verbose", "Show internal Unity IDs").action((file, options) => {
  const result = getScanner().scan_scene_with_components(file, { verbose: options.verbose });
  const output = {
    file,
    count: result.length,
    objects: result
  };
  console.log(JSON.stringify(output, null, 2));
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
program.command("get <file> <object_id>").description("Get GameObject details by ID").option("-c, --component <type>", "Get specific component type").option("-j, --json", "Output as JSON").option("-v, --verbose", "Show internal Unity IDs").action((file, object_id, options) => {
  const result = getScanner().inspect({
    file,
    identifier: object_id,
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
program.command("inspect <file> [identifier]").description("Inspect Unity file or specific GameObject").option("-p, --properties", "Include component properties").option("-j, --json", "Output as JSON").option("-v, --verbose", "Show internal Unity IDs").action((file, identifier, options) => {
  if (!identifier) {
    const result2 = getScanner().inspect_all(file, options.properties === true, options.verbose === true);
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
program.command("inspect-all <file>").description("Inspect entire Unity file with all details").option("-p, --properties", "Include component properties").option("-j, --json", "Output as JSON").option("-v, --verbose", "Show internal Unity IDs").action((file, options) => {
  const result = getScanner().inspect_all(file, options.properties === true, options.verbose === true);
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
program.command("add-component <file> <object_name> <component>").description("Add a component to a GameObject (built-in or custom script)").option("-p, --project <path>", "Unity project path (for script GUID lookup)").option("-j, --json", "Output as JSON").action((file, object_name, component, options) => {
  const result = addComponent({
    file_path: file,
    game_object_name: object_name,
    component_type: component,
    project_path: options.project
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
program.command("search-docs <query>").description("Search Unity documentation").option("--summarize", "-s", "Summarize results").option("--compress", "-c", "Compress results").option("-j, --json", "Output as JSON").action((query, options) => {
  const docIndexerPath = path2.join(__dirname, "..", "..", "doc-indexer", "dist", "cli.js");
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
  const docIndexerPath = path2.join(__dirname, "..", "..", "doc-indexer", "dist", "cli.js");
  const args = [docIndexerPath, "index", pathArg];
  exec(`bun ${args.join(" ")}`, (error, stdout, _stderr) => {
    if (error) {
      console.error("Error:", error.message);
      process.exit(1);
    }
    console.log(stdout);
  });
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
  const projectPath = path2.resolve(options.project || process.cwd());
  const configPath = path2.join(projectPath, ".unity-agentic");
  const configFile = path2.join(configPath, "config.json");
  let config = null;
  let guidCacheCount = 0;
  try {
    const { existsSync: existsSync5, readFileSync: readFileSync3 } = require("fs");
    if (existsSync5(configFile)) {
      config = JSON.parse(readFileSync3(configFile, "utf-8"));
    }
    const guidCachePath = path2.join(configPath, "guid-cache.json");
    if (existsSync5(guidCachePath)) {
      const guidCache = JSON.parse(readFileSync3(guidCachePath, "utf-8"));
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
