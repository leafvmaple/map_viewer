import { describe, it, expect, vi } from 'vitest';

async function fresh() {
  vi.resetModules();
  localStorage.clear();
  const { i18n } = await import('./index.js');
  const { userStore } = await import('../core/UserStore.js');
  return { i18n, userStore };
}

describe('i18n', () => {
  it('t() resolves the key, falls back to en, then to the key itself', async () => {
    const { i18n } = await fresh();
    i18n.lang = 'zh';
    expect(i18n.t('nav.back')).toBe('返回');
    expect(i18n.t('no.such.key')).toBe('no.such.key');
  });

  it('t() substitutes {params}', async () => {
    const { i18n } = await fresh();
    i18n.lang = 'en';
    expect(i18n.t('user.deleteConfirm', { name: 'Bob' })).toContain('"Bob"');
  });

  it('localize() prefers current lang, then en, then any value', async () => {
    const { i18n } = await fresh();
    i18n.lang = 'zh';
    expect(i18n.localize({ zh: '中', en: 'E' })).toBe('中');
    expect(i18n.localize({ en: 'E', ja: 'J' })).toBe('E');
    expect(i18n.localize({ ja: 'J' })).toBe('J');
    expect(i18n.localize('plain')).toBe('plain');
    expect(i18n.localize(undefined)).toBe('');
    expect(i18n.localize({})).toBe('');
  });

  it('language is stored per user; reload() follows a user switch', async () => {
    const { i18n, userStore } = await fresh();
    const first = userStore.current.id;
    i18n.lang = 'ja';

    userStore.create('other');
    i18n.lang = 'zh';

    userStore.switchTo(first);
    const seen: string[] = [];
    i18n.onChange(l => seen.push(l));
    i18n.reload();
    expect(i18n.lang).toBe('ja');
    expect(seen).toEqual(['ja']);

    i18n.reload(); // unchanged → no notification
    expect(seen).toEqual(['ja']);
  });
});
