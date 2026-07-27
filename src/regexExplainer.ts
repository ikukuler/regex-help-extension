import { RegExpParser } from '@eslint-community/regexpp';
import type {
  Alternative,
  Assertion,
  Backreference,
  CapturingGroup,
  Character,
  CharacterClass,
  CharacterClassElement,
  CharacterClassRange,
  CharacterSet,
  ClassIntersection,
  ClassStringDisjunction,
  ClassSubtraction,
  Element,
  ExpressionCharacterClass,
  Flags,
  Group,
  LookaroundAssertion,
  Pattern,
  Quantifier,
} from '@eslint-community/regexpp/ast';

export interface ExplanationNode {
  /** Raw regex fragment, shown as inline code. */
  code: string;
  /** Human-readable description of the fragment. */
  text: string;
  children: ExplanationNode[];
}

export interface RegexExplanation {
  summary: string;
  flags: { code: string; text: string }[];
  breakdown: ExplanationNode[];
}


const EXAMPLE_REGEX = /^(?<user>[a-z0-9._]+)@([\w-]+\.)+[a-z]{2,}$/;
const FLAG_DESCRIPTIONS: Record<string, string> = {
  g: 'global — find all matches, not just the first',
  i: 'case-insensitive',
  m: 'multiline — `^` and `$` match at line breaks',
  s: 'dotAll — `.` also matches newlines',
  u: 'unicode — treat pattern as a sequence of Unicode code points',
  y: 'sticky — match only from lastIndex',
  d: 'indices — capture groups record start/end offsets',
  v: 'unicodeSets — extended character class syntax',
};

const CONTROL_CHAR_NAMES: Record<number, string> = {
  0x00: 'NUL (null character)',
  0x09: 'tab',
  0x0a: 'newline',
  0x0b: 'vertical tab',
  0x0c: 'form feed',
  0x0d: 'carriage return',
  0x20: 'space',
};

/**
 * Parses a regex literal's pattern + flags and produces a structured
 * explanation. Throws if the pattern is not valid ES2024 regex syntax.
 */
export function explainRegex(pattern: string, flags: string): RegexExplanation {
  const parser = new RegExpParser();
  const flagsAst = parser.parseFlags(flags);
  const patternAst = parser.parsePattern(pattern, undefined, undefined, {
    unicode: flagsAst.unicode,
    unicodeSets: flagsAst.unicodeSets,
  });

  return {
    summary: summarize(patternAst, flagsAst),
    flags: describeFlags(flagsAst),
    breakdown: explainAlternatives(patternAst.alternatives),
  };
}

function describeFlags(flags: Flags): { code: string; text: string }[] {
  return [...flags.raw].map((f) => ({
    code: f,
    text: FLAG_DESCRIPTIONS[f] ?? 'unknown flag',
  }));
}

function summarize(pattern: Pattern, flags: Flags): string {
  const alts = pattern.alternatives;
  const body =
    alts.length === 1
      ? shortDescribeAlternative(alts[0])
      : alts.map((a) => shortDescribeAlternative(a)).join(' OR ');

  let summary = `Matches ${body}`;
  const notes: string[] = [];
  if (flags.ignoreCase) notes.push('case-insensitively');
  if (flags.global) notes.push('all occurrences');
  if (notes.length > 0) summary += ` (${notes.join(', ')})`;
  return summary;
}

function shortDescribeAlternative(alt: Alternative): string {
  if (alt.elements.length === 0) return 'an empty string';
  const parts = alt.elements.map((el) => shortDescribe(el));
  return joinParts(parts);
}

function joinParts(parts: string[]): string {
  const filtered = parts.filter((p) => p.length > 0);
  if (filtered.length === 0) return 'an empty string';
  return filtered.join(', then ');
}

