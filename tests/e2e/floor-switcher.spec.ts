import { test, expect, type Page } from '@playwright/test';

/**
 * In-map floor switcher (maps with `floorGroup`): opening a floored map shows
 * the pill stack; clicking another pill switches maps in place. Data-dependent —
 * skips when no exported game carries floor groups.
 */

interface Floored { gameId: string; mapId: string; group: string; size: number }

async function expectMapImageLoaded(page: Page, fileName: RegExp): Promise<void> {
  const image = page.locator('img.map-image');
  await expect(image).toHaveAttribute('src', fileName);
  await expect.poll(() => image.evaluate(element => {
    const img = element as HTMLImageElement;
    return img.complete && img.naturalWidth > 0;
  })).toBe(true);
}

async function findFlooredMap(page: Page): Promise<Floored | null> {
  const reg = await page.request.get('/games/registry.json');
  if (!reg.ok()) return null;
  for (const g of (await reg.json()).games ?? []) {
    const res = await page.request.get(g.configPath);
    if (!res.ok()) continue;
    const game = await res.json();
    const groups = new Map<string, string[]>();
    for (const [mapId, m] of Object.entries<{ floorGroup?: string }>(game.maps)) {
      if (m.floorGroup) {
        groups.set(m.floorGroup, [...(groups.get(m.floorGroup) ?? []), mapId]);
      }
    }
    // prefer the tallest building for a meaningful pill stack
    let best: Floored | null = null;
    for (const [group, ids] of groups) {
      if (ids.length >= 2 && (!best || ids.length > best.size)) {
        best = { gameId: game.id, mapId: ids[0], group, size: ids.length };
      }
    }
    if (best) return best;
  }
  return null;
}

test('floor pills appear on grouped maps and switch floors in place', async ({ page }) => {
  const found = await page.goto('/').then(() => findFlooredMap(page));
  test.skip(!found, 'no exported game has floorGroup data');
  const { gameId, mapId, size } = found!;

  await page.goto(`/#${gameId}/${mapId}`, { waitUntil: 'networkidle' });
  await expect(page.locator('.map-list-item.active')).toHaveAttribute('data-map-id', mapId);
  const switcher = page.locator('.floor-switcher');
  await expect(switcher).toBeVisible();
  await expect(switcher.locator('.floor-btn')).toHaveCount(size);
  await expect(switcher.locator('.floor-btn.active')).toHaveCount(1);

  // click a different floor: the map (and hash) switches, the pill follows
  const other = switcher.locator('.floor-btn:not(.active)').first();
  const targetId = await other.getAttribute('data-map-id');
  await other.click();
  await expect.poll(() => page.evaluate(() => location.hash)).toContain(targetId!);
  await expect(switcher.locator('.floor-btn.active')).toHaveAttribute('data-map-id', targetId!);

  // an ungrouped map hides the switcher
  await page.goto(`/#${gameId}/world_map`, { waitUntil: 'networkidle' });
  await expect(switcher).toBeHidden();
});

test('Metal Max Corona Building renders 21 floors with floor-local chests', async ({ page }, testInfo) => {
  const configResponse = await page.request.get('/res/metal_max/game.json');
  test.skip(!configResponse.ok(), 'Metal Max export is optional test data');

  const consoleIssues: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleIssues.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', error => consoleIssues.push(`pageerror: ${String(error)}`));

  await page.goto('/#metal_max/map_AD', { waitUntil: 'networkidle' });
  await expect(page.locator('.map-list-item.active')).toHaveAttribute('data-map-id', 'map_AD');

  const switcher = page.locator('.floor-switcher');
  await expect(switcher).toBeVisible();
  await expect(switcher.locator('.floor-btn')).toHaveCount(21);
  await expect(switcher.locator('.floor-btn.active')).toHaveText('1F');

  const sidebarGroup = page.locator('.map-list-floor-group[data-floor-group="map_AD"]');
  await expect(sidebarGroup).toHaveAttribute('open', '');
  await expect(sidebarGroup.locator('.map-floor-range')).toHaveText('1F–21F');
  await expect(sidebarGroup.locator('.map-floor-members .map-list-item')).toHaveCount(21);
  await expect(sidebarGroup.locator('[data-map-id="map_AD"]')).toBeInViewport();
  await expect(page.locator('.sidebar-map-list > .map-list-item[data-map-id="map_AD"]')).toHaveCount(0);

  // 6F owns the B1 chest. The clean B1 template is shared, while the chest is
  // a floor-local sprite and must not leak onto 5F.
  await switcher.locator('[data-map-id="map_B1_y15"]').click();
  await expect(page.locator('.map-list-item.active')).toHaveAttribute('data-map-id', 'map_B1_y15');
  await expect(sidebarGroup.locator('[data-map-id="map_B1_y15"]')).toBeInViewport();
  await expectMapImageLoaded(page, /scene_maps\/map_B1\.png$/);
  await expect(page.locator('.poi-marker img[src$="map_B1_chest.png"]')).toHaveCount(1);
  const activeIsVisible = await switcher.evaluate(element => {
    const active = element.querySelector('.floor-btn.active');
    if (!active) return false;
    const outer = element.getBoundingClientRect();
    const inner = active.getBoundingClientRect();
    return inner.top >= outer.top && inner.bottom <= outer.bottom;
  });
  expect(activeIsVisible).toBe(true);
  const screenshot = await page.screenshot({
    path: 'test-results/corona-building-6f-edge.png',
    fullPage: true,
  });
  await testInfo.attach('corona-building-6f-edge', {
    body: screenshot,
    contentType: 'image/png',
  });

  await switcher.locator('[data-map-id="map_B1"]').click();
  await expect(page.locator('.map-list-item.active')).toHaveAttribute('data-map-id', 'map_B1');
  await expect(page.locator('.poi-marker img[src$="map_B1_chest.png"]')).toHaveCount(0);

  // The second reused template's last chest belongs to 19F.
  await switcher.locator('[data-map-id="map_B2_y7E"]').click();
  await expect(page.locator('.map-list-item.active')).toHaveAttribute('data-map-id', 'map_B2_y7E');
  await expectMapImageLoaded(page, /scene_maps\/map_B2\.png$/);
  await expect(page.locator('.poi-marker img[src$="map_B2_chest.png"]')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/corona-building-19f-edge.png', fullPage: true });

  expect(consoleIssues).toEqual([]);
});
