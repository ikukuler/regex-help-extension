import { describe, expect, it } from 'vitest';
import { generateExamples } from '../src/exampleGenerator';

describe('generateExamples', () => {
  it('generates strings that actually match the pattern', () => {
    const pattern = '^[a-z]{3,5}@(mail|inbox)\\.com$';
    const examples = generateExamples(pattern, '');
    expect(examples.length).toBeGreaterThan(0);
    for (const example of examples) {
      expect(example).toMatch(new RegExp(pattern));
    }
  });

  it('returns distinct examples', () => {
    const examples = generateExamples('\\d{5}', '');
    expect(new Set(examples).size).toBe(examples.length);
  });

  it('respects the count limit', () => {
    const examples = generateExamples('[a-z]+', '', 2);
    expect(examples.length).toBeLessThanOrEqual(2);
  });

  it('verifies matches even when the g flag is present', () => {
    // A stateful global regex would make .test() flaky; flags g/y are dropped.
    const examples = generateExamples('^abc$', 'g');
    expect(examples).toEqual(['abc']);
  });

  it('returns empty for invalid patterns', () => {
    expect(generateExamples('(', '')).toEqual([]);
  });

  it('never returns empty-string or control-character examples', () => {
    const examples = generateExamples('a*', '');
    for (const example of examples) {
      expect(example.length).toBeGreaterThan(0);
      expect(example).not.toMatch(/[\u0000-\u001f]/);
    }
  });

  it('handles fixed literal patterns', () => {
    expect(generateExamples('hello', '')).toEqual(['hello']);
  });

  it('supports named groups (which randexp itself cannot parse)', () => {
    const pattern = '^(?<user>[a-z]{2,4})@mail\\.com$';
    const examples = generateExamples(pattern, '');
    expect(examples.length).toBeGreaterThan(0);
    for (const example of examples) {
      expect(example).toMatch(new RegExp(pattern));
    }
  });

  it('supports named backreferences', () => {
    const pattern = '(?<w>[ab]{3})-\\k<w>';
    const examples = generateExamples(pattern, '');
    expect(examples.length).toBeGreaterThan(0);
    for (const example of examples) {
      expect(example).toMatch(new RegExp(pattern));
    }
  });
});
