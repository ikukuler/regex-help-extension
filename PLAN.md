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
