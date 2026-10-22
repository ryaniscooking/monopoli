// Parser for docs/RULES.md. Only the small subset the file uses is understood: "## " sections,
// paragraphs, "- " bullets and **bold** (handled when rendering). Text before the first section
// is a note for editors and is not shown.

export interface Section {
  title: string;
  blocks: { kind: 'p' | 'ul'; lines: string[] }[];
}

export function parseRules(md: string): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('## ')) {
      current = { title: line.slice(3), blocks: [] };
      sections.push(current);
      continue;
    }
    if (!current) continue;
    if (line === '') {
      current.blocks.push({ kind: 'p', lines: [] });
      continue;
    }
    const kind = line.startsWith('- ') ? 'ul' : 'p';
    const text = kind === 'ul' ? line.slice(2) : line;
    const last = current.blocks.at(-1);
    if (last && last.kind === kind && (kind === 'ul' || last.lines.length > 0)) {
      last.lines.push(text);
    } else if (last && last.lines.length === 0) {
      last.kind = kind;
      last.lines.push(text);
    } else {
      current.blocks.push({ kind, lines: [text] });
    }
  }
  for (const s of sections) s.blocks = s.blocks.filter((b) => b.lines.length > 0);
  return sections;
}
