import * as vscode from 'vscode';
import { AstCache } from './astCache';
import { DiagnosticsManager } from './diagnosticsManager';
import { generateExamples } from './exampleGenerator';
import { renderExplanationMarkdown } from './explanationRenderer';
import { explainRegex } from './regexExplainer';
import { findRegexInProgram } from './regexLocator';

const LANGUAGES = ['javascript', 'javascriptreact', 'typescript', 'typescriptreact'];

const astCache = new AstCache();

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = new DiagnosticsManager(LANGUAGES, astCache);

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(LANGUAGES, { provideHover }),
    vscode.commands.registerCommand('regexHelp.explainSelection', explainSelection),
    diagnostics,
    vscode.workspace.onDidOpenTextDocument((doc) => diagnostics.refresh(doc)),
    vscode.workspace.onDidChangeTextDocument((e) =>
      diagnostics.scheduleRefresh(e.document),
    ),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      astCache.drop(doc);
      diagnostics.drop(doc);
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('regexHelp.diagnostics')) {
        diagnostics.refreshAllOpen();
      }
    }),
  );

  diagnostics.refreshAllOpen();
}

function provideHover(
  document: vscode.TextDocument,
  position: vscode.Position,
): vscode.Hover | undefined {
  const ast = astCache.getAst(document);
  if (!ast) return undefined;

  const offset = document.offsetAt(position);
  const located = findRegexInProgram(ast, offset);
  if (!located) return undefined;

  const markdown = explainToMarkdown(located.pattern, located.flags, true);
  if (!markdown) return undefined;

  const range = new vscode.Range(
    document.positionAt(located.range[0]),
    document.positionAt(located.range[1]),
  );
  const md = new vscode.MarkdownString(markdown);
  // Fragment colors in the breakdown are inline <span style="color:…">.
  md.supportHtml = true;
  return new vscode.Hover(md, range);
}

function explainToMarkdown(
  pattern: string,
  flags: string,
  colors: boolean,
): string | undefined {
  try {
    const explanation = explainRegex(pattern, flags);
    const examples = generateExamples(pattern, flags);
    const source = `/${pattern}/${flags}`;
    return renderExplanationMarkdown(source, explanation, examples, { colors });
  } catch {
    return undefined;
  }
}

async function explainSelection(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const selected = editor.document.getText(editor.selection).trim();
  if (!selected) {
    void vscode.window.showInformationMessage('Regex Help: select a regex first.');
    return;
  }

  const parsed = splitRegexSource(selected);
  const markdown = parsed
    ? explainToMarkdown(parsed.pattern, parsed.flags, false)
    : undefined;
  if (!markdown) {
    void vscode.window.showWarningMessage(
      'Regex Help: selection is not a valid regular expression.',
    );
    return;
  }

  const doc = await vscode.workspace.openTextDocument({
    content: markdown,
    language: 'markdown',
  });
  await vscode.window.showTextDocument(doc, {
    viewColumn: vscode.ViewColumn.Beside,
    preview: true,
  });
}

function splitRegexSource(
  text: string,
): { pattern: string; flags: string } | undefined {
  if (text.startsWith('/')) {
    const lastSlash = text.lastIndexOf('/');
    if (lastSlash > 0) {
      const pattern = text.slice(1, lastSlash);
      const flags = text.slice(lastSlash + 1);
      if (/^[dgimsuvy]*$/.test(flags)) {
        return { pattern, flags };
      }
    }
  }
  return { pattern: text, flags: '' };
}

export function deactivate(): void {}
