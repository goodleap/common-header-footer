import { test, expect } from '@playwright/test';

const modulePath = '/src/common-header-footer.js';
const config = {
  brand: { label: 'Shared brand', href: '/' },
  navigation: [
    { id: 'alpha', label: 'Alpha project', href: '/alpha/' },
    { id: 'beta', label: 'Beta project', href: 'https://projects.example.test/beta/' },
  ],
  footer: {
    text: 'Shared footer',
    links: [{ label: 'Documentation', href: '/docs/' }],
  },
};

async function mount(page, markup, { configure = true } = {}) {
  await page.goto('/');
  await page.setContent(`<!doctype html><html><head><style>
    html, body { margin: 0; }
    common-shell { display: block; width: 100%; height: 520px; }
    .business { box-sizing: border-box; width: 100%; height: 100%; min-height: 0; overflow: auto; }
  </style></head><body>${markup}</body></html>`);
  await page.evaluate(async ({ modulePath, config, configure }) => {
    await import(modulePath);
    if (configure) {
      document.querySelectorAll('common-header, common-footer, common-shell').forEach(element => {
        element.config = config;
      });
    }
  }, { modulePath, config, configure });
}

async function shellRect(page) {
  return page.locator('common-shell').evaluate(shell => {
    const content = shell.querySelector('.business').getBoundingClientRect();
    const measured = shell.getContentRect();
    return { width: content.width, height: content.height, measuredWidth: measured.width, measuredHeight: measured.height };
  });
}

test('import alone leaves business DOM intact and repeated imports are safe', async ({ page }) => {
  await mount(page, '<main id="business">Existing business content</main>');
  const before = await page.locator('body').innerHTML();
  await page.evaluate(async () => {
    await import('/src/common-header-footer.js?second-import');
    await import('/src/common-header-footer.js?third-import');
  });
  expect(await page.locator('body').innerHTML()).toBe(before);
  expect(await page.locator('common-header, common-footer, common-shell').count()).toBe(0);
  await expect(page.locator('#business')).toHaveText('Existing business content');
});

test('standalone header and footer show by default and toggle independently without placeholders', async ({ page }) => {
  await mount(page, '<common-header></common-header><main>Business</main><common-footer></common-footer>');
  const header = page.locator('common-header');
  const footer = page.locator('common-footer');
  await expect(header.getByRole('link', { name: 'Shared brand' })).toBeVisible();
  await expect(footer.getByText('Shared footer')).toBeVisible();

  await header.evaluate(element => element.hide());
  await expect(header).toBeHidden();
  expect(await header.evaluate(element => element.getBoundingClientRect().height)).toBe(0);
  await expect(footer).toBeVisible();
  await header.evaluate(element => element.show());
  await footer.evaluate(element => { element.hidden = true; });
  await expect(header).toBeVisible();
  expect(await footer.evaluate(element => element.getBoundingClientRect().height)).toBe(0);
  await footer.evaluate(element => { element.hidden = false; });
  await expect(footer).toBeVisible();
});

test('initial hidden configuration and subsequent independent visibility changes are honored', async ({ page }) => {
  await mount(page, '<common-shell hide-header><main class="business">Business</main></common-shell>');
  const shell = page.locator('common-shell');
  expect(await shell.evaluate(element => element.getVisibility())).toEqual({ header: false, footer: true });
  await expect(shell.locator('common-header')).toBeHidden();
  await expect(shell.locator('common-footer')).toBeVisible();

  await shell.evaluate(element => element.setVisibility({ header: true, footer: false }));
  expect(await shell.evaluate(element => element.getVisibility())).toEqual({ header: true, footer: false });
  await expect(shell.locator('common-header')).toBeVisible();
  await expect(shell.locator('common-footer')).toBeHidden();

  await shell.evaluate(element => element.hide());
  expect(await shell.evaluate(element => element.getVisibility())).toEqual({ header: false, footer: false });
  await shell.evaluate(element => element.show('footer'));
  expect(await shell.evaluate(element => element.getVisibility())).toEqual({ header: false, footer: true });
});

