# regex-help-extension — Plan

VS Code / Cursor extension that explains what a regular expression does when you hover over it in JS/TS code.

## Decisions

- **Platform**: standard VS Code extension (TypeScript, `vscode` Extension API). Works in Cursor, VS Code, and any compatible fork.
- **Scope**: JS/TS regex literals only (`/pattern/flags`) in `.js`, `.jsx`, `.ts`, `.tsx`. No `new RegExp("...")` strings, no other languages (Python/PHP/etc.) in v1.
- **Detection**: parse the whole file with a JS/TS AST parser (`@typescript-eslint/typescript-estree`) on hover, walk the tree for `Literal` nodes with a `regex` property (or `RegExpLiteral`) whose range contains the cursor position. This resolves the classic `/` division-vs-regex ambiguity correctly, unlike text/regex-based scanning.
- **Explanation engine**: fully local, no LLM/network calls. Use `@eslint-community/regexpp` to parse the pattern into an AST, then a hand-written renderer walks that AST to produce human-readable text. Full ES2024 syntax coverage: groups (capturing/named/non-capturing), lookahead/lookbehind, character classes, quantifiers, alternation, backreferences, anchors, unicode property escapes (`\p{...}`), all flags (`g i m s u y d v`).
- **Hover content**: one summary sentence at the top, followed by a recursive, indented breakdown of each part (nested groups/quantifiers get nested indentation). Rendered as Markdown in the `Hover` (monospace for regex fragments).
- **Additional entry point**: a command `Explain Regex` (Command Palette + editor context menu) that runs the same explainer against the current text selection, shown via an information message or a Markdown preview — for cases where the literal isn't hoverable directly (e.g. selecting a sub-pattern).
- **Error handling**: if `regexpp` fails to parse (syntax error / unsupported construct), suppress the hover entirely — return `undefined` from the hover provider rather than showing an error message, so we don't clutter hovers or conflict with other providers (e.g. TS type hints).
- **Output language**: English.
- **Build**: `esbuild` bundling extension source to `dist/extension.js` (CommonJS, node target, external `vscode`).
- **Tests**: unit tests (Vitest) directly against the regex-explainer module (pattern string in → explanation text out), independent of VS Code. Integration smoke test via `@vscode/test-electron` + Mocha to confirm the hover provider registers and returns content for a sample file.
- **Distribution**: package as `.vsix` via `vsce`/`@vscode/vsce`; publish to **Open VSX only** (Cursor pulls extensions from there; VS Code Marketplace skipped — a similar extension already exists there). `publisher` field in `package.json` is a placeholder (`TODO`) until the Open VSX namespace is chosen. Publishing flow per https://github.com/eclipse-openvsx/openvsx/wiki/Namespace-Access: create namespace via `ovsx create-namespace` (grants contributor rights), publish with `ovsx publish`; optionally claim ownership via a public issue at github.com/EclipseFdn/open-vsx.org to get the "verified" shield instead of the ⚠️ unverified icon.

## Project layout

```
regex-help-extension/
  package.json
  tsconfig.json
  esbuild.js
  src/
    extension.ts          # activate(): registers hover provider + command
    regexLocator.ts        # AST walk to find regex literal at a position
    regexExplainer.ts       # regexpp AST -> explanation tree
    explanationRenderer.ts  # explanation tree -> Markdown string
  test/
    regexExplainer.test.ts  # unit tests (Vitest)
    suite/
      extension.test.ts     # integration smoke test (Mocha + vscode-test)
  .vscodeignore
  README.md
  CHANGELOG.md
  LICENSE
```

## Implementation steps

