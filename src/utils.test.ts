import { describe, it, expect } from 'vitest';
import { escapeHtml } from './utils.js';

describe('escapeHtml', () => {
  it('escapes all HTML-significant characters', () => {
    expect(escapeHtml(`<img src=x onerror="alert('1')" & more>`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot; &amp; more&gt;',
    );
  });

  it('passes plain text (incl. CJK) through unchanged', () => {
    expect(escapeHtml('拉多镇 · 宝箱 12,34')).toBe('拉多镇 · 宝箱 12,34');
  });

  it('handles numbers, null and undefined', () => {
    expect(escapeHtml(42)).toBe('42');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});
