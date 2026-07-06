import { i18n } from '../i18n/index.js';
import { escapeHtml } from '../utils.js';
import { renderItemIcon } from '../core/ItemIcon.js';
import { serviceDisplayName, serviceEntryIcon, serviceEntryName, serviceEntryPrice, type ServiceIndexEntry } from '../core/ServiceIndex.js';
import type { CatalogItemDef } from '../types';

interface ServicePanelOptions {
  onNavigateToPoi?: (mapId: string, poiId: string) => void | Promise<void>;
  onOpen?: () => void;
  onClose?: () => void;
}

export class ServicePanel {
  private _el: HTMLElement;
  private _entries: ServiceIndexEntry[] = [];
  private _index = new Map<string, ServiceIndexEntry>();
  private _activeId: string | null = null;
  private _mode: 'directory' | 'detail' | null = null;
  private _options: ServicePanelOptions;
  private _resolveIcon: ((relativePath: string) => string) | null = null;

  constructor(options: ServicePanelOptions = {}) {
    this._options = options;
    this._el = document.createElement('div');
    this._el.className = 'service-panel';
    this._el.style.display = 'none';
    document.getElementById('app')?.appendChild(this._el);

    this._el.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.service-panel-close')) {
        this.hide();
        return;
      }
      if (target.closest('.service-panel-back')) {
        this.showDirectory();
        return;
      }
      const serviceRow = target.closest<HTMLElement>('.service-directory-item');
      if (serviceRow?.dataset.serviceId) {
        this.show(serviceRow.dataset.serviceId);
        return;
      }
      const row = target.closest<HTMLElement>('.service-binding');
      if (row?.dataset.mapId && row.dataset.poiId) {
        void this._options.onNavigateToPoi?.(row.dataset.mapId, row.dataset.poiId);
      }
    });
  }

  setEntries(entries: ServiceIndexEntry[]): void {
    this._entries = entries;
    this._index = new Map(entries.map(entry => [entry.serviceId, entry]));
    if (this._activeId && this._index.has(this._activeId)) this.show(this._activeId);
    else if (this._mode === 'directory') this.showDirectory();
    else this.hide();
  }

  setIconResolver(resolve: (relativePath: string) => string): void {
    this._resolveIcon = resolve;
    if (this._activeId) this.show(this._activeId);
  }

  toggleDirectory(): boolean {
    if (this._mode === 'directory' && this._el.style.display !== 'none') {
      this.hide();
      return false;
    }
    this.showDirectory();
    return true;
  }

  showDirectory(): void {
    this._activeId = null;
    this._mode = 'directory';
    const rows = this._entries.length > 0
      ? this._entries.map(entry => this._directoryRow(entry)).join('')
      : `<div class="service-empty service-directory-empty">${escapeHtml(i18n.t('service.directoryEmpty'))}</div>`;

    this._el.innerHTML = `
      <div class="service-panel-head">
        <div>
          <div class="service-kind">${escapeHtml(i18n.t('sidebar.serviceResults'))}</div>
          <h3>${escapeHtml(i18n.t('service.directory'))}</h3>
        </div>
        <button class="service-panel-close" title="${escapeHtml(i18n.t('editor.cancel'))}">×</button>
      </div>
      <div class="service-directory-list">${rows}</div>
    `;
    this._el.style.display = 'flex';
    this._options.onOpen?.();
  }

  show(serviceId: string): void {
    const entry = this._index.get(serviceId);
    if (!entry) return;
    this._activeId = serviceId;
    this._mode = 'detail';
    const service = entry.service;
    const source = service.source ?? {};
    const sourceParts = [source.type, source.listIndex, source.pointer]
      .filter(v => v !== undefined && v !== null)
      .map(v => String(v));
    const bindings = entry.bindings.length > 0
      ? entry.bindings.map(binding => `<button class="service-binding" data-map-id="${escapeHtml(binding.mapId)}" data-poi-id="${escapeHtml(binding.poi.id)}">${escapeHtml(binding.mapId)} · ${escapeHtml(binding.poi.id)}</button>`).join('')
      : `<span class="service-empty">${escapeHtml(i18n.t('service.unbound'))}</span>`;
    const award = service.award
      ? `<div class="service-award"><span>${escapeHtml(i18n.t('service.award'))}</span><strong>${escapeHtml(serviceEntryName(service.award, entry.items))}</strong></div>`
      : '';
    const back = this._entries.length > 0
      ? `<button class="service-panel-back">‹ ${escapeHtml(i18n.t('service.directory'))}</button>`
      : '';

    this._el.innerHTML = `
      <div class="service-panel-head">
        <div>
          ${back}
          <div class="service-kind">${escapeHtml(service.kind)}</div>
          <h3>${escapeHtml(serviceDisplayName(service))}</h3>
        </div>
        <button class="service-panel-close" title="${escapeHtml(i18n.t('editor.cancel'))}">×</button>
      </div>
      <div class="service-source">${escapeHtml(sourceParts.join(' · ') || serviceId)}</div>
      <div class="service-bindings">${bindings}</div>
      ${award}
      <div class="service-entry-list">
        ${service.entries.map((item, idx) => this._entryRow(item, idx, entry.items)).join('')}
      </div>
    `;
    this._el.style.display = 'flex';
    this._options.onOpen?.();
  }

  hide(): void {
    this._activeId = null;
    this._mode = null;
    this._el.style.display = 'none';
    this._el.innerHTML = '';
    this._options.onClose?.();
  }

  refreshLabels(): void {
    if (this._activeId) this.show(this._activeId);
  }

  private _entryRow(entry: ServiceIndexEntry['service']['entries'][number], idx: number, items: Record<string, CatalogItemDef>): string {
    const icon = renderItemIcon(serviceEntryIcon(entry, items), 'service-entry-icon', this._resolveIcon);
    const price = serviceEntryPrice(entry, items);
    const priceHtml = price ? `<span class="service-entry-price">${escapeHtml(price)}</span>` : '';
    const itemId = entry.itemId ? `<span class="service-entry-id">${escapeHtml(entry.itemId)}</span>` : '';
    const stockBits: string[] = [];
    if (Number.isFinite(entry.quantity)) stockBits.push(`${i18n.t('service.quantity')}: ${entry.quantity}`);
    if (entry.available === false) stockBits.push(i18n.t('service.soldOut'));
    const stock = stockBits.length ? `<span class="service-entry-stock">${escapeHtml(stockBits.join(' · '))}</span>` : '';
    const cls = entry.available === false ? ' service-entry-unavailable' : '';
    return `<div class="service-entry${cls}">
      <span class="service-entry-idx">${idx + 1}</span>
      <span class="service-entry-icon-slot">${icon}</span>
      <span class="service-entry-main">${escapeHtml(serviceEntryName(entry, items))}${itemId}</span>
      ${stock}${priceHtml}
    </div>`;
  }

  private _directoryRow(entry: ServiceIndexEntry): string {
    const service = entry.service;
    const glyph = service.kind === 'vending' ? '🥫' : service.kind === 'inn' ? '🛏️' : service.kind === 'transport' ? '↕' : '🏪';
    const locations = entry.bindings.length > 0
      ? entry.bindings.map(binding => binding.mapId).join(' / ')
      : i18n.t('service.unbound');
    return `<button class="service-directory-item" data-service-id="${escapeHtml(entry.serviceId)}">
      <span class="service-directory-glyph">${glyph}</span>
      <span class="service-directory-main">
        <span class="service-directory-name">${escapeHtml(serviceDisplayName(service))}</span>
        <span class="service-directory-meta">${escapeHtml(locations)} · ${service.entries.length}</span>
      </span>
    </button>`;
  }
}
