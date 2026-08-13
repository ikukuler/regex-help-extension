import type { ExplanationNode, NodeCategory, RegexExplanation } from './regexExplainer';

/**
 * Mid-tone hues, picked to stay legible on both light and dark backgrounds —
 * hovers can't read the active theme's colors, so the palette is fixed.
 */
const CATEGORY_COLORS: Record<NodeCategory, string> = {
  group: '#b07fc7',
  quantifier: '#b3722f',
  class: '#2f8a72',
  anchor: '#2b8cc4',
  lookaround: '#7a86d6',
  backref: '#c25b7c',
  literal: '#8a8f98',
  other: '#8a8f98',
};

export interface RenderOptions {
  /**
   * Emit colored HTML fragments. Only for MarkdownString with `supportHtml`;
   * plain-text output (e.g. the Explain Regex document) must stay false.
   */
  colors?: boolean;
}

export function renderExplanationMarkdown(
  source: string,
  explanation: RegexExplanation,
  examples: string[] = [],
  options: RenderOptions = {},
): string {
  const lines: string[] = [];
  // A js fenced block gets the editor's own regex syntax colors, so the
  // pattern is highlighted exactly as it is in the code — and stays readable
  // in whatever color theme the user runs.
  lines.push('```js');
  lines.push(source);
  lines.push('```');
  lines.push('');
  lines.push(explanation.summary);
  lines.push('');

  if (examples.length > 0) {
    lines.push(
      `**Example matches**: ${examples.map((e) => `\`${escapeCode(e)}\``).join(', ')}`,
    );
    lines.push('');
  }

  if (explanation.breakdown.length > 0) {
    lines.push('**Breakdown**');
    lines.push('');
    for (const node of explanation.breakdown) {
      renderNode(node, 0, lines, options.colors === true);
    }
  }

  if (explanation.flags.length > 0) {
    lines.push('');
    lines.push('**Flags**');
    lines.push('');
    for (const flag of explanation.flags) {
      lines.push(`- \`${flag.code}\` — ${flag.text}`);
    }
  }

  return lines.join('\n');
}

function renderNode(
  node: ExplanationNode,
  depth: number,
  lines: string[],
  colors: boolean,
): void {
  const indent = '  '.repeat(depth);
  const fragment = colors
    ? colorCode(node.code, node.category)
    : `\`${escapeCode(node.code)}\``;
  lines.push(`${indent}- ${fragment} — ${node.text}`);
  for (const child of node.children) {
    renderNode(child, depth + 1, lines, colors);
  }
}

/**
 * Renders a regex fragment as colored monospace. Needs `supportHtml` on the
 * MarkdownString; without it VS Code strips the tags and the fragment still
 * reads fine, just uncolored.
 */
function colorCode(code: string, category: NodeCategory = 'other'): string {
  const color = CATEGORY_COLORS[category];
  return `<code><span style="color:${color};">${escapeHtml(code)}</span></code>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeCode(code: string): string {
  // Backticks inside inline code need a longer fence; regex rarely contains
  // backticks, so replace to keep rendering simple.
  return code.replace(/`/g, '‘');
}
