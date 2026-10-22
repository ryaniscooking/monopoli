import { InstallHint, ReloadPrompt, RotateOverlay } from './components/overlays';
import { Game } from './screens/Game';
import { Home } from './screens/Home';
import { HowTo } from './screens/HowTo';
import { Settings } from './screens/Settings';
import { SoloSetup } from './screens/SoloSetup';
import { useUi } from './store/ui';

export function App() {
  const screen = useUi((s) => s.screen);
  return (
    <>
      {screen === 'home' && <Home />}
      {screen === 'setup' && <SoloSetup />}
      {screen === 'game' && <Game />}
      {screen === 'settings' && <Settings />}
      {screen === 'howto' && <HowTo />}
      <RotateOverlay />
      <InstallHint />
      <ReloadPrompt />
    </>
  );
}
