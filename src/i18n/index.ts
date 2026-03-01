import en from './en.json';
import zh from './zh.json';
import ja from './ja.json';
import type { LangCode, LangOption, LocalizedString } from '../types';

type LocaleMap = Record<string, string>;
const locales: Record<LangCode, LocaleMap> = { en, zh, ja };
const STORAGE_KEY = 'map_viewer_lang';

type ChangeListener = (lang: LangCode) => void;

class I18n {
  private _lang: LangCode;
  private _listeners = new Set<ChangeListener>();

  constructor() {
    this._lang = this._detectLanguage();
  }

  private _detectLanguage(): LangCode {
    const stored = localStorage.getItem(STORAGE_KEY) as LangCode | null;
    if (stored && locales[stored]) return stored;

    const nav = navigator.language.toLowerCase();
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
    localStorage.setItem(STORAGE_KEY, value);
    this._listeners.forEach(fn => fn(value));
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
