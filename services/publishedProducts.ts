import type { Category, Item, UOM } from '../types';

/**
 * Published (website_published) products from the Odoo backend, for the
 * "Receive Stock" product picker.
 *
 * Source: the unified_shop_api module's public, read-only
 * POST /api/snabbb-shop/products (it filters on website_published = True and
 * sale_ok = True server-side), reached through the same snabbb-worker that
 * already answers inventory.snabbb.com/api/*. Paged (max 96 per page) and
 * merged here so the dropdown can list the whole catalog.
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
const CACHE_TTL_MS = 10 * 60 * 1000;

let cache: { at: number; products: PublishedProduct[] } | null = null;

function getProductsUrl() {
  const apiBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '');
  return apiBase ? `${apiBase}/snabbb-shop/products` : '/api/snabbb-shop/products';
}

export async function fetchPublishedProducts(force = false): Promise<PublishedProduct[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.products;

  const byId = new Map<number, PublishedProduct>();
  let total = Infinity;

  for (let page = 1; page <= MAX_PAGES && byId.size < total; page++) {
    const res = await fetch(getProductsUrl(), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page, pageSize: PAGE_SIZE, sort: 'name_asc' }),
    });
    if (!res.ok) throw new Error(`Product catalog request failed (${res.status})`);
    const data = await res.json();
    const rows: any[] = Array.isArray(data?.products) ? data.products : [];
    total = typeof data?.total === 'number' ? data.total : rows.length;
    if (rows.length === 0) break;
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
  }

  const products = [...byId.values()]
    .filter(p => p.name)
    .sort((a, b) => a.name.localeCompare(b.name));
  cache = { at: Date.now(), products };
  return products;
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
