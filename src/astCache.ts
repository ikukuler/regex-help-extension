import type { TSESTree } from '@typescript-eslint/typescript-estree';
import * as vscode from 'vscode';
import { parseProgram } from './regexLocator';

interface CacheEntry {
  version: number;
  /** null = the document failed to parse at this version. */
  ast: TSESTree.Program | null;
}

const MAX_ENTRIES = 20;

/**
 * Per-document AST cache keyed by URI and invalidated by document version, so
 * repeated hovers over an unchanged file skip the (expensive) full parse.
 */
export class AstCache {
  private entries = new Map<string, CacheEntry>();

  getAst(document: vscode.TextDocument): TSESTree.Program | null {
    const key = document.uri.toString();
    const cached = this.entries.get(key);
    if (cached && cached.version === document.version) {
      return cached.ast;
    }

    const jsx =
      document.languageId === 'javascriptreact' ||
      document.languageId === 'typescriptreact';
    const ast = parseProgram(document.getText(), jsx) ?? null;

    // Re-insert to keep Map iteration order ~LRU, then trim oldest.
    this.entries.delete(key);
    this.entries.set(key, { version: document.version, ast });
    while (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    return ast;
  }

  drop(document: vscode.TextDocument): void {
    this.entries.delete(document.uri.toString());
  }
}
