import { test, expect, type Page } from '@playwright/test';

/** Load the app and wait for the initial map + sidebar. */
async function openApp(page: Page, hash = ''): Promise<void> {
  await page.goto('/' + hash, { waitUntil: 'networkidle' });
  await page.waitForSelector('.map-list-item', { timeout: 15_000 });
}

interface FocusFixture {
  source: string;
  target: string;
  focus: [number, number];
}

/** Inject focus into a real exported trigger in-flight, without changing res/. */
async function openWithFocusedTrigger(page: Page, sameMap: boolean): Promise<FocusFixture | null> {
  let fixture: FocusFixture | null = null;
  await page.route('**/game.json', async (route) => {
    const response = await route.fetch();
    const config = await response.json();
    const source = config.defaultMap as string | undefined;
    const sourceMap = source ? config.maps?.[source] : undefined;
    const trigger = sourceMap?.triggers?.[0];
    const target = sameMap ? source : trigger?.target;
    const targetMap = target ? config.maps?.[target] : undefined;
    if (!fixture && source && trigger && target && targetMap) {
      const width = Number(targetMap.width ?? 512);
      const height = Number(targetMap.height ?? 512);
      const focus: [number, number] = [Math.round(width * 0.31), Math.round(height * 0.37)];
      trigger.target = target;
      trigger.focus = focus;
      delete trigger.kind;
      delete trigger.returnTargets;
      fixture = { source, target, focus };
    }
    await route.fulfill({ response, json: config });
  });
  await openApp(page);
  return fixture;
}

async function hashCenter(page: Page): Promise<[number, number] | null> {
  return page.evaluate(() => {
    const match = location.hash.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),/);
    return match ? [Number(match[1]), Number(match[2])] : null;
  });
}

