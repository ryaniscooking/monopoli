import type { GameState } from '@monopoli/engine';
import { expect, test, type Locator, type Page } from '@playwright/test';

// Spec 17 Phase 5: every screen fits the smallest supported iPhone landscape (iPhone SE, 667x375)
// with no page scroll and no console errors.
test.use({ viewport: { width: 667, height: 375 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'monopoli:settings',
      JSON.stringify({
        state: { speed: 'fast', reducedMotion: true, installHintDismissed: true },
        version: 0,
      }),
    );
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  (page as Page & { errors?: string[] }).errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { errors?: string[] }).errors ?? []).toEqual([]);
});

async function noPageScroll(page: Page) {
  const size = await page.evaluate(() => ({
    w: document.documentElement.scrollWidth,
    h: document.documentElement.scrollHeight,
    vw: innerWidth,
    vh: innerHeight,
  }));
  expect(size.w).toBeLessThanOrEqual(size.vw);
  expect(size.h).toBeLessThanOrEqual(size.vh);
}

async function inView(el: Locator) {
  const box = await el.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(668);
  expect(box.y + box.height).toBeLessThanOrEqual(376);
}

test('home, setup, settings and how-to fit at 667x375', async ({ page }) => {
  await page.goto('/?seed=7&test');
  await noPageScroll(page);
  await inView(page.getByTestId('play-solo'));
  await page.getByTestId('play-solo').click();
  await noPageScroll(page);
  await inView(page.getByTestId('start-game'));
  await page.goto('/?test');
  await page.getByRole('button', { name: 'Settings' }).click();
  await noPageScroll(page);
  await inView(page.getByTestId('setting-groupMarkers'));
  await page.goto('/?test');
  await page.getByRole('button', { name: 'How to Play' }).click();
  await noPageScroll(page);
  await inView(page.getByTestId('howto-section'));
});

test('the game screen and its sheets fit at 667x375', async ({ page }) => {
  await page.goto('/?seed=7&test');
  await page.getByTestId('play-solo').click();
  await page.getByTestId('map-myanmar').click();
  await page.getByTestId('nickname').fill('Tester');
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('act-roll')).toBeVisible({ timeout: 30_000 });
  await noPageScroll(page);
  for (const id of ['board', 'act-roll', 'open-manage', 'open-trade', 'open-log', 'open-menu']) {
    await inView(page.getByTestId(id));
  }
  await page.getByTestId('open-menu').click();
  await inView(page.getByTestId('menu-sound'));
  await page.getByRole('button', { name: 'Back to game' }).click();

  // Game over with stats (largest table on the smallest screen).
  await page.evaluate(() => {
    type Hook = { patch: (fn: (s: GameState) => void) => void };
    (window as unknown as { __monopoli: Hook }).__monopoli.patch((s) => {
      s.phase = 'game_over';
      s.winner = 'p0';
      s.endReason = 'last_standing';
    });
  });
  const over = page.getByTestId('game-over');
  await expect(over).toBeVisible();
  await inView(page.getByTestId('game-stats'));
  await inView(over.getByRole('button', { name: 'Home' }));
  await noPageScroll(page);
});
