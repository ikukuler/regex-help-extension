import { RegExpParser, visitRegExpAST } from '@eslint-community/regexpp';
import RandExp from 'randexp';

const MAX_ATTEMPTS = 12;
const MAX_EXAMPLE_LENGTH = 60;

/**
 * Generates up to `count` distinct strings that provably match the pattern.
 * Every candidate is verified with RegExp.test(); constructs randexp can't
 * handle faithfully (e.g. lookbehind) simply yield no examples.
 */
export function generateExamples(pattern: string, flags: string, count = 3): string[] {
  let verifier: RegExp;
  let generator: RandExp;
  try {
    // Drop g/y so .test() checks from the start of the string every time.
    const verifyFlags = flags.replace(/[gy]/g, '');
    verifier = new RegExp(pattern, verifyFlags);
    // randexp doesn't understand named groups; generate from a de-named
    // pattern but always verify candidates against the original regex.
    generator = new RandExp(stripNamedGroups(pattern, flags), verifyFlags);
    generator.max = 4;
  } catch {
    return [];
  }

  const examples = new Set<string>();
  for (let i = 0; i < MAX_ATTEMPTS && examples.size < count; i++) {
    let candidate: string;
    try {
      candidate = generator.gen();
    } catch {
      return [];
    }
    if (candidate.length === 0 || candidate.length > MAX_EXAMPLE_LENGTH) continue;
    if (!isDisplayable(candidate)) continue;
    if (!verifier.test(candidate)) continue;
    examples.add(candidate);
  }
  return [...examples];
}

/**
 * Rewrites `(?<name>...)` to `(...)` and `\k<name>` to the equivalent
 * numbered backreference, producing a pattern randexp can consume.
 */
function stripNamedGroups(pattern: string, flags: string): string {
  if (!pattern.includes('(?<')) return pattern;

  const parser = new RegExpParser();
  const flagsAst = parser.parseFlags(flags.replace(/[gy]/g, ''));
  const ast = parser.parsePattern(pattern, undefined, undefined, {
    unicode: flagsAst.unicode,
    unicodeSets: flagsAst.unicodeSets,
  });

  const groupNumbers = new Map<string, number>();
  let groupCounter = 0;
  const splices: { start: number; end: number; replacement: string }[] = [];

  // First pass: number the groups (a \k<name> may precede its group).
  visitRegExpAST(ast, {
    onCapturingGroupEnter(group) {
      groupCounter += 1;
      if (group.name) {
        groupNumbers.set(group.name, groupCounter);
        // Replace the `(?<name>` opener with a plain `(`.
        splices.push({
          start: group.start,
          end: group.start + `(?<${group.name}>`.length,
          replacement: '(',
        });
      }
    },
  });
  // Second pass: rewrite named backreferences to numbered ones.
  visitRegExpAST(ast, {
    onBackreferenceEnter(ref) {
      if (typeof ref.ref === 'string') {
        const num = groupNumbers.get(ref.ref);
        if (num !== undefined) {
          splices.push({ start: ref.start, end: ref.end, replacement: `\\${num}` });
        }
      }
    },
  });

  let result = pattern;
  for (const { start, end, replacement } of splices.sort((a, b) => b.start - a.start)) {
    result = result.slice(0, start) + replacement + result.slice(end);
  }
  return result;
}

function isDisplayable(s: string): boolean {
  // Skip examples with control characters — they render poorly in hovers.
  // eslint-disable-next-line no-control-regex
  return !/[\u0000-\u001f\u007f-\u009f]/.test(s);
}
