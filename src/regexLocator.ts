import { parse, TSESTree } from '@typescript-eslint/typescript-estree';

export interface LocatedRegex {
  pattern: string;
  flags: string;
  /** Zero-based [start, end) offsets of the whole literal in the source. */
  range: [number, number];
}

/**
 * Finds the regex literal that contains the given source offset, using a full
 * JS/TS parse so that division (`a / b / c`) is never mistaken for a regex.
 * Returns undefined when the file doesn't parse or the offset isn't inside a
 * regex literal.
 */
export function findRegexAtOffset(
  sourceText: string,
  offset: number,
  jsx: boolean,
): LocatedRegex | undefined {
  let ast: TSESTree.Program;
  try {
    ast = parse(sourceText, {
      jsx,
      loc: false,
      range: true,
      errorOnUnknownASTType: false,
      allowInvalidAST: true,
      suppressDeprecatedPropertyWarnings: true,
    });
  } catch {
    return undefined;
  }

  let found: LocatedRegex | undefined;

  const visit = (node: TSESTree.Node): void => {
    if (found) return;
    const [start, end] = node.range;
    if (offset < start || offset >= end) return;

    if (node.type === 'Literal' && 'regex' in node && node.regex) {
      found = {
        pattern: node.regex.pattern,
        flags: node.regex.flags,
        range: [start, end],
      };
      return;
    }

    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const value = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (const item of value) {
          if (isNode(item)) visit(item);
          if (found) return;
        }
      } else if (isNode(value)) {
        visit(value);
        if (found) return;
      }
    }
  };

  visit(ast);
  return found;
}

function isNode(value: unknown): value is TSESTree.Node {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string' &&
    Array.isArray((value as { range?: unknown }).range)
  );
}