function shortDescribe(el: Element): string {
  switch (el.type) {
    case 'Character':
      return describeLiteralRun(el);
    case 'CharacterSet':
      return describeCharacterSet(el, false);
    case 'CharacterClass':
      return describeCharacterClassShort(el);
    case 'ExpressionCharacterClass':
      return `a character matching \`${el.raw}\``;
    case 'Quantifier':
      return `${shortDescribe(el.element)} ${quantifierPhrase(el)}`;
    case 'CapturingGroup':
      return el.name
        ? `a group "${el.name}" (${groupContents(el)})`
        : `a group (${groupContents(el)})`;
    case 'Group':
      return groupContents(el);
    case 'Assertion':
      return describeAssertionShort(el);
    case 'Backreference':
      return typeof el.ref === 'string'
        ? `the same text as group "${el.ref}"`
        : `the same text as group #${el.ref}`;
    default:
      return `\`${(el as Element).raw}\``;
  }
}

function groupContents(group: Group | CapturingGroup): string {
  return group.alternatives.map((a) => shortDescribeAlternative(a)).join(' OR ');
}

function describeLiteralRun(ch: Character): string {
  return `"${printableChar(ch)}"`;
}

function describeAssertionShort(a: Assertion): string {
  switch (a.kind) {
    case 'start':
      return 'start of string/line';
    case 'end':
      return 'end of string/line';
    case 'word':
      return a.negate ? 'a non-word-boundary' : 'a word boundary';
    case 'lookahead':
      return a.negate
        ? `(not followed by ${lookaroundContents(a)})`
        : `(followed by ${lookaroundContents(a)})`;
    case 'lookbehind':
      return a.negate
        ? `(not preceded by ${lookaroundContents(a)})`
        : `(preceded by ${lookaroundContents(a)})`;
  }
}

function lookaroundContents(a: LookaroundAssertion): string {
  return a.alternatives.map((alt) => shortDescribeAlternative(alt)).join(' OR ');
}

function describeCharacterClassShort(cc: CharacterClass): string {
  const inner = cc.elements.map((e) => describeClassElement(e)).join(', ');
  return cc.negate ? `any character except ${inner}` : `one of: ${inner}`;
}

function quantifierPhrase(q: Quantifier): string {
  let phrase: string;
  if (q.min === 0 && q.max === Infinity) phrase = 'zero or more times';
  else if (q.min === 1 && q.max === Infinity) phrase = 'one or more times';
  else if (q.min === 0 && q.max === 1) phrase = '(optional)';
  else if (q.min === q.max) phrase = `exactly ${q.min} time${q.min === 1 ? '' : 's'}`;
  else if (q.max === Infinity) phrase = `${q.min} or more times`;
  else phrase = `between ${q.min} and ${q.max} times`;
  if (!q.greedy) phrase += ' (lazy — as few as possible)';
  return phrase;
}

// ---------------------------------------------------------------------------
// Detailed recursive breakdown
// ---------------------------------------------------------------------------

function explainAlternatives(alts: Alternative[]): ExplanationNode[] {
  if (alts.length === 1) {
    return explainAlternativeElements(alts[0]);
  }
  return alts.map((alt) => ({
    code: alt.raw || '(empty)',
    text: 'alternative:',
    children: explainAlternativeElements(alt),
  }));
}

function explainAlternativeElements(alt: Alternative): ExplanationNode[] {
  const nodes: ExplanationNode[] = [];
  let literalRun: Character[] = [];

  const flushRun = () => {
    if (literalRun.length === 0) return;
    const raw = literalRun.map((c) => c.raw).join('');
    const text =
      literalRun.length === 1
        ? `matches the character ${charName(literalRun[0])}`
        : `matches the literal text "${literalRun.map((c) => printableChar(c)).join('')}"`;
    nodes.push({ code: raw, text, children: [] });
    literalRun = [];
  };

  for (const el of alt.elements) {
    if (el.type === 'Character') {
      literalRun.push(el);
    } else {
      flushRun();
      nodes.push(explainElement(el));
    }
  }
  flushRun();

  if (nodes.length === 0) {
    nodes.push({ code: '(empty)', text: 'matches an empty string', children: [] });
  }
  return nodes;
}

