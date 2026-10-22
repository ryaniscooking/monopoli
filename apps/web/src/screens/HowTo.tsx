import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Button } from '../components/ui';
import { useUi } from '../store/ui';
import { en } from '../strings/en';
import rulesMd from '../../../../docs/RULES.md?raw';
import { parseRules } from './rules';

// How to Play (spec 12.1.7), rendered from docs/RULES.md (see ./rules.ts for the format).

function inline(text: string): ReactNode {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      ),
    );
}

export function HowTo() {
  const go = useUi((s) => s.go);
  const sections = useMemo(() => parseRules(rulesMd), []);
  const [open, setOpen] = useState(0);
  const section = sections[open];
  return (
    <div className="safe flex h-full justify-center bg-primary text-white">
      <div className="flex min-h-0 w-[min(860px,94vw)] flex-col gap-2 py-2">
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" onClick={() => go('home')}>
            {en.settings.back}
          </Button>
          <div className="text-lg font-bold">{en.home.howTo}</div>
        </div>
        <div className="flex min-h-0 flex-1 gap-2">
          <nav className="scroll-y flex w-44 shrink-0 flex-col gap-1" data-testid="howto-nav">
            {sections.map((s, i) => (
              <button
                key={s.title}
                onClick={() => setOpen(i)}
                className={`rounded-lg px-2 py-1.5 text-left text-[13px] ${
                  i === open ? 'bg-accent font-semibold text-ink' : 'bg-white/10'
                }`}
              >
                {s.title}
              </button>
            ))}
          </nav>
          {section && (
            <article
              data-testid="howto-section"
              className="scroll-y min-w-0 flex-1 rounded-xl bg-tile p-3 text-sm leading-snug text-ink"
            >
              <h2 className="mb-2 text-base font-bold text-primary">{section.title}</h2>
              {section.blocks.map((b, i) =>
                b.kind === 'ul' ? (
                  <ul key={i} className="mb-2 list-disc space-y-1 pl-5">
                    {b.lines.map((l, j) => (
                      <li key={j}>{inline(l)}</li>
                    ))}
                  </ul>
                ) : (
                  <p key={i} className="mb-2">
                    {inline(b.lines.join(' '))}
                  </p>
                ),
              )}
            </article>
          )}
        </div>
      </div>
    </div>
  );
}
