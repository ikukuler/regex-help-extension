import * as vscode from 'vscode';
import type { AstCache } from './astCache';
import { analyzePattern, DiagnosticOptions, RegexFinding } from './regexDiagnostics';
import { findAllRegexes } from './regexLocator';

const DEBOUNCE_MS = 300;

const SEVERITY_MAP: Record<RegexFinding['severity'], vscode.DiagnosticSeverity> = {
  warning: vscode.DiagnosticSeverity.Warning,
  information: vscode.DiagnosticSeverity.Information,
  hint: vscode.DiagnosticSeverity.Hint,
};

/**
 * Keeps a DiagnosticCollection in sync with open JS/TS documents: analyzes
 * every regex literal on open/change (debounced) and clears on close.
 */
export class DiagnosticsManager implements vscode.Disposable {
  private readonly collection =
    vscode.languages.createDiagnosticCollection('regexHelp');
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly languages: readonly string[],
    private readonly astCache: AstCache,
  ) {}

  /** Analyze now (used on open/activation and after config changes). */
  refresh(document: vscode.TextDocument): void {
    if (!this.languages.includes(document.languageId)) return;

    const config = vscode.workspace.getConfiguration('regexHelp.diagnostics');
    if (!config.get<boolean>('enabled', true)) {
      this.collection.delete(document.uri);
      return;
    }
    const options: DiagnosticOptions = {
      redos: config.get<boolean>('redos', true),
      emptyClass: config.get<boolean>('emptyClass', true),
      uselessEscape: config.get<boolean>('uselessEscape', true),
    };

    const ast = this.astCache.getAst(document);
    if (!ast) {
      // Mid-edit files often don't parse; drop stale squiggles rather than
      // leaving them pointing at moved text.
      this.collection.delete(document.uri);
      return;
    }

    const diagnostics: vscode.Diagnostic[] = [];
    for (const literal of findAllRegexes(ast)) {
      // Pattern text starts one character after the literal's opening slash.
      const patternBase = literal.range[0] + 1;
      for (const finding of analyzePattern(literal.pattern, literal.flags, options)) {
        const range = new vscode.Range(
          document.positionAt(patternBase + finding.start),
          document.positionAt(patternBase + finding.end),
        );
        const diagnostic = new vscode.Diagnostic(
          range,
          finding.message,
          SEVERITY_MAP[finding.severity],
        );
        diagnostic.source = 'Regex Help';
        diagnostic.code = finding.kind;
        diagnostics.push(diagnostic);
      }
    }
    this.collection.set(document.uri, diagnostics);
  }

  /** Debounced refresh for change events. */
  scheduleRefresh(document: vscode.TextDocument): void {
    if (!this.languages.includes(document.languageId)) return;
    const key = document.uri.toString();
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        this.refresh(document);
      }, DEBOUNCE_MS),
    );
  }

  drop(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    const timer = this.timers.get(key);
    if (timer) clearTimeout(timer);
    this.timers.delete(key);
    this.collection.delete(document.uri);
  }

  refreshAllOpen(): void {
    for (const document of vscode.workspace.textDocuments) {
      this.refresh(document);
    }
  }

  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.collection.dispose();
  }
}