test.describe('viewer basics', () => {
  test('initial load: sidebar, dropdown selection, hash, no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));

    await openApp(page);
    expect(await page.locator('.map-list-item').count()).toBeGreaterThan(0);

    const selected = await page.locator('.sidebar-game-select').inputValue();
    expect(selected.length).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#.+\/.+@/);
    expect(errors).toEqual([]);
  });

  test('game dropdown shows localized names for ALL games without visiting them', async ({ page }) => {
    await openApp(page);
    // background prefetch fills the names in shortly after first paint
    await expect.poll(async () => {
      const options = await page.locator('.sidebar-game-select option').allTextContents();
      // a raw id shown as the label means the config was not localized yet
      const values = await page.locator('.sidebar-game-select option').evaluateAll(
        (els) => els.map((el) => (el as HTMLOptionElement).value),
      );
      return options.every((text, i) => text !== values[i]);
    }, { timeout: 10_000 }).toBe(true);
  });

  test('grid overlay renders as a single svg path', async ({ page }) => {
    await openApp(page);
    const before = await page.locator('#map svg path').count();
    await page.click('.btn-grid');
    await expect.poll(() => page.locator('#map svg path').count()).toBe(before + 1);
    await page.click('.btn-grid');
    await expect.poll(() => page.locator('#map svg path').count()).toBe(before);
  });

  test('sidebar navigation pushes history; browser back/forward navigate maps', async ({ page }) => {
    await openApp(page);
    const worldHash = await page.evaluate(() => location.hash);
    const target = await page.locator('.map-list-item').nth(1).getAttribute('data-map-id');
    await page.locator('.map-list-item').nth(1).click();
    await expect.poll(() => page.evaluate(() => location.hash)).toContain(target!);

    await page.goBack();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe(worldHash);
    await expect(page.locator('.map-list-item.active')).not.toHaveAttribute('data-map-id', target!);

    await page.goForward();
    await expect.poll(() =>
      page.locator('.map-list-item.active').getAttribute('data-map-id'),
    ).toBe(target);
  });

  test('doors extend the breadcrumb; sidebar map-select resets it (teleport, not a door)', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('.breadcrumb-item')).toHaveCount(1); // world map is the root

    // A door pushes a level onto the back-stack.
    const box = await page.locator('#map path.leaflet-interactive:not(.poi-hover)').first().boundingBox();
    test.skip(!box, 'world map needs a clickable door');
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await expect(page.locator('.breadcrumb-item')).toHaveCount(2);
    await expect(page.locator('.btn-back')).toBeEnabled();

    // Picking a map from the sidebar list is a jump — it starts a fresh path,
    // it does not keep pushing onto the door-entry breadcrumb.
    await page.locator('.map-list-item:not(.active)').first().click();
    await expect(page.locator('.breadcrumb-item')).toHaveCount(1);
    await expect(page.locator('.btn-back')).toBeDisabled();
  });

  test('trigger hover previews the target map; click navigates; back restores the view', async ({ page }) => {
    await openApp(page);
    const worldHash = await page.evaluate(() => location.hash);

    // exclude POI chest zones — they are interactive svg paths too
    const trigger = page.locator('#map path.leaflet-interactive:not(.poi-hover)').first();
    const box = await trigger.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await expect(page.locator('.trigger-preview')).toBeVisible();

    await page.mouse.down();
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => location.hash)).not.toBe(worldHash);

    await page.goBack();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe(worldHash);
  });

  test('trigger focus pans to its arrival pixel after cross-map navigation', async ({ page }) => {
    const fixture = await openWithFocusedTrigger(page, false);
    test.skip(!fixture, 'default map needs a trigger with a concrete target');

    await page.locator('#map path.leaflet-interactive:not(.poi-hover)').first().click({ force: true });
    await expect.poll(() =>
      page.locator('.map-list-item.active').getAttribute('data-map-id'),
    ).toBe(fixture!.target);
    await expect.poll(async () => Math.abs((await hashCenter(page))![0] + fixture!.focus[1]))
      .toBeLessThanOrEqual(1);
    await expect.poll(async () => Math.abs((await hashCenter(page))![1] - fixture!.focus[0]))
      .toBeLessThanOrEqual(1);
  });

  test('same-map trigger focus pans without reloading or adding a map-history entry', async ({ page }) => {
    const fixture = await openWithFocusedTrigger(page, true);
    test.skip(!fixture, 'default map needs a trigger');
    const before = await page.evaluate(() => location.hash);

    await page.locator('#map path.leaflet-interactive:not(.poi-hover)').first().click({ force: true });
    await expect(page.locator('.map-list-item.active')).toHaveAttribute('data-map-id', fixture!.source);
    await expect.poll(async () => Math.abs((await hashCenter(page))![0] + fixture!.focus[1]))
      .toBeLessThanOrEqual(1);
    await expect.poll(async () => Math.abs((await hashCenter(page))![1] - fixture!.focus[0]))
      .toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => location.hash)).not.toBe(before);
    await expect(page.locator('.btn-back')).toBeDisabled();
  });

  test('exported Golden Sun map 016 door pans to its real same-map entrance', async ({ page }) => {
    const response = await page.request.get('/res/golden_sun/game.json');
    test.skip(!response.ok(), 'Golden Sun export is optional test data');
    const config = await response.json();
    const triggers = config.maps?.map_016?.triggers ?? [];
    const index = triggers.findIndex((trigger: { target?: string; focus?: [number, number] }) =>
      trigger.target === 'map_016' && Array.isArray(trigger.focus));
    test.skip(index < 0, 'map_016 needs an exported same-map door with focus');
    const focus = triggers[index].focus as [number, number];

    await openApp(page, '#golden_sun/map_016');
    await expect(page.locator('.map-list-item.active')).toHaveAttribute('data-map-id', 'map_016');
    const paths = page.locator('#map path.leaflet-interactive:not(.poi-hover)');
    await expect.poll(() => paths.count()).toBeGreaterThanOrEqual(triggers.length);
    await paths.nth(index).click({ force: true });

    await expect(page.locator('.map-list-item.active')).toHaveAttribute('data-map-id', 'map_016');
    await expect.poll(async () => Math.abs((await hashCenter(page))![0] + focus[1]))
      .toBeLessThanOrEqual(1);
    await expect.poll(async () => Math.abs((await hashCenter(page))![1] - focus[0]))
      .toBeLessThanOrEqual(1);
  });

  test('deep link to another game syncs the dropdown and it can switch back', async ({ page }) => {
    await openApp(page);
    const values = await page.locator('.sidebar-game-select option').evaluateAll(
      (els) => els.map((el) => (el as HTMLOptionElement).value),
    );
    test.skip(values.length < 2, 'needs at least two games in the registry');

    const second = values[1];
    await openApp(page, `#${second}/world_map`);
    await expect(page.locator('.sidebar-game-select')).toHaveValue(second);

    await page.selectOption('.sidebar-game-select', values[0]);
    await expect.poll(() => page.evaluate(() => location.hash)).toContain(`#${values[0]}/`);
  });

  test('language switch re-renders the UI in place', async ({ page }) => {
    await openApp(page);
    await page.selectOption('.toolbar-lang-select', 'en');
    await expect(page.locator('.btn-back')).toContainText('Back');
    await page.selectOption('.toolbar-lang-select', 'zh');
    await expect(page.locator('.btn-back')).toContainText('返回');
  });

  test('a missing map image surfaces a visible error', async ({ page }) => {
    await openApp(page);
    await page.click('.sidebar-add-map-btn');
    await page.fill('.add-map-id', 'zz_e2e_bad_image');
    await page.fill('.add-map-image', 'scene_maps/definitely_missing.png');
    await page.click('.add-map-confirm');
    await page.locator('.map-list-item[data-map-id="zz_e2e_bad_image"]').click();
    await expect(page.locator('.map-loading')).toBeVisible({ timeout: 10_000 });
  });
});
