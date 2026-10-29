import { expect, test as base, type Page } from '@playwright/test';
import { games } from '../src/lib/catalogue';

const test = base.extend<{ runtimeDiagnostics: void }>({
  runtimeDiagnostics: [
    async ({ page }, use, testInfo) => {
      const failures: string[] = [];
      page.on('pageerror', (error) => failures.push(error.message));
      page.on('console', (message) => {
        if (
          message.type() === 'error' ||
          /hydration|hydrating|did not match|server rendered HTML/i.test(
            message.text(),
          )
        ) {
          failures.push(
            `Console ${message.type()}: ${message.text()} (${message.location().url})`,
          );
        }
      });
      page.on('response', (response) => {
        if (response.status() >= 400) {
          failures.push(`HTTP ${response.status()}: ${response.url()}`);
        }
      });
      page.on('requestfailed', (request) => {
        const reason = request.failure()?.errorText ?? 'Unknown failure';
        // Leaving a document can cancel its unfinished requests normally.
        if (!reason.includes('ERR_ABORTED')) {
          failures.push(`${reason}: ${request.url()}`);
        }
      });

      await use();

      if (failures.length) {
        await testInfo.attach('browser-errors', {
          body: failures.join('\n'),
          contentType: 'text/plain',
        });
      }
      expect(
        failures,
        'Pages must load without runtime, hydration, or asset errors',
      ).toEqual([]);
    },
    { auto: true },
  ],
});

async function openPage(page: Page, href: string) {
  const response = await page.goto(href);
  expect(response?.status()).toBe(200);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

test('catalogue preserves all games, screenshots, and accessible filters', async ({
  page,
}, testInfo) => {
  await openPage(page, '/');
  await expect(page).toHaveTitle('The Game Shelf — Pick up & play');
  await expect(page.locator('.game:visible')).toHaveCount(20);
  await expect(page.locator('#game-count')).toHaveText('20 games');
  expect(
    await page
      .locator('.game-link')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
  ).toEqual(games.map((game) => game.href));

  const filterCases = [
    {
      label: 'Arcade & racing',
      count: 12,
      status: '12 games for a high score',
    },
    {
      label: 'Puzzles & strategy',
      count: 6,
      status: '6 games to get you thinking',
    },
    { label: 'Take it easy', count: 6, status: '6 games for taking it easy' },
    { label: 'With friends', count: 3, status: '3 games for good company' },
  ];
  for (const filter of filterCases) {
    const button = page.getByRole('button', {
      name: filter.label,
      exact: true,
    });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.filters [aria-pressed=true]')).toHaveCount(1);
    await expect(page.locator('.game:visible')).toHaveCount(filter.count);
    await expect(page.locator('#game-count')).toHaveText(filter.status);
  }

  const allGames = page.getByRole('button', {
    name: 'All games 20',
    exact: true,
  });
  await allGames.focus();
  await page.keyboard.press('Enter');
  await expect(allGames).toBeFocused();
  await expect(page.locator('.game:visible')).toHaveCount(20);
  await page.keyboard.press('Tab');
  const arcadeFilter = page.getByRole('button', {
    name: 'Arcade & racing',
    exact: true,
  });
  await expect(arcadeFilter).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('#game-count')).toHaveText(
    '12 games for a high score',
  );
  await allGames.click();

  await page.locator('img').evaluateAll((images: HTMLImageElement[]) => {
    for (const image of images) image.loading = 'eager';
  });
  await expect
    .poll(() =>
      page
        .locator('img')
        .evaluateAll((images: HTMLImageElement[]) =>
          images.every((image) => image.complete && image.naturalWidth > 0),
        ),
    )
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('catalogue-desktop.png'),
    fullPage: true,
  });
});