1. Scaffold `package.json` (contributes: nothing UI-visible except the command), `tsconfig.json`, `esbuild.js`.
2. `regexExplainer.ts`: walk `regexpp`'s `AST.Pattern`/`AST.Flags`, produce a tree of `{ summary: string, detail?: string, children?: Node[] }`.
3. `explanationRenderer.ts`: render that tree to indented Markdown.
4. `regexLocator.ts`: parse active document text with `typescript-estree`, find regex literal node covering a `vscode.Position`.
5. `extension.ts`: `registerHoverProvider` for `javascript`/`typescriptreact`/etc. language ids using the locator + explainer + renderer; `registerCommand('regexHelp.explainSelection', ...)`.
6. Unit tests for explainer covering: literals, character classes, quantifiers (`*+?{n,m}` incl. lazy), groups (capturing/non-capturing/named), alternation, anchors, backreferences, lookaround, unicode property escapes, flags.
7. Integration smoke test opening a fixture file and asserting hover content is non-empty over a known regex and `undefined` elsewhere.
8. README with usage + example screenshot placeholder, CHANGELOG, MIT LICENSE.
9. Verify manually: build, launch Extension Development Host, hover over sample regexes in a scratch file.

## Status

- **v0.0.1** — initial release, published to Open VSX (namespace `ikukuler`).
- **v0.0.2** — extension icon (orange `/.*/` on black), README cleanup. Published.
- **v0.0.3** — example matches in hover (randexp + `.test()` verification, named-group support via AST rewrite), per-document AST cache (LRU, 20 docs), merged literal runs in summaries. Never published standalone; shipped as part of 0.0.4. (`repository` field intentionally omitted while the GitHub repo is private.)
- **v0.0.4** — 0.0.3 content + tag-triggered auto-publish via GitHub Actions (OVSX_PAT secret). Published.
- **v0.0.5** — regex diagnostics (see below). Built and tested; release = commit → `npm version patch` → `git push && git push --tags`.

## Regex diagnostics (shipped in 0.0.5)

Turn the extension from an explainer into a linter that catches real bugs. New module `regexDiagnostics.ts` walking the existing regexpp AST + a `vscode.DiagnosticCollection` (warning squiggles on the regex literal, updated on open/change of JS/TS documents, reusing `AstCache` to find all regex literals in the file).

Checks, in priority order:

1. **Catastrophic backtracking / ReDoS** (severity: Warning)
   - Nested quantifiers where the inner element can match repeatedly: `(a+)+`, `(\d*)*`, `(?:x+)+` — exponential blowup on non-matching input (demo: `/^(a+)+$/.test('a'.repeat(30)+'!')` ≈ 7 s, +2 chars ≈ ×4).
   - Overlapping alternatives under a quantifier: `(a|ab)+`, `(.|\n)*`.
   - Approach: star-height analysis over the AST (flag quantifier nodes whose subtree contains another unbounded quantifier with a non-disjoint first set). Consider `safe-regex`-style heuristic as a baseline; avoid false positives on bounded repetition (`{2,5}`).
   - Real-world motivation: Stack Overflow's 34-minute outage (2016) from one such regex.
2. **Empty character class** (severity: Warning)
   - `[]` never matches anything in JS (valid syntax, always-failing regex) — almost certainly a bug.
   - `[^]` matches everything incl. newlines — often accidental, suggest `.` + `s` flag or `[\s\S]` explicitly.
3. **Useless escapes** (severity: Hint/Information)
   - Escaping non-special chars outside classes (`\-` outside `[...]`) and inside classes (`[\.]` → `[.]`).
   - regexpp exposes these as `Character` nodes where `raw` starts with `\` but the char isn't special in context.

Config: a setting `regexHelp.diagnostics.enabled` (default true) and per-check toggles. Diagnostics must never fire on patterns regexpp can't parse (same silent-skip policy as hover).

Implementation notes (0.0.5): `regexDiagnostics.ts` (pure analyzer, unit-tested) + `diagnosticsManager.ts` (DiagnosticCollection, 300 ms debounce on change, reuses AstCache, live settings updates). The overlapping-alternatives ReDoS check (`(a|ab)+`) was deferred — only the star-height heuristic (nested unbounded quantifiers) shipped; revisit if false negatives bite.
