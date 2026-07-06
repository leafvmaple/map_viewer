import { i18n } from '../i18n/index.js';
import type {
  CatalogItemDef,
  CurrencyDef,
  CurrencyRefDef,
  GameDataCatalogs,
  LocalizedString,
  PartyDef,
  PartyMemberDef,
  PartyMemberRefDef,
  PoiDef,
  PoiItemRefDef,
  SpeciesDef,
  TrainerDef,
} from '../types';

type CatalogSource = Record<string, CatalogItemDef> | GameDataCatalogs | undefined;

export interface ResolvedPoiItem {
  itemId?: string;
  quantity?: number;
  item?: CatalogItemDef;
  name: LocalizedString;
  itemIcon?: string;
}

export interface ResolvedPoiBattle {
  trainer?: TrainerDef;
  party?: PartyDef;
  members: PartyMemberDef[];
  label?: LocalizedString;
  reward?: LocalizedString;
  icon?: string;
  iconSize?: [number, number];
}

export interface ResolvedPoiReward {
  kind: 'item' | 'currency';
  text: string;
  icon?: string;
  searchTexts: string[];
}

export function catalogItem(items: Record<string, CatalogItemDef> | undefined, itemId: string | undefined): CatalogItemDef | undefined {
  if (!items || !itemId) return undefined;
  return items[itemId] ?? items[itemId.toUpperCase()] ?? items[itemId.toLowerCase()];
}

export function catalogSpecies(species: Record<string, SpeciesDef> | undefined, speciesId: string | undefined): SpeciesDef | undefined {
  return catalogById(species, speciesId);
}

export function catalogParty(parties: Record<string, PartyDef> | undefined, partyId: string | undefined): PartyDef | undefined {
  return catalogById(parties, partyId);
}

export function catalogTrainer(trainers: Record<string, TrainerDef> | undefined, trainerId: string | undefined): TrainerDef | undefined {
  return catalogById(trainers, trainerId);
}

export function catalogCurrency(currencies: Record<string, CurrencyDef> | undefined, currencyId: string | undefined): CurrencyDef | undefined {
  return catalogById(currencies, currencyId);
}

export function resolvePoiItems(poi: PoiDef, source?: CatalogSource): ResolvedPoiItem[] {
  const items = itemCatalog(source);
  if ((poi.itemRefs?.length ?? 0) > 0) {
    return poi.itemRefs!.map(ref => resolveItemRef(ref, items));
  }
  if ((poi.items?.length ?? 0) > 0) {
    return poi.items!.map(ref => {
      const item = catalogItem(items, ref.item);
      return {
        itemId: ref.item,
        item,
        name: item?.name ?? ref.name,
        itemIcon: item?.itemIcon ?? ref.itemIcon,
      };
    });
  }
  if (poi.item) {
    const item = catalogItem(items, poi.item);
    return [{
      itemId: poi.item,
      item,
      name: item?.name ?? poi.label ?? { en: poi.item },
      itemIcon: item?.itemIcon ?? poi.itemIcon,
    }];
  }
  return [];
}

export function resolvePoiCurrencies(poi: PoiDef, catalogs?: GameDataCatalogs): ResolvedPoiReward[] {
  return (poi.currencyRefs ?? []).map(ref => resolveCurrencyRef(ref, catalogs));
}

export function resolvePoiRewards(poi: PoiDef, source?: CatalogSource): ResolvedPoiReward[] {
  const items = resolvePoiItems(poi, source).map(item => ({
    kind: 'item' as const,
    text: resolvedItemText(item),
    icon: item.itemIcon,
    searchTexts: [item.itemId, item.itemId?.toLowerCase(), i18n.localize(item.name)].filter((v): v is string => !!v),
  }));
  return [...items, ...resolvePoiCurrencies(poi, gameCatalogs(source))];
}

