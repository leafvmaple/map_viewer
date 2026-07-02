import { test, expect, type Page } from '@playwright/test';

/** Load the app and wait for the initial map + sidebar. */
async function openApp(page: Page, hash = ''): Promise<void> {
  await page.goto('/' + hash, { waitUntil: 'networkidle' });
  await page.waitForSelector('.map-list-item', { timeout: 15_000 });
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

  test('trigger hover previews the target map; click navigates; back restores the view', async ({ page }) => {
    await openApp(page);
    const worldHash = await page.evaluate(() => location.hash);

    const trigger = page.locator('#map path.leaflet-interactive').first();
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