test('hidden shell rows release their space and content-resize follows actual available area', async ({ page }) => {
  await mount(page, '<common-shell><main class="business">Business viewport</main></common-shell>');
  const shell = page.locator('common-shell');
  await expect.poll(async () => (await shellRect(page)).height).toBeGreaterThan(0);
  const withBoth = await shellRect(page);
  expect(withBoth.height).toBeLessThan(520);
  expect(withBoth.measuredHeight).toBeCloseTo(withBoth.height, 0);
  expect(withBoth.measuredWidth).toBeCloseTo(withBoth.width, 0);

  await shell.evaluate(element => {
    window.resizeEvents = [];
    element.addEventListener('content-resize', event => window.resizeEvents.push(event.detail));
    element.hide('header');
  });
  await expect.poll(async () => (await shellRect(page)).height).toBeGreaterThan(withBoth.height);
  const withFooter = await shellRect(page);
  await shell.evaluate(element => element.hide('footer'));
  await expect.poll(async () => (await shellRect(page)).height).toBeCloseTo(520, 0);
  expect(withFooter.height).toBeLessThan(520);
  await expect.poll(() => page.evaluate(() => window.resizeEvents.at(-1)?.height ?? 0)).toBeCloseTo(520, 0);

  await shell.evaluate(element => { element.style.height = '360px'; });
  await expect.poll(async () => (await shellRect(page)).height).toBeCloseTo(360, 0);
  await expect.poll(() => page.evaluate(() => window.resizeEvents.at(-1)?.height ?? 0)).toBeCloseTo(360, 0);
  await shell.evaluate(element => element.show());
  await expect.poll(async () => (await shellRect(page)).height).toBeLessThan(360);
});

test('nested immersion restores the latest requested visibility and releases are idempotent', async ({ page }) => {
  await mount(page, '<common-shell hide-footer><main class="business">Business</main></common-shell>');
  const shell = page.locator('common-shell');
  await shell.evaluate(element => {
    window.releaseFirst = element.suspend();
    window.releaseSecond = element.suspend();
  });
  expect(await shell.evaluate(element => element.getVisibility())).toEqual({ header: false, footer: false });

  await shell.evaluate(element => {
    element.setVisibility({ header: false, footer: true });
    window.releaseFirst();
    window.releaseFirst();
  });
  expect(await shell.evaluate(element => element.getVisibility())).toEqual({ header: false, footer: false });
  await page.evaluate(() => window.releaseSecond());
  expect(await shell.evaluate(element => element.getVisibility())).toEqual({ header: false, footer: true });
  await page.evaluate(() => window.releaseSecond());
  expect(await shell.evaluate(element => element.getVisibility())).toEqual({ header: false, footer: true });
});

test('standalone suspension preserves a previously hidden footer', async ({ page }) => {
  await mount(page, '<common-header></common-header><common-footer hidden></common-footer>');
  await page.evaluate(() => {
    const header = document.querySelector('common-header');
    const footer = document.querySelector('common-footer');
    window.releaseHeader = header.suspend();
    window.releaseFooter = footer.suspend();
  });
  await expect(page.locator('common-header')).toBeHidden();
  await expect(page.locator('common-footer')).toBeHidden();
  await page.evaluate(() => { window.releaseHeader(); window.releaseFooter(); });
  await expect(page.locator('common-header')).toBeVisible();
  await expect(page.locator('common-footer')).toBeHidden();
});

test('repeated configuration and reconnect do not duplicate component content', async ({ page }) => {
  await mount(page, '<common-shell><main class="business">Business</main></common-shell>');
  await page.locator('common-shell').evaluate((element, settings) => {
    for (let index = 0; index < 5; index++) element.config = settings;
    element.remove();
    document.body.append(element);
  }, config);
  await expect(page.locator('common-shell')).toHaveCount(1);
  await expect(page.locator('common-shell common-header')).toHaveCount(1);
  await expect(page.locator('common-shell common-footer')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Alpha project' })).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Documentation' })).toHaveCount(1);
});

test('config assigned before custom-element upgrade is preserved and later setters still work', async ({ page }) => {
  await page.goto('/');
  await page.setContent('<common-shell><main>Business</main></common-shell>');
  await page.evaluate(async ({ modulePath, config }) => {
    document.querySelector('common-shell').config = config;
    await import(modulePath);
  }, { modulePath, config });
  const shell = page.locator('common-shell');
  await expect(shell.getByRole('link', { name: 'Shared brand' })).toBeVisible();
  expect(await shell.evaluate(element => Object.hasOwn(element, 'config'))).toBe(false);
  await shell.evaluate((element, settings) => {
    element.config = { ...settings, brand: { label: 'Updated after upgrade', href: '/' } };
    element.remove();
    document.body.append(element);
    return element.ready;
  }, config);
  await expect(shell.getByRole('link', { name: 'Updated after upgrade' })).toBeVisible();
  await expect(shell.getByRole('link', { name: 'Shared brand' })).toHaveCount(0);
});

