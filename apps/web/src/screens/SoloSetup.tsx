import { Minus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, SectionLabel } from '../components/ui';
import { applyTheme, getMap, MAPS } from '../game/maps';
import { saveStore } from '../game/saves';
import { newSoloGame } from '../game/session';
import { HouseRulesSheet } from './HouseRules';
import { useSetup, useUi } from '../store/ui';
import { en } from '../strings/en';
import { TokenIcon } from '../components/TokenIcon';

const s = en.setup;

export function SoloSetup() {
  const setup = useSetup();
  const go = useUi((st) => st.go);
  const map = getMap(MAPS[setup.mapId] ? setup.mapId : 'myanmar');
  const [hasSave, setHasSave] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  useEffect(() => {
    applyTheme(map);
    saveStore
      .list()
      .then((list) => setHasSave(list.some((x) => x.mapId === map.id)))
      .catch(() => setHasSave(false));
  }, [map]);

  const token = map.tokens.some((t) => t.id === setup.token) ? setup.token : map.tokens[0]?.id;
  const color =
    setup.color && map.theme.playerColors.includes(setup.color)
      ? setup.color
      : map.theme.playerColors[0];

  return (
    <div className="safe flex h-full gap-3 bg-primary text-white">
      <div className="flex w-[38%] flex-col gap-2">
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => go('home')}>
            {s.back}
          </Button>
          <div className="text-lg font-bold">{s.title}</div>
        </div>
        <SectionLabel>{s.map}</SectionLabel>
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
          {Object.values(MAPS).map((m) => {
            const active = m.id === map.id;
            return (
              <button
                key={m.id}
                data-testid={`map-${m.id}`}
                onClick={() => setup.update({ mapId: m.id })}
                className={`flex flex-col justify-between rounded-xl p-2 text-left transition-transform active:scale-[0.98] ${
                  active ? 'ring-4 ring-accent' : 'opacity-80'
                }`}
                style={{ background: m.theme.primary, border: `3px solid ${m.theme.boardBg}` }}
              >
                <div className="flex gap-1">
                  {(['red', 'yellow', 'green', 'darkblue'] as const).map((g) => (
                    <span
                      key={g}
                      className="h-2 flex-1 rounded-sm"
                      style={{ background: m.theme.groupColors[g] }}
                    />
                  ))}
                </div>
                <div>
                  <div className="text-xl font-black" style={{ color: m.theme.boardBg }}>
                    {m.name}
                  </div>
                  <div className="text-xs opacity-80" style={{ color: m.theme.boardBg }}>
                    {m.currency.code}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <Button
            data-testid="start-game"
            className="w-full text-base"
            onClick={() =>
              newSoloGame({ ...setup, mapId: map.id, token: token ?? null, color: color ?? null })
            }
          >
            {s.start}
          </Button>
          {hasSave && <span className="text-[11px] leading-tight opacity-80">{s.replaceSave}</span>}
        </div>
      </div>

      <div className="scroll-y flex min-w-0 flex-1 flex-col gap-2 rounded-xl bg-tile p-3 text-ink">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col">
            <SectionLabel>{s.nickname}</SectionLabel>
            <input
              data-testid="nickname"
              className="min-h-10 rounded-lg border border-black/15 bg-white px-2 text-base"
              maxLength={20}
              placeholder={s.nicknamePlaceholder}
              value={setup.nickname}
              onChange={(e) => setup.update({ nickname: e.target.value.replace(/\p{Cc}/gu, '') })}
            />
          </label>
          <div>
            <SectionLabel>{s.bots}</SectionLabel>
            <div className="flex items-center gap-2">
              <Button
                variant="light"
                aria-label="fewer bots"
                disabled={setup.bots <= 1}
                onClick={() => setup.update({ bots: setup.bots - 1 })}
              >
                <Minus size={16} />
              </Button>
              <span data-testid="bot-count" className="w-6 text-center text-lg font-bold">
                {setup.bots}
              </span>
              <Button
                variant="light"
                aria-label="more bots"
                disabled={setup.bots >= 5}
                onClick={() => setup.update({ bots: setup.bots + 1 })}
              >
                <Plus size={16} />
              </Button>
            </div>
          </div>
        </div>
        <div>
          <SectionLabel>{s.botLevel}</SectionLabel>
          <div className="flex flex-col gap-1">
            {Array.from({ length: setup.bots }, (_, i) => (
              <div key={i} className="flex items-center gap-1.5 text-sm">
                <span className="w-12 opacity-70">Bot {i + 1}</span>
                {(['easy', 'normal', 'hard'] as const).map((lvl) => (
                  <Button
                    key={lvl}
                    data-testid={`bot-${i}-${lvl}`}
                    variant={(setup.botLevels[i] ?? 'normal') === lvl ? 'primary' : 'light'}
                    className="min-h-8 flex-1 px-1 text-[12px]"
                    onClick={() => {
                      const botLevels = [...setup.botLevels];
                      botLevels[i] = lvl;
                      setup.update({ botLevels });
                    }}
                  >
                    {en.level[lvl]}
                  </Button>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div>
          <SectionLabel>{en.rules.title}</SectionLabel>
          <div className="flex gap-1.5">
            <Button
              data-testid="rules-official"
              variant={setup.preset === 'official' ? 'primary' : 'light'}
              className="flex-1"
              onClick={() => setup.update({ preset: 'official' })}
            >
              {en.rules.official}
            </Button>
            <Button
              data-testid="rules-house"
              variant={setup.preset === 'house' ? 'primary' : 'light'}
              className="flex-1"
              onClick={() => {
                setup.update({ preset: 'house' });
                setRulesOpen(true);
              }}
            >
              {en.rules.house}…
            </Button>
          </div>
        </div>
        <div>
          <SectionLabel>{s.token}</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {map.tokens.map((t) => (
              <button
                key={t.id}
                title={t.name}
                aria-label={t.name}
                onClick={() => setup.update({ token: t.id })}
                className={`flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl ${token === t.id ? 'ring-3 ring-accent' : 'opacity-70'}`}
              >
                <TokenIcon token={t} color={color ?? '#333'} size={26} />
              </button>
            ))}
          </div>
        </div>
        <div>
          <SectionLabel>{s.color}</SectionLabel>
          <div className="flex gap-2">
            {map.theme.playerColors.map((c) => (
              <button
                key={c}
                aria-label={c}
                onClick={() => setup.update({ color: c })}
                className={`h-10 w-10 rounded-full ${color === c ? 'ring-3 ring-ink ring-offset-2' : ''}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </div>
      <HouseRulesSheet
        open={rulesOpen}
        map={map}
        onClose={() => setRulesOpen(false)}
        house={setup.house}
        onChange={(house) => setup.update({ house, preset: 'house' })}
        onOfficial={() => setup.update({ house: {}, preset: 'official' })}
      />
    </div>
  );
}
