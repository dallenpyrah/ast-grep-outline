import { execFile } from "node:child_process"
import { isAbsolute, relative, resolve, sep } from "node:path"
import { promisify } from "node:util"

interface PluginUI {
  notify: (message: string) => Promise<void>
}

interface PluginCommandContext {
  readonly ui: PluginUI
}

interface PluginCommandOptions {
  readonly title: string
  readonly category?: string
  readonly description?: string
}

interface PluginToolDefinition {
  readonly name: string
  readonly description: string
  readonly inputSchema: {
    readonly type: "object"
    readonly properties?: Record<string, unknown>
    readonly required?: ReadonlyArray<string>
    readonly [key: string]: unknown
  }
  readonly execute: (input: Record<string, unknown>) => Promise<string>
}

interface PluginAPI {
  registerCommand: (
    id: string,
    options: PluginCommandOptions,
    handler: (ctx: PluginCommandContext) => Promise<void> | void
  ) => unknown
  registerTool: (definition: PluginToolDefinition) => unknown
}

type Items = "auto" | "structure" | "exports" | "imports" | "all"
type View = "auto" | "names" | "signatures" | "digest" | "expanded"
type JsonStyle = "pretty" | "stream" | "compact"

interface OutlineInput {
  readonly paths?: unknown
  readonly lang?: unknown
  readonly items?: unknown
  readonly view?: unknown
  readonly match?: unknown
  readonly types?: unknown
  readonly pubMembers?: unknown
  readonly json?: unknown
  readonly config?: unknown
  readonly outlineRules?: unknown
  readonly noDefaultOutlineRules?: unknown
  readonly globs?: unknown
  readonly follow?: unknown
  readonly maxOutputChars?: unknown
}

const execFileAsync = promisify(execFile)

const items = new Set<Items>(["auto", "structure", "exports", "imports", "all"])
const views = new Set<View>(["auto", "names", "signatures", "digest", "expanded"])
const jsonStyles = new Set<JsonStyle>(["pretty", "stream", "compact"])

const exec = async (command: string, args: ReadonlyArray<string>, cwd: string) =>
  await execFileAsync(command, [...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  })

const findAstGrep = async (cwd: string): Promise<string> => {
  for (const candidate of ["ast-grep", "sg"]) {
    try {
      await exec(candidate, ["--version"], cwd)
      return candidate
    } catch {
      // Try the next binary name.
    }
  }

  throw new Error("ast-grep is not installed. Install ast-grep 0.44.0 or newer to use outline.")
}

const workspaceRoot = async (): Promise<string> => {
  const cwd = resolve(process.env.PWD?.trim() || process.cwd())
  try {
    const result = await exec("git", ["rev-parse", "--show-toplevel"], cwd)
    return result.stdout.trim() || cwd
  } catch {
    return cwd
  }
}

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined

const booleanValue = (value: unknown): boolean => value === true

const stringArray = (value: unknown): ReadonlyArray<string> => {
  if (typeof value === "string" && value.trim().length > 0) return [value.trim()]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
}

const enumValue = <T extends string>(value: unknown, allowed: ReadonlySet<T>): T | undefined => {
  if (typeof value !== "string") return undefined
  return allowed.has(value as T) ? (value as T) : undefined
}

const outputLimit = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return 30_000
  return Math.max(2_000, Math.min(80_000, Math.floor(value)))
}

const assertInsideRoot = (root: string, path: string, label: string) => {
  if (path.startsWith("-")) throw new Error(`${label} must be a path, not an option: ${path}`)
  const absolute = isAbsolute(path) ? resolve(path) : resolve(root, path)
  const rel = relative(root, absolute)
  if (rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))) return
  throw new Error(`${label} must stay inside the workspace root: ${path}`)
}

const truncate = (output: string, limit: number): string => {
  if (output.length <= limit) return output
  return `${output.slice(0, limit)}\n\n[ast_grep_outline: output truncated at ${limit} characters. Narrow with paths, match, items, view, types, or globs before reading full source.]`
}

const errorText = (error: unknown): string => {
  if (error instanceof Error && "stderr" in error && typeof error.stderr === "string" && error.stderr.trim()) {
    return error.stderr.trim()
  }
  if (error instanceof Error && "stdout" in error && typeof error.stdout === "string" && error.stdout.trim()) {
    return error.stdout.trim()
  }
  return error instanceof Error ? error.message : String(error)
}