test('inline config survives reconnect with config-src until an explicit source change or reload', async ({ page }) => {
  await page.route('**/first-config.json', route => route.fulfill({ json: {
    ...config, brand: { label: 'First remote brand', href: '/' },
  } }));
  let secondRequests = 0;
  await page.route('**/second-config.json', route => {
    secondRequests++;
    return route.fulfill({ json: {
      ...config, brand: { label: 'Second remote brand', href: '/' },
    } });
  });
  await mount(page, '<common-shell config-src="/first-config.json"><main class="business">Business</main></common-shell>', { configure: false });
  const shell = page.locator('common-shell');
  await expect(shell.getByRole('link', { name: 'First remote brand' })).toBeVisible();

  async function applyInlineAndReconnect() {
    await shell.evaluate((element, settings) => {
      element.config = settings;
      element.remove();
      document.body.append(element);
      return element.ready;
    }, config);
    await expect(shell.getByRole('link', { name: 'Shared brand' })).toBeVisible();
  }

  await applyInlineAndReconnect();
  await shell.evaluate(element => element.setAttribute('config-src', '/second-config.json'));
  await expect(shell.getByRole('link', { name: 'Second remote brand' })).toBeVisible();
  await applyInlineAndReconnect();
  expect(secondRequests).toBe(1);
  await shell.evaluate(element => element.reloadConfig());
  await expect(shell.getByRole('link', { name: 'Second remote brand' })).toBeVisible();
  expect(secondRequests).toBe(2);
});

for (const replacement of ['new source', 'inline config']) {
  test(`a delayed old config cannot overwrite ${replacement}`, async ({ page }) => {
    let releaseRoute;
    const pendingRoute = new Promise(resolve => { releaseRoute = resolve; });
    await page.route('**/slow-config.json', route => { releaseRoute(route); });
    await page.route('**/latest-config.json', route => route.fulfill({ json: {
      ...config, brand: { label: 'Latest remote brand', href: '/' },
    } }));
    await mount(page, '<common-shell config-src="/slow-config.json"><main class="business">Business</main></common-shell>', { configure: false });
    const oldRoute = await pendingRoute;
    const shell = page.locator('common-shell');
    await shell.evaluate(element => { window.oldConfigReady = element.ready; });
    if (replacement === 'new source') {
      await shell.evaluate(element => element.setAttribute('config-src', '/latest-config.json'));
    } else {
      await shell.evaluate((element, settings) => { element.config = settings; }, config);
    }
    const expectedBrand = replacement === 'new source' ? 'Latest remote brand' : 'Shared brand';
    await expect(shell.getByRole('link', { name: expectedBrand })).toBeVisible();
    await oldRoute.fulfill({ json: { ...config, brand: { label: 'Stale remote brand', href: '/' } } });
    expect(await page.evaluate(() => window.oldConfigReady)).toBe(false);
    await expect(shell.getByRole('link', { name: expectedBrand })).toBeVisible();
    await expect(shell.getByRole('link', { name: 'Stale remote brand' })).toHaveCount(0);
  });
}

test('component styles stay isolated from business styles and do not take over page scrolling', async ({ page }) => {
  await mount(page, `<style>
    body { overflow: visible; }
    a { color: rgb(190, 0, 80); padding: 91px; position: fixed; }
    header, footer { display: none; }
    .business { background: rgb(230, 231, 232); }
  </style><common-shell><main class="business"><a id="business-link" href="#">Business link</a></main></common-shell>`);
  await expect(page.getByRole('link', { name: 'Shared brand' })).toBeVisible();
  await expect(page.getByText('Shared footer')).toBeVisible();
  expect(await page.locator('#business-link').evaluate(element => getComputedStyle(element).color)).toBe('rgb(190, 0, 80)');
  expect(await page.locator('body').evaluate(element => getComputedStyle(element).overflow)).toBe('visible');
  expect(await page.getByRole('link', { name: 'Alpha project' }).evaluate(element => getComputedStyle(element).position)).not.toBe('fixed');
  expect(await page.locator('.business').evaluate(element => element.parentElement.tagName)).toBe('COMMON-SHELL');
});

