import { i18n } from '../i18n/index.js';
import type { LangCode } from '../types';

interface ToolbarOptions {
  onLanguageChange: (lang: LangCode) => void;
  onTriggersToggle: () => boolean;
  onLabelsToggle: () => boolean;
  onGridToggle: () => boolean;
  onEditModeToggle: () => boolean;
  onBack: () => void;
}

/**
 * Toolbar - Top controls: back, language switcher, trigger toggle,
 * always-on labels, grid toggle, edit mode.
 */
export class Toolbar {
  private _el: HTMLElement;
  private _options: ToolbarOptions;
  private _triggersVisible = true;
  private _labelsVisible = false;
  private _gridVisible = false;
  private _editMode = false;
  private _backEnabled = false;
  private _backBtn!: HTMLButtonElement;

  constructor(container: HTMLElement, options: ToolbarOptions) {
    this._el = container;
    this._el.className = 'toolbar';
    this._options = options;
    this._render();
  }

  private _render(): void {
    this._el.innerHTML = `
      <button class="toolbar-btn btn-back" title="${i18n.t('nav.back')}" disabled>
        ← ${i18n.t('nav.back')}
      </button>
      <div class="toolbar-spacer"></div>
      <div class="toolbar-group">
        <select class="toolbar-lang-select" title="${i18n.t('toolbar.language')}">
          ${i18n.availableLanguages.map(l =>
            `<option value="${l.code}" ${l.code === i18n.lang ? 'selected' : ''}>${l.label}</option>`
          ).join('')}
        </select>
      </div>
      <div class="toolbar-group">
        <button class="toolbar-btn btn-triggers" title="${i18n.t('toolbar.triggersShow')}">
          ⚡ ${i18n.t('toolbar.triggers')}
        </button>
        <button class="toolbar-btn btn-labels" title="${i18n.t('toolbar.labelsShow')}">
          🏷 ${i18n.t('toolbar.labels')}
        </button>
        <button class="toolbar-btn btn-grid" title="${i18n.t('toolbar.grid')}">
          # ${i18n.t('toolbar.grid')}
        </button>
        <button class="toolbar-btn btn-edit" title="${i18n.t('toolbar.editModeOff')}">
          ✏ ${i18n.t('toolbar.editMode')}
        </button>
      </div>
    `;

    // Back button
    this._backBtn = this._el.querySelector('.btn-back')!;
    this._backBtn.addEventListener('click', () => this._options.onBack());

    // Language select
    const langSelect = this._el.querySelector('.toolbar-lang-select') as HTMLSelectElement;
    langSelect.addEventListener('change', () => {
      this._options.onLanguageChange(langSelect.value as LangCode);
    });

    // Trigger toggle
    const trigBtn = this._el.querySelector('.btn-triggers')!;
    trigBtn.addEventListener('click', () => {
      this._triggersVisible = this._options.onTriggersToggle();
      trigBtn.classList.toggle('active', this._triggersVisible);
    });

    // Always-on labels toggle
    const labelsBtn = this._el.querySelector('.btn-labels')!;
    labelsBtn.addEventListener('click', () => {
      this._labelsVisible = this._options.onLabelsToggle();
      labelsBtn.classList.toggle('active', this._labelsVisible);
    });

    // Grid toggle
    const gridBtn = this._el.querySelector('.btn-grid')!;
    gridBtn.addEventListener('click', () => {
      this._gridVisible = this._options.onGridToggle();
      gridBtn.classList.toggle('active', this._gridVisible);
    });

    // Edit mode toggle
    const editBtn = this._el.querySelector('.btn-edit')!;
    editBtn.addEventListener('click', () => {
      this._editMode = this._options.onEditModeToggle();
      editBtn.classList.toggle('active', this._editMode);
      editBtn.textContent = this._editMode
        ? `✏ ${i18n.t('toolbar.editModeOn')}`
        : `✏ ${i18n.t('toolbar.editMode')}`;
    });

    // Reflect current state onto the freshly-rendered buttons.
    this._applyState();
  }

  /**
   * Re-apply the toolbar's live state (back-enabled + toggle actives) onto the
   * DOM. Used after _render(); refreshLabels() updates text in place instead.
   */
  private _applyState(): void {
    this._backBtn.disabled = !this._backEnabled;
    this._el.querySelector('.btn-triggers')?.classList.toggle('active', this._triggersVisible);
    this._el.querySelector('.btn-labels')?.classList.toggle('active', this._labelsVisible);
    this._el.querySelector('.btn-grid')?.classList.toggle('active', this._gridVisible);

    const editBtn = this._el.querySelector('.btn-edit');
    if (editBtn) {
      editBtn.classList.toggle('active', this._editMode);
      editBtn.textContent = this._editMode
        ? `✏ ${i18n.t('toolbar.editModeOn')}`
        : `✏ ${i18n.t('toolbar.editMode')}`;
    }
  }

  /** Enable or disable back button. */
  setBackEnabled(enabled: boolean): void {
    this._backEnabled = enabled;
    this._backBtn.disabled = !enabled;
  }

  /** Refresh labels after language change — update text in place (no re-render). */
  refreshLabels(): void {
    this._backBtn.title = i18n.t('nav.back');
    this._backBtn.textContent = `← ${i18n.t('nav.back')}`;

    const langSelect = this._el.querySelector('.toolbar-lang-select') as HTMLSelectElement | null;
    if (langSelect) {
      langSelect.title = i18n.t('toolbar.language');
      langSelect.value = i18n.lang;
    }

    const trigBtn = this._el.querySelector('.btn-triggers');
    if (trigBtn) trigBtn.textContent = `⚡ ${i18n.t('toolbar.triggers')}`;

    const labelsBtn = this._el.querySelector('.btn-labels');
    if (labelsBtn) labelsBtn.textContent = `🏷 ${i18n.t('toolbar.labels')}`;

    const gridBtn = this._el.querySelector('.btn-grid');
    if (gridBtn) gridBtn.textContent = `# ${i18n.t('toolbar.grid')}`;

    // Edit-button text depends on mode → handled by _applyState.
    this._applyState();
  }
}
