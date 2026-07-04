import { test, expect, type Page } from '@playwright/test';

/**
 * Trainer party tooltip card (pokemon_frlg data): hovering a trainer POI
 * shows a structured icon·name·level card instead of the old one-line text.
 * Data-dependent — skips when the FRLG export isn't present.
 */

interface PartyMon { name: Record<string, string>; level: number; icon?: string }
interface Poi { id: string; kind: string; party?: PartyMon[] }

/** Find a map with a multi-mon trainer party in the FRLG export, if any. */
async function findTrainerWithParty(page: Page): Promise<{ mapId: string; poi: Poi } | null> {
  const res = await page.request.get('/res/pokemon_frlg/game.json');
  if (!res.ok()) return null;
  const game = await res.json();
  for (const [mapId, m] of Object.entries<{ pois?: Poi[] }>(game.maps)) {
    const poi = m.pois?.find(p => p.kind === 'trainer' && (p.party?.length ?? 0) >= 2);
    if (poi) return { mapId, poi };
  }
  return null;
}

/** Hover the first trainer marker whose box is fully inside the viewport. */
async function hoverVisibleTrainer(page: Page): Promise<boolean> {
  const markers = page.locator('.poi-marker.poi-trainer');
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

test('hovering a trainer shows the party card (icon · name · level)', async ({ page }) => {
  const found = await page.goto('/').then(() => findTrainerWithParty(page));
  test.skip(!found, 'no FRLG trainer-party data in the working tree');
  const { mapId, poi } = found!;

  // Deep-link pans to the POI and flashes it, so it ends up mid-viewport.
  await page.goto(`/#pokemon_frlg/${mapId}&poi=${poi.id}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.poi-marker.poi-trainer', { timeout: 15_000 });

  expect(await hoverVisibleTrainer(page)).toBe(true);

  const card = page.locator('.poi-tooltip-card');
  await expect(card).toBeVisible();
  const rows = card.locator('.poi-tt-party li');
  await expect(rows).toHaveCount(poi.party!.length);

  // Each row: a mini icon (img or ball placeholder), a name, a Lv badge.
  for (let i = 0; i < poi.party!.length; i++) {
    const row = rows.nth(i);
    await expect(row.locator('.poi-tt-icon')).toHaveCount(1);
    expect((await row.locator('.poi-tt-mon').textContent())?.trim()).toBeTruthy();
    expect(await row.locator('.poi-tt-lv').textContent()).toMatch(/^Lv\d+$/);
  }

  // The header carries the short title — the party is NOT concatenated into it.
  const head = await card.locator('.poi-tt-head').textContent();
  expect(head).not.toContain('Lv');
});
