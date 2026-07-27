import { test, expect, type Page } from '@playwright/test';

/**
 * Fixed-encounter formation tooltip card (metal_max data): hovering a
 * fixed-encounter POI shows the trainer-style icon·name·×count card resolved
 * from `fixedEncounters[*].members`, instead of the old one-line label.
 * Data-dependent — skips when the Metal Max export isn't present.
 */

interface Member { speciesId: string; count: number }
interface Poi { id: string; kind: string; fixedEncounterId?: string }

/** Find a map with a members-resolved fixed encounter in the export, if any. */
async function findFixedEncounter(page: Page): Promise<{ mapId: string; poi: Poi } | null> {
  const game = await page.request.get('/res/metal_max/game.json');
  const enc = await page.request.get('/res/metal_max/data/encounters.json');
  if (!game.ok() || !enc.ok()) return null;
  const fixed: Record<string, { members?: Member[] }> = (await enc.json()).fixedEncounters ?? {};
  for (const [mapId, m] of Object.entries<{ pois?: Poi[] }>((await game.json()).maps)) {
    const poi = m.pois?.find(p =>
      p.kind === 'fixed_encounter' && !!p.fixedEncounterId && !!fixed[p.fixedEncounterId]?.members?.length);
    if (poi) return { mapId, poi };
  }
  return null;
}

/** Hover the first fixed-encounter marker fully inside the viewport. */
async function hoverVisibleFixedEncounter(page: Page): Promise<boolean> {
  const markers = page.locator('.poi-marker.poi-fixed_encounter');
  const n = await markers.count();
  const vp = page.viewportSize()!;
  for (let i = 0; i < n; i++) {
    const box = await markers.nth(i).boundingBox();
    if (box && box.x >= 0 && box.y >= 0
        && box.x + box.width <= vp.width && box.y + box.height <= vp.height) {
      await markers.nth(i).hover();
      return true;
    }
  }
  return false;
}

test('hovering a fixed encounter shows the formation card (icon · name · ×count)', async ({ page }) => {
  const found = await page.goto('/').then(() => findFixedEncounter(page));
  test.skip(!found, 'no Metal Max fixed-encounter data in the working tree');
  const { mapId, poi } = found!;

  await page.goto(`/#metal_max/${mapId}&poi=${poi.id}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.poi-marker.poi-fixed_encounter', { timeout: 15_000 });

  expect(await hoverVisibleFixedEncounter(page)).toBe(true);

  const card = page.locator('.poi-tooltip-card');
  await expect(card).toBeVisible();
  const rows = card.locator('.poi-tt-party li');
  expect(await rows.count()).toBeGreaterThan(0);

  // Each row: a mini icon (img or ball placeholder), a species name, a ×count badge.
  for (let i = 0; i < await rows.count(); i++) {
    const row = rows.nth(i);
    await expect(row.locator('.poi-tt-icon')).toHaveCount(1);
    expect((await row.locator('.poi-tt-mon').textContent())?.trim()).toBeTruthy();
    expect(await row.locator('.poi-tt-lv').textContent()).toMatch(/^×\d+$/);
  }
});
