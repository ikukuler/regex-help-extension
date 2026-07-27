import type { ExplanationNode, RegexExplanation } from './regexExplainer';

export function renderExplanationMarkdown(
  source: string,
  explanation: RegexExplanation,
): string {
  const lines: string[] = [];
  lines.push(`**Regex** \`${source}\``);
  lines.push('');
  lines.push(explanation.summary);
  lines.push('');

  if (explanation.breakdown.length > 0) {
    lines.push('**Breakdown**');
    lines.push('');
    for (const node of explanation.breakdown) {
      renderNode(node, 0, lines);
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

function renderNode(node: ExplanationNode, depth: number, lines: string[]): void {
  const indent = '  '.repeat(depth);
  lines.push(`${indent}- \`${escapeCode(node.code)}\` — ${node.text}`);
  for (const child of node.children) {
    renderNode(child, depth + 1, lines);
  }
}

function escapeCode(code: string): string {
  // Backticks inside inline code need a longer fence; regex rarely contains
  // backticks, so replace to keep rendering simple.
  return code.replace(/`/g, '‘');
}
