# Regex Help

Hover over a regular expression in JavaScript or TypeScript code and instantly see what it does — a plain-English summary plus a recursive breakdown of every part of the pattern.

Fully local: no network calls, no LLM, no telemetry. Powered by [`@eslint-community/regexpp`](https://github.com/eslint-community/regexpp), the same regex parser ESLint uses.

## Features

- **Hover explanations** for regex literals (`/pattern/flags`) in `.js`, `.jsx`, `.ts`, `.tsx` files.
- **Accurate detection** — the file is parsed as JS/TS, so division (`a / b / c`) is never mistaken for a regex.
- **Full ES2024 syntax**: named groups, lookahead/lookbehind, backreferences, unicode property escapes (`\p{...}`), `v`-flag class set operations, all flags (`g i m s u y d v`).
- **Explain Regex command** — select any pattern (e.g. inside a `new RegExp("...")` string) and run *Regex Help: Explain Regex* from the Command Palette or the editor context menu to open the explanation beside the editor.

## Example

Hovering over `/^(?<user>[a-z0-9._]+)@([\w-]+\.)+[a-z]{2,}$/i` shows:

> Matches start of string/line, then a group "user" (…), then "@", … (case-insensitively)
>
> **Breakdown**
> - `^` — asserts position at the start of the string (or line, with `m` flag)
> - `(?<user>[a-z0-9._]+)` — capturing group "user":
>   - `[a-z0-9._]+` — one or more times:
>     - `[a-z0-9._]` — matches any character in this set:
>       - `a-z` — a character in the range a–z
>       - …
>
> **Flags**
> - `i` — case-insensitive

## Requirements

None. Works out of the box in VS Code, Cursor, and other VS Code-compatible editors (engine `^1.85.0`).

## Extension Settings

No settings yet.

## Known Limitations

- Only regex *literals* get hover explanations. Patterns built from strings (`new RegExp(str)`) can be explained via the *Explain Regex* command on a selection.
- Invalid patterns are silently ignored (no hover) rather than reported.

## License

MIT
