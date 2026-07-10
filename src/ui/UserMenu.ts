import { i18n } from '../i18n/index.js';
import { escapeHtml } from '../utils.js';
import { userStore } from '../core/UserStore.js';

/**
 * UserMenu - Toolbar dropdown for the auth-free user profiles.
 *
 * Button shows the current user; the panel lists users (click to switch,
 * double-click to rename inline), lets you create one by typing a name, and
 * exposes export / import / delete for the current profile.
 */
export interface UserMenuOptions {
  /** Import a battery save file into a new profile (orchestrated by main.ts,
   *  which has the current game + mark-refresh plumbing). */
  onImportSave?: (file: File) => void | Promise<void>;
}

export class UserMenu {
  private _el: HTMLElement;
  private _btn!: HTMLButtonElement;
  private _panel!: HTMLElement;
  private _fileInput!: HTMLInputElement;
  private _saveInput!: HTMLInputElement;
  private _open = false;
  private _opts: UserMenuOptions;

  constructor(container: HTMLElement, opts: UserMenuOptions = {}) {
    this._opts = opts;
    this._el = document.createElement('div');
    this._el.className = 'user-menu';
    container.appendChild(this._el);
    this._render();

    // Keep the button + list in sync with any profile change.
    userStore.onChange(() => this._refresh());

    // Click outside closes the panel.
    document.addEventListener('click', (e) => {
      if (this._open && !this._el.contains(e.target as Node)) this._setOpen(false);
    });
  }

