import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseRules } from './rules';

describe('How to Play parser', () => {
  it('splits sections, paragraphs and bullet lists', () => {
    const md = 'note\n\n## A\n\nOne\nline two\n\n- x\n- y\nAfter\n\n## B\n- z\n';
    expect(parseRules(md)).toEqual([
      {
        title: 'A',
        blocks: [
          { kind: 'p', lines: ['One', 'line two'] },
          { kind: 'ul', lines: ['x', 'y'] },
          { kind: 'p', lines: ['After'] },
        ],
      },
      { title: 'B', blocks: [{ kind: 'ul', lines: ['z'] }] },
    ]);
  });

  it('docs/RULES.md has sections, each with content', () => {
    const sections = parseRules(
      readFileSync(new URL('../../../../docs/RULES.md', import.meta.url), 'utf8'),
    );
    expect(sections.length).toBeGreaterThan(8);
    for (const s of sections) expect(s.blocks.length).toBeGreaterThan(0);
  });
});