export function resolvePoiBattle(poi: PoiDef, catalogs?: GameDataCatalogs): ResolvedPoiBattle {
  const trainer = catalogTrainer(catalogs?.trainers, poi.trainerId);
  const partyId = poi.partyId ?? trainer?.partyId;
  const party = catalogParty(catalogs?.parties, partyId);
  const members = (party?.members ?? []).map(member => resolvePartyMember(member, catalogs));
  const fallbackMembers = members.length > 0 ? members : (poi.party ?? []);
  return {
    trainer,
    party,
    members: fallbackMembers,
    label: poi.label ?? trainer?.label ?? trainer?.name,
    reward: poi.reward ?? trainer?.reward,
    icon: poi.icon ?? trainer?.icon,
    iconSize: poi.iconSize ?? trainer?.iconSize,
  };
}

export function resolveBattleRewardText(poi: PoiDef, catalogs?: GameDataCatalogs): string {
  const trainer = catalogTrainer(catalogs?.trainers, poi.trainerId);
  const refs = poi.currencyRefs ?? trainer?.currencyRefs ?? [];
  if (refs.length > 0) return refs.map(ref => resolveCurrencyRef(ref, catalogs).text).join(' / ');
  const reward = poi.reward ?? trainer?.reward;
  return reward ? i18n.localize(reward) : '';
}

export function resolvedItemText(item: ResolvedPoiItem): string {
  const name = i18n.localize(item.name) || item.itemId || '?';
  return item.quantity && item.quantity > 1 ? `${name} ×${item.quantity}` : name;
}

export function poiPrimaryItemIcon(poi: PoiDef, source?: CatalogSource): string | undefined {
  return resolvePoiRewards(poi, source).find(reward => reward.icon)?.icon ?? resolvePoiSpecies(poi, gameCatalogs(source))?.icon ?? poi.itemIcon;
}

export function poiDisplayName(poi: PoiDef, source?: CatalogSource): string {
  const refs = resolvePoiItems(poi, source);
  if (refs.length > 0) return refs.map(resolvedItemText).join(' / ');
  const catalogs = gameCatalogs(source);
  const currencyRefs = resolvePoiCurrencies(poi, catalogs);
  if (currencyRefs.length > 0) return currencyRefs.map(ref => ref.text).join(' / ');
  const species = resolvePoiSpecies(poi, catalogs);
  if (species) return i18n.localize(species.name) || species.id;
  const battle = resolvePoiBattle(poi, catalogs);
  const full = battle.label ? i18n.localize(battle.label) : '';
  const sep = full.indexOf('·');
  if (sep >= 0) return full.slice(sep + 1).trim();
  const serviceName = poi.serviceIds
    ?.map(id => {
      const service = catalogs?.services[id];
      return service ? i18n.localize(service.name) : '';
    })
    .filter(Boolean)
    .join(' / ');
  return full || serviceName || poi.item || poi.trainerId || poi.partyId || poi.speciesId || poi.kind || '?';
}

export function poiSearchTexts(poi: PoiDef, source?: CatalogSource): string[] {
  const catalogs = gameCatalogs(source);
  const out: string[] = [];
  if (poi.label) pushLocalized(out, poi.label);
  for (const item of resolvePoiItems(poi, source)) {
    if (item.itemId) out.push(item.itemId);
    pushLocalized(out, item.name);
    if (item.item?.category) pushLocalized(out, item.item.category);
  }
  for (const reward of resolvePoiCurrencies(poi, catalogs)) out.push(...reward.searchTexts);
  const species = resolvePoiSpecies(poi, catalogs);
  if (poi.speciesId) out.push(poi.speciesId);
  if (species) {
    out.push(species.id);
    pushLocalized(out, species.name);
  }
  for (const serviceId of poi.serviceIds ?? []) {
    out.push(serviceId);
    const service = catalogs?.services[serviceId];
    if (service) pushLocalized(out, service.name);
  }
  if (poi.trainerId) out.push(poi.trainerId);
  if (poi.partyId) out.push(poi.partyId);
  const battle = resolvePoiBattle(poi, catalogs);
  if (battle.trainer?.label) pushLocalized(out, battle.trainer.label);
  if (battle.trainer?.name) pushLocalized(out, battle.trainer.name);
  if (battle.trainer?.className) pushLocalized(out, battle.trainer.className);
  if (battle.trainer?.partyId) out.push(battle.trainer.partyId);
  const battleReward = resolveBattleRewardText(poi, catalogs);
  if (battleReward) out.push(battleReward);
  for (const ref of battle.trainer?.currencyRefs ?? []) out.push(...resolveCurrencyRef(ref, catalogs).searchTexts);
  for (const member of battle.members) {
    if (member.id != null) out.push(String(member.id));
    pushLocalized(out, member.name);
  }
  return out;
}

