import { useEffect, useState } from 'react';
import { InstallHint, ReloadPrompt, RotateOverlay } from './components/overlays';
import { Lobby } from './screens/Lobby';
import { OnlineHome } from './screens/OnlineHome';
import { en } from './strings/en';
import { Game } from './screens/Game';
import { Home } from './screens/Home';
import { HowTo } from './screens/HowTo';
import { Settings } from './screens/Settings';
import { SoloSetup } from './screens/SoloSetup';
import { useUi } from './store/ui';

/** /r/CODE share links open the online screen with the code filled in (spec 10.1). */
function useShareLink() {
  useEffect(() => {
    const m = /^\/r\/([A-Za-z0-9]{6})\/?$/.exec(location.pathname);
    if (!m?.[1]) return;
    history.replaceState(null, '', '/');
    useUi.setState({ pendingCode: m[1].toUpperCase() });
    useUi.getState().go('online');
  }, []);
}

function OfflineBanner() {
  const screen = useUi((s) => s.screen);
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
  if (online || (screen !== 'lobby' && screen !== 'game')) return null;
  return (
    <div className="fixed top-0 left-1/2 z-[60] -translate-x-1/2 rounded-b-lg bg-red-700 px-3 py-1 text-xs font-semibold text-white">
      {en.offlineBanner}
    </div>
  );
}

export function App() {
  const screen = useUi((s) => s.screen);
  useShareLink();
  return (
    <>
      {screen === 'home' && <Home />}
      {screen === 'setup' && <SoloSetup />}
      {screen === 'game' && <Game />}
      {screen === 'settings' && <Settings />}
      {screen === 'howto' && <HowTo />}
      {screen === 'online' && <OnlineHome />}
      {screen === 'lobby' && <Lobby />}
      <OfflineBanner />
      <RotateOverlay />
      <InstallHint />
      <ReloadPrompt />
    </>
  );
}
