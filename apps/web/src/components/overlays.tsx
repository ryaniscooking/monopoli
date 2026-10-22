import { RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useSettings } from '../store/settings';
import { en } from '../strings/en';
import { Button } from './ui';

/** iOS ignores the manifest orientation lock, so portrait gets this overlay (spec 12.2). */
export function RotateOverlay() {
  return (
    <div
      data-testid="rotate-overlay"
      className="rotate-overlay fixed inset-0 z-[100] flex-col items-center justify-center gap-4 bg-primary p-8 text-center text-white"
    >
      <RotateCcw size={56} className="animate-[spin_3s_ease-in-out_infinite]" />
      <div className="text-xl font-semibold">{en.rotate}</div>
      <div className="opacity-80">{en.rotateSub}</div>
    </div>
  );
}

function isIosSafariBrowser(): boolean {
  const ua = navigator.userAgent;
  const ios =
    /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    matchMedia('(display-mode: standalone)').matches;
  return ios && !standalone;
}

/** First visit in iPhone Safari: how to install (spec 13). */
export function InstallHint() {
  const dismissed = useSettings((s) => s.installHintDismissed);
  const set = useSettings((s) => s.set);
  const [show] = useState(() => isIosSafariBrowser());
  if (!show || dismissed) return null;
  return (
    <div className="fixed bottom-3 left-1/2 z-50 flex w-[min(520px,90vw)] -translate-x-1/2 items-center gap-3 rounded-xl bg-white p-3 text-sm text-ink shadow-lg">
      <div className="flex-1">
        <div className="font-semibold">{en.install.title}</div>
        <div className="opacity-80">{en.install.body}</div>
      </div>
      <Button onClick={() => set({ installHintDismissed: true })}>{en.install.dismiss}</Button>
    </div>
  );
}

/** "Update available" toast (registerType: 'prompt'). */
export function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (!offlineReady) return;
    const t = setTimeout(() => setOfflineReady(false), 3000);
    return () => clearTimeout(t);
  }, [offlineReady, setOfflineReady]);

  if (!offlineReady && !needRefresh) return null;
  return (
    <div className="fixed top-3 right-3 z-50 flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm text-ink shadow-lg">
      <span>{needRefresh ? en.update.available : en.update.offlineReady}</span>
      {needRefresh && (
        <Button onClick={() => void updateServiceWorker(true)}>{en.update.reload}</Button>
      )}
      <Button
        variant="ghost"
        onClick={() => {
          setOfflineReady(false);
          setNeedRefresh(false);
        }}
      >
        {en.update.dismiss}
      </Button>
    </div>
  );
}