export function resolvePoiSpecies(poi: PoiDef, catalogs?: GameDataCatalogs): SpeciesDef | undefined {
  return catalogSpecies(catalogs?.species, poi.speciesId);
}

function resolvePartyMember(member: PartyMemberRefDef, catalogs?: GameDataCatalogs): PartyMemberDef {
  const species = catalogSpecies(catalogs?.species, member.speciesId ?? stringId(member.id));
  return {
    name: member.name ?? species?.name ?? { en: member.speciesId ?? stringId(member.id) ?? '?' },
    value: member.value ?? member.level,
    unit: member.unit,
    id: member.id ?? member.speciesId ?? species?.id,
    icon: member.icon ?? species?.icon,
  };
}

function resolveItemRef(ref: PoiItemRefDef, items?: Record<string, CatalogItemDef>): ResolvedPoiItem {
  const item = catalogItem(items, ref.itemId);
  return {
    itemId: ref.itemId,
    quantity: ref.quantity,
    item,
    name: item?.name ?? { en: ref.itemId },
    itemIcon: item?.itemIcon,
  };
}

function resolveCurrencyRef(ref: CurrencyRefDef, catalogs?: GameDataCatalogs): ResolvedPoiReward {
  const currency = catalogCurrency(catalogs?.currencies, ref.currencyId);
  const text = formatCurrency(ref, currency);
  const searchTexts = [ref.currencyId, text];
  if (Number.isFinite(ref.amount)) searchTexts.push(String(ref.amount));
  if (ref.amountRange) searchTexts.push(String(ref.amountRange[0]), String(ref.amountRange[1]), `${ref.amountRange[0]}-${ref.amountRange[1]}`);
  if (currency?.name) pushLocalized(searchTexts, currency.name);
  if (currency?.symbol) pushLocalized(searchTexts, currency.symbol);
  return { kind: 'currency', text, icon: currency?.icon, searchTexts };
}

function formatCurrency(ref: CurrencyRefDef, currency?: CurrencyDef): string {
  const amount = ref.amountRange
    ? `${ref.amountRange[0]}-${ref.amountRange[1]}`
    : Number.isFinite(ref.amount) ? String(ref.amount) : '';
  const symbol = currency?.symbol ? i18n.localize(currency.symbol) : (currency?.name ? i18n.localize(currency.name) : ref.currencyId);
  if (!amount) return symbol;
  const position = currency?.format?.position ?? 'suffix';
  const space = currency?.format?.space ?? position === 'suffix';
  return position === 'prefix'
    ? `${symbol}${space ? ' ' : ''}${amount}`
    : `${amount}${space ? ' ' : ''}${symbol}`;
}

function catalogById<T>(catalog: Record<string, T> | undefined, id: string | undefined): T | undefined {
  if (!catalog || !id) return undefined;
  return catalog[id] ?? catalog[id.toUpperCase()] ?? catalog[id.toLowerCase()];
}

function itemCatalog(source: CatalogSource): Record<string, CatalogItemDef> | undefined {
  if (!source) return undefined;
  return isGameCatalogs(source) ? source.items : source;
}

function gameCatalogs(source: CatalogSource): GameDataCatalogs | undefined {
  return isGameCatalogs(source) ? source : undefined;
}

function isGameCatalogs(source: CatalogSource): source is GameDataCatalogs {
  return !!source && typeof source === 'object' && 'items' in source && 'services' in source;
}

function stringId(value: number | string | undefined): string | undefined {
  return value == null ? undefined : String(value);
}

function pushLocalized(out: string[], value: LocalizedString): void {
  for (const text of Object.values(value)) {
    if (text) out.push(text);
  }
}
