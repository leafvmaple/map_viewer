// ============================================================
// UserStore - local, auth-free user profiles.
//
// One person = one profile; switching is free. Everything that is a personal
// preference (language, layer toggles, saved views, chest marks) is stored
// under the current profile's localStorage namespace:
//
//   map_viewer_users                     registry: { users: [...], currentId }
//   map_viewer_u_{userId}_{key}          per-user JSON values
//
// Map EDITS (triggers, added/renamed maps) intentionally stay global — they
// are corrections to the shared data, not personal state.
// ============================================================

export interface UserProfile {
  id: string;
  name: string;
  createdAt: number;
}

interface UsersRegistry {
  users: UserProfile[];
  currentId: string;
}

const REGISTRY_KEY = 'map_viewer_users';
const USER_PREFIX = 'map_viewer_u_';
/** Pre-profile keys migrated into the default user on first run. */
const LEGACY_LANG_KEY = 'map_viewer_lang';
const LEGACY_PREFS_KEY = 'map_viewer_prefs';

type ChangeListener = (current: UserProfile) => void;

function randomId(): string {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

function defaultUserName(): string {
  const nav = typeof navigator !== 'undefined' ? (navigator.language ?? '').toLowerCase() : '';
  if (nav.startsWith('zh')) return '玩家 1';
  if (nav.startsWith('ja')) return 'プレイヤー1';
  return 'Player 1';
}

export class UserStore {
  private _registry: UsersRegistry;
  private _listeners = new Set<ChangeListener>();

  constructor() {
    this._registry = this._loadOrInit();
  }

  // ─── Registry ───────────────────────────────────────────

  private _loadOrInit(): UsersRegistry {
    try {
      const raw = localStorage.getItem(REGISTRY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as UsersRegistry;
        if (Array.isArray(parsed.users) && parsed.users.length > 0) {
          if (!parsed.users.some(u => u.id === parsed.currentId)) {
            parsed.currentId = parsed.users[0].id;
          }
          return parsed;
        }
      }
    } catch { /* fall through to init */ }
    return this._initWithMigration();
  }

  /** First run: create a default profile and adopt any pre-profile settings. */
  private _initWithMigration(): UsersRegistry {
    const user: UserProfile = { id: randomId(), name: defaultUserName(), createdAt: Date.now() };
    const registry: UsersRegistry = { users: [user], currentId: user.id };
    this._registry = registry; // setItem below needs current id
    this._saveRegistry();

    try {
      const lang = localStorage.getItem(LEGACY_LANG_KEY);
      if (lang) {
        this.setItem('lang', lang);
        localStorage.removeItem(LEGACY_LANG_KEY);
      }
      const prefs = localStorage.getItem(LEGACY_PREFS_KEY);
      if (prefs) {
        this.setItem('prefs', JSON.parse(prefs));
        localStorage.removeItem(LEGACY_PREFS_KEY);
      }
    } catch { /* migration is best-effort */ }

    return registry;
  }

  private _saveRegistry(): void {
    try {
      localStorage.setItem(REGISTRY_KEY, JSON.stringify(this._registry));
    } catch (e) {
      console.warn('Failed to save user registry:', e);
    }
  }

  private _notify(): void {
    const cur = this.current;
    this._listeners.forEach(fn => fn(cur));
  }

  // ─── Users ──────────────────────────────────────────────

  get current(): UserProfile {
    return this._registry.users.find(u => u.id === this._registry.currentId) ?? this._registry.users[0];
  }

  list(): UserProfile[] {
    return [...this._registry.users];
  }

  /** Create a profile and switch to it. Returns the new profile. */
  create(name: string): UserProfile {
    const user: UserProfile = { id: randomId(), name: name.trim() || defaultUserName(), createdAt: Date.now() };
    this._registry.users.push(user);
    this._registry.currentId = user.id;
    this._saveRegistry();
    this._notify();
    return user;
  }

  switchTo(id: string): void {
    if (id === this._registry.currentId) return;
    if (!this._registry.users.some(u => u.id === id)) return;
    this._registry.currentId = id;
    this._saveRegistry();
    this._notify();
  }

  rename(id: string, name: string): void {
    const user = this._registry.users.find(u => u.id === id);
    const trimmed = name.trim();
    if (!user || !trimmed) return;
    user.name = trimmed;
    this._saveRegistry();
    this._notify();
  }

  /** Delete a profile and all its data. Refuses to delete the last one. */
  remove(id: string): boolean {
    if (this._registry.users.length <= 1) return false;
    const idx = this._registry.users.findIndex(u => u.id === id);
    if (idx < 0) return false;

    for (const key of this._userKeys(id)) localStorage.removeItem(key);
    this._registry.users.splice(idx, 1);
    if (this._registry.currentId === id) {
      this._registry.currentId = this._registry.users[0].id;
    }
    this._saveRegistry();
    this._notify();
    return true;
  }

  /** Subscribe to user changes (switch/create/rename/remove/import). */
  onChange(fn: ChangeListener): () => void {
    this._listeners.add(fn);
    return () => { this._listeners.delete(fn); };
  }

  // ─── Namespaced per-user storage ────────────────────────

  private _keyFor(userId: string, key: string): string {
    return `${USER_PREFIX}${userId}_${key}`;
  }

  /** All raw localStorage keys belonging to a user. */
  private _userKeys(userId: string): string[] {
    const prefix = `${USER_PREFIX}${userId}_`;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) keys.push(k);
    }
    return keys;
  }

  /** Read a JSON value from the CURRENT user's namespace. */
  getItem<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(this._keyFor(this._registry.currentId, key));
      return raw == null ? null : (JSON.parse(raw) as T);
    } catch {
      return null;
    }
  }

  /** Write a JSON value into the CURRENT user's namespace. */
  setItem(key: string, value: unknown): void {
    try {
      localStorage.setItem(this._keyFor(this._registry.currentId, key), JSON.stringify(value));
    } catch (e) {
      console.warn(`Failed to save user data "${key}":`, e);
    }
  }

  removeItem(key: string): void {
    localStorage.removeItem(this._keyFor(this._registry.currentId, key));
  }

  // ─── Export / Import (backup & moving between devices) ──

  /** Serialize the current user's profile + data as a JSON string. */
  exportCurrent(): string {
    const cur = this.current;
    const prefix = `${USER_PREFIX}${cur.id}_`;
    const data: Record<string, unknown> = {};
    for (const rawKey of this._userKeys(cur.id)) {
      try {
        data[rawKey.slice(prefix.length)] = JSON.parse(localStorage.getItem(rawKey)!);
      } catch { /* skip unparseable entries */ }
    }
    return JSON.stringify({ version: 1, name: cur.name, exportedAt: Date.now(), data }, null, 2);
  }

  /**
   * Replace the CURRENT user's data with an exported payload.
   * Throws on malformed input (caller shows the error).
   */
  importCurrent(json: string): void {
    const parsed = JSON.parse(json) as { version?: number; data?: Record<string, unknown> };
    if (parsed.version !== 1 || typeof parsed.data !== 'object' || parsed.data === null) {
      throw new Error('unsupported payload');
    }
    const cur = this.current;
    for (const key of this._userKeys(cur.id)) localStorage.removeItem(key);
    for (const [key, value] of Object.entries(parsed.data)) {
      this.setItem(key, value);
    }
    this._notify();
  }
}

export const userStore = new UserStore();
