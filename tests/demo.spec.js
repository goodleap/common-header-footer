import { test, expect } from '@playwright/test';

async function openDemo(page) {
  await page.goto('/demo/');
  await page.locator('#shell').evaluate(element => element.ready);
  await expect(page.locator('#canvas-size')).not.toHaveText('测量中');
}

async function visibility(page) {
  return page.locator('#shell').evaluate(element => element.getVisibility());
}

test('business fullscreen enters through a real gesture and external exit restores previous choices', async ({ page }) => {
  await openDemo(page);
  await page.locator('#footer-toggle').uncheck();
  expect(await visibility(page)).toEqual({ header: true, footer: false });
  await page.locator('#fullscreen').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('app');
  expect(await visibility(page)).toEqual({ header: false, footer: false });
  await expect(page.locator('#fullscreen')).toContainText('退出全屏');
  await page.evaluate(() => document.exitFullscreen());
  await expect.poll(() => visibility(page)).toEqual({ header: true, footer: false });
  await expect(page.locator('#fullscreen')).toContainText('进入全屏');
  await expect(page.locator('#footer-toggle')).not.toBeChecked();
});

test('fullscreen nested inside immersion keeps both hidden until immersion also exits', async ({ page }) => {
  await openDemo(page);
  await page.locator('#footer-toggle').uncheck();
  await page.locator('#immerse').click();
  expect(await visibility(page)).toEqual({ header: false, footer: false });
  await page.locator('#fullscreen').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('app');
  await page.locator('#fullscreen').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
  expect(await visibility(page)).toEqual({ header: false, footer: false });
  await expect(page.locator('#immerse')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#immerse').click();
  expect(await visibility(page)).toEqual({ header: true, footer: false });
});

test('a denied fullscreen request releases only its own suspension and remains recoverable', async ({ page }) => {
  await openDemo(page);
  await page.locator('#header-toggle').uncheck();
  await page.locator('#app').evaluate(element => {
    element.requestFullscreen = () => Promise.reject(new DOMException('Test denial', 'NotAllowedError'));
  });
  await page.locator('#fullscreen').click();
  await expect(page.locator('#message')).toContainText('全屏未完成');
  expect(await visibility(page)).toEqual({ header: false, footer: true });
  await expect(page.locator('#fullscreen')).toBeEnabled();
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();

  await page.locator('#immerse').click();
  await page.locator('#fullscreen').click();
  await expect(page.locator('#message')).toContainText('全屏未完成');
  expect(await visibility(page)).toEqual({ header: false, footer: false });
  await page.locator('#immerse').click();
  expect(await visibility(page)).toEqual({ header: false, footer: true });
});

test.describe('Canvas sizing on a high-density display', () => {
  test.use({ deviceScaleFactor: 2, viewport: { width: 1280, height: 900 } });

  async function canvasDimensions(page) {
    return page.evaluate(() => {
      const canvas = document.querySelector('#canvas');
      const stage = document.querySelector('#canvas-stage').getBoundingClientRect();
      return {
        width: stage.width,
        height: stage.height,
        synchronized: canvas.width === Math.round(stage.width * devicePixelRatio)
          && canvas.height === Math.round(stage.height * devicePixelRatio),
        expectedText: `${Math.round(stage.width)} × ${Math.round(stage.height)}`,
        actualText: document.querySelector('#canvas-size').textContent,
      };
    });
  }

  test('business resizes its bitmap and CSS measurements when chrome and viewport change', async ({ page }) => {
    await openDemo(page);
    await expect.poll(async () => (await canvasDimensions(page)).synchronized).toBe(true);
    const original = await canvasDimensions(page);
    await page.locator('#header-toggle').uncheck();
    await page.locator('#footer-toggle').uncheck();
    await expect.poll(async () => (await canvasDimensions(page)).height).toBeGreaterThan(original.height);
    await expect.poll(async () => (await canvasDimensions(page)).synchronized).toBe(true);
    const expanded = await canvasDimensions(page);
    expect(expanded.actualText).toBe(expanded.expectedText);
    await page.setViewportSize({ width: 900, height: 760 });
    await expect.poll(async () => (await canvasDimensions(page)).width).toBeLessThan(expanded.width);
    await expect.poll(async () => (await canvasDimensions(page)).synchronized).toBe(true);
    const resized = await canvasDimensions(page);
    expect(resized.actualText).toBe(resized.expectedText);
  });
});

test('mobile demo controls remain usable in immersion and long navigation does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openDemo(page);
  await page.locator('#wrap-toggle').click();
  await expect(page.locator('#wrap-toggle')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#immerse').click();
  await expect(page.locator('#immerse')).toBeVisible();
  expect(await visibility(page)).toEqual({ header: false, footer: false });
  await page.locator('#footer-toggle').uncheck();
  await page.locator('#immerse').click();
  expect(await visibility(page)).toEqual({ header: true, footer: false });
  await page.locator('#footer-toggle').check();
  expect(await visibility(page)).toEqual({ header: true, footer: true });
  await expect(page.locator('#fullscreen')).toBeVisible();
});

test('a pending remote configuration does not block business Canvas or visibility controls', async ({ page }) => {
  let releaseRoute;
  const pendingRoute = new Promise(resolve => { releaseRoute = resolve; });
  await page.route('**/config/site.json', route => { releaseRoute(route); });
  await page.goto('/demo/', { waitUntil: 'domcontentloaded' });
  const configRoute = await pendingRoute;
  await page.locator('#shell').evaluate(element => { window.pendingConfigReady = element.ready; });
  await expect(page.locator('#canvas-size')).not.toHaveText('测量中');
  expect(await page.locator('#canvas').evaluate(canvas => {
    return canvas.getContext('2d').getImageData(1, 1, 1, 1).data[3];
  })).toBe(255);
  await expect(page.locator('#wrap-toggle')).toBeDisabled();
  await page.locator('#header-toggle').uncheck();
  expect(await visibility(page)).toEqual({ header: false, footer: true });
  await page.locator('#immerse').click();
  expect(await visibility(page)).toEqual({ header: false, footer: false });
  await page.locator('#immerse').click();
  expect(await visibility(page)).toEqual({ header: false, footer: true });

  await configRoute.fulfill({ json: {
    brand: { label: 'Delayed shared brand', href: '/' },
    navigation: [{ id: 'overview', label: 'Overview', href: '/demo/' }],
    footer: { text: 'Delayed footer', links: [] },
  } });
  expect(await page.evaluate(() => window.pendingConfigReady)).toBe(true);
  await expect(page.locator('#wrap-toggle')).toBeEnabled();
  await expect(page.getByText('Delayed footer', { exact: true })).toBeVisible();
  expect(await visibility(page)).toEqual({ header: false, footer: true });
});
