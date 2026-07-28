import * as assert from 'assert';
import * as vscode from 'vscode';

const FIXTURE = [
  'const re = /^[a-z]+\\d{2}$/i;',
  'const division = 10 / 2 / 1;',
  'const evil = /(a+)+$/;',
].join('\n');

async function getHovers(
  doc: vscode.TextDocument,
  position: vscode.Position,
): Promise<vscode.Hover[]> {
  return vscode.commands.executeCommand<vscode.Hover[]>(
    'vscode.executeHoverProvider',
    doc.uri,
    position,
  );
}

function hoverTexts(hovers: vscode.Hover[]): string {
  return hovers
    .flatMap((h) => h.contents)
    .map((c) => (typeof c === 'string' ? c : (c as vscode.MarkdownString).value))
    .join('\n');
}

describe('regex-help-extension', () => {
  let doc: vscode.TextDocument;

  before(async () => {
    doc = await vscode.workspace.openTextDocument({
      content: FIXTURE,
      language: 'javascript',
    });
    await vscode.window.showTextDocument(doc);
  });

  it('provides a hover over a regex literal', async () => {
    // Position inside `/^[a-z]+\d{2}$/i` on line 0.
    const position = new vscode.Position(0, 15);
    const hovers = await getHovers(doc, position);
    const text = hoverTexts(hovers);
    assert.ok(text.includes('Breakdown'), `expected regex hover, got: ${text}`);
    assert.ok(text.includes('case-insensitive'), 'expected flag description');
  });

  it('does not provide a regex hover over division', async () => {
    // Position inside `10 / 2 / 1` on line 1.
    const position = new vscode.Position(1, 22);
    const hovers = await getHovers(doc, position);
    const text = hoverTexts(hovers);
    assert.ok(!text.includes('Breakdown'), `unexpected regex hover: ${text}`);
  });

  it('reports a ReDoS diagnostic for /(a+)+$/', async () => {
    // Diagnostics are produced asynchronously after the document opens.
    const deadline = Date.now() + 10000;
    let diagnostics: vscode.Diagnostic[] = [];
    while (Date.now() < deadline) {
      diagnostics = vscode.languages
        .getDiagnostics(doc.uri)
        .filter((d) => d.source === 'Regex Help');
      if (diagnostics.length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.strictEqual(diagnostics.length, 1, 'expected one diagnostic');
    assert.strictEqual(diagnostics[0].code, 'redos');
    assert.strictEqual(diagnostics[0].range.start.line, 2);
    assert.ok(/catastrophic backtracking/i.test(diagnostics[0].message));
  });
});