  private _render(): void {
    this._el.innerHTML = `
      <button class="toolbar-btn user-menu-btn" title="${i18n.t('user.menu')}"></button>
      <div class="user-menu-panel" style="display:none;">
        <div class="user-menu-list"></div>
        <div class="user-menu-new">
          <input class="user-menu-input" type="text" placeholder="${i18n.t('user.newPlaceholder')}" maxlength="24" />
          <button class="btn user-menu-add">${i18n.t('user.add')}</button>
        </div>
        <div class="user-menu-save">
          <button class="btn user-menu-import-save" title="${i18n.t('save.importTip')}">${i18n.t('save.import')}</button>
        </div>
        <div class="user-menu-actions">
          <button class="btn user-menu-export">${i18n.t('user.export')}</button>
          <button class="btn user-menu-import">${i18n.t('user.import')}</button>
          <button class="btn btn-danger user-menu-delete">${i18n.t('user.delete')}</button>
        </div>
        <input class="user-menu-file" type="file" accept="application/json,.json" style="display:none;" />
        <input class="user-menu-save-file" type="file" accept=".sav,.srm,.sa1,.dat,.bin" style="display:none;" />
      </div>
    `;
    this._btn = this._el.querySelector('.user-menu-btn')!;
    this._panel = this._el.querySelector('.user-menu-panel')!;
    this._fileInput = this._el.querySelector('.user-menu-file')!;
    this._saveInput = this._el.querySelector('.user-menu-save-file')!;

    this._btn.addEventListener('click', () => this._setOpen(!this._open));

    const input = this._el.querySelector('.user-menu-input') as HTMLInputElement;
    const addUser = () => {
      const name = input.value.trim();
      if (!name) return;
      input.value = '';
      userStore.create(name); // creates AND switches; onChange handles the rest
      this._setOpen(false);
    };
    this._el.querySelector('.user-menu-add')!.addEventListener('click', addUser);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addUser();
    });

    this._el.querySelector('.user-menu-export')!.addEventListener('click', () => {
      const json = userStore.exportCurrent();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `map_viewer_${userStore.current.name}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this._setOpen(false);
    });

    this._el.querySelector('.user-menu-import')!.addEventListener('click', () => {
      this._fileInput.click();
    });
    this._fileInput.addEventListener('change', async () => {
      const file = this._fileInput.files?.[0];
      this._fileInput.value = '';
      if (!file) return;
      try {
        userStore.importCurrent(await file.text());
        this._setOpen(false);
      } catch (err) {
        console.error('Import failed:', err);
        alert(i18n.t('user.importError'));
      }
    });

    // Save import: pick a battery save, hand the file to main.ts. Hidden when
    // no importer is wired (keeps the menu unchanged in tests / embeds).
    const saveBtn = this._el.querySelector('.user-menu-import-save') as HTMLButtonElement;
    if (this._opts.onImportSave) {
      saveBtn.addEventListener('click', () => this._saveInput.click());
      this._saveInput.addEventListener('change', async () => {
        const file = this._saveInput.files?.[0];
        this._saveInput.value = '';
        if (!file) return;
        this._setOpen(false);
        await this._opts.onImportSave!(file);
      });
    } else {
      (saveBtn.parentElement as HTMLElement).style.display = 'none';
    }

    this._el.querySelector('.user-menu-delete')!.addEventListener('click', () => {
      const cur = userStore.current;
      if (userStore.list().length <= 1) {
        alert(i18n.t('user.lastUserError'));
        return;
      }
      if (confirm(i18n.t('user.deleteConfirm', { name: cur.name }))) {
        userStore.remove(cur.id);
      }
    });

    // Delegated user-row events: the ✎ button renames inline, anywhere else switches.
    const list = this._el.querySelector('.user-menu-list')!;
    list.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.user-rename-input')) return;
      const row = target.closest<HTMLElement>('.user-menu-item');
      if (!row?.dataset.id) return;
      const nameEl = row.querySelector<HTMLElement>('.user-menu-name');
      if (target.closest('.user-menu-edit')) {
        if (nameEl && !nameEl.querySelector('input')) this._startRename(nameEl, row.dataset.id);
        return;
      }
      userStore.switchTo(row.dataset.id);
      this._setOpen(false);
    });

    this._refresh();
  }

  private _startRename(nameEl: HTMLElement, userId: string): void {
    const original = nameEl.textContent ?? '';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'user-rename-input';
    input.value = original;
    input.maxLength = 24;
    nameEl.textContent = '';
    nameEl.appendChild(input);
    input.focus();
    input.select();

    const commit = () => {
      const name = input.value.trim();
      if (name && name !== original) userStore.rename(userId, name); // onChange re-renders
      else this._renderList();
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      else if (e.key === 'Escape') {
        input.removeEventListener('blur', commit);
        this._renderList();
      }
      e.stopPropagation(); // don't leak into map/editor shortcuts
    });
  }

  private _setOpen(open: boolean): void {
    this._open = open;
    this._panel.style.display = open ? 'block' : 'none';
    if (open) this._renderList();
  }

  private _renderList(): void {
    const list = this._el.querySelector('.user-menu-list');
    if (!list) return;
    const currentId = userStore.current.id;
    list.innerHTML = userStore.list()
      .map(u => `<div class="user-menu-item${u.id === currentId ? ' active' : ''}" data-id="${escapeHtml(u.id)}">
        <span class="user-menu-check">${u.id === currentId ? '✓' : ''}</span>
        <span class="user-menu-name">${escapeHtml(u.name)}</span>
        <button class="user-menu-edit" title="${escapeHtml(i18n.t('user.renameTip'))}">✎</button>
      </div>`)
      .join('');
  }

  private _refresh(): void {
    this._btn.textContent = `👤 ${userStore.current.name}`;
    this._renderList();
  }

  /** Refresh static labels after a language change. */
  refreshLabels(): void {
    this._btn.title = i18n.t('user.menu');
    (this._el.querySelector('.user-menu-input') as HTMLInputElement).placeholder = i18n.t('user.newPlaceholder');
    this._el.querySelector('.user-menu-add')!.textContent = i18n.t('user.add');
    const saveBtn = this._el.querySelector('.user-menu-import-save') as HTMLButtonElement | null;
    if (saveBtn) {
      saveBtn.textContent = i18n.t('save.import');
      saveBtn.title = i18n.t('save.importTip');
    }
    this._el.querySelector('.user-menu-export')!.textContent = i18n.t('user.export');
    this._el.querySelector('.user-menu-import')!.textContent = i18n.t('user.import');
    this._el.querySelector('.user-menu-delete')!.textContent = i18n.t('user.delete');
    this._renderList();
  }
}
