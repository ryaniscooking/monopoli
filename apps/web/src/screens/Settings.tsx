import { Button, SectionLabel } from '../components/ui';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { en } from '../strings/en';

const s = en.settings;

export function Settings() {
  const settings = useSettings();
  const back = useUi((st) => st.back);
  const go = useUi((st) => st.go);
  return (
    <div className="safe flex h-full justify-center bg-primary text-white">
      <div className="scroll-y flex w-[min(560px,90vw)] flex-col gap-3 py-2">
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => go(back)}>
            {s.back}
          </Button>
          <div className="text-lg font-bold">{s.title}</div>
        </div>
        <div className="rounded-xl bg-tile p-3 text-ink">
          <SectionLabel>{s.speed}</SectionLabel>
          <div className="flex gap-2">
            {(['normal', 'fast'] as const).map((v) => (
              <Button
                key={v}
                variant={settings.speed === v ? 'primary' : 'light'}
                onClick={() => settings.set({ speed: v })}
              >
                {s[v]}
              </Button>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={settings.reducedMotion}
              onChange={(e) => settings.set({ reducedMotion: e.target.checked })}
            />
            {s.reducedMotion}
          </label>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              data-testid="setting-sound"
              className="h-5 w-5"
              checked={settings.sound}
              onChange={(e) => settings.set({ sound: e.target.checked })}
            />
            {s.sound}
          </label>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              data-testid="setting-followCamera"
              className="h-5 w-5"
              checked={settings.followCamera}
              onChange={(e) => settings.set({ followCamera: e.target.checked })}
            />
            {s.followCamera}
          </label>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              data-testid="setting-groupMarkers"
              className="h-5 w-5"
              checked={settings.groupMarkers}
              onChange={(e) => settings.set({ groupMarkers: e.target.checked })}
            />
            {s.groupMarkers}
          </label>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              data-testid="setting-boardTilt"
              className="h-5 w-5"
              checked={settings.boardTilt}
              onChange={(e) => settings.set({ boardTilt: e.target.checked })}
            />
            {s.boardTilt}
          </label>
          <p className="mt-3 text-xs opacity-70">{s.storage}</p>
        </div>
      </div>
    </div>
  );
}
