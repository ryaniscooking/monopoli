import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button, SectionLabel } from '../components/ui';
import { MAPS } from '../game/maps';
import {
  checkLastRoom,
  createOnlineRoom,
  joinOnlineRoom,
  lastRoom,
  removeLastRoom,
  useLobby,
  type LastRoomStatus,
} from '../online/lobby';
import { onlineConfigured } from '../online/supabase';
import { useSetup, useUi } from '../store/ui';
import { en } from '../strings/en';

const o = en.online;

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    addEventListener('online', up);
    addEventListener('offline', down);
    return () => {
      removeEventListener('online', up);
      removeEventListener('offline', down);
    };
  }, []);
  return online;
}

/** Create a room or join one by code (spec 12.1.3). */
export function OnlineHome() {
  const setup = useSetup();
  const go = useUi((s) => s.go);
  const pendingCode = useUi((s) => s.pendingCode);
  const busy = useLobby((s) => s.busy);
  const error = useLobby((s) => s.error);
  const online = useOnline();
  const [code, setCode] = useState(pendingCode ?? '');
  const [mapId, setMapId] = useState(MAPS[setup.mapId] ? setup.mapId : 'myanmar');
  const [last, setLast] = useState(() => lastRoom());
  const [lastStatus, setLastStatus] = useState<LastRoomStatus | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  // Drop a remembered room that has finished, closed or that we are no longer in.
  useEffect(() => {
    if (!onlineConfigured || !lastRoom()) return;
    let alive = true;
    void checkLastRoom().then((status) => {
      if (!alive) return;
      setLastStatus(status);
      if (status === null) setLast(null);
    });
    return () => {
      alive = false;
    };
  }, []);
  const nickname = setup.nickname.trim() || 'Player';
  const disabled = busy || !online || !onlineConfigured;

  const join = (c: string) => {
    useUi.setState({ pendingCode: null });
    void joinOnlineRoom(c, nickname);
  };

  return (
    <div className="safe flex h-full gap-3 bg-primary text-white" data-testid="online-home">
      <div className="flex w-[40%] flex-col gap-2">
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => go('home')}>
            {o.back}
          </Button>
          <div className="text-lg font-bold">{o.title}</div>
        </div>
        <label className="flex flex-col">
          <SectionLabel>{o.name}</SectionLabel>
          <input
            data-testid="online-nickname"
            className="min-h-10 rounded-lg border border-black/15 bg-white px-2 text-base text-ink"
            maxLength={20}
            placeholder="Player"
            value={setup.nickname}
            onChange={(e) => setup.update({ nickname: e.target.value.replace(/\p{Cc}/gu, '') })}
          />
        </label>
        {!onlineConfigured && (
          <div className="rounded-lg bg-white/15 p-2 text-sm">{o.notConfigured}</div>
        )}
        {!online && <div className="rounded-lg bg-white/15 p-2 text-sm">{o.offline}</div>}
        {error && <div className="rounded-lg bg-red-700 p-2 text-sm">{error}</div>}
        {last && !confirmRemove && (
          <div className="flex gap-1.5">
            <Button
              data-testid="rejoin"
              variant="secondary"
              className="flex-1"
              disabled={disabled}
              onClick={() => join(last.code)}
            >
              {o.rejoin(last.code)}
              {lastStatus && (
                <span className="ml-1 text-xs opacity-75">
                  · {lastStatus === 'lobby' ? o.inLobby : o.inGame}
                </span>
              )}
            </Button>
            <Button
              data-testid="remove-room"
              variant="secondary"
              aria-label={o.removeRoom}
              disabled={busy}
              onClick={() => setConfirmRemove(true)}
            >
              <X size={16} />
            </Button>
          </div>
        )}
        {last && confirmRemove && (
          <div className="rounded-lg bg-white/15 p-2 text-sm">
            <div className="mb-2">
              {lastStatus === 'lobby'
                ? o.confirmRemoveLobby(last.code)
                : o.confirmRemoveGame(last.code)}
            </div>
            <div className="flex gap-2">
              <Button
                data-testid="confirm-remove-room"
                variant="danger"
                onClick={() => {
                  setConfirmRemove(false);
                  setLast(null);
                  void removeLastRoom();
                }}
              >
                {o.remove}
              </Button>
              <Button variant="light" onClick={() => setConfirmRemove(false)}>
                {o.keep}
              </Button>
            </div>
          </div>
        )}
      </div>
      <div className="scroll-y flex min-w-0 flex-1 flex-col gap-3 rounded-xl bg-tile p-3 text-ink">
        <div>
          <SectionLabel>{en.lobby.map}</SectionLabel>
          <div className="flex gap-2">
            {Object.values(MAPS).map((m) => (
              <Button
                key={m.id}
                variant={m.id === mapId ? 'primary' : 'light'}
                className="flex-1"
                onClick={() => setMapId(m.id)}
              >
                {m.name}
              </Button>
            ))}
          </div>
        </div>
        <Button
          data-testid="create-room"
          className="text-base"
          disabled={disabled}
          onClick={() => void createOnlineRoom(nickname, mapId, { preset: 'official', house: {} })}
        >
          {o.create}
        </Button>
        <div className="text-center text-xs uppercase opacity-60">{o.or}</div>
        <div className="flex gap-2">
          <input
            data-testid="room-code"
            className="min-h-10 min-w-0 flex-1 rounded-lg border border-black/15 bg-white px-2 text-center text-lg font-bold tracking-[0.3em] uppercase"
            maxLength={6}
            placeholder={o.codePlaceholder}
            autoCapitalize="characters"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          />
          <Button
            data-testid="join-room"
            disabled={disabled || code.length !== 6}
            onClick={() => join(code)}
          >
            {o.join}
          </Button>
        </div>
      </div>
    </div>
  );
}
