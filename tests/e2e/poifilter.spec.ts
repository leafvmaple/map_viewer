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

    // pick the first category and count its markers/zones (.poi-{kind} matches both)
    const kind = await page.locator('.poi-filter-item input').first().getAttribute('data-kind');
    const markersBefore = await page.locator(`#map .poi-${kind}`).count();
    expect(markersBefore).toBeGreaterThan(0);

    await page.locator('.poi-filter-item input').first().uncheck();
    await expect(page.locator(`#map .poi-${kind}`)).toHaveCount(0);

    // other categories stay (if the map has more than one)
    if (rows > 1) {
      const totalLeft = await page.locator('#map .poi-marker, #map path.poi-hover').count();
      expect(totalLeft).toBeGreaterThan(0);
    }

    await page.locator('.poi-filter-item input').first().check();
    await expect(page.locator(`#map .poi-${kind}`)).toHaveCount(markersBefore);
  });

  test('filter persists across reload and is per user', async ({ page }) => {
    await openApp(page);
    const legendVisible = await page.locator('.poi-filter').isVisible();
    test.skip(!legendVisible, 'current world map has no POIs');

    const kind = await page.locator('.poi-filter-item input').first().getAttribute('data-kind');
    await page.locator('.poi-filter-item input').first().uncheck();
    await expect(page.locator(`#map .poi-${kind}`)).toHaveCount(0);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.poi-filter-item');
    await expect(page.locator('.poi-filter-item input').first()).not.toBeChecked();
    await expect(page.locator(`#map .poi-${kind}`)).toHaveCount(0);

    // a fresh user sees everything again
    await page.click('.user-menu-btn');
    await page.fill('.user-menu-input', 'FilterFresh');
    await page.click('.user-menu-add');
    await expect(page.locator('.poi-filter-item input').first()).toBeChecked();
    await expect
      .poll(() => page.locator(`#map .poi-${kind}`).count())
      .toBeGreaterThan(0);
  });

  test('marking one chest does not rebuild the whole poi layer', async ({ page }) => {
    await openApp(page);
    const panelVisible = await page.locator('.treasure-panel').isVisible();
    test.skip(!panelVisible, 'current world map has no treasure list');

    // tag every svg path (chest zones + triggers), toggle one mark, then verify
    // untouched elements kept their DOM nodes (incremental update, not a rebuild).
    const before = await page.evaluate(() => {
      const paths = document.querySelectorAll('#map svg path');
      paths.forEach((el, i) => { (el as SVGPathElement).dataset.probe = String(i); });
      return paths.length;
    });
    await page.locator('.treasure-item .treasure-mark').first().check();
    await expect(page.locator('.treasure-count')).toContainText('1/');
    const surviving = await page.evaluate(
      () => document.querySelectorAll('#map svg path[data-probe]').length,
    );
    expect(surviving).toBeGreaterThan(before - 3); // only the toggled zone was rebuilt
  });
});