for (const choice of [
  { name: 'first', random: 0, href: '/pocket-putt/', button: 'Surprise me' },
  {
    name: 'last',
    random: 0.999999,
    href: '/drift/',
    button: 'Pick a game for me',
  },
]) {
  test(`surprise chooses the ${choice.name} game within the active filter`, async ({
    page,
  }) => {
    await openPage(page, '/');
    await page
      .getByRole('button', { name: 'With friends', exact: true })
      .click();
    await expect(page.locator('.game:visible')).toHaveCount(3);
    await page.evaluate((random) => {
      Math.random = () => random;
    }, choice.random);
    await page.route(`**${choice.href}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><title>Surprise destination</title><p>Destination verified.</p>',
      }),
    );
    const navigation = page.waitForRequest(
      (request) =>
        request.isNavigationRequest() &&
        new URL(request.url()).pathname === choice.href,
    );
    await page
      .getByRole('button', { name: choice.button, exact: true })
      .click();
    expect(new URL((await navigation).url()).pathname).toBe(choice.href);
    await expect(page).toHaveURL(new RegExp(`${choice.href}$`));
  });
}

test('catalogue remains usable at a narrow mobile viewport', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPage(page, '/');
  await page.getByRole('button', { name: 'With friends', exact: true }).click();
  await expect(page.locator('.game:visible')).toHaveCount(3);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('catalogue-mobile.png'),
    fullPage: true,
  });
});

for (const game of games) {
  test(`${game.title} loads through its native game route`, async ({
    page,
  }, testInfo) => {
    await openPage(page, game.href);
    await expect(page.locator('body')).not.toBeEmpty();
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(page).not.toHaveTitle(/404|Internal Server Error/);

    if (game.href === '/beat-bounce/') {
      await expect(page.locator('#tracks button')).toHaveCount(3);
      await page
        .getByRole('button', { name: 'Play Sunroom', exact: true })
        .click();
      await expect(page.locator('#tap')).toBeEnabled();
      await expect(page.locator('#overlay')).toBeHidden();
    } else if (game.href === '/pocket-putt/') {
      await expect(page.locator('#score-rows tr')).toHaveCount(6);
      await page.getByRole('button', { name: 'Start round' }).click();
      await expect(page.locator('#setup')).toBeHidden();
      await expect(page.locator('#putt')).toBeEnabled();
    } else if (
      [
        '/trap-sprint/',
        '/daily-circuit/',
        '/bumper-ring/',
        '/block-bloom/',
        '/shelf-shuffle/',
        '/wobble-delivery/',
        '/corner-rush/',
      ].includes(game.href)
    ) {
      await expect(page.locator('.game-nav-title')).toHaveText(game.title);
      await expect(page.locator('[data-start]')).toBeVisible();
      await page.locator('[data-start]').click();
      await expect(page.locator('[data-pause]')).toBeEnabled();
      await expect(page.locator('#game-overlay')).toBeHidden();
      const canvas = page.locator('#game-host canvas').first();
      if (await canvas.count()) {
        await expect
          .poll(() =>
            canvas.evaluate((element: HTMLCanvasElement) => {
              const context = element.getContext('2d');
              return (
                (context?.getImageData(
                  Math.floor(element.width / 2),
                  Math.floor(element.height / 2),
                  1,
                  1,
                ).data[3] ?? 0) > 0
              );
            }),
          )
          .toBe(true);
      }
    } else if (game.href === '/drift/') {
      await expect(page.locator('#boot')).toBeHidden();
      await expect(page.locator('#unsupported')).toBeHidden();
      await expect(page.locator('#lobby-modes input')).not.toHaveCount(0);
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await expect(page.locator('#settings')).toBeVisible();
      await page
        .getByRole('button', { name: 'Close settings', exact: true })
        .click();
    } else if (game.href === '/faultline/') {
      await expect(page.locator('#start')).toBeEnabled();
      await page.locator('#start').click();
      await expect(page.locator('#hud')).toBeVisible();
      await expect(page.locator('#menu')).toBeHidden();
    }

    if (
      [
        '/beat-bounce/',
        '/pocket-putt/',
        '/trap-sprint/',
        '/drift/',
        '/faultline/',
      ].includes(game.href)
    ) {
      await page.screenshot({
        path: testInfo.outputPath('game-initialized.png'),
        fullPage: true,
      });
    }
  });
}

test('game links return to a working catalogue with document navigation', async ({
  page,
}) => {
  await openPage(page, '/');
  const navigation = page.waitForRequest(
    (request) =>
      request.isNavigationRequest() &&
      new URL(request.url()).pathname === '/pocket-putt/',
  );
  await page
    .getByRole('link', { name: 'Play Pocket Putt', exact: true })
    .click();
  await navigation;
  await expect(page.locator('#start')).toBeVisible();
  await page.getByRole('link', { name: '← All games', exact: true }).click();
  await expect(page.locator('#game-count')).toHaveText('20 games');
  await page.getByRole('button', { name: 'With friends', exact: true }).click();
  await expect(page.locator('.game:visible')).toHaveCount(3);
});