const validatePath = (root: string, path: string, label: string): string | undefined => {
  try {
    assertInsideRoot(root, path, label)
    return undefined
  } catch (error) {
    return `ast-grep outline failed: ${errorText(error)}`
  }
}

export default function astGrepOutlinePlugin(amp: PluginAPI) {
  amp.registerCommand(
    "ast-grep-outline-status",
    {
      title: "Ast-grep Outline Status",
      category: "ast-grep",
      description: "Show the installed ast-grep version used by the ast_grep_outline tool."
    },
    async (ctx) => {
      const root = await workspaceRoot()
      const binary = await findAstGrep(root)
      const result = await exec(binary, ["--version"], root)
      await ctx.ui.notify(result.stdout.trim())
    }
  )

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
          description:
            "Workspace-relative file or directory path(s) to outline. Defaults to [\".\"]. Use candidate paths from search; avoid broad repo-root calls unless you need exported surface.",
          oneOf: [{ type: "string" }, { type: "array", items: { type: "string" }, maxItems: 20 }]
        },
        items: {
          type: "string",
          enum: [...items],
          description:
            "`auto` uses structure for files and exports for directories. Use imports to inspect dependencies, exports for public surface, all for imports plus local declarations."
        },
        view: {
          type: "string",
          enum: [...views],
          description:
            "`names` is most compact, `signatures` lists item signatures, `digest` adds compact member names, `expanded` includes direct member signatures."
        },
        match: {
          type: "string",
          description:
            "Regex matched against top-level item names/signatures/import-export signatures. Use to focus a known symbol such as `Parser` or `MemoryService`."
        },
        types: {
          description: "Top-level symbol types to keep, e.g. [\"class\", \"function\"] or \"class,function\".",
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
          description: "Include/exclude file globs, e.g. [\"**/*.ts\", \"!**/*.test.ts\"]. Passed as repeated --globs flags.",
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
          description:
            "Do not load bundled outline extractor definitions. Rare; use only when custom outline rules intentionally replace defaults."
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
      const input = rawInput as OutlineInput
      const root = await workspaceRoot()
      const binary = await findAstGrep(root)
      const args: Array<string> = ["outline", "--color", "never"]

      const selectedItems = enumValue(input.items, items)
      if (selectedItems) args.push("--items", selectedItems)

      const selectedView = enumValue(input.view, views)
      if (selectedView) args.push("--view", selectedView)

      const lang = stringValue(input.lang)
      if (lang) args.push("--lang", lang)

      const match = stringValue(input.match)
      if (match) args.push("--match", match)

      const selectedTypes = stringArray(input.types)
      if (selectedTypes.length > 0) args.push("--type", selectedTypes.join(","))

      if (booleanValue(input.pubMembers)) args.push("--pub-members")

      if (input.json === true) args.push("--json")
      else {
        const jsonStyle = enumValue(input.json, jsonStyles)
        if (jsonStyle) args.push(`--json=${jsonStyle}`)
      }

      const config = stringValue(input.config)
      if (config) {
        const error = validatePath(root, config, "config")
        if (error) return error
        args.push("--config", config)
      }

      const outlineRules = stringValue(input.outlineRules)
      if (outlineRules) {
        const error = validatePath(root, outlineRules, "outlineRules")
        if (error) return error
        args.push("--outline-rules", outlineRules)
      }

      if (booleanValue(input.noDefaultOutlineRules)) args.push("--no-default-outline-rules")
      if (booleanValue(input.follow)) args.push("--follow")

      for (const glob of stringArray(input.globs)) args.push("--globs", glob)

      const paths = stringArray(input.paths)
      for (const path of paths.length > 0 ? paths : ["."]) {
        const error = validatePath(root, path, "path")
        if (error) return error
        args.push(path)
      }

      try {
        const result = await exec(binary, args, root)
        const output = result.stdout.trim() || result.stderr.trim() || "No outline entries found."
        return truncate(output, outputLimit(input.maxOutputChars))
      } catch (error) {
        return `ast-grep outline failed: ${errorText(error)}`
      }
    }
  })
}
