import type { GameState } from '@monopoli/engine';
import { expect, test, type Page } from '@playwright/test';

// Fast animations, no install hint; fixed dice via ?seed; ?test exposes window.__monopoli.
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

async function startSolo(page: Page, map = 'myanmar', seed = 7) {
  await page.goto(`/?seed=${seed}&test`);
  await page.getByTestId('play-solo').click();
  await page.getByTestId(`map-${map}`).click();
  await page.getByTestId('nickname').fill('Tester');
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('game-screen')).toBeVisible();
}

/** Press whatever primary button is offered until `until` is visible. */
async function playUntil(page: Page, until: string, maxSteps = 120) {
  for (let i = 0; i < maxSteps; i++) {
    if (await page.getByTestId(until).isVisible()) return;
    // Stay out of auctions so the bots settle them quickly.
    const withdraw = page.getByTestId('auction-withdraw');
    if ((await withdraw.isVisible()) && (await withdraw.isEnabled())) await withdraw.click();
    for (const id of ['act-roll', 'act-end', 'act-decline']) {
      const btn = page.getByTestId(id);
      if (until !== id && (await btn.isVisible()) && (await btn.isEnabled())) {
        await btn.click();
        break;
      }
    }
    await page.waitForTimeout(150);
  }
  throw new Error(`never reached ${until}`);
}

test('home screen shows the logo and menu', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('logo')).toBeVisible();
  await expect(page.getByTestId('play-solo')).toBeVisible();
  await expect(page).toHaveTitle('မိုနိုပိုလီ');
  await expect(page.getByTestId('rotate-overlay')).toBeHidden();
});

test('portrait shows the rotate overlay', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByTestId('rotate-overlay')).toBeVisible();
});

test('a solo game starts with the human and bots; the board fits the screen', async ({ page }) => {
  await startSolo(page);
  await expect(page.getByTestId('player-p0')).toContainText('Tester');
  await expect(page.getByTestId('player-p3')).toBeVisible(); // 3 bots by default
  const board = await page.getByTestId('board').boundingBox();
  expect(board).not.toBeNull();
  // In the 3D table view the board leans back, so its on-screen box is not square; it must
  // still sit fully inside the screen.
  expect(board!.y).toBeGreaterThanOrEqual(0);
  expect(board!.y + board!.height).toBeLessThanOrEqual(390);
  expect(board!.x + board!.width).toBeLessThanOrEqual(844);
  // Bots take their turns until it is ours.
  await expect(page.getByTestId('act-roll')).toBeVisible({ timeout: 30_000 });
});

test('buy a property', async ({ page }) => {
  await startSolo(page);
  await playUntil(page, 'act-buy');
  const deed = page.getByTestId('deed');
  await expect(deed).toBeVisible();
  const name = ((await deed.getByTestId('deed-name').textContent()) ?? '').trim();
  await page.getByTestId('act-buy').click();
  await expect(page.getByTestId('act-buy')).toBeHidden();
  await page.getByTestId('open-manage').click();
  await expect(page.getByTestId('manage-sheet')).toContainText(name);
});

test('debt: mortgage to raise cash, then pay', async ({ page }) => {
  await startSolo(page, 'dubai');
  await expect(page.getByTestId('act-roll')).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => {
    type Hook = { patch: (fn: (s: GameState) => void) => void };
    const hook = (window as unknown as { __monopoli: Hook }).__monopoli;
    hook.patch((s) => {
      const me = s.players[0]!;
      me.cash = 10;
      s.properties.p22 = { owner: 'p0', mortgaged: false, buildings: 0 };
      s.phase = 'post_roll';
      s.pending = {
        kind: 'debt',
        debtor: 'p0',
        creditor: 'bank',
        amount: 150,
        reason: 'test',
        queue: [],
        then: null,
      };
    });
  });
  const panel = page.getByTestId('debt-panel');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('act-pay-debt')).toBeDisabled();
  await panel.getByRole('button', { name: /Palm Jumeirah/ }).click();
  await expect(page.getByTestId('act-pay-debt')).toBeEnabled();
  await page.getByTestId('act-pay-debt').click();
  await expect(panel).toBeHidden();
  await expect(page.getByTestId('act-end')).toBeVisible();
});

test('the game is saved and can be resumed after a reload', async ({ page }) => {
  await startSolo(page, 'dubai', 11);
  await playUntil(page, 'act-end');
  await page.reload();
  await expect(page.getByTestId('resume-dubai')).toBeVisible();
  await page.getByTestId('resume-dubai').click();
  await expect(page.getByTestId('game-screen')).toBeVisible();
  await expect(page.getByTestId('act-end')).toBeVisible();
});

test('tap a tile to see its deed', async ({ page }) => {
  await startSolo(page);
  const tile = page.locator('[data-tile="p22"]');
  await tile.tap();
  await expect(page.getByTestId('deed')).toContainText('Yangon');
  await expect(page.getByTestId('deed')).toContainText('400,000 Ks');
});

test('works offline after the first visit (PWA)', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('play-solo')).toBeVisible();
  await page.getByTestId('play-solo').click();
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('game-screen')).toBeVisible();
  await expect(page.getByTestId('act-roll')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('act-roll').click();
  await expect(page.getByTestId('dice')).toBeVisible();
});

test('declining a property starts an auction; dropping out lets the bots settle it', async ({
  page,
}) => {
  await startSolo(page, 'dubai');
  await playUntil(page, 'act-decline');
  await page.getByTestId('act-decline').click();
  const panel = page.getByTestId('auction-panel');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('auction-status')).toBeVisible();
  await page.getByTestId('auction-withdraw').click();
  await expect(panel).toBeHidden({ timeout: 30_000 });
});