test('one centralized configuration request is shared and explicit reload refreshes it', async ({ page }) => {
  let requests = 0;
  await page.route('**/shared-config.json', route => {
    requests++;
    return route.fulfill({ json: { ...config, brand: { label: `Configured brand ${requests}`, href: '/' } } });
  });
  await mount(page, '<common-header config-src="/shared-config.json"></common-header><common-footer config-src="/shared-config.json"></common-footer><common-shell config-src="/shared-config.json"><main class="business">Business</main></common-shell>', { configure: false });
  await expect(page.getByRole('link', { name: 'Configured brand 1', exact: true })).toHaveCount(2);
  await expect(page.getByText('Shared footer', { exact: true })).toHaveCount(2);
  expect(requests).toBe(1);
  await page.locator('body > common-header').evaluate(element => element.reloadConfig());
  await expect(page.locator('body > common-header').getByRole('link', { name: 'Configured brand 2', exact: true })).toBeVisible();
  expect(requests).toBe(2);
});

test('configuration failure reports an error and leaves the business viewport usable', async ({ page }) => {
  await page.route('**/unavailable-config.json', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await mount(page, '<common-shell><main class="business">Business remains available</main></common-shell>');
  await page.locator('common-shell').evaluate(element => {
    window.configurationError = null;
    element.addEventListener('config-error', event => { window.configurationError = String(event.detail.error); });
    element.setAttribute('config-src', '/unavailable-config.json');
  });
  await expect.poll(() => page.evaluate(() => window.configurationError)).toBeTruthy();
  await expect(page.getByText('Business remains available')).toBeVisible();
  expect((await shellRect(page)).height).toBeGreaterThan(0);
});

test('labels render as text and unsafe navigation protocols never become links', async ({ page }) => {
  await mount(page, '<common-shell><main class="business">Business</main></common-shell>');
  await page.locator('common-shell').evaluate(element => {
    element.config = {
      brand: { label: '<img src=x onerror="window.injected=true">', href: '/' },
      navigation: [
        { id: 'local', label: 'Local path', href: '/local/' },
        { id: 'external', label: 'External project', href: 'https://sub.example.test/', newTab: true },
      ],
      footer: { text: '<script>window.injected=true</script>', links: [] },
    };
  });
  await expect(page.getByRole('link', { name: '<img src=x onerror="window.injected=true">' })).toBeVisible();
  await expect(page.getByText('<script>window.injected=true</script>', { exact: true })).toBeVisible();
  const rejected = await page.locator('common-shell').evaluate(element => {
    return ['javascript:alert(1)', 'data:text/html,bad'].map(href => {
      try {
        element.config = { navigation: [{ label: 'Unsafe link', href }] };
        return false;
      } catch (error) {
        return error instanceof TypeError;
      }
    });
  });
  expect(rejected).toEqual([true, true]);
  const hrefs = await page.locator('common-shell').locator('a').evaluateAll(links => links.map(link => link.getAttribute('href')));
  expect(hrefs.some(href => /^(javascript|data):/i.test(href ?? ''))).toBe(false);
  expect(await page.locator('common-shell').locator('img, script').count()).toBe(0);
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
  await expect(page.getByRole('link', { name: 'Local path' })).toHaveAttribute('href', 'http://127.0.0.1:4173/local/');
  const external = page.getByRole('link', { name: 'External project' });
  await expect(external).toHaveAttribute('target', '_blank');
  await expect(external).toHaveAttribute('rel', /noopener/);
});

test('navigation supports keyboard focus and an explicit current project', async ({ page }) => {
  await mount(page, '<common-header current="alpha"></common-header><button>Business action</button>');
  const brand = page.getByRole('link', { name: 'Shared brand' });
  const alpha = page.getByRole('link', { name: 'Alpha project' });
  await expect(alpha).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Tab');
  await expect(brand).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(alpha).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Beta project' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Business action' })).toBeFocused();
});

test('narrow screens wrap long labels and resize the content area without horizontal page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await mount(page, '<common-shell><main class="business">Business</main></common-shell>');
  const before = await shellRect(page);
  await page.locator('common-shell').evaluate((element, settings) => {
    element.config = {
      ...settings,
      brand: { label: 'A very long shared brand name that still needs to fit', href: '/' },
      navigation: [
        { id: 'a', label: 'An unusually long project navigation label', href: '/a/' },
        { id: 'b', label: 'Another project with a descriptive navigation label', href: '/b/' },
      ],
    };
  }, config);
  await expect.poll(async () => (await shellRect(page)).height).toBeLessThan(before.height);
  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
  }));
  expect(overflow.page).toBeLessThanOrEqual(overflow.viewport + 1);
  expect((await shellRect(page)).width).toBeCloseTo(320, 0);
  await expect(page.getByRole('link', { name: 'An unusually long project navigation label' })).toBeVisible();
});
