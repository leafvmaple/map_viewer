import { i18n } from '../i18n/index.js';
import type { CatalogItemDef, GameConfig, GameDataCatalogs, PoiDef, ServiceDef, ServiceEntryDef } from '../types';

export interface ServiceBinding {
  mapId: string;
  poi: PoiDef;
}

export interface ServiceIndexEntry {
  serviceId: string;
  service: ServiceDef;
  items: Record<string, CatalogItemDef>;
  bindings: ServiceBinding[];
}

export interface ServiceSearchResult {
  entry: ServiceIndexEntry;
  matchedEntry?: ServiceEntryDef;
}

export function buildServiceIndex(config: GameConfig, catalogs: GameDataCatalogs): ServiceIndexEntry[] {
  const bindings = new Map<string, ServiceBinding[]>();
  for (const [mapId, map] of Object.entries(config.maps)) {
    for (const poi of map.pois ?? []) {
      for (const serviceId of poi.serviceIds ?? []) {
        const rows = bindings.get(serviceId) ?? [];
        rows.push({ mapId, poi });
        bindings.set(serviceId, rows);
      }
    }
  }

  return Object.entries(catalogs.services).map(([serviceId, service]) => ({
    serviceId,
    service,
    items: catalogs.items,
    bindings: bindings.get(serviceId) ?? [],
  }));
}

export function serviceDisplayName(service: ServiceDef): string {
  return i18n.localize(service.name) || service.id;
}

export function serviceCatalogItem(entry: ServiceEntryDef, items?: Record<string, CatalogItemDef>): CatalogItemDef | undefined {
  if (!entry.itemId || !items) return undefined;
  return items[entry.itemId] ?? items[entry.itemId.toUpperCase()] ?? items[entry.itemId.toLowerCase()];
}

export function serviceEntryName(entry: ServiceEntryDef, items?: Record<string, CatalogItemDef>): string {
  const item = serviceCatalogItem(entry, items);
  if (item?.name) return i18n.localize(item.name) || item.id;
  return entry.name ? i18n.localize(entry.name) : entry.itemId ?? entry.type;
}

export function serviceEntryIcon(entry: ServiceEntryDef, items?: Record<string, CatalogItemDef>): string | undefined {
  return serviceCatalogItem(entry, items)?.itemIcon ?? (typeof entry.itemIcon === 'string' ? entry.itemIcon : undefined);
}

export function serviceEntryPrice(entry: ServiceEntryDef, items?: Record<string, CatalogItemDef>): string {
  const item = serviceCatalogItem(entry, items);
  const price = Number.isFinite(item?.price) ? item?.price : entry.price;
  const currency = item?.currency ?? entry.currency;
  if (!Number.isFinite(price)) return '';
  return `${price}${currency ? ` ${currency}` : ''}`;
}

export function searchServices(index: ServiceIndexEntry[], query: string, limit = 20): ServiceSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: ServiceSearchResult[] = [];

  for (const entry of index) {
    const serviceTexts = [
      entry.serviceId,
      entry.service.kind,
      ...Object.values(entry.service.name).filter((v): v is string => Boolean(v)),
    ];
    const serviceMatches = serviceTexts.some(text => text.toLowerCase().includes(q));
    const matchedEntry = entry.service.entries.find(e => entryMatches(e, q, entry.items));
    if (serviceMatches || matchedEntry) {
      results.push({ entry, matchedEntry });
      if (results.length >= limit) return results;
    }
  }
  return results;
}

function entryMatches(entry: ServiceEntryDef, q: string, items?: Record<string, CatalogItemDef>): boolean {
  const texts: string[] = [entry.type];
  if (entry.itemId) texts.push(entry.itemId);
  const item = serviceCatalogItem(entry, items);
  if (item) {
    texts.push(item.id);
    for (const value of Object.values(item.name)) {
      if (value) texts.push(value);
    }
    if (item.category) {
      for (const value of Object.values(item.category)) {
        if (value) texts.push(value);
      }
    }
  }
  if (entry.name) {
    for (const value of Object.values(entry.name)) {
      if (value) texts.push(value);
    }
  }
  if (entry.category) {
    for (const value of Object.values(entry.category)) {
      if (value) texts.push(value);
    }
  }
  return texts.some(text => text.toLowerCase().includes(q));
}
