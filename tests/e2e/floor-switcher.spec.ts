import { test, expect, type Page } from '@playwright/test';

/**
 * In-map floor switcher (maps with `floorGroup`): opening a floored map shows
 * the pill stack; clicking another pill switches maps in place. Data-dependent —
 * skips when no exported game carries floor groups.
 */

interface Floored { gameId: string; mapId: string; group: string; size: number }

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
