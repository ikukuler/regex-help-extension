import * as vscode from 'vscode';
import { explainRegex } from './regexExplainer';
import { renderExplanationMarkdown } from './explanationRenderer';
import { findRegexAtOffset } from './regexLocator';

const LANGUAGES = ['javascript', 'javascriptreact', 'typescript', 'typescriptreact'];

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(LANGUAGES, { provideHover }),
    vscode.commands.registerCommand('regexHelp.explainSelection', explainSelection),
  );
}

function provideHover(
  document: vscode.TextDocument,
  position: vscode.Position,
): vscode.Hover | undefined {
  const offset = document.offsetAt(position);
  const jsx =
    document.languageId === 'javascriptreact' ||
    document.languageId === 'typescriptreact';

  const located = findRegexAtOffset(document.getText(), offset, jsx);
  if (!located) return undefined;

  let markdown: string;
  try {
    const explanation = explainRegex(located.pattern, located.flags);
    const source = `/${located.pattern}/${located.flags}`;
    markdown = renderExplanationMarkdown(source, explanation);
  } catch {
    return undefined;
  }

  const range = new vscode.Range(
    document.positionAt(located.range[0]),
    document.positionAt(located.range[1]),
  );
  const md = new vscode.MarkdownString(markdown);
  return new vscode.Hover(md, range);
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
  if (!parsed) {
    void vscode.window.showWarningMessage(
      'Regex Help: selection is not a valid regular expression.',
    );
    return;
  }

  let markdown: string;
  try {
    const explanation = explainRegex(parsed.pattern, parsed.flags);
    markdown = renderExplanationMarkdown(`/${parsed.pattern}/${parsed.flags}`, explanation);
  } catch {
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
