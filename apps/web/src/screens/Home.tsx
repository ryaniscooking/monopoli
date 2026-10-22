import { useEffect, useState } from 'react';
import { Button } from '../components/ui';
import { getMap, MAPS } from '../game/maps';
import { saveStore, type LocalSave } from '../game/saves';
import { resumeGame } from '../game/session';
import { useUi } from '../store/ui';
import { en } from '../strings/en';

export function Home() {
  const go = useUi((s) => s.go);
  const [saves, setSaves] = useState<LocalSave[]>([]);

  useEffect(() => {
    let alive = true;
    saveStore
      .list()
      .then((list) => alive && setSaves(list.filter((s) => MAPS[s.mapId])))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="safe flex h-full items-center justify-center gap-[6vw] bg-primary text-white">
      <div className="flex flex-col items-center">
        <img
          src="/logo.png"
          alt={en.appTitle}
          className="w-[min(40vw,420px)]"
          draggable={false}
          data-testid="logo"
        />
      </div>
      <div className="flex w-[min(300px,40vw)] flex-col gap-2">
        {saves.map((s) => (
          <Button
            key={s.mapId}
            data-testid={`resume-${s.mapId}`}
            onClick={() => resumeGame(s)}
            className="text-base"
          >
            {en.home.resume}
            <span className="ml-1 text-xs font-normal opacity-75">
              {en.home.savedGame(getMap(s.mapId).name, s.state.round)}
            </span>
          </Button>
        ))}
        <Button
          data-testid="play-solo"
          variant={saves.length ? 'secondary' : 'primary'}
          className="text-base"
          onClick={() => go('setup')}
        >
          {en.home.playSolo}
        </Button>
        <Button variant="secondary" disabled className="text-base">
          {en.home.playOnline} <span className="text-xs">· {en.home.onlineSoon}</span>
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => go('howto')}>
            {en.home.howTo}
          </Button>
          <Button variant="secondary" onClick={() => go('settings')}>
            {en.home.settings}
          </Button>
        </div>
      </div>
    </div>
  );
}
