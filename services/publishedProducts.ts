import type { Category, Item, UOM } from '../types';

/**
 * Published (website_published) products from the Odoo backend, for the
 * "Receive Stock" product picker.
 *
 * Fast path: GET /api/product-catalog (same origin, handled by
 * public/_worker.js) -> Odoo's snabbb_shop_inventory_sync
 * /api/inventory/product-catalog. One request returns the whole published
 * catalog (id / name / sku / unit / category / company, no pricing) and is
 * cached at Cloudflare's edge.
 *
 * Fallback (endpoint not deployed yet, local dev, or it errors): the
 * unified_shop_api's public POST /api/snabbb-shop/products, capped at 96 per
 * page and slow (~6-10 s per page) because it re-scans and prices on every
 * call — fetched with page 1 first and every other page in parallel.
 *
 * On top of that:
 *  - page 1 is fetched first (to learn `total`), then EVERY remaining page
 *    in parallel instead of one after another;
 *  - the result is kept in localStorage (stale-while-revalidate), so the
 *    picker is populated instantly on every visit after the first and
 *    refreshes quietly in the background;
 *  - concurrent callers share a single in-flight request;
 *  - prefetchPublishedProducts() lets the app warm the cache on load.
 */

export interface PublishedProduct {
  id: number;
  name: string;
  sku: string | null;
  price: number | null;
  currency: string | null;
  unit: string | null;
  categoryName: string | null;
  companyName: string | null;
  description: string | null;
}

const PAGE_SIZE = 96;
const MAX_PAGES = 15; // safety cap: ~1,440 products
const FRESH_MS = 10 * 60 * 1000; // within this, no network call at all
const STORAGE_KEY = 'inventory:publishedProducts:v1';
const STORAGE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // ignore persisted data older than a week

let cache: { at: number; products: PublishedProduct[] } | null = null;
let inflight: Promise<PublishedProduct[]> | null = null;

function apiBase() {
  return import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || '/api';
}

const getProductsUrl = () => `${apiBase()}/snabbb-shop/products`;

/* ------------------------------------------------------------------ */
/* persistence                                                         */
/* ------------------------------------------------------------------ */

function loadPersisted() {
  if (cache) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      Array.isArray(parsed.products) &&
      typeof parsed.at === 'number' &&
      Date.now() - parsed.at < STORAGE_MAX_AGE_MS
    ) {
      cache = { at: parsed.at, products: parsed.products };
    }
  } catch {
    /* storage unavailable or corrupt — behave as if empty */
  }
}

function persist() {
  if (!cache) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    /* quota / private mode — the in-memory cache still works */
  }
}

/* ------------------------------------------------------------------ */
/* normalising rows                                                    */
/* ------------------------------------------------------------------ */

function normalise(rows: any[]): PublishedProduct[] {
  const byId = new Map<number, PublishedProduct>();
  for (const r of rows) {
    if (r?.id == null || byId.has(r.id)) continue;
    byId.set(r.id, {
      id: r.id,
      name: String(r.name || '').trim(),
      sku: r.sku || null,
      price: typeof r.price === 'number' ? r.price : null,
      currency: r.currency || null,
      unit: r.unit || null,
      categoryName: r.categoryName || null,
      companyName: r.companyName || null,
      description: r.description || null,
    });
  }
  return [...byId.values()]
    .filter(p => p.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* ------------------------------------------------------------------ */
/* network                                                             */
/* ------------------------------------------------------------------ */

async function fetchViaCatalog(): Promise<PublishedProduct[]> {
  const res = await fetch('/api/product-catalog', { method: 'GET' });
  if (!res.ok) throw new Error(`Catalog request failed (${res.status})`);
  const data = await res.json();
  if (!Array.isArray(data?.products)) throw new Error('Catalog response malformed');
  return normalise(data.products);
}

async function fetchPage(page: number) {
  const res = await fetch(getProductsUrl(), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page, pageSize: PAGE_SIZE, sort: 'name_asc' }),
  });
  if (!res.ok) throw new Error(`Product catalog request failed (${res.status})`);
  const data = await res.json();
  const rows: any[] = Array.isArray(data?.products) ? data.products : [];
  const total = typeof data?.total === 'number' ? data.total : rows.length;
  return { rows, total };
}

/** Page 1 first (to learn `total`), then every other page in parallel —
 *  N sequential round-trips become 2. */
async function fetchFromNetwork(onProgress?: (partial: PublishedProduct[]) => void): Promise<PublishedProduct[]> {
  try {
    return await fetchViaCatalog();
  } catch (err) {
    console.warn('MasterInventory: catalog endpoint unavailable, using paged products', err);
    return fetchViaPagedProducts(onProgress);
  }
}

