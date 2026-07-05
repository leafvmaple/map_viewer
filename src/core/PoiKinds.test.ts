import { describe, it, expect, beforeAll } from 'vitest';
import { kindDisplayName, kindGlyph } from './PoiKinds.js';
import { i18n } from '../i18n/index.js';

const meta = {
  general: { name: { zh: '敌将', en: 'General' }, glyph: '🚩' },
  dock: { name: { zh: '渡口' } }, // overrides the built-in name, keeps built-in glyph
};

beforeAll(() => {
  i18n.lang = 'zh';
});

describe('kindDisplayName', () => {
  it('prefers the game-provided name, then i18n, then the raw id', () => {
    expect(kindDisplayName(meta, 'general')).toBe('敌将');
    expect(kindDisplayName(meta, 'dock')).toBe('渡口');       // game overrides built-in
    expect(kindDisplayName(undefined, 'trainer')).toBe('训练师'); // built-in i18n
    expect(kindDisplayName(undefined, 'weird_kind')).toBe('weird_kind');
  });
});

describe('kindGlyph', () => {
  it('prefers the game-provided glyph, then built-ins, then a generic pin', () => {
    expect(kindGlyph(meta, 'general')).toBe('🚩');
    expect(kindGlyph(meta, 'dock')).toBe('⚓');   // no glyph in meta → built-in
    expect(kindGlyph(undefined, 'treasure')).toBe('⭐');
    expect(kindGlyph(undefined, 'weird_kind')).toBe('📍');
  });
});
