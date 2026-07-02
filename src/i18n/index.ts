import en from './en.json';
import zh from './zh.json';
import ja from './ja.json';
import { userStore } from '../core/UserStore.js';
import type { LangCode, LangOption, LocalizedString } from '../types';

type LocaleMap = Record<string, string>;
const locales: Record<LangCode, LocaleMap> = { en, zh, ja };

type ChangeListener = (lang: LangCode) => void;

class I18n {
  private _lang: LangCode;
  private _listeners = new Set<ChangeListener>();

  constructor() {
    this._lang = this._detectLanguage();
  }

  private _detectLanguage(): LangCode {
    const stored = userStore.getItem<LangCode>('lang');
    if (stored && locales[stored]) return stored;

    const nav = typeof navigator !== 'undefined' ? (navigator.language ?? '').toLowerCase() : '';
    if (nav.startsWith('zh')) return 'zh';
    if (nav.startsWith('ja')) return 'ja';
    return 'en';
  }

  get lang(): LangCode {
    return this._lang;
  }

  set lang(value: LangCode) {
    if (!locales[value]) return;
    this._lang = value;
    userStore.setItem('lang', value);
    this._listeners.forEach(fn => fn(value));
  }

  /**
   * Re-read the language from the (possibly different) current user's storage.
   * Notifies listeners only when the language actually changed.
   */
  reload(): void {
    const lang = this._detectLanguage();
    if (lang === this._lang) return;
    this._lang = lang;
    this._listeners.forEach(fn => fn(lang));
  }

  get availableLanguages(): LangOption[] {
    return [
      { code: 'en', label: 'English' },
      { code: 'zh', label: '中文' },
      { code: 'ja', label: '日本語' },
    ];
  }

  /**
   * Translate a UI key.
   */
  t(key: string, params?: Record<string, string | number>): string {
    let text = locales[this._lang]?.[key] ?? locales.en?.[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, String(v));
      }
    }
    return text;
  }

  /**
   * Resolve a localized object from game data.
   * E.g. { zh: "拉多镇", en: "Rado Town" } → "拉多镇" (if lang=zh)
   */
  localize(obj: LocalizedString | string | undefined | null): string {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    return obj[this._lang] ?? obj.en ?? Object.values(obj).find(v => v != null) ?? '';
  }

  /**
   * Subscribe to language changes.
   */
  onChange(fn: ChangeListener): () => void {
    this._listeners.add(fn);
    return () => { this._listeners.delete(fn); };
  }
}

export const i18n = new I18n();
