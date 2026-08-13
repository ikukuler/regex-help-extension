# Regex Help

Hover over a regular expression in JavaScript or TypeScript code and instantly see what it does — a plain-English summary, generated example matches, and a recursive breakdown of every part of the pattern. Dangerous patterns (ReDoS, `[]`, useless escapes) get warning squiggles as you type.

Fully local: no network calls, no LLM, no telemetry. Powered by [`@eslint-community/regexpp`](https://github.com/eslint-community/regexpp), the same regex parser ESLint uses.

## Features

- **Hover explanations** for regex literals (`/pattern/flags`) in `.js`, `.jsx`, `.ts`, `.tsx` files: summary sentence, example matches, part-by-part breakdown, flag descriptions.
- **Color-coded breakdown** — each fragment is colored by what it is (group, quantifier, character class, anchor, lookaround, backreference), so a long pattern is easy to scan.
- **Example matches** — each hover includes generated sample strings, every one verified against the pattern before display (named groups and backreferences supported).
- **Accurate detection** — the file is parsed as JS/TS, so division (`a / b / c`) is never mistaken for a regex. Parsed ASTs are cached per document, so hovers stay instant in large files.
- **Full ES2024 syntax**: named groups, lookahead/lookbehind, backreferences, unicode property escapes (`\p{...}`), `v`-flag class set operations, all flags (`g i m s u y d v`).
- **Explain Regex command** — select any pattern (e.g. inside a `new RegExp("...")` string) and run *Regex Help: Explain Regex* from the Command Palette or the editor context menu to open the explanation beside the editor.
- **Hazard diagnostics** — regex literals are analyzed as you type:
  - ⚠️ potential catastrophic backtracking (ReDoS), e.g. `(a+)+` — exponential time on non-matching input;
  - ⚠️ `[]` never matches anything; ℹ️ `[^]` matches everything including newlines;
  - useless escapes such as `\-` outside a character class.

  Each check can be turned off individually (`regexHelp.diagnostics.*` settings).

## Example

Hovering over `/^(?<user>[a-z0-9._]+)@([\w-]+\.)+[a-z]{2,}$/i` shows:

> Matches start of string/line, then a group "user" (one of: a–z, 0–9, ".", "_" one or more times), then "@", then a group (…) one or more times, then one of: a–z 2 or more times, then end of string/line (case-insensitively)
>
> **Example matches**: `0c@v.3a.PgL.zKKX`, `84h@wrjg.yq1.example.com`
>
> **Breakdown**
> - `^` — asserts position at the start of the string (or line, with `m` flag)
> - `(?<user>[a-z0-9._]+)` — capturing group "user":
>   - `[a-z0-9._]+` — one or more times:
>     - `[a-z0-9._]` — matches any character in this set:
>       - `a-z` — a character in the range a–z
>       - `0-9` — a character in the range 0–9
>       - …
> - `@` — matches the character "@"
> - …
>
> **Flags**
> - `i` — case-insensitive

And typing `/(a+)+$/` gets an immediate warning squiggle:

> ⚠️ Potential catastrophic backtracking (ReDoS): unbounded quantifier `a+` is nested inside `(a+)+`. On non-matching input the regex engine may explore exponentially many ways to split the text.

## Requirements

None. Works out of the box in VS Code, Cursor, and other VS Code-compatible editors (engine `^1.85.0`).

## Extension Settings

| Setting | Default | Description |
|---|---|---|
| `regexHelp.diagnostics.enabled` | `true` | Master switch for regex diagnostics |
| `regexHelp.diagnostics.redos` | `true` | Warn about potential catastrophic backtracking |
| `regexHelp.diagnostics.emptyClass` | `true` | Warn about `[]` / `[^]` |
| `regexHelp.diagnostics.uselessEscape` | `true` | Hint about escapes that have no effect |

## Known Limitations

- Only regex *literals* get hover explanations. Patterns built from strings (`new RegExp(str)`) can be explained via the *Explain Regex* command on a selection.
- Invalid patterns are silently ignored (no hover) rather than reported.

## Source and issues

Code lives at [github.com/ikukuler/regex-help-extension](https://github.com/ikukuler/regex-help-extension) — bug reports and feature requests are welcome in the [issue tracker](https://github.com/ikukuler/regex-help-extension/issues).

## License

MIT
