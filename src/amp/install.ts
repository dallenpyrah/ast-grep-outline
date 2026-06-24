#!/usr/bin/env bun
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const managedMarker = "ast-grep-outline amp installer managed"
const guidanceStart = "<!-- ast-grep-outline amp guidance start -->"
const guidanceEnd = "<!-- ast-grep-outline amp guidance end -->"

type InstallScope = "system" | "workspace"

interface InstallOptions {
  readonly scope: InstallScope
  readonly force: boolean
  readonly workspaceRoot: string
}

const usage = `Install the ast-grep-outline Amp plugin and guidance.

Usage:
  bun run amp:install [-- --system|--workspace] [--workspace-root <path>] [--force]

Options:
  --system          Install user-wide into ~/.config/amp/plugins and ~/.config/amp/AGENTS.md (default).
  --workspace       Install into <workspace>/.amp/plugins and <workspace>/.amp/AGENTS.md.
  --workspace-root  Workspace path for --workspace installs (default: current directory).
  --force           Overwrite an existing non-ast-grep-outline plugin with the same name.
  --help            Show this help.
`

const isErrno = (error: unknown): error is NodeJS.ErrnoException =>
  typeof error === "object" && error !== null && "code" in error

const parseArgs = (args: ReadonlyArray<string>): InstallOptions => {
  let scope: InstallScope = "system"
  let force = false
  let workspaceRoot = process.cwd()

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === "--system" || arg === "--global") {
      scope = "system"
      continue
    }
    if (arg === "--workspace") {
      scope = "workspace"
      continue
    }
    if (arg === "--workspace-root") {
      const next = args[index + 1]
      if (!next) throw new Error("--workspace-root requires a path")
      workspaceRoot = resolve(next)
      index += 1
      continue
    }
    if (arg === "--force") {
      force = true
      continue
    }
    if (arg === "--help" || arg === "-h") {
      console.log(usage)
      process.exit(0)
    }
    throw new Error(`Unknown argument: ${arg}\n\n${usage}`)
  }

  return { scope, force, workspaceRoot: resolve(workspaceRoot) }
}

const readIfExists = async (file: string): Promise<string | undefined> => {
  try {
    return await readFile(file, "utf8")
  } catch (error) {
    if (isErrno(error) && error.code === "ENOENT") return undefined
    throw error
  }
}

const assertManagedOrMissing = async (file: string, force: boolean, label: string) => {
  const existing = await readIfExists(file)
  if (existing === undefined || existing.includes(managedMarker) || force) return
  throw new Error(`${label} already exists and was not created by ast-grep-outline: ${file}\nUse --force to overwrite it.`)
}

const sourceRoot = (): string => resolve(fileURLToPath(new URL("../../", import.meta.url)))

const guidanceHeading = "## Use ast-grep outline for code shape before broad reads"

const withoutAstGrepOutlineGuidance = (content: string): string => {
  let next = content

  const managedStart = next.indexOf(guidanceStart)
  const managedEnd = next.indexOf(guidanceEnd)
  if (managedStart >= 0 && managedEnd >= managedStart) {
    next = `${next.slice(0, managedStart).trimEnd()}\n\n${next.slice(managedEnd + guidanceEnd.length).trimStart()}`
  }

  const legacyStart = next.indexOf(guidanceHeading)
  if (legacyStart < 0) return next

  const nextManagedBlock = next.indexOf(guidanceStart, legacyStart)
  const nextHeading = next.indexOf("\n## ", legacyStart + guidanceHeading.length)
  const legacyEndCandidates = [nextManagedBlock, nextHeading].filter((index) => index >= 0)
  const legacyEnd = legacyEndCandidates.length > 0 ? Math.min(...legacyEndCandidates) : next.length

  return `${next.slice(0, legacyStart).trimEnd()}\n\n${next.slice(legacyEnd).trimStart()}`
}

const upsertGuidance = async (agentsFile: string, guidance: string) => {
  const existing = (await readIfExists(agentsFile)) ?? "# Global Amp Guidance\n"
  const base = withoutAstGrepOutlineGuidance(existing)
  const normalizedGuidance = guidance.trimEnd()
  const next = `${base.trimEnd()}\n\n${normalizedGuidance}\n`

  await mkdir(dirname(agentsFile), { recursive: true })
  await writeFile(agentsFile, next)
}

const install = async (options: InstallOptions) => {
  const root = sourceRoot()
  const sourcePlugin = resolve(root, "dist/amp/ast-grep-outline.ts")
  const sourceGuidance = resolve(root, "src/amp/guidance.md")
  await Promise.all([stat(sourcePlugin), stat(sourceGuidance)])

  const ampRoot = options.scope === "system" ? resolve(homedir(), ".config/amp") : resolve(options.workspaceRoot, ".amp")
  const pluginFile = resolve(ampRoot, "plugins/ast-grep-outline.ts")
  const agentsFile = resolve(ampRoot, "AGENTS.md")

  await assertManagedOrMissing(pluginFile, options.force, "Amp plugin")
  await mkdir(dirname(pluginFile), { recursive: true })

  await writeFile(
    pluginFile,
    [
      `// ${managedMarker}`,
      "// Bundled ast-grep-outline Amp plugin. No local checkout imports.",
      await readFile(sourcePlugin, "utf8")
    ].join("\n")
  )
  await upsertGuidance(agentsFile, await readFile(sourceGuidance, "utf8"))

  console.log(`Installed ast-grep-outline Amp integration (${options.scope}):`)
  console.log(`- plugin: ${pluginFile}`)
  console.log(`- guidance: ${agentsFile}`)
  console.log("Restart Amp or run `plugins: reload` from the command palette.")
}

install(parseArgs(process.argv.slice(2))).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
