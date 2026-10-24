// iOS Safari ignores user-scalable=no, so a two-finger pinch could zoom the whole UI. Block the
// browser's own pinch zoom (WebKit gesture events and multi-touch moves); the board's pinch
// handler (@use-gesture) still gets the touches because it reads them before the default
// action is cancelled.
export function preventPageZoom(): void {
  const stop = (e: Event) => e.preventDefault();
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, stop, { passive: false });
  }
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false },
  );
}
