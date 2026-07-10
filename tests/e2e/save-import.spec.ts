import { test, expect, type Page } from '@playwright/test';

// Phase 0 has no real save layout in the exported data yet, so we inject a
// synthetic `saveFormat` + per-chest `saveRef` by intercepting game.json. An
// all-bits-set save then marks every chest — proving the full browser chain:
// import → parse → map to poi ids → new carrier profile → marks → UI refresh.
async function openWithInjectedSave(page: Page): Promise<void> {
  await page.route('**/game.json', async (route) => {
    const resp = await route.fetch();
    const cfg = await resp.json();
    // Big flat bitfield; an all-0xFF save sets every flag.
    cfg.saveFormat = { family: 'nes-sram', size: 8192, regions: { treasure: { offset: 0, length: 1024 } } };
    let flag = 0;
    for (const map of Object.values<any>(cfg.maps)) {
      for (const poi of map.pois ?? []) {
        if (poi.kind === 'treasure' || poi.kind === 'gold') poi.saveRef = { flag: flag++ };
      }
    }
    await route.fulfill({ body: JSON.stringify(cfg), contentType: 'application/json' });
  });

  await page.goto('/#metal_max', { waitUntil: 'networkidle' });
  await page.waitForSelector('.map-list-item', { timeout: 15_000 });
}

test.describe('save import', () => {
  test('the import button is present in the user menu', async ({ page }) => {
    await openWithInjectedSave(page);
    await page.click('.user-menu-btn');
    await expect(page.locator('.user-menu-import-save')).toBeVisible();
  });

  test('importing a save creates a carrier profile and marks the chests', async ({ page }) => {
    await openWithInjectedSave(page);
    const panelVisible = await page.locator('.treasure-panel').isVisible();
    test.skip(!panelVisible, 'default map has no treasure list');

    const total = await page.locator('.treasure-item').count();
    await expect(page.locator('.treasure-count')).toHaveText(`0/${total}`);
    // the button shows "👤 <name>"; the menu item shows the bare name
    const originalName = (await page.locator('.user-menu-btn').textContent())!.replace(/^👤\s*/, '').trim();

    // Import an all-0xFF save → every injected saveRef flag is set.
    page.once('dialog', (d) => d.accept()); // the "mark N/total?" confirm
    await page.click('.user-menu-btn');
    await page.locator('.user-menu-save-file').setInputFiles({
      name: 'metal_max.sav',
      mimeType: 'application/octet-stream',
      buffer: Buffer.alloc(8192, 0xff),
    });

    // Every chest on this map is now marked, in a brand-new profile.
    await expect(page.locator('.treasure-count')).toHaveText(`${total}/${total}`);
    await expect(page.locator('.user-menu-btn')).not.toContainText(originalName);

    // The carrier is a second, distinct profile — the original is untouched.
    await page.click('.user-menu-btn'); // open the menu (stays open)
    await expect(page.locator('.user-menu-item')).toHaveCount(2);
    await page.locator('.user-menu-item', { hasText: originalName }).click();
    await expect(page.locator('.user-menu-btn')).toContainText(originalName);
    await expect(page.locator('.treasure-count')).toHaveText(`0/${total}`);
  });
});
