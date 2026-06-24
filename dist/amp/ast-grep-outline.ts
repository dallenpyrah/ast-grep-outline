// @amp-plugin updated automatically from https://raw.githubusercontent.com/dallenpyrah/ast-grep-outline/main/dist/amp/ast-grep-outline.ts

// src/amp/plugin.ts
import { execFile } from "node:child_process";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
var execFileAsync = promisify(execFile);
var items = new Set(["auto", "structure", "exports", "imports", "all"]);
var views = new Set(["auto", "names", "signatures", "digest", "expanded"]);
var jsonStyles = new Set(["pretty", "stream", "compact"]);
var noIgnoreValues = new Set(["hidden", "dot", "exclude", "global", "parent", "vcs"]);
var exec = async (command, args, cwd) => await execFileAsync(command, [...args], {
  cwd,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024
});
var findAstGrep = async (cwd) => {
  for (const candidate of ["ast-grep", "sg"]) {
    try {
      await exec(candidate, ["--version"], cwd);
      return candidate;
    } catch {}
  }
  throw new Error("ast-grep is not installed. Install ast-grep 0.44.0 or newer to use outline.");
};
var workspaceRoot = async () => {
  const cwd = resolve(process.env.PWD?.trim() || process.cwd());
  try {
    const result = await exec("git", ["rev-parse", "--show-toplevel"], cwd);
    return result.stdout.trim() || cwd;
  } catch {
    return cwd;
  }
};
var stringValue = (value) => typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
var booleanValue = (value) => value === true;
var stringArray = (value) => {
  if (typeof value === "string" && value.trim().length > 0)
    return [value.trim()];
  if (!Array.isArray(value))
    return [];
  return value.filter((item) => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
};
var enumValue = (value, allowed) => {
  if (typeof value !== "string")
    return;
  return allowed.has(value) ? value : undefined;
};
var enumArray = (value, allowed) => {
  if (typeof value === "string") {
    const selected2 = enumValue(value, allowed);
    return selected2 === undefined ? [] : [selected2];
  }
  if (!Array.isArray(value))
    return [];
  const selected = [];
  for (const item of value) {
    const next = enumValue(item, allowed);
    if (next !== undefined)
      selected.push(next);
  }
  return [...new Set(selected)];
};
var outputLimit = (value) => {
  if (typeof value !== "number" || !Number.isFinite(value))
    return 30000;
  return Math.max(2000, Math.min(80000, Math.floor(value)));
};
var assertInsideRoot = (root, path, label) => {
  if (path.startsWith("-"))
    throw new Error(`${label} must be a path, not an option: ${path}`);
  const absolute = isAbsolute(path) ? resolve(path) : resolve(root, path);
  const rel = relative(root, absolute);
  if (rel === "" || rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
    return;
  throw new Error(`${label} must stay inside the workspace root: ${path}`);
};
var truncate = (output, limit) => {
  if (output.length <= limit)
    return output;
  return `${output.slice(0, limit)}

[ast_grep_outline: output truncated at ${limit} characters. Narrow with paths, match, items, view, types, or globs before reading full source.]`;
};
var errorText = (error) => {
  if (error instanceof Error && "stderr" in error && typeof error.stderr === "string" && error.stderr.trim()) {
    return error.stderr.trim();
  }
  if (error instanceof Error && "stdout" in error && typeof error.stdout === "string" && error.stdout.trim()) {
    return error.stdout.trim();
  }
  return error instanceof Error ? error.message : String(error);
};
var validatePath = (root, path, label) => {
  try {
    assertInsideRoot(root, path, label);
    return;
  } catch (error) {
    return `ast-grep outline failed: ${errorText(error)}`;
  }
};
function astGrepOutlinePlugin(amp) {
  amp.registerCommand("ast-grep-outline-status", {
    title: "Ast-grep Outline Status",
    category: "ast-grep",
    description: "Show the installed ast-grep version used by the ast_grep_outline tool."
  }, async (ctx) => {
    const root = await workspaceRoot();
    const binary = await findAstGrep(root);
    const result = await exec(binary, ["--version"], root);
    await ctx.ui.notify(result.stdout.trim());
  });
  amp.registerTool({
    name: "ast_grep_outline",
    description: [
      "Run `ast-grep outline` to get a fast, local, AST-backed table of contents for code before reading full source.",
      "Use this after search/grep has identified candidate files or directories and you need shape: exports, imports, classes, functions, structs, interfaces, methods, fields, and source ranges.",
      "Prefer it over opening whole large files when deciding which symbol or line range to read next. It has no index, no type resolution, and no cross-file semantics; it reports local source structure only.",
      "Default behavior mirrors ast-grep: file inputs show local structure with member digest, directory inputs show exported surface with grouped names. Narrow with `items`, `view`, `match`, `types`, or `globs` before reading source."
    ].join(" "),
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        paths: {
          description: 'Workspace-relative file or directory path(s) to outline. Defaults to ["."]. Use candidate paths from search; avoid broad repo-root calls unless you need exported surface.',
          oneOf: [{ type: "string" }, { type: "array", items: { type: "string" }, maxItems: 20 }]
        },
        items: {
          type: "string",
          enum: [...items],
          description: "`auto` uses structure for files and exports for directories. Use imports to inspect dependencies, exports for public surface, all for imports plus local declarations."
        },
        view: {
          type: "string",
          enum: [...views],
          description: "`names` is most compact, `signatures` lists item signatures, `digest` adds compact member names, `expanded` includes direct member signatures."
        },
        match: {
          type: "string",
          description: "Regex matched against top-level item names/signatures/import-export signatures. Use to focus a known symbol such as `Parser` or `MemoryService`."
        },
        types: {
          description: 'Top-level symbol types to keep, e.g. ["class", "function"] or "class,function".',
          oneOf: [{ type: "string" }, { type: "array", items: { type: "string" }, maxItems: 20 }]
        },
        lang: {
          type: "string",
          description: "Optional ast-grep language override. Usually omit for path input so ast-grep infers from extensions."
        },
        pubMembers: {
          type: "boolean",
          description: "Only show public members in member views."
        },
        json: {
          description: "Optional structured JSON output style. Omit for concise text optimized for navigation.",
          oneOf: [{ type: "boolean" }, { type: "string", enum: [...jsonStyles] }]
        },
        globs: {
          description: 'Include/exclude file globs, e.g. ["**/*.ts", "!**/*.test.ts"]. Passed as repeated --globs flags.',
          oneOf: [{ type: "string" }, { type: "array", items: { type: "string" }, maxItems: 20 }]
        },
        config: {
          type: "string",
          description: "Workspace-relative ast-grep config path. Defaults to sgconfig.yml if present."
        },
        outlineRules: {
          type: "string",
          description: "Workspace-relative file containing additional ast-grep outline extractor definitions."
        },
        noDefaultOutlineRules: {
          type: "boolean",
          description: "Do not load bundled outline extractor definitions. Rare; use only when custom outline rules intentionally replace defaults."
        },
        noIgnore: {
          description: "Override ast-grep ignore behavior. Values: hidden, dot, exclude, global, parent, vcs. Use sparingly, e.g. hidden to include dotfiles/directories.",
          oneOf: [
            { type: "string", enum: [...noIgnoreValues] },
            { type: "array", items: { type: "string", enum: [...noIgnoreValues] }, maxItems: 6 }
          ]
        },
        follow: {
          type: "boolean",
          description: "Follow symlinks while traversing directories."
        },
        maxOutputChars: {
          type: "number",
          minimum: 2000,
          maximum: 80000,
          description: "Maximum returned characters before truncation. Defaults to 30000."
        }
      },
      required: []
    },
    async execute(rawInput) {
      const input = rawInput;
      const root = await workspaceRoot();
      const binary = await findAstGrep(root);
      const args = ["outline", "--color", "never"];
      const selectedItems = enumValue(input.items, items);
      if (selectedItems)
        args.push("--items", selectedItems);
      const selectedView = enumValue(input.view, views);
      if (selectedView)
        args.push("--view", selectedView);
      const lang = stringValue(input.lang);
      if (lang)
        args.push("--lang", lang);
      const match = stringValue(input.match);
      if (match)
        args.push("--match", match);
      const selectedTypes = stringArray(input.types);
      if (selectedTypes.length > 0)
        args.push("--type", selectedTypes.join(","));
      if (booleanValue(input.pubMembers))
        args.push("--pub-members");
      if (input.json === true)
        args.push("--json");
      else {
        const jsonStyle = enumValue(input.json, jsonStyles);
        if (jsonStyle)
          args.push(`--json=${jsonStyle}`);
      }
      const config = stringValue(input.config);
      if (config) {
        const error = validatePath(root, config, "config");
        if (error)
          return error;
        args.push("--config", config);
      }
      const outlineRules = stringValue(input.outlineRules);
      if (outlineRules) {
        const error = validatePath(root, outlineRules, "outlineRules");
        if (error)
          return error;
        args.push("--outline-rules", outlineRules);
      }
      if (booleanValue(input.noDefaultOutlineRules))
        args.push("--no-default-outline-rules");
      if (booleanValue(input.follow))
        args.push("--follow");
      for (const value of enumArray(input.noIgnore, noIgnoreValues))
        args.push("--no-ignore", value);
      for (const glob of stringArray(input.globs))
        args.push("--globs", glob);
      const paths = stringArray(input.paths);
      for (const path of paths.length > 0 ? paths : ["."]) {
        const error = validatePath(root, path, "path");
        if (error)
          return error;
        args.push(path);
      }
      try {
        const result = await exec(binary, args, root);
        const output = result.stdout.trim() || result.stderr.trim() || "No outline entries found.";
        return truncate(output, outputLimit(input.maxOutputChars));
      } catch (error) {
        return `ast-grep outline failed: ${errorText(error)}`;
      }
    }
  });
}
export {
  astGrepOutlinePlugin as default
};
