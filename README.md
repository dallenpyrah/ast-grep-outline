# ast-grep-outline

Amp plugin that exposes [`ast-grep outline`](https://ast-grep.github.io/) as an agent tool named
`ast_grep_outline`.

Use it after search has identified candidate files or directories, but before reading full source. It
returns local AST-backed structure: exports, imports, classes, functions, structs, interfaces, methods,
fields, signatures, and source ranges. It does not build an index, resolve types, follow references, or
pretend to know cross-file semantics.

## Requirements

- Amp CLI
- Bun
- `ast-grep` 0.44.0 or newer (`brew install ast-grep` or `brew upgrade ast-grep`)

## Install globally for Amp

From this checkout:

```bash
bun install
bun run amp:build
bun run amp:install
```

Amp currently restricts `amp plugins add` to `https://ampcode.com/@amp/plugins/*.ts` URLs. Until this
plugin is published there, the installer copies the self-contained bundled plugin to
`~/.config/amp/plugins/ast-grep-outline.ts` and writes a managed guidance block to
`~/.config/amp/AGENTS.md`.

Reload plugins from Amp's command palette (`plugins: reload`) or restart Amp.

## Tool examples

```json
{ "paths": "src/parser.ts" }
```

```json
{ "paths": "src", "items": "exports" }
```

```json
{ "paths": "src/parser.ts", "match": "Parser", "view": "expanded" }
```

```json
{ "paths": "src/parser.ts", "items": "imports" }
```

## Safety

The plugin runs `ast-grep` with `execFile`, not shell interpolation, and rejects paths outside the
current workspace/git root.
