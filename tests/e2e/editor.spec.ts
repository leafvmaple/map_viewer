import { test, expect, type Page } from '@playwright/test';

async function openEditMode(page: Page): Promise<void> {
  const registry = await page.request.get('/games/registry.json');
  let hash = '';
  if (registry.ok()) {
    for (const gameRef of (await registry.json()).games ?? []) {
      const response = await page.request.get(gameRef.configPath);
      if (!response.ok()) continue;
      const game = await response.json();
      const candidate = Object.entries<{
        type?: string;
        triggers?: unknown[];
        pois?: unknown[];
        events?: unknown[];
        width?: number;
        height?: number;
      }>(game.maps ?? {}).find(([, map]) =>
        map.type === 'image' &&
        (map.triggers?.length ?? 0) === 0 &&
        (map.pois?.length ?? 0) === 0 &&
        (map.events?.length ?? 0) === 0 &&
        (map.width ?? 0) >= 160 &&
        (map.height ?? 0) >= 160,
      );
      if (candidate) {
        hash = `#${game.id}/${candidate[0]}`;
        break;
      }
    }
  }
  await page.goto('/' + hash, { waitUntil: 'networkidle' });
  await page.waitForSelector('.map-list-item', { timeout: 15_000 });
  await page.click('.btn-edit');
  await expect(page.locator('.editor-panel')).toBeVisible();
}

/** Drag on the map (draw / move) with settled input timing. */
async function drag(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move(to[0], to[1], { steps: 5 });
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.waitForTimeout(120);
}

async function dragOnMap(
  page: Page,
  from: [number, number],
  to: [number, number],
): Promise<void> {
  const box = await page.locator('#map').boundingBox();
  if (!box) throw new Error('map has no bounding box');
  await drag(
    page,
    [box.x + box.width * from[0], box.y + box.height * from[1]],
    [box.x + box.width * to[0], box.y + box.height * to[1]],
  );
}

test.describe('trigger editor', () => {
  test('drawing a zone opens the form; ids stay unique across deletions', async ({ page }) => {
    await openEditMode(page);

    await dragOnMap(page, [0.20, 0.30], [0.28, 0.40]);
    await expect(page.locator('.trigger-form')).toBeVisible();
    const idA = await page.locator('.trigger-form [data-field="id"]').inputValue();

    await dragOnMap(page, [0.35, 0.30], [0.43, 0.40]);
    const idB = await page.locator('.trigger-form [data-field="id"]').inputValue();
    expect(idB).not.toBe(idA);

    // Delete B with the keyboard, draw C: its id must not collide with A.
    await page.keyboard.press('Delete');
    await expect(page.locator('.trigger-form')).toHaveCount(0);
    await dragOnMap(page, [0.50, 0.30], [0.58, 0.40]);
    const idC = await page.locator('.trigger-form [data-field="id"]').inputValue();
    expect(idC).not.toBe(idA);
  });

  test('Space+drag pans the map while edit mode is active', async ({ page }) => {
    await openEditMode(page);
    const before = await page.evaluate(() => location.hash);

    await page.keyboard.down('Space');
    await page.waitForTimeout(120); // let the page process the keydown
    await dragOnMap(page, [0.55, 0.50], [0.38, 0.35]);
    await page.keyboard.up('Space');

    await expect.poll(() => page.evaluate(() => location.hash)).not.toBe(before);
    // and no trigger form opened (the drag panned, it did not draw)
    await expect(page.locator('.trigger-form')).toHaveCount(0);
  });

  test('Esc deselects first, then exits edit mode with the toolbar in sync', async ({ page }) => {
    await openEditMode(page);
    await dragOnMap(page, [0.20, 0.30], [0.28, 0.40]);
    await expect(page.locator('.trigger-form')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.trigger-form')).toHaveCount(0);
    await expect(page.locator('.editor-panel')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.editor-panel')).toHaveCount(0);
    await expect(page.locator('.btn-edit')).not.toHaveClass(/active/);
  });

  test('Ctrl+Z undoes a draw', async ({ page }) => {
    await openEditMode(page);
    const before = await page.locator('#map path.trigger-edit-rect').count();
    await dragOnMap(page, [0.20, 0.30], [0.28, 0.40]);
    await expect.poll(() => page.locator('#map path.trigger-edit-rect').count()).toBe(before + 1);
    await page.keyboard.press('Control+z');
    await expect.poll(() => page.locator('#map path.trigger-edit-rect').count()).toBe(before);
  });
});
