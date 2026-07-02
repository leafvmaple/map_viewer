import { test, expect, type Page } from '@playwright/test';

async function openEditMode(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'networkidle' });
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

test.describe('trigger editor', () => {
  test('drawing a zone opens the form; ids stay unique across deletions', async ({ page }) => {
    await openEditMode(page);

    await drag(page, [420, 320], [500, 390]);
    await expect(page.locator('.trigger-form')).toBeVisible();
    const idA = await page.locator('.trigger-form [data-field="id"]').inputValue();

    await drag(page, [540, 320], [620, 390]);
    const idB = await page.locator('.trigger-form [data-field="id"]').inputValue();
    expect(idB).not.toBe(idA);

    // Delete B with the keyboard, draw C: its id must not collide with A.
    await page.keyboard.press('Delete');
    await expect(page.locator('.trigger-form')).toHaveCount(0);
    await drag(page, [660, 320], [740, 390]);
    const idC = await page.locator('.trigger-form [data-field="id"]').inputValue();
    expect(idC).not.toBe(idA);
  });

  test('Space+drag pans the map while edit mode is active', async ({ page }) => {
    await openEditMode(page);
    const before = await page.evaluate(() => location.hash);

    await page.keyboard.down('Space');
    await page.waitForTimeout(120); // let the page process the keydown
    await drag(page, [700, 450], [520, 320]);
    await page.keyboard.up('Space');

    await expect.poll(() => page.evaluate(() => location.hash)).not.toBe(before);
    // and no trigger form opened (the drag panned, it did not draw)
    await expect(page.locator('.trigger-form')).toHaveCount(0);
  });

  test('Esc deselects first, then exits edit mode with the toolbar in sync', async ({ page }) => {
    await openEditMode(page);
    await drag(page, [420, 320], [500, 390]);
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
    await drag(page, [420, 320], [500, 390]);
    await expect.poll(() => page.locator('#map path.trigger-edit-rect').count()).toBe(before + 1);
    await page.keyboard.press('Control+z');
    await expect.poll(() => page.locator('#map path.trigger-edit-rect').count()).toBe(before);
  });
});