function explainElement(el: Element): ExplanationNode {
  switch (el.type) {
    case 'Character':
      return {
        code: el.raw,
        text: `matches the character ${charName(el)}`,
        children: [],
      };
    case 'CharacterSet':
      return { code: el.raw, text: describeCharacterSet(el, true), children: [] };
    case 'CharacterClass':
      return explainCharacterClass(el);
    case 'ExpressionCharacterClass':
      return explainExpressionCharacterClass(el);
    case 'Quantifier':
      return explainQuantifier(el);
    case 'CapturingGroup':
      return explainCapturingGroup(el);
    case 'Group':
      return {
        code: el.raw,
        text: 'non-capturing group:',
        children: explainAlternatives(el.alternatives),
      };
    case 'Assertion':
      return explainAssertion(el);
    case 'Backreference':
      return {
        code: el.raw,
        text:
          typeof el.ref === 'string'
            ? `matches the same text as the named group "${el.ref}"`
            : `matches the same text as capturing group #${el.ref}`,
        children: [],
      };
  }
}

function explainQuantifier(q: Quantifier): ExplanationNode {
  const inner = explainElement(q.element);
  return {
    code: q.raw,
    text: `${quantifierPhrase(q)}:`,
    children: [inner],
  };
}

function explainCapturingGroup(g: CapturingGroup): ExplanationNode {
  const label = g.name
    ? `capturing group "${g.name}":`
    : 'capturing group:';
  return { code: g.raw, text: label, children: explainAlternatives(g.alternatives) };
}

function explainAssertion(a: Assertion): ExplanationNode {
  switch (a.kind) {
    case 'start':
      return {
        code: a.raw,
        text: 'asserts position at the start of the string (or line, with `m` flag)',
        children: [],
      };
    case 'end':
      return {
        code: a.raw,
        text: 'asserts position at the end of the string (or line, with `m` flag)',
        children: [],
      };
    case 'word':
      return {
        code: a.raw,
        text: a.negate
          ? 'asserts position is NOT at a word boundary'
          : 'asserts position at a word boundary',
        children: [],
      };
    case 'lookahead':
      return {
        code: a.raw,
        text: a.negate
          ? 'negative lookahead — the following must NOT come next (not consumed):'
          : 'positive lookahead — the following must come next (not consumed):',
        children: explainAlternatives(a.alternatives),
      };
    case 'lookbehind':
      return {
        code: a.raw,
        text: a.negate
          ? 'negative lookbehind — the following must NOT come before (not consumed):'
          : 'positive lookbehind — the following must come before (not consumed):',
        children: explainAlternatives(a.alternatives),
      };
  }
}

function explainCharacterClass(cc: CharacterClass): ExplanationNode {
  const label = cc.negate
    ? 'matches any character NOT in this set:'
    : 'matches any character in this set:';
  return {
    code: cc.raw,
    text: label,
    children: cc.elements.map((e) => explainClassElementNode(e)),
  };
}

function explainExpressionCharacterClass(cc: ExpressionCharacterClass): ExplanationNode {
  const label = cc.negate
    ? 'matches any character NOT matching this class expression:'
    : 'matches any character matching this class expression:';
  return {
    code: cc.raw,
    text: label,
    children: [explainClassSetExpression(cc.expression)],
  };
}

function explainClassSetExpression(
  expr: ClassIntersection | ClassSubtraction,
): ExplanationNode {
  if (expr.type === 'ClassIntersection') {
    return {
      code: expr.raw,
      text: 'intersection — a character must match both sides:',
      children: [classOperandNode(expr.left), classOperandNode(expr.right)],
    };
  }
  return {
    code: expr.raw,
    text: 'subtraction — matches the left side except the right side:',
    children: [classOperandNode(expr.left), classOperandNode(expr.right)],
  };
}

