import { ENGINE_VERSION } from '@monopoli/engine';

// Phase 0 placeholder page; replaced by the real Home screen in Phase 2.
export function App() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        textAlign: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        background: '#F6EBD0',
        color: '#2A1A14',
      }}
    >
      <div>
        <h1 style={{ margin: 0, fontSize: '2.5rem' }}>Hello, monopoli</h1>
        <p style={{ opacity: 0.7 }}>Engine v{ENGINE_VERSION} · Phase 0 scaffold</p>
      </div>
    </main>
  );
}
