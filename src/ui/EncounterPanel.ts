import { i18n } from '../i18n/index.js';
import type {
  CatalogItemDef,
  EncounterOutcomeDef,
  EncounterRealmDef,
  EncounterZoneDef,
  GameDataCatalogs,
  SpeciesDef,
} from '../types';

interface SpeciesDrop {
  itemId?: string;
  numerator?: number;
  denominator?: number;
  chancePercent?: number;
}

/** Details for the encounter realm under the cursor (or the current scene). */
export class EncounterPanel {
  private readonly _el: HTMLDivElement;
  private _catalogs: GameDataCatalogs = {
    items: {}, services: {}, species: {}, parties: {}, trainers: {}, currencies: {}, encounters: {},
  };
  private _resolveImagePath: (path: string) => string = (path) => path;
  private _zone: EncounterZoneDef | null = null;
  private _fixedEncounterId: string | null = null;
  private _enabled = true;

  constructor(container: HTMLElement) {
    this._el = document.createElement('div');
    this._el.className = 'encounter-panel hidden';
    container.appendChild(this._el);
  }

  setCatalogs(catalogs: GameDataCatalogs, resolveImagePath: (path: string) => string): void {
    this._catalogs = catalogs;
    this._resolveImagePath = resolveImagePath;
    this._render();
  }

  selectZone(zone: EncounterZoneDef | null): void {
    this._zone = zone;
    this._fixedEncounterId = null;
    this._render();
  }

  selectFixedEncounter(id: string): void {
    this._zone = null;
    this._fixedEncounterId = id;
    this._render();
  }

  setVisible(visible: boolean): void {
    this._enabled = visible;
    this._render();
  }

  refreshLabels(): void {
    this._render();
  }

  private _render(): void {
    this._el.replaceChildren();
    const fixed = this._fixedEncounterId
      ? this._catalogs.fixedEncounters?.[this._fixedEncounterId]
      : undefined;
    const realm = this._zone ? this._catalogs.encounters?.[this._zone.realmId] : undefined;
    if (!this._enabled || (!realm && !fixed)) {
      this._el.classList.add('hidden');
      return;
    }
    this._el.classList.remove('hidden');

    if (fixed) {
      const header = document.createElement('div');
      header.className = 'encounter-panel-header';
      header.textContent = `${i18n.t('encounter.fixed')} · ${i18n.localize(fixed.name)}`;
      this._el.appendChild(header);
      const meta = document.createElement('div');
      meta.className = 'encounter-panel-meta encounter-fixed-meta';
      meta.textContent = [
        `${i18n.t('encounter.row')} #${fixed.id}`,
        `${i18n.t('encounter.victoryFlag')} ${fixed.completionFlag}`,
        `${i18n.t('encounter.handler')} ${fixed.handlerId}`,
        `${i18n.t('encounter.battleParameter')} ${fixed.battleParameter}`,
      ].join(' · ');
      this._el.appendChild(meta);
      return;
    }

    if (!realm) return;

    const header = document.createElement('div');
    header.className = 'encounter-panel-header';
    header.textContent = `${i18n.t('encounter.title')} · ${i18n.localize(realm.name) || `#${realm.id}`}`;
    this._el.appendChild(header);

    const meta = document.createElement('div');
    meta.className = 'encounter-panel-meta';
    meta.textContent = [
      `${i18n.t('encounter.rateClass')} ${realm.initialRateClass ?? '–'}`,
      `${i18n.t('encounter.surpriseClass')} ${realm.surpriseClass ?? '–'}`,
      `${i18n.t('encounter.probabilitySet')} ${realm.probabilitySet ?? '–'}`,
    ].join(' · ');
    this._el.appendChild(meta);

    if (realm.conditional) {
      const warning = document.createElement('div');
      warning.className = 'encounter-panel-warning';
      warning.textContent = i18n.t('encounter.conditionalNote');
      this._el.appendChild(warning);
    }

    const list = document.createElement('div');
    list.className = 'encounter-list';
    for (const outcome of realm.outcomes) list.appendChild(this._outcomeRow(outcome, realm));
    this._el.appendChild(list);
  }

  private _outcomeRow(outcome: EncounterOutcomeDef, realm: EncounterRealmDef): HTMLElement {
    const row = document.createElement('div');
    row.className = 'encounter-row';
    const body = document.createElement('div');
    body.className = 'encounter-row-body';

    if (outcome.kind === 'monster' && outcome.speciesId) {
      const species = this._catalogs.species[outcome.speciesId];
      this._appendSpeciesIdentity(row, body, species, outcome.speciesId);
      const counts = (outcome.countRanges ?? []).map(([lo, hi]) => lo === hi ? `×${lo}` : `×${lo}–${hi}`);
      if (counts.length) this._appendMuted(body, counts.join(' / '));
      this._appendDrop(body, species);
    } else {
      const title = document.createElement('div');
      title.className = 'encounter-name';
      title.textContent = `${i18n.t('encounter.formation')} #${outcome.groupId ?? '?'}`;
      body.appendChild(title);
      for (const member of outcome.members ?? []) {
        const species = this._catalogs.species[member.speciesId];
        this._appendMuted(body, `${i18n.localize(species?.name) || `#${member.speciesId}`} ×${member.count}`);
      }
    }

    const chance = document.createElement('div');
    chance.className = 'encounter-chance';
    chance.textContent = outcome.chancePercent != null && !realm.conditional
      ? `${this._formatPercent(outcome.chancePercent)}%`
      : `${i18n.t('encounter.weight')} ${outcome.weight}${outcome.conditional ? '*' : ''}`;
    body.appendChild(chance);
    row.appendChild(body);
    return row;
  }

  private _appendSpeciesIdentity(row: HTMLElement, body: HTMLElement, species: SpeciesDef | undefined, id: string): void {
    if (species?.icon) {
      const img = document.createElement('img');
      img.className = 'encounter-icon';
      img.src = this._resolveImagePath(species.icon);
      img.alt = '';
      row.appendChild(img);
    }
    const name = document.createElement('div');
    name.className = 'encounter-name';
    name.textContent = i18n.localize(species?.name) || `#${id}`;
    body.appendChild(name);
  }

  private _appendDrop(body: HTMLElement, species: SpeciesDef | undefined): void {
    const drop = species?.drop as SpeciesDrop | undefined;
    if (!drop?.itemId) return;
    const item: CatalogItemDef | undefined = this._catalogs.items[drop.itemId];
    const itemName = i18n.localize(item?.name) || `#${drop.itemId}`;
    const percent = drop.chancePercent ?? (
      drop.numerator != null && drop.denominator ? drop.numerator * 100 / drop.denominator : undefined
    );
    this._appendMuted(
      body,
      `${i18n.t('encounter.drop')} ${itemName}${percent == null ? '' : ` ${this._formatPercent(percent)}%`}`,
      'encounter-drop',
    );
  }

  private _appendMuted(body: HTMLElement, text: string, extraClass = ''): void {
    const line = document.createElement('div');
    line.className = `encounter-muted ${extraClass}`.trim();
    line.textContent = text;
    body.appendChild(line);
  }

  private _formatPercent(value: number): string {
    return value >= 10 ? value.toFixed(1).replace(/\.0$/, '') : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  }
}
