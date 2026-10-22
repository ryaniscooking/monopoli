// Two "phones" (separate browser contexts) play online against the local Supabase stack.
// Runs only when the build was configured for online play (apps/web/.env.local).
import { expect, test, type Browser, type Page } from '@playwright/test';

const ONLINE = process.env.E2E_ONLINE === '1';
test.skip(!ONLINE, 'set E2E_ONLINE=1 with `supabase start` running to test online play');

async function phone(browser: Browser, name: string): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && console.log(`[${name}] ${m.text()}`));
  page.on('pageerror', (e) => console.log(`[${name}] pageerror ${e.message}`));
  await page.addInitScript((nick) => {
    localStorage.setItem(
      'monopoli:settings',
      JSON.stringify({
        state: { speed: 'fast', reducedMotion: true, installHintDismissed: true },
        version: 0,
      }),
    );
    localStorage.setItem(
      'monopoli:setup',
      JSON.stringify({ state: { nickname: nick }, version: 0 }),
    );
  }, name);
  return page;
}

/** Whoever has a Roll / End turn / Don't buy button presses it; returns true if someone acted. */
async function step(pages: Page[]): Promise<boolean> {
  for (const p of pages) {
    for (const id of ['act-roll', 'act-end', 'act-decline', 'auction-withdraw']) {
      const b = p.getByTestId(id);
      if ((await b.isVisible()) && (await b.isEnabled())) {
        await b.click();
        return true;
      }
    }
  }
  return false;
}

test('two players create, join by link, ready, start and play', async ({ browser }) => {
  const alice = await phone(browser, 'Alice');
  const bob = await phone(browser, 'Bob');

  await alice.goto('/');
  await alice.getByTestId('play-online').click();
  await alice.getByTestId('create-room').click();
  await expect(alice.getByTestId('lobby')).toBeVisible({ timeout: 20_000 });
  const code = ((await alice.getByTestId('lobby-code').innerText()).match(/[A-Z2-9]{6}/) ?? [
    '',
  ])[0];
  expect(code).toHaveLength(6);

  // Bob opens the share link.
  await bob.goto(`/r/${code}`);
  await expect(bob.getByTestId('online-home')).toBeVisible();
  await expect(bob.getByTestId('room-code')).toHaveValue(code);
  await bob.getByTestId('join-room').click();
  await expect(bob.getByTestId('lobby')).toBeVisible({ timeout: 20_000 });
  await expect(alice.getByTestId('seat-1')).toContainText('Bob', { timeout: 15_000 });

  await alice.getByTestId('add-bot').click();
  await expect(alice.getByTestId('seat-2')).toBeVisible({ timeout: 15_000 });
  await expect(alice.getByTestId('start-online')).toBeDisabled();
  await bob.getByTestId('ready').click();
  await expect(alice.getByTestId('start-online')).toBeEnabled({ timeout: 15_000 });
  await alice.getByTestId('start-online').click();

  // Both phones switch to the game.
  await expect(alice.getByTestId('game-screen')).toBeVisible({ timeout: 20_000 });
  await expect(bob.getByTestId('game-screen')).toBeVisible({ timeout: 20_000 });
  await expect(bob.getByTestId('player-p0')).toContainText('Alice');
  await expect(alice.getByTestId('player-p1')).toContainText('Bob');

  // Play a few moves; each side sees the other's moves through Realtime.
  let moves = 0;
  for (let i = 0; i < 60 && moves < 8; i++) {
    if (await step([alice, bob])) moves++;
    await alice.waitForTimeout(400);
  }
  expect(moves).toBeGreaterThanOrEqual(4);
  const round = async (p: Page) =>
    (await p.getByTestId('board').innerText()).match(/Round \d+/)?.[0];
  await expect
    .poll(async () => (await round(alice)) === (await round(bob)), { timeout: 15_000 })
    .toBe(true);

  // A reaction from Bob shows on Alice's screen.
  await bob.getByTestId('reactions').click();
  await bob.getByRole('button', { name: '🎉' }).click();
  await expect(alice.getByTestId('player-p1')).toContainText('🎉', { timeout: 10_000 });
});
