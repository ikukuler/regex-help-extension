import { describe, expect, it } from 'vitest';
import { analyzePattern, RegexFinding } from '../src/regexDiagnostics';

function kinds(pattern: string, flags = ''): string[] {
  return analyzePattern(pattern, flags).map((f) => f.kind);
}

describe('analyzePattern — ReDoS', () => {
  it('flags nested unbounded quantifiers', () => {
    expect(kinds('(a+)+')).toContain('redos');
    expect(kinds('(a*)*')).toContain('redos');
    expect(kinds('(?:\\d+)*')).toContain('redos');
    expect(kinds('([a-z]*)+$')).toContain('redos');
  });

  it('flags the classic Stack Overflow outage shape', () => {
    // Trailing whitespace check: \s+$ inside an unbounded group.
    expect(kinds('^[\\s\\u200c]+|[\\s\\u200c]+$')).not.toContain('redos');
    expect(kinds('(\\s+)*$')).toContain('redos');
  });

  it('does not flag simple unbounded quantifiers', () => {
    expect(kinds('a+')).toEqual([]);
    expect(kinds('[a-z]*')).toEqual([]);
    expect(kinds('\\d+\\.\\d+')).toEqual([]);
  });

  it('does not flag bounded repetition', () => {
    expect(kinds('(a{2,5})+')).not.toContain('redos');
    expect(kinds('(a+){2,5}')).not.toContain('redos');
  });

  it('reports the range of the outer quantifier', () => {
    const findings = analyzePattern('x(a+)+y', '');
    const redos = findings.find((f) => f.kind === 'redos') as RegexFinding;
    expect(redos.start).toBe(1);
    expect(redos.end).toBe(6); // `(a+)+`
  });
});

describe('analyzePattern — empty classes', () => {
  it('warns that [] never matches', () => {
    const findings = analyzePattern('a[]b', '');
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe('empty-class');
    expect(findings[0].severity).toBe('warning');
  });

  it('informs about [^] matching everything', () => {
    const findings = analyzePattern('a[^]b', '');
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe('match-all-class');
    expect(findings[0].severity).toBe('information');
  });

  it('does not flag non-empty classes', () => {
    expect(kinds('[a]')).toEqual([]);
    expect(kinds('[^a]')).toEqual([]);
  });
});

describe('analyzePattern — useless escapes', () => {
  it('flags identity escapes of non-special characters', () => {
    expect(kinds('\\-\\d')).toContain('useless-escape');
    expect(kinds('[\\.]')).toContain('useless-escape');
    expect(kinds('\\ ')).toContain('useless-escape');
  });

  it('keeps meaningful escapes', () => {
    expect(kinds('\\.')).toEqual([]); // dot is special outside a class
    expect(kinds('[\\]]')).toEqual([]); // ] must be escaped inside a class
    expect(kinds('[a\\-z]')).toEqual([]); // escaped dash prevents a range
    expect(kinds('\\n\\t')).toEqual([]); // real control-character escapes
    expect(kinds('\\$\\^')).toEqual([]);
  });

  it('is skipped in unicode mode where such escapes are syntax errors', () => {
    expect(analyzePattern('\\-', 'u')).toEqual([]);
  });
});

describe('analyzePattern — options and robustness', () => {
  it('respects per-check toggles', () => {
    const findings = analyzePattern('(a+)+[]\\-', '', {
      redos: false,
      emptyClass: true,
      uselessEscape: false,
    });
    expect(findings.map((f) => f.kind)).toEqual(['empty-class']);
  });

  it('returns nothing for unparseable patterns', () => {
    expect(analyzePattern('(', '')).toEqual([]);
  });

  it('can report multiple findings with pattern-relative offsets', () => {
    const findings = analyzePattern('([]a+)+', '');
    const found = findings.map((f) => f.kind).sort();
    expect(found).toEqual(['empty-class', 'redos']);
    for (const f of findings) {
      expect(f.start).toBeGreaterThanOrEqual(0);
      expect(f.end).toBeLessThanOrEqual('([]a+)+'.length);
    }
  });
});