function classOperandNode(
  operand:
    | ClassIntersection
    | ClassSubtraction
    | CharacterClassElement,
): ExplanationNode {
  if (operand.type === 'ClassIntersection' || operand.type === 'ClassSubtraction') {
    return explainClassSetExpression(operand);
  }
  return explainClassElementNode(operand);
}

function explainClassElementNode(el: CharacterClassElement): ExplanationNode {
  switch (el.type) {
    case 'Character':
      return { code: el.raw, text: `the character ${charName(el)}`, children: [] };
    case 'CharacterClassRange':
      return {
        code: el.raw,
        text: `a character in the range ${printableChar(el.min)}–${printableChar(el.max)}`,
        children: [],
      };
    case 'CharacterSet':
      return { code: el.raw, text: describeCharacterSet(el, false), children: [] };
    case 'CharacterClass':
      return explainCharacterClass(el);
    case 'ExpressionCharacterClass':
      return explainExpressionCharacterClass(el);
    case 'ClassStringDisjunction':
      return explainClassStringDisjunction(el);
  }
}

function explainClassStringDisjunction(d: ClassStringDisjunction): ExplanationNode {
  return {
    code: d.raw,
    text: 'one of these strings:',
    children: d.alternatives.map((alt) => ({
      code: alt.raw || '(empty)',
      text: `"${alt.elements.map((c) => printableChar(c)).join('')}"`,
      children: [],
    })),
  };
}

function describeClassElement(el: CharacterClassElement): string {
  switch (el.type) {
    case 'Character':
      return `"${printableChar(el)}"`;
    case 'CharacterClassRange':
      return `${printableChar(el.min)}–${printableChar(el.max)}`;
    case 'CharacterSet':
      return describeCharacterSet(el, false);
    case 'CharacterClass':
      return describeCharacterClassShort(el);
    case 'ExpressionCharacterClass':
      return `a character matching \`${el.raw}\``;
    case 'ClassStringDisjunction':
      return `one of the strings \`${el.raw}\``;
  }
}

function describeCharacterSet(set: CharacterSet, verbose: boolean): string {
  const prefix = verbose ? 'matches ' : '';
  switch (set.kind) {
    case 'any':
      return `${prefix}any character${verbose ? ' (except newlines, unless `s` flag is set)' : ''}`;
    case 'digit':
      return set.negate ? `${prefix}any non-digit` : `${prefix}a digit (0–9)`;
    case 'space':
      return set.negate
        ? `${prefix}any non-whitespace character`
        : `${prefix}a whitespace character`;
    case 'word':
      return set.negate
        ? `${prefix}any non-word character`
        : `${prefix}a word character (letter, digit or underscore)`;
    case 'property': {
      const name =
        set.value === null
          ? set.key
          : set.key === 'General_Category'
            ? set.value
            : `${set.key}=${set.value}`;
      if (set.strings) {
        return `${prefix}a string with the Unicode property "${name}"`;
      }
      return set.negate
        ? `${prefix}any character without the Unicode property "${name}"`
        : `${prefix}a character with the Unicode property "${name}"`;
    }
  }
}

function charName(ch: Character): string {
  const special = CONTROL_CHAR_NAMES[ch.value];
  if (special) return special;
  if (ch.value < 0x20 || (ch.value >= 0x7f && ch.value < 0xa0)) {
    return `U+${ch.value.toString(16).toUpperCase().padStart(4, '0')}`;
  }
  return `"${String.fromCodePoint(ch.value)}"`;
}

function printableChar(ch: Character): string {
  const special = CONTROL_CHAR_NAMES[ch.value];
  if (special && ch.value !== 0x20) return `<${special}>`;
  if (ch.value < 0x20 || (ch.value >= 0x7f && ch.value < 0xa0)) {
    return `U+${ch.value.toString(16).toUpperCase().padStart(4, '0')}`;
  }
  return String.fromCodePoint(ch.value);
}