async function fetchViaPagedProducts(onProgress?: (partial: PublishedProduct[]) => void): Promise<PublishedProduct[]> {
  const first = await fetchPage(1);
  const rowsByPage: any[][] = [first.rows];
  const emit = () => onProgress?.(normalise(rowsByPage.flat()));
  emit(); // first page is usable on its own — show it straight away

  const pageCount = Math.min(MAX_PAGES, Math.ceil(first.total / PAGE_SIZE));
  await Promise.all(
    Array.from({ length: Math.max(pageCount - 1, 0) }, (_, i) =>
      fetchPage(i + 2).then(p => {
        rowsByPage.push(p.rows);
        emit(); // list grows as each page lands instead of waiting for the slowest
      }),
    ),
  );
  return normalise(rowsByPage.flat());
}

/* ------------------------------------------------------------------ */
/* public API                                                          */
/* ------------------------------------------------------------------ */

/** Whatever is cached right now (memory or localStorage), fresh or stale —
 *  or null. Synchronous, so the picker can render instantly. */
export function getCachedPublishedProducts(): PublishedProduct[] | null {
  loadPersisted();
  return cache ? cache.products : null;
}

/** Loads the catalog. Resolves from cache without any request while it is
 *  fresh (or when `force` is false and a request is already running);
 *  otherwise fetches, de-duplicating concurrent callers. */
export async function fetchPublishedProducts(
  force = false,
  onProgress?: (partial: PublishedProduct[]) => void,
): Promise<PublishedProduct[]> {
  loadPersisted();
  if (!force && cache && Date.now() - cache.at < FRESH_MS) return cache.products;
  if (inflight) return inflight;

  inflight = fetchFromNetwork(onProgress)
    .then(products => {
      cache = { at: Date.now(), products };
      persist();
      return products;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

const priceCache = new Map<number, number | null>();

/** The fast catalog carries no prices (pricing is the expensive part of the
 *  storefront endpoint), so the receive form asks for ONE product's price
 *  when it is selected: a search narrowed to that SKU/name (cheap, unlike
 *  the full scan), matched back by id. Cached per product. */
export async function fetchPublishedProductPrice(p: PublishedProduct): Promise<number | null> {
  if (typeof p.price === 'number') return p.price;
  if (priceCache.has(p.id)) return priceCache.get(p.id) ?? null;
  try {
    const res = await fetch(getProductsUrl(), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ search: p.sku || p.name, page: 1, pageSize: 20, sort: 'name_asc' }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const row = (Array.isArray(data?.products) ? data.products : []).find((r: any) => r?.id === p.id);
    const price = typeof row?.price === 'number' ? row.price : null;
    priceCache.set(p.id, price);
    return price;
  } catch {
    return null;
  }
}

/** Fire-and-forget cache warm-up. Call once when the app mounts (e.g. in
 *  the layout that hosts MasterInventory) so the picker is already filled
 *  by the time anyone opens "Receive Stock". */
export function prefetchPublishedProducts() {
  fetchPublishedProducts().catch(() => {
    /* best effort */
  });
}

// Same keyword heuristics the Odoo-side snabbb_shop_inventory_sync uses when
// it auto-receives a shop purchase, so a product picked here lands in the
// same category/UOM as the identical product bought through the shop.
const CATEGORY_KEYWORDS: [Category, string[]][] = [
  ['ppe', ['mask', 'glove', 'gown', 'ppe', 'face shield', 'apron']],
  ['instruments', ['bur', 'forceps', 'scaler', 'probe', 'mirror', 'instrument', 'handpiece', 'elevator', 'curette']],
  ['equipment', ['chair', 'unit', 'machine', 'equipment', 'autoclave', 'sterilizer', 'steriliser', 'compressor', 'x-ray', 'xray', 'led light', 'suction']],
  ['materials', ['composite', 'cement', 'alginate', 'impression', 'resin', 'material', 'wax', 'amalgam', 'etchant', 'bonding']],
  ['medication', ['anesthetic', 'anaesthetic', 'medicine', 'drug', 'antibiotic', 'medication', 'lidocaine', 'articaine']],
  ['consumables', ['cotton', 'gauze', 'needle', 'syringe', 'floss', 'disposable', 'bib', 'cup', 'tray sheet', 'roll']],
];

function mapCategory(p: PublishedProduct): Category {
  const haystack = `${p.name} ${p.categoryName || ''}`.toLowerCase();
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some(k => haystack.includes(k))) return category;
  }
  return 'other';
}

function mapUom(p: PublishedProduct): UOM {
  const unit = (p.unit || '').toLowerCase();
  if (unit.includes('box')) return 'box';
  if (unit.includes('kit') || unit.includes('set')) return 'kit';
  if (unit.includes('unit')) return 'unit';
  return 'pcs';
}

/** Pre-fills the receive form from an Odoo product. Brand stays empty (like the
 *  shop auto-sync) so receiving it merges with the same item bought via the shop. */
export function productToItemDraft(p: PublishedProduct): Partial<Item> {
  return {
    name: p.name,
    brand: '',
    code: p.sku || '',
    category: mapCategory(p),
    uom: mapUom(p),
    vendor: p.companyName || 'Mr.Bur Shop',
    description: '',
  };
}
