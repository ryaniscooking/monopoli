import { RotateCcw, Share, SquarePlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
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
  // Chrome, Firefox and Edge on iOS put "Add to Home Screen" elsewhere; the steps are for Safari.
  const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    matchMedia('(display-mode: standalone)').matches;
  return ios && !otherBrowser && !standalone;
}

/** First visit in iPhone Safari, on the home screen only: how to install (spec 13). */
export function InstallHint() {
  const dismissed = useSettings((s) => s.installHintDismissed);
  const set = useSettings((s) => s.set);
  const screen = useUi((s) => s.screen);
  const [show] = useState(() => isIosSafariBrowser());
  if (!show || dismissed || screen !== 'home') return null;
  const i = en.install;
  return (
    <div
      data-testid="install-hint"
      className="fixed bottom-3 left-1/2 z-50 flex w-[min(560px,92vw)] -translate-x-1/2 items-center gap-3 rounded-xl bg-white p-3 text-sm text-ink shadow-lg"
    >
      <div className="flex-1">
        <div className="font-semibold">{i.title}</div>
        <ol className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          <li className="flex items-center gap-1">
            <b>1.</b> {i.step1} <Share size={16} aria-label="Share" className="text-blue-600" />
          </li>
          <li className="flex items-center gap-1">
            <b>2.</b> {i.step2} <SquarePlus size={16} aria-hidden />
          </li>
          <li className="flex items-center gap-1">
            <b>3.</b> {i.step3}
          </li>
        </ol>
        <div className="mt-1 text-[12px] opacity-70">{i.why}</div>
      </div>
      <Button onClick={() => set({ installHintDismissed: true })}>{i.dismiss}</Button>
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
