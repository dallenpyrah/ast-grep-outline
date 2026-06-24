<!-- ast-grep-outline amp guidance start -->
## Use ast-grep outline for code shape before broad reads

When search has identified candidate source files or directories and the next question is “what is inside this file/subtree?”, use the `ast_grep_outline` tool before reading large files. It is best for local structure: exports, imports, classes, functions, structs, interfaces, methods, fields, and source ranges.

Default pattern:

1. Use text/semantic search to find likely files.
2. Run `ast_grep_outline` on the candidate file or directory.
3. Read only the smallest relevant source range after the outline identifies the symbol or exported surface.

Prefer `items: "imports"` for dependency shape, `items: "exports"` for public surface, `view: "expanded"` plus `match` for one known symbol, and `globs` to narrow broad directories. Do not use outline as a semantic graph: it does not resolve types, references, imports, or cross-file relationships.
<!-- ast-grep-outline amp guidance end -->
