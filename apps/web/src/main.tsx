import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installAudioUnlock } from './audio/sfx';
import { preventPageZoom } from './components/noZoom';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
installAudioUnlock();
preventPageZoom();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
