import type { BotLevel } from '@monopoli/engine';
import { Bot, Copy, Crown, X } from 'lucide-react';
import { useState } from 'react';
import { Button, SectionLabel } from '../components/ui';
import { MAPS } from '../game/maps';
import { lobbyActions, useLobby } from '../online/lobby';
import { en } from '../strings/en';
import { HouseRulesSheet } from './HouseRules';
import { TokenIcon } from '../components/TokenIcon';

const l = en.lobby;

/** Lobby (spec 10.1, 12.1.3): players, ready checks, map, rules, bots, share link, host controls. */
export function Lobby() {
  const room = useLobby((s) => s.room);
  const seats = useLobby((s) => s.seats);
  const userId = useLobby((s) => s.userId);
  const busy = useLobby((s) => s.busy);
  const error = useLobby((s) => s.error);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [botLevel, setBotLevel] = useState<BotLevel>('normal');
  if (!room) return null;

  const isHost = room.host_id === userId;
  const me = seats.find((s) => s.user_id === userId);
  const map = MAPS[room.map_id];
  const link = `${location.origin}/r/${room.code}`;
  const canStart =
    seats.length >= 2 && seats.every((s) => s.is_bot || s.user_id === userId || s.ready);
  const usedTokens = new Set(seats.filter((s) => s.seat !== me?.seat).map((s) => s.token));
  const usedColors = new Set(
    seats.filter((s) => s.seat !== me?.seat).map((s) => s.color.toLowerCase()),
  );

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'မိုနိုပိုလီ', url: link });
      else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {
      /* share sheet dismissed */
    }
  };

  return (
    <div className="safe flex h-full gap-3 bg-primary text-white" data-testid="lobby">
      <div className="flex w-[44%] flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="text-lg font-bold" data-testid="lobby-code">
            {l.title(room.code)}
          </div>
          <Button
            variant="secondary"
            className="ml-auto flex items-center gap-1"
            onClick={() => void share()}
          >
            <Copy size={14} /> {copied ? l.copied : l.share}
          </Button>
        </div>
        <SectionLabel>{l.players}</SectionLabel>
        <div className="scroll-y flex min-h-0 flex-1 flex-col gap-1">
          {seats.map((s) => {
            const token = map?.tokens.find((t) => t.id === s.token);
            return (
              <div
                key={s.seat}
                data-testid={`seat-${s.seat}`}
                className="flex items-center gap-2 rounded-lg bg-tile px-2 py-1 text-sm text-ink"
                style={{ borderLeft: `5px solid ${s.color}` }}
              >
                <TokenIcon token={token} color={s.color} size={22} />
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {s.nickname}
                  {s.user_id === userId && (
                    <span className="ml-1 text-[10px] opacity-60">({l.you})</span>
                  )}
                </span>
                {s.user_id === room.host_id && <Crown size={14} aria-label={l.host} />}
                {s.is_bot ? (
                  <span className="flex items-center gap-0.5 text-[11px] opacity-70">
                    <Bot size={12} /> {en.level[s.bot_level ?? 'normal']}
                  </span>
                ) : (
                  <span
                    className={`text-[11px] font-semibold ${s.ready || s.user_id === room.host_id ? 'text-green-700' : 'opacity-50'}`}
                  >
                    {s.ready || s.user_id === room.host_id ? l.ready : l.notReady}
                  </span>
                )}
                {isHost && s.user_id !== userId && (
                  <button
                    aria-label={s.is_bot ? l.remove : l.kick}
                    className="p-1 opacity-60"
                    disabled={busy}
                    onClick={() => void lobbyActions.removeSeat(s.seat)}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {isHost && seats.length < 6 && (
          <div className="flex gap-1">
            {(['easy', 'normal', 'hard'] as const).map((lvl) => (
              <Button
                key={lvl}
                variant={botLevel === lvl ? 'primary' : 'secondary'}
                className="min-h-8 flex-1 px-1 text-[12px]"
                onClick={() => setBotLevel(lvl)}
              >
                {en.level[lvl]}
              </Button>
            ))}
            <Button
              data-testid="add-bot"
              variant="secondary"
              disabled={busy}
              onClick={() => void lobbyActions.addBot(botLevel)}
            >
              + {l.addBot}
            </Button>
          </div>
        )}
      </div>

      <div className="scroll-y flex min-w-0 flex-1 flex-col gap-2 rounded-xl bg-tile p-3 text-ink">
        {error && <div className="rounded-lg bg-red-100 p-2 text-sm text-red-800">{error}</div>}
        <div>
          <SectionLabel>{l.map}</SectionLabel>
          <div className="flex gap-2">
            {Object.values(MAPS).map((m) => (
              <Button
                key={m.id}
                variant={m.id === room.map_id ? 'primary' : 'light'}
                className="flex-1"
                disabled={!isHost || busy}
                onClick={() => void lobbyActions.setMap(m.id)}
              >
                {m.name}
              </Button>
            ))}
          </div>
        </div>
        <div>
          <SectionLabel>{l.rules}</SectionLabel>
          <div className="flex gap-2">
            <Button
              variant={room.settings.preset === 'official' ? 'primary' : 'light'}
              className="flex-1"
              disabled={!isHost || busy}
              onClick={() => void lobbyActions.setRules({ preset: 'official', house: {} })}
            >
              {en.rules.official}
            </Button>
            <Button
              variant={room.settings.preset === 'house' ? 'primary' : 'light'}
              className="flex-1"
              onClick={() => setRulesOpen(true)}
            >
              {isHost ? `${en.rules.house}…` : l.viewRules}
            </Button>
          </div>
        </div>
        {me && map && (
          <>
            <div>
              <SectionLabel>{l.token}</SectionLabel>
              <div className="flex flex-wrap gap-1">
                {map.tokens.map((t) => (
                  <button
                    key={t.id}
                    aria-label={t.name}
                    disabled={usedTokens.has(t.id) || busy}
                    onClick={() => void lobbyActions.setMe({ token: t.id })}
                    className={`flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg disabled:opacity-25 ${me.token === t.id ? 'ring-3 ring-accent' : ''}`}
                  >
                    <TokenIcon token={t} color={me.color} size={24} />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <SectionLabel>{l.color}</SectionLabel>
              <div className="flex gap-1.5">
                {map.theme.playerColors.map((c) => (
                  <button
                    key={c}
                    aria-label={c}
                    disabled={usedColors.has(c.toLowerCase()) || busy}
                    onClick={() => void lobbyActions.setMe({ color: c })}
                    className={`h-9 w-9 rounded-full disabled:opacity-25 ${me.color.toLowerCase() === c.toLowerCase() ? 'ring-3 ring-ink ring-offset-2' : ''}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          </>
        )}
        <div className="mt-auto flex items-center gap-2">
          {isHost ? (
            <Button
              data-testid="start-online"
              className="px-6 text-base"
              disabled={!canStart || busy}
              onClick={() => void lobbyActions.start()}
            >
              {l.start}
            </Button>
          ) : (
            <Button
              data-testid="ready"
              variant={me?.ready ? 'light' : 'primary'}
              disabled={busy}
              onClick={() => void lobbyActions.setReady(!me?.ready)}
            >
              {me?.ready ? l.notReadyYet : l.iAmReady}
            </Button>
          )}
          <span className="text-xs opacity-70">
            {isHost ? (canStart ? '' : l.needPlayers) : l.waitHost}
          </span>
          <Button
            variant="light"
            className="ml-auto"
            disabled={busy}
            onClick={() => void lobbyActions.leave()}
          >
            {l.leave}
          </Button>
        </div>
      </div>
      {map && (
        <HouseRulesSheet
          open={rulesOpen}
          map={map}
          onClose={() => setRulesOpen(false)}
          house={room.settings.house}
          onChange={(house) => void lobbyActions.setRules({ preset: 'house', house })}
          onOfficial={() => void lobbyActions.setRules({ preset: 'official', house: {} })}
          online
          readOnly={!isHost}
        />
      )}
    </div>
  );
}
