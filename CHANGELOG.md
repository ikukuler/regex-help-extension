# Changelog

## 0.0.5

- **Regex diagnostics**: regex literals are now analyzed as you type, with squiggles for
  - potential catastrophic backtracking / ReDoS (nested unbounded quantifiers like `(a+)+`) — Warning
  - `[]` (never matches anything) — Warning; `[^]` (matches everything incl. newlines) — Information
  - useless escapes (`\-` outside a class, `[\.]` inside) — Hint
- New settings: `regexHelp.diagnostics.enabled` plus per-check toggles (`redos`, `emptyClass`, `uselessEscape`).

## 0.0.4

- Publishing is now automated via GitHub Actions (tag-triggered, gated by the full test suite).

## 0.0.3 (unreleased)

- Hover now shows **example matches** — generated strings verified against the pattern (works with named groups and backreferences).
- Cleaner summaries: literal runs read as whole words (`"mail"` instead of `"m", then "a", …`).
- Per-document AST caching — hovers no longer re-parse an unchanged file.

## 0.0.2

- Added extension icon.

## 0.0.1

- Initial release.
- Hover explanations for JS/TS regex literals with summary, recursive breakdown, and flag descriptions.
- `Regex Help: Explain Regex` command for explaining a selected pattern.
