import { parse, TSESTree } from '@typescript-eslint/typescript-estree';

export interface LocatedRegex {
  pattern: string;
  flags: string;
  /** Zero-based [start, end) offsets of the whole literal in the source. */
  range: [number, number];
}

/**
 * Parses JS/TS source into an AST suitable for findRegexInProgram.
 * Returns undefined when the file doesn't parse.
 */
export function parseProgram(
  sourceText: string,
  jsx: boolean,
): TSESTree.Program | undefined {
  try {
    return parse(sourceText, {
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
}

/**
 * Finds the regex literal that contains the given source offset. Because the
 * search runs over a full JS/TS parse, division (`a / b / c`) is never
 * mistaken for a regex.
 */
export function findRegexInProgram(
  ast: TSESTree.Program,
  offset: number,
): LocatedRegex | undefined {
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

/** Collects every regex literal in the program, in source order. */
export function findAllRegexes(ast: TSESTree.Program): LocatedRegex[] {
  const results: LocatedRegex[] = [];

  const visit = (node: TSESTree.Node): void => {
    if (node.type === 'Literal' && 'regex' in node && node.regex) {
      results.push({
        pattern: node.regex.pattern,
        flags: node.regex.flags,
        range: [node.range[0], node.range[1]],
      });
      return;
    }
    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const value = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (const item of value) {
          if (isNode(item)) visit(item);
        }
      } else if (isNode(value)) {
        visit(value);
      }
    }
  };

  visit(ast);
  return results;
}

/** Convenience wrapper: parse + locate in one call (used by tests). */
export function findRegexAtOffset(
  sourceText: string,
  offset: number,
  jsx: boolean,
): LocatedRegex | undefined {
  const ast = parseProgram(sourceText, jsx);
  return ast ? findRegexInProgram(ast, offset) : undefined;
}

function isNode(value: unknown): value is TSESTree.Node {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string' &&
    Array.isArray((value as { range?: unknown }).range)
  );
}