test('build houses on a full color set from the Manage sheet', async ({ page }) => {
  await startSolo(page, 'dubai');
  await expect(page.getByTestId('act-roll')).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => {
    type Hook = { patch: (fn: (s: GameState) => void) => void };
    (window as unknown as { __monopoli: Hook }).__monopoli.patch((s) => {
      s.properties.p01 = { owner: 'p0', mortgaged: false, buildings: 0 };
      s.properties.p02 = { owner: 'p0', mortgaged: false, buildings: 0 };
    });
  });
  await page.getByTestId('open-manage').click();
  await page.getByTestId('build-p01').click();
  await expect(page.getByTestId('manage-p01')).toContainText('🏠');
  // Even building: p01 cannot get a second house before p02 has one.
  await expect(page.getByTestId('build-p01')).toBeDisabled();
  await expect(page.getByTestId('build-p02')).toBeEnabled();
});

test('accept a trade offer from a bot', async ({ page }) => {
  await startSolo(page, 'dubai');
  await expect(page.getByTestId('act-roll')).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => {
    type Hook = { patch: (fn: (s: GameState) => void) => void };
    (window as unknown as { __monopoli: Hook }).__monopoli.patch((s) => {
      s.properties.t1 = { owner: 'p0', mortgaged: false, buildings: 0 };
      s.trades = [
        {
          id: 't50',
          from: 'p1',
          to: 'p0',
          give: { cash: 300, tiles: [], jailCards: 0 },
          get: { cash: 0, tiles: ['t1'], jailCards: 0 },
          expiresAt: Date.now() + 60_000,
        },
      ];
    });
  });
  await expect(page.getByTestId('incoming-offer')).toContainText('Dubai Metro');
  await page.getByTestId('accept-offer').click();
  await expect(page.getByTestId('incoming-offer')).toBeHidden();
  await expect(page.getByTestId('player-p0')).toContainText('AED 1,800');
});

test('trade offers show the title deeds of the cards involved', async ({ page }) => {
  await startSolo(page, 'dubai');
  await expect(page.getByTestId('act-roll')).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => {
    type Hook = { patch: (fn: (s: GameState) => void) => void };
    (window as unknown as { __monopoli: Hook }).__monopoli.patch((s) => {
      s.properties.t1 = { owner: 'p0', mortgaged: false, buildings: 0 };
      s.properties.p01 = { owner: 'p1', mortgaged: false, buildings: 0 };
      s.trades = [
        {
          id: 't51',
          from: 'p1',
          to: 'p0',
          give: { cash: 0, tiles: ['p01'], jailCards: 0 },
          get: { cash: 0, tiles: ['t1'], jailCards: 0 },
          expiresAt: Date.now() + 60_000,
        },
      ];
    });
  });
  // A chip opens one deed.
  await page.getByTestId('chip-p01').click();
  await expect(page.getByTestId('deed-preview')).toContainText('Title deed');
  await page.getByTestId('deed-preview').getByRole('button', { name: 'Close' }).click();
  // View cards shows both sides, with the deeds' rent tables.
  await page.getByTestId('view-cards').click();
  const details = page.getByTestId('trade-details');
  await expect(details).toContainText('You get');
  await expect(details).toContainText('You give');
  await expect(details.getByTestId('deed')).toHaveCount(2);
  await details.getByTestId('accept-offer').click();
  await expect(details).toBeHidden();
  await expect(page.getByTestId('incoming-offer')).toBeHidden();
});

test('choose bot levels and house rules in setup', async ({ page }) => {
  await page.goto('/?seed=5&test');
  await page.getByTestId('play-solo').click();
  await page.getByTestId('bot-0-hard').click();
  await page.getByTestId('rules-house').click();
  await page
    .getByTestId('house-rules')
    .getByText('Taxes and fines go to a Free Parking pot')
    .click();
  await page.getByTestId('house-rules').getByRole('button', { name: 'Close' }).click();
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('player-p1')).toContainText('H');
  await expect(page.getByTestId('board')).toContainText('Pot');
});

test('house-rule money options use the chosen map’s currency', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('play-solo').click();
  await page.getByTestId('map-myanmar').click();
  await page.getByTestId('rules-house').click();
  const sheet = page.getByTestId('house-rules');
  await expect(sheet.getByRole('button', { name: '1.5M Ks' })).toBeVisible(); // starting cash
  await expect(sheet.getByRole('button', { name: '200K Ks' })).toBeVisible(); // GO salary
  await expect(sheet.getByRole('button', { name: '50K Ks' })).toBeVisible(); // jail fine
  await sheet.getByRole('button', { name: 'Close' }).click();
  await page.getByTestId('map-dubai').click();
  await page.getByTestId('rules-house').click();
  await expect(sheet.getByRole('button', { name: 'AED 1,500' })).toBeVisible();
});

test('3D table view: the board leans back and keeps the angle while zoomed in', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'monopoli:settings',
      JSON.stringify({ state: { speed: 'fast', installHintDismissed: true }, version: 0 }),
    );
  });
  await startSolo(page, 'dubai');
  await expect(page.getByTestId('act-roll')).toBeVisible({ timeout: 30_000 });
  const board = page.getByTestId('board');
  await expect(board).toHaveAttribute('data-tilted', 'true');
  await page.locator('[data-tile="p01"]').tap();
  await expect(page.getByTestId('deed')).toContainText('Deira');
  await expect(board).toHaveAttribute('data-zoomed', 'true');
  await expect(board).toHaveAttribute('data-tilted', 'true');
  await page.getByTestId('deed').getByRole('button', { name: 'Close' }).click();
  await expect(board).not.toHaveAttribute('data-zoomed');
});
