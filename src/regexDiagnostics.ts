import { RegExpParser, visitRegExpAST } from '@eslint-community/regexpp';
import type {
  Character,
  CharacterClass,
  Node,
  Quantifier,
} from '@eslint-community/regexpp/ast';

export type FindingKind = 'redos' | 'empty-class' | 'match-all-class' | 'useless-escape';

export interface RegexFinding {
  kind: FindingKind;
  severity: 'warning' | 'information' | 'hint';
  message: string;
  /** Zero-based [start, end) offsets relative to the pattern string. */
  start: number;
  end: number;
}

export interface DiagnosticOptions {
  redos: boolean;
  emptyClass: boolean;
  uselessEscape: boolean;
}

const ALL_CHECKS: DiagnosticOptions = {
  redos: true,
  emptyClass: true,
  uselessEscape: true,
};

/**
 * Analyzes a regex pattern for common hazards. Returns an empty list when the
 * pattern doesn't parse (same silent-skip policy as the hover provider).
 */
export function analyzePattern(
  pattern: string,
  flags: string,
  options: DiagnosticOptions = ALL_CHECKS,
): RegexFinding[] {
  const parser = new RegExpParser();
  let ast;
  try {
    const flagsAst = parser.parseFlags(flags.replace(/[gy]/g, ''));
    ast = parser.parsePattern(pattern, undefined, undefined, {
      unicode: flagsAst.unicode,
      unicodeSets: flagsAst.unicodeSets,
    });
  } catch {
    return [];
  }

  const findings: RegexFinding[] = [];

  visitRegExpAST(ast, {
    onQuantifierEnter(node) {
      if (options.redos) checkNestedQuantifier(node, findings);
    },
    onCharacterClassEnter(node) {
      if (options.emptyClass) checkEmptyClass(node, findings);
    },
    onCharacterEnter(node) {
      if (options.uselessEscape) checkUselessEscape(node, findings);
    },
  });

  return findings;
}

// ---------------------------------------------------------------------------
// ReDoS: unbounded quantifier nested inside another unbounded quantifier
// (star height ≥ 2), e.g. (a+)+, (\d*)*, (?:[a-z]+)* — exponential
// backtracking on non-matching input.
// ---------------------------------------------------------------------------

function checkNestedQuantifier(node: Quantifier, findings: RegexFinding[]): void {
  if (!isUnbounded(node)) return;

  const inner = findUnboundedInner(node.element);
  if (!inner) return;

  findings.push({
    kind: 'redos',
    severity: 'warning',
    message:
      `Potential catastrophic backtracking (ReDoS): unbounded quantifier ` +
      `\`${inner.raw}\` is nested inside \`${node.raw}\`. On non-matching input ` +
      `the regex engine may explore exponentially many ways to split the text. ` +
      `Consider making the inner pattern bounded or unambiguous.`,
    start: node.start,
    end: node.end,
  });
}

function isUnbounded(q: Quantifier): boolean {
  return q.max === Infinity;
}

/** Depth-first search for an unbounded quantifier within an element subtree. */
function findUnboundedInner(root: Node): Quantifier | undefined {
  let found: Quantifier | undefined;
  visitRegExpAST(root, {
    onQuantifierEnter(q) {
      if (!found && isUnbounded(q)) found = q;
    },
  });
  // A quantifier's element can never itself be a Quantifier in the ES regex
  // grammar, so any quantifier found here is genuinely nested below `root`.
  return found;
}

// ---------------------------------------------------------------------------
// Empty character classes
// ---------------------------------------------------------------------------

function checkEmptyClass(node: CharacterClass, findings: RegexFinding[]): void {
  if (node.elements.length !== 0) return;

  if (node.negate) {
    findings.push({
      kind: 'match-all-class',
      severity: 'information',
      message:
        '`[^]` matches every character including newlines. If that is not ' +
        'intentional, use `.` (with the `s` flag for newlines) or `[\\s\\S]` ' +
        'to make the intent explicit.',
      start: node.start,
      end: node.end,
    });
  } else {
    findings.push({
      kind: 'empty-class',
      severity: 'warning',
      message:
        '`[]` never matches any character, so this regex can never match. ' +
        'This is almost certainly a bug.',
      start: node.start,
      end: node.end,
    });
  }
}

// ---------------------------------------------------------------------------
// Useless escapes: identity escapes of characters that are not special in
// their context, e.g. \- outside a class or [\.] inside one. (In unicode
// mode these are syntax errors, so this check only fires without u/v flags.)
// ---------------------------------------------------------------------------

const SPECIAL_OUTSIDE_CLASS = new Set([...'^$\\.*+?()[]{}|/']);
const SPECIAL_INSIDE_CLASS = new Set([...'\\]^-/']);

function checkUselessEscape(node: Character, findings: RegexFinding[]): void {
  if (node.raw.length !== 2 || node.raw[0] !== '\\') return;
  const escaped = node.raw[1];
  // Not an identity escape (e.g. \n, \t map to different code points).
  if (escaped.codePointAt(0) !== node.value) return;

  const insideClass = isInsideCharacterClass(node);
  const special = insideClass ? SPECIAL_INSIDE_CLASS : SPECIAL_OUTSIDE_CLASS;
  if (special.has(escaped)) return;

  findings.push({
    kind: 'useless-escape',
    severity: 'hint',
    message: `Useless escape: \`\\${escaped}\` is the same as \`${escaped}\` ${
      insideClass ? 'inside a character class' : 'here'
    }.`,
    start: node.start,
    end: node.end,
  });
}

function isInsideCharacterClass(node: Character): boolean {
  let current: Node | null = node.parent;
  while (current) {
    if (current.type === 'CharacterClass') return true;
    current = (current as { parent?: Node | null }).parent ?? null;
  }
  return false;
}
