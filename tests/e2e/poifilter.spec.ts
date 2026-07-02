import { test, expect, type Page } from '@playwright/test';

async function openApp(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.map-list-item', { timeout: 15_000 });
}

test.describe('poi category legend', () => {
  test('legend lists kinds with counts; unchecking hides that category', async ({ page }) => {
    await openApp(page);
    const legendVisible = await page.locator('.poi-filter').isVisible();
    test.skip(!legendVisible, 'current world map has no POIs');

    const rows = await page.locator('.poi-filter-item').count();
    expect(rows).toBeGreaterThan(0);

    // pick the first category and count its markers
    const kind = await page.locator('.poi-filter-item input').first().getAttribute('data-kind');
    const markersBefore = await page.locator(`.poi-marker.poi-${kind}`).count();
    expect(markersBefore).toBeGreaterThan(0);

    await page.locator('.poi-filter-item input').first().uncheck();
    await expect(page.locator(`.poi-marker.poi-${kind}`)).toHaveCount(0);

    // other categories stay (if the map has more than one)
    if (rows > 1) {
      const totalLeft = await page.locator('.poi-marker').count();
      expect(totalLeft).toBeGreaterThan(0);
    }

    await page.locator('.poi-filter-item input').first().check();
    await expect(page.locator(`.poi-marker.poi-${kind}`)).toHaveCount(markersBefore);
  });

  test('filter persists across reload and is per user', async ({ page }) => {
    await openApp(page);
    const legendVisible = await page.locator('.poi-filter').isVisible();
    test.skip(!legendVisible, 'current world map has no POIs');

    const kind = await page.locator('.poi-filter-item input').first().getAttribute('data-kind');
    await page.locator('.poi-filter-item input').first().uncheck();
    await expect(page.locator(`.poi-marker.poi-${kind}`)).toHaveCount(0);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.poi-filter-item');
    await expect(page.locator('.poi-filter-item input').first()).not.toBeChecked();
    await expect(page.locator(`.poi-marker.poi-${kind}`)).toHaveCount(0);

    // a fresh user sees everything again
    await page.click('.user-menu-btn');
    await page.fill('.user-menu-input', 'FilterFresh');
    await page.click('.user-menu-add');
    await expect(page.locator('.poi-filter-item input').first()).toBeChecked();
    await expect
      .poll(() => page.locator(`.poi-marker.poi-${kind}`).count())
      .toBeGreaterThan(0);
  });

  test('marking one chest does not rebuild the whole poi layer', async ({ page }) => {
    await openApp(page);
    const panelVisible = await page.locator('.treasure-panel').isVisible();
    test.skip(!panelVisible, 'current world map has no treasure list');

    // tag every marker element, toggle one mark, then verify untouched markers
    // kept their DOM nodes (incremental update, not clearLayers + rebuild).
    await page.evaluate(() => {
      document.querySelectorAll('.leaflet-marker-icon').forEach((el, i) => {
        (el as HTMLElement).dataset.probe = String(i);
      });
    });
    await page.locator('.treasure-item .treasure-mark').first().check();
    await expect(page.locator('.treasure-count')).toContainText('1/');
    const surviving = await page.evaluate(
      () => document.querySelectorAll('.leaflet-marker-icon[data-probe]').length,
    );
    const total = await page.locator('.leaflet-marker-icon').count();
    expect(surviving).toBeGreaterThan(total - 3); // only the toggled marker was rebuilt
  });
});
