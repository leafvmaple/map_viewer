import { describe, expect, it } from 'vitest';
import type { CatalogItemDef, PoiDef } from '../types';
import { renderPlainTooltip } from './PoiTooltip.js';

const items: Record<string, CatalogItemDef> = {
  '0001': { id: '0001', name: { zh: '恢复胶囊' } },
  '000D': { id: '000D', name: { zh: '火瓶' } },
};

describe('random-loot selection odds', () => {
  it('shows the native weight ratio and normalized percentage per reward', () => {
    const poi: PoiDef = {
      id: 'random_loot_p003_r002',
      kind: 'random_loot',
      pos: [10, 20],
      itemRefs: [
        { itemId: '0001', selectionWeight: 35, selectionWeightTotal: 255 },
        { itemId: '000D', selectionWeight: 220, selectionWeightTotal: 255 },
      ],
    };

    const html = renderPlainTooltip(poi, '随机拾取', false, null, items);

    expect(html).toContain('恢复胶囊');
    expect(html).toContain('火瓶');
    expect(html).toContain('35/255 · 13.7%');
    expect(html).toContain('220/255 · 86.3%');
    expect(html.match(/poi-tt-chance/g)).toHaveLength(2);
  });

  it('also shows 100 percent for a pool collapsed to one unique item', () => {
    const poi: PoiDef = {
      id: 'random_loot_p010_r001',
      kind: 'random_loot',
      pos: [10, 20],
      itemRefs: [
        { itemId: '0001', selectionWeight: 80, selectionWeightTotal: 80 },
      ],
    };

    const html = renderPlainTooltip(poi, '随机拾取', false, null, items);

    expect(html).toContain('80/80 · 100%');
  });

  it('does not invent odds for ordinary item references', () => {
    const poi: PoiDef = {
      id: 'treasure_1',
      kind: 'treasure',
      pos: [10, 20],
      itemRefs: [{ itemId: '0001' }, { itemId: '000D' }],
    };

    const html = renderPlainTooltip(poi, '宝箱', false, null, items);

    expect(html).not.toContain('poi-tt-chance');
    expect(html).not.toContain('%');
  });
});
