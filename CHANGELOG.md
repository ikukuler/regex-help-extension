# Changelog

## 0.0.3

- Hover now shows **example matches** — generated strings verified against the pattern (works with named groups and backreferences).
- Cleaner summaries: literal runs read as whole words (`"mail"` instead of `"m", then "a", …`).
- Per-document AST caching — hovers no longer re-parse an unchanged file.

## 0.0.2

- Added extension icon.

## 0.0.1

- Initial release.
- Hover explanations for JS/TS regex literals with summary, recursive breakdown, and flag descriptions.
- `Regex Help: Explain Regex` command for explaining a selected pattern.
