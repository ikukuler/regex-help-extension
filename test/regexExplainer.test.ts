import { describe, expect, it } from 'vitest';
import { explainRegex, ExplanationNode } from '../src/regexExplainer';
import { renderExplanationMarkdown } from '../src/explanationRenderer';

function flatten(nodes: ExplanationNode[]): ExplanationNode[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)]);
}

function allTexts(pattern: string, flags = ''): string[] {
  return flatten(explainRegex(pattern, flags).breakdown).map((n) => n.text);
}

describe('explainRegex', () => {
  it('explains literal text', () => {
    const e = explainRegex('abc', '');
    expect(e.breakdown).toHaveLength(1);
    expect(e.breakdown[0].text).toContain('literal text "abc"');
  });

  it('explains anchors', () => {
    const texts = allTexts('^a$');
    expect(texts.some((t) => t.includes('start of the string'))).toBe(true);
    expect(texts.some((t) => t.includes('end of the string'))).toBe(true);
  });

  it('explains character classes with ranges and negation', () => {
    const texts = allTexts('[a-z0-9]');
    expect(texts.some((t) => t.includes('any character in this set'))).toBe(true);
    expect(texts.some((t) => t.includes('range a–z'))).toBe(true);

    const negated = allTexts('[^abc]');
    expect(negated.some((t) => t.includes('NOT in this set'))).toBe(true);
  });

  it('explains predefined character sets', () => {
    expect(allTexts('\\d').join()).toContain('digit');
    expect(allTexts('\\D').join()).toContain('non-digit');
    expect(allTexts('\\w').join()).toContain('word character');
    expect(allTexts('\\s').join()).toContain('whitespace');
    expect(allTexts('.').join()).toContain('any character');
  });

  it('explains quantifiers', () => {
    expect(allTexts('a*').join()).toContain('zero or more times');
    expect(allTexts('a+').join()).toContain('one or more times');
    expect(allTexts('a?').join()).toContain('optional');
    expect(allTexts('a{3}').join()).toContain('exactly 3 times');
    expect(allTexts('a{2,}').join()).toContain('2 or more times');
    expect(allTexts('a{2,5}').join()).toContain('between 2 and 5 times');
  });

  it('marks lazy quantifiers', () => {
    expect(allTexts('a+?').join()).toContain('lazy');
  });

  it('explains capturing, named and non-capturing groups', () => {
    expect(allTexts('(a)').join()).toContain('capturing group:');
    expect(allTexts('(?<year>\\d{4})').join()).toContain('capturing group "year"');
    expect(allTexts('(?:a)').join()).toContain('non-capturing group');
  });

  it('explains alternation', () => {
    const e = explainRegex('cat|dog', '');
    expect(e.breakdown).toHaveLength(2);
    expect(e.breakdown[0].text).toBe('alternative:');
    expect(e.summary).toContain('OR');
  });

  it('explains backreferences', () => {
    expect(allTexts('(a)\\1').join()).toContain('capturing group #1');
    expect(allTexts('(?<x>a)\\k<x>').join()).toContain('named group "x"');
  });

  it('explains lookaround', () => {
    expect(allTexts('a(?=b)').join()).toContain('positive lookahead');
    expect(allTexts('a(?!b)').join()).toContain('negative lookahead');
    expect(allTexts('(?<=b)a').join()).toContain('positive lookbehind');
    expect(allTexts('(?<!b)a').join()).toContain('negative lookbehind');
  });

  it('explains word boundaries', () => {
    expect(allTexts('\\bword\\b').join()).toContain('word boundary');
    expect(allTexts('\\Ba').join()).toContain('NOT at a word boundary');
  });

  it('explains unicode property escapes', () => {
    const texts = allTexts('\\p{Letter}', 'u');
    expect(texts.join()).toContain('Unicode property "Letter"');
  });

  it('explains v-flag class set expressions', () => {
    const sub = allTexts('[\\p{Letter}--[a-z]]', 'v');
    expect(sub.join()).toContain('subtraction');

    const inter = allTexts('[\\p{Letter}&&\\p{ASCII}]', 'v');
    expect(inter.join()).toContain('intersection');
  });

  it('describes all flags', () => {
    const e = explainRegex('a', 'gimsy');
    const codes = e.flags.map((f) => f.code);
    expect(codes).toEqual(['g', 'i', 'm', 's', 'y']);
    expect(e.flags.every((f) => f.text !== 'unknown flag')).toBe(true);
  });

  it('mentions case-insensitivity in the summary when i flag is set', () => {
    expect(explainRegex('a', 'i').summary).toContain('case-insensitively');
  });

  it('names control characters instead of printing them', () => {
    expect(allTexts('\\n').join()).toContain('newline');
    expect(allTexts('\\t').join()).toContain('tab');
  });

  it('throws on invalid patterns', () => {
    expect(() => explainRegex('(', '')).toThrow();
    expect(() => explainRegex('a{2,1}', '')).toThrow();
  });

  it('throws on invalid flags', () => {
    expect(() => explainRegex('a', 'q')).toThrow();
  });
});

describe('renderExplanationMarkdown', () => {
  it('renders summary, breakdown and flags sections', () => {
    const e = explainRegex('^a+$', 'g');
    const md = renderExplanationMarkdown('/^a+$/g', e);
    expect(md).toContain('**Regex** `/^a+$/g`');
    expect(md).toContain('**Breakdown**');
    expect(md).toContain('**Flags**');
    expect(md).toContain('- `g` —');
  });

  it('indents nested nodes', () => {
    const e = explainRegex('(a+)', '');
    const md = renderExplanationMarkdown('/(a+)/', e);
    const lines = md.split('\n');
    const groupLine = lines.findIndex((l) => l.includes('capturing group'));
    expect(lines[groupLine + 1].startsWith('  -')).toBe(true);
  });
});
