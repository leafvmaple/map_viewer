import { test, expect, type Page } from '@playwright/test';

async function openApp(page: Page, hash = ''): Promise<void> {
  await page.goto('/' + hash, { waitUntil: 'networkidle' });
  await page.waitForSelector('.map-list-item', { timeout: 15_000 });
}

/** Marked baked chests get a check overlay; hidden/sprite POIs dim their marker. */
function markedMapPoi(page: Page) {
  return page.locator('.poi-check, .poi-marker.poi-marked');
}

test.describe('global item search', () => {
  test('searching an item name lists it; clicking jumps to it and anchors the hash', async ({ page }) => {
    await openApp(page);
    const panelVisible = await page.locator('.treasure-panel').isVisible();
    test.skip(!panelVisible, 'current world map has no treasure list');

    // use a real item name from the current map's chest list as the query
    const itemName = (await page.locator('.treasure-item .treasure-name').first().textContent())!.trim();
    await page.fill('.sidebar-search', itemName);
    await expect(page.locator('.poi-result').first()).toBeVisible();

    await page.locator('.poi-result').first().click();
    await expect
      .poll(() => page.evaluate(() => location.hash))
      .toContain('&poi=');
  });
});

test.describe('collection checklist', () => {
  test('drawer shows game-wide progress; checkbox updates it everywhere', async ({ page }) => {
    await openApp(page);
    await page.click('.btn-checklist');
    await expect(page.locator('.checklist')).toBeVisible();

    const progress = (await page.locator('.checklist-progress').textContent())!;
    const total = parseInt(progress.match(/\/\s*(\d+)/)![1], 10);
    test.skip(total === 0, 'game has no chests');
    expect(progress).toContain('0 /');

    await page.locator('.checklist-row .checklist-mark').first().check();
    await expect(page.locator('.checklist-progress')).toContainText(`1 / ${total}`);

    // hide-collected filter removes the row
    await page.locator('.checklist-hide').check();
    await expect(page.locator('.checklist-row.marked')).toHaveCount(0);
    await page.locator('.checklist-hide').uncheck();
    await expect(page.locator('.checklist-row.marked')).toHaveCount(1);

    // in-drawer search narrows rows
    const firstName = (await page.locator('.checklist-row .checklist-name').first().textContent())!.trim();
    await page.fill('.checklist-search', firstName);
    expect(await page.locator('.checklist-row').count()).toBeGreaterThan(0);

    // Esc closes and the toolbar button de-activates
    await page.keyboard.press('Escape');
    await expect(page.locator('.checklist')).toBeHidden();
    await expect(page.locator('.btn-checklist')).not.toHaveClass(/active/);
  });

  test('clicking a row on another map navigates there', async ({ page }) => {
    await openApp(page);
    await page.click('.btn-checklist');
    const groups = await page.locator('.checklist-group').count();
    test.skip(groups < 2, 'all chests are on a single map');

    const currentMap = await page.locator('.map-list-item.active').getAttribute('data-map-id');
    // pick the first row of the second group (a different map than the world)
    const row = page.locator('.checklist-group').nth(1).locator('.checklist-row').first();
    const targetMap = await row.getAttribute('data-map-id');
    test.skip(targetMap === currentMap, 'second group is the current map');

    await row.click();
    await expect
      .poll(() => page.locator('.map-list-item.active').getAttribute('data-map-id'))
      .toBe(targetMap);
    await expect.poll(() => page.evaluate(() => location.hash)).toContain('&poi=');
  });
});

test.describe('hide collected on the map', () => {
  test('legend toggle removes collected markers and persists per user', async ({ page }) => {
    await openApp(page);
    const panelVisible = await page.locator('.treasure-panel').isVisible();
    test.skip(!panelVisible, 'current world map has no treasure list');

    await page.locator('.treasure-item .treasure-mark').first().check();
    await expect(markedMapPoi(page)).toHaveCount(1);

    await page.locator('.poi-filter input[data-hide-marked]').check();
    await expect(markedMapPoi(page)).toHaveCount(0);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.poi-filter-item');
    await expect(page.locator('.poi-filter input[data-hide-marked]')).toBeChecked();
    await expect(markedMapPoi(page)).toHaveCount(0);

    await page.locator('.poi-filter input[data-hide-marked]').uncheck();
    await expect(markedMapPoi(page)).toHaveCount(1);
  });
});

test.describe('poi deep link', () => {
  test('#game/map&poi=id pans to and anchors the marker on a fresh load', async ({ page }) => {
    await openApp(page);
    const panelVisible = await page.locator('.treasure-panel').isVisible();
    test.skip(!panelVisible, 'current world map has no treasure list');

    const poiId = await page.locator('.treasure-item').first().getAttribute('data-id');
    const gameId = await page.locator('.sidebar-game-select').inputValue();
    const mapId = await page.locator('.map-list-item.active').getAttribute('data-map-id');

    await page.goto(`/#${gameId}/${mapId}&poi=${poiId}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.map-list-item');
    await expect
      .poll(() => page.evaluate(() => location.hash))
      .toContain(`&poi=${poiId}`);
    // The anchored POI is on screen: baked chests use a hover zone, while
    // hidden or sprite-backed collectibles use a visible marker.
    await expect(page.locator('#map path.poi-hover, #map .poi-marker').first()).toBeVisible();
  });
});
