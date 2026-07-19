import { test, expect, type Page } from '@playwright/test';

async function openApp(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.map-list-item', { timeout: 15_000 });
}

function markedMapPoi(page: Page) {
  return page.locator('.poi-check, .poi-marker.poi-marked');
}

async function createUser(page: Page, name: string): Promise<void> {
  await page.click('.user-menu-btn');
  await page.fill('.user-menu-input', name);
  await page.click('.user-menu-add');
  await expect(page.locator('.user-menu-btn')).toContainText(name);
}

async function switchUser(page: Page, name: string): Promise<void> {
  await page.click('.user-menu-btn');
  await page.locator('.user-menu-item', { hasText: name }).click();
  await expect(page.locator('.user-menu-btn')).toContainText(name);
}

test.describe('user profiles', () => {
  test('a default profile exists on first run', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('.user-menu-btn')).toContainText('👤');
    await page.click('.user-menu-btn');
    await expect(page.locator('.user-menu-item')).toHaveCount(1);
    await expect(page.locator('.user-menu-item.active .user-menu-check')).toHaveText('✓');
  });

  test('language and layer toggles are per user', async ({ page }) => {
    await openApp(page);
    // user A: japanese + triggers hidden
    await page.selectOption('.toolbar-lang-select', 'ja');
    await expect(page.locator('.btn-back')).toContainText('戻る');
    await page.click('.btn-triggers');
    await expect(page.locator('.btn-triggers')).not.toHaveClass(/active/);

    // fresh user B: back to defaults (browser language, triggers on)
    await createUser(page, 'Bob');
    await expect(page.locator('.btn-back')).not.toContainText('戻る');
    await expect(page.locator('.btn-triggers')).toHaveClass(/active/);

    // back to A: japanese + hidden triggers restored
    const firstName = await page.locator('.user-menu-item .user-menu-name').first().textContent();
    await switchUser(page, firstName!.trim());
    await expect(page.locator('.btn-back')).toContainText('戻る');
    await expect(page.locator('.btn-triggers')).not.toHaveClass(/active/);
  });

  test('renaming a user updates the button', async ({ page }) => {
    await openApp(page);
    await page.click('.user-menu-btn');
    await page.locator('.user-menu-item').first().hover(); // ✎ shows on row hover
    await page.locator('.user-menu-item .user-menu-edit').first().click();
    const input = page.locator('.user-rename-input');
    await input.fill('改名测试');
    await input.press('Enter');
    await expect(page.locator('.user-menu-btn')).toContainText('改名测试');
  });

  test('deleting the last user is refused; delete works with two users', async ({ page }) => {
    await openApp(page);
    page.once('dialog', (d) => d.accept()); // the "at least one user" alert
    await page.click('.user-menu-btn');
    await page.click('.user-menu-delete');
    await page.click('.user-menu-btn'); // still one user
    await expect(page.locator('.user-menu-item')).toHaveCount(1);

    await createUser(page, 'Doomed');
    page.once('dialog', (d) => d.accept()); // confirm deletion
    await page.click('.user-menu-btn');
    await page.click('.user-menu-delete');
    await expect(page.locator('.user-menu-btn')).not.toContainText('Doomed');
  });
});

test.describe('chest marks', () => {
  test('marking via the list: counter, dimmed glyph, persistence, per-user isolation', async ({ page }) => {
    await openApp(page);
    const panelVisible = await page.locator('.treasure-panel').isVisible();
    test.skip(!panelVisible, 'current world map has no treasure list');

    const total = await page.locator('.treasure-item').count();
    await expect(page.locator('.treasure-count')).toHaveText(`0/${total}`);

    // mark the first chest via its checkbox — the baked chest gets a ✓ shade
    await page.locator('.treasure-item .treasure-mark').first().check();
    await expect(page.locator('.treasure-count')).toHaveText(`1/${total}`);
    await expect(page.locator('.treasure-item.marked')).toHaveCount(1);
    await expect(markedMapPoi(page)).toHaveCount(1);

    // survives a reload
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.treasure-item');
    await expect(page.locator('.treasure-count')).toHaveText(`1/${total}`);

    // a fresh user sees no marks; switching back restores them
    await createUser(page, 'Clean');
    await expect(page.locator('.treasure-count')).toHaveText(`0/${total}`);
    const firstName = await page.locator('.user-menu-item .user-menu-name').first().textContent();
    await switchUser(page, firstName!.trim());
    await expect(page.locator('.treasure-count')).toHaveText(`1/${total}`);
  });

  test('marking by clicking a chest zone on the map toggles it', async ({ page }) => {
    await openApp(page);
    const zones = await page.locator('#map path.poi-hover').count();
    test.skip(zones === 0, 'current world map has no chest zones');

    // The incremental update replaces the toggled layer (DOM order shifts),
    // so click the same MAP POSITION twice instead of the same DOM index.
    const box = await page.locator('#map path.poi-hover').first().boundingBox();
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;
    await page.mouse.click(cx, cy);
    await expect(page.locator('.poi-check')).toHaveCount(1);
    await page.mouse.click(cx, cy);
    await expect(page.locator('.poi-check')).toHaveCount(0);
  });

  test('export/import moves marks between users', async ({ page }) => {
    await openApp(page);
    const panelVisible = await page.locator('.treasure-panel').isVisible();
    test.skip(!panelVisible, 'current world map has no treasure list');
    const total = await page.locator('.treasure-item').count();

    await page.locator('.treasure-item .treasure-mark').first().check();
    await expect(page.locator('.treasure-count')).toHaveText(`1/${total}`);

    await page.click('.user-menu-btn');
    const downloadPromise = page.waitForEvent('download');
    await page.click('.user-menu-export');
    const download = await downloadPromise;
    const filePath = await download.path();

    await createUser(page, 'Importer');
    await expect(page.locator('.treasure-count')).toHaveText(`0/${total}`);

    await page.click('.user-menu-btn');
    await page.locator('.user-menu-file').setInputFiles(filePath!);
    await expect(page.locator('.treasure-count')).toHaveText(`1/${total}`);
  });
});
