import { describe, it, expect, beforeAll } from 'vitest';
import { hasPartyCard, renderPartyCard, renderPlainTooltip } from './PoiTooltip.js';
import { i18n } from '../i18n/index.js';
import type { PoiDef } from '../types';

const withParty = (party?: PoiDef['party'], kind = 'trainer'): PoiDef => ({
  id: 't00',
  kind,
  pos: [0, 0],
  label: { zh: '训练师' },
  party,
});

const resolve = (p: string) => `/res/g/${p}`;

beforeAll(() => {
  i18n.lang = 'zh';
});

describe('hasPartyCard', () => {
  it('true only for a non-empty party array', () => {
    expect(hasPartyCard(withParty())).toBe(false);
    expect(hasPartyCard(withParty([]))).toBe(false);
    expect(hasPartyCard(withParty([{ name: { zh: '豪力' }, value: 39 }]))).toBe(true);
  });
});

describe('renderPlainTooltip', () => {
  const chest = (itemIcon?: string): PoiDef =>
    ({ id: 'c0', kind: 'treasure', pos: [0, 0], label: { zh: '精灵球 · 伤药' }, itemIcon });

  it('prepends the item mini-icon when present and resolvable', () => {
    const html = renderPlainTooltip(chest('sprites/item/013.png'), '精灵球 · 伤药', false, resolve);
    expect(html).toContain('src="/res/g/sprites/item/013.png"');
    expect(html).toContain('精灵球 · 伤药');
    expect(renderPlainTooltip(chest(), '精灵球 · 伤药', false, resolve)).not.toContain('<img');
    expect(renderPlainTooltip(chest('x.png'), '精灵球 · 伤药', false, null)).not.toContain('<img');
  });

  it('keeps the collected suffix and escapes the title', () => {
    const html = renderPlainTooltip(chest('x.png'), '<b>', true, resolve);
    expect(html).toContain('✓');
    expect(html).not.toContain('<b>');
  });
});

describe('renderPartyCard', () => {
  const party = [
    { name: { zh: '火爆猴', ja: 'オコリザル' }, value: 39, id: 57, icon: 'sprites/mon/057.png' },
    { name: { zh: '豪力', ja: 'ゴーリキー' }, value: 40, id: 67 },
  ];

  it('renders one icon·name·badge row per member, localized, unit defaults to Lv', () => {
    const html = renderPartyCard(withParty(party), '训练师', false, resolve);
    expect(html.match(/<li>/g)).toHaveLength(2);
    expect(html).toContain('火爆猴');
    expect(html).toContain('<small>Lv</small>39');
    expect(html).toContain('<small>Lv</small>40');
    expect(html).toContain('src="/res/g/sprites/mon/057.png"');
  });

  it('a custom unit renders instead of Lv (enemy-general style)', () => {
    const generals = [{ name: { zh: '张飞' }, value: 12000, unit: { zh: '兵' } }];
    const html = renderPartyCard(withParty(generals, 'general'), '敌将', false, resolve);
    expect(html).toContain('张飞');
    expect(html).toContain('<small>兵</small>12000');
    expect(html).not.toContain('Lv');
  });

  it('a member without value gets a name-only row (no badge, no leader)', () => {
    const html = renderPartyCard(withParty([{ name: { zh: '张飞' } }]), '敌将', false, resolve);
    expect(html).toContain('张飞');
    expect(html).not.toContain('poi-tt-lv');
    expect(html).not.toContain('poi-tt-leader');
  });

  it('renders the defeat reward dimmed in the header', () => {
    const withReward = { ...withParty(party), reward: { en: '¥624' } };
    const html = renderPartyCard(withReward, '训练师', false, resolve);
    expect(html).toContain('poi-tt-reward');
    expect(html).toContain('¥624');
    expect(renderPartyCard(withParty(party), '训练师', false, resolve)).not.toContain('poi-tt-reward');
  });

  it('falls back to the ja name when zh is missing', () => {
    const html = renderPartyCard(withParty([{ name: { ja: 'カポエラー' }, value: 48 }]), '训练师', false, resolve);
    expect(html).toContain('カポエラー');
  });

  it('missing icon or resolver → poké-ball placeholder', () => {
    const noIcon = renderPartyCard(withParty(party), '训练师', false, resolve);
    expect(noIcon).toContain('poi-tt-ball'); // 豪力 has no icon
    const noResolver = renderPartyCard(withParty(party), '训练师', false, null);
    expect(noResolver.match(/poi-tt-ball/g)).toHaveLength(2);
    expect(noResolver).not.toContain('<img');
  });

  it('member count badge appears only for 2+ members and never together with the defeated chip', () => {
    expect(renderPartyCard(withParty(party), '训练师', false, resolve)).toContain('×2');
    const single = renderPartyCard(withParty([party[0]]), '训练师', false, resolve);
    expect(single).not.toContain('poi-tt-count');
    const done = renderPartyCard(withParty(party), '训练师', true, resolve);
    expect(done).toContain('已击败');
    expect(done).not.toContain('poi-tt-count');
  });

  it('escapes HTML in names, units and title', () => {
    const html = renderPartyCard(
      withParty([{ name: { zh: '<b>x</b>' }, value: 5, unit: { zh: '<i>' } }]),
      '<script>',
      false,
      resolve,
    );
    expect(html).not.toContain('<b>x</b>');
    expect(html).not.toContain('<i>');
    expect(html).not.toContain('<script>');
  });
});
