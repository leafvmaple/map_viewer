import { i18n } from '../i18n/index.js';
import type {
  CatalogItemDef,
  EncounterMemberDef,
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
      // Exported names already carry a kind prefix ("固定遇敌·水鬼×2"),
      // so the header is the localized name alone.
      const name = i18n.localize(fixed.name);
      header.textContent = name.includes('·') ? name : `${i18n.t('encounter.fixed')} · ${name}`;
      this._el.appendChild(header);
      const meta = document.createElement('div');
      meta.className = 'encounter-panel-meta encounter-fixed-meta';
      const formationId = fixed.groupId ?? fixed.handlerId;
      meta.textContent = [
        `${i18n.t('encounter.row')} #${fixed.id}`,
        `${i18n.t('encounter.victoryFlag')} ${fixed.completionFlag}`,
        ...(formationId ? [`${i18n.t('encounter.group')} ${formationId}`] : []),
        `${i18n.t('encounter.battleParameter')} ${fixed.battleParameter}`,
        ...(fixed.scripted ? [i18n.t('encounter.scripted')] : []),
      ].join(' · ');
      this._el.appendChild(meta);
      if (fixed.members?.length) {
        const list = document.createElement('div');
        list.className = 'encounter-list';
        for (const member of fixed.members) list.appendChild(this._memberRow(member));
        this._el.appendChild(list);
      }
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

  /** One fixed-formation species: icon · name · ×count · drop. */
  private _memberRow(member: EncounterMemberDef): HTMLElement {
    const row = document.createElement('div');
    row.className = 'encounter-row';
    row.appendChild(this._speciesCell(member.speciesId, `×${member.count}`));
    return row;
  }

  private _outcomeRow(outcome: EncounterOutcomeDef, realm: EncounterRealmDef): HTMLElement {
    const row = document.createElement('div');
    row.className = 'encounter-row';

    if (outcome.kind === 'monster' && outcome.speciesId) {
      const counts = (outcome.countRanges ?? []).map(([lo, hi]) => lo === hi ? `×${lo}` : `×${lo}–${hi}`);
      row.appendChild(this._speciesCell(outcome.speciesId, counts.join(' / ')));
    } else {
      // Formation: same species-cell format as normal rows, one per member,
      // tagged on the first line; the shared odds column covers the group.
      const stack = document.createElement('div');
      stack.className = 'encounter-stack';
      (outcome.members ?? []).forEach((member, index) => {
        const tag = index === 0 ? `#${outcome.groupId ?? '?'}` : undefined;
        stack.appendChild(this._speciesCell(member.speciesId, `×${member.count}`, tag));
      });
      row.appendChild(stack);
    }

    const chance = document.createElement('div');
    chance.className = 'encounter-chance';
    chance.textContent = outcome.chancePercent != null && !realm.conditional
      ? `${this._formatPercent(outcome.chancePercent)}%`
      : `${i18n.t('encounter.weight')} ${outcome.weight}${outcome.conditional ? '*' : ''}`;
    row.appendChild(chance);
    return row;
  }

  /** Icon + name (+ optional formation tag) + counts·drop line for one species. */
  private _speciesCell(speciesId: string, counts: string, formationTag?: string): HTMLElement {
    const cell = document.createElement('div');
    cell.className = 'encounter-cell';
    const species = this._catalogs.species[speciesId];
    if (species?.icon) {
      const img = document.createElement('img');
      img.className = 'encounter-icon';
      img.src = this._resolveImagePath(species.icon);
      img.alt = '';
      cell.appendChild(img);
    }
    const body = document.createElement('div');
    body.className = 'encounter-row-body';
    const name = document.createElement('div');
    name.className = 'encounter-name';
    name.textContent = i18n.localize(species?.name) || `#${speciesId}`;
    if (formationTag != null) {
      const chip = document.createElement('span');
      chip.className = 'encounter-tag';
      chip.textContent = i18n.t('encounter.formation');
      chip.title = formationTag;
      name.appendChild(chip);
    }
    body.appendChild(name);
    this._appendDetails(body, counts, species);
    cell.appendChild(body);
    return cell;
  }

  /** Counts and drop share one muted line so tall realm rosters stay compact. */
  private _appendDetails(body: HTMLElement, counts: string, species: SpeciesDef | undefined): void {
    const drop = this._dropText(species);
    if (!counts && !drop) return;
    const line = document.createElement('div');
    line.className = 'encounter-muted';
    if (counts) line.appendChild(document.createTextNode(counts));
    if (drop) {
      const span = document.createElement('span');
      span.className = 'encounter-drop';
      span.textContent = counts ? ` · ${drop}` : drop;
      line.appendChild(span);
    }
    body.appendChild(line);
  }

  private _dropText(species: SpeciesDef | undefined): string {
    const drop = species?.drop as SpeciesDrop | undefined;
    if (!drop?.itemId) return '';
    const item: CatalogItemDef | undefined = this._catalogs.items[drop.itemId];
    const itemName = i18n.localize(item?.name) || `#${drop.itemId}`;
    const percent = drop.chancePercent ?? (
      drop.numerator != null && drop.denominator ? drop.numerator * 100 / drop.denominator : undefined
    );
    return `${i18n.t('encounter.drop')} ${itemName}${percent == null ? '' : ` ${this._formatPercent(percent)}%`}`;
  }

  private _formatPercent(value: number): string {
    return value >= 10 ? value.toFixed(1).replace(/\.0$/, '') : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  }
}
