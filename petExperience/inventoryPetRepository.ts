// PHASE 7E (Virtual Pet migration): this file is the LOCAL persistence
// adapter connecting the shared `@mrburdeveloperteam/molar-experience/pet`
// runtime to Inventory's OWN existing database. It implements the
// package's `PetRepository` interface — the shared runtime only ever
// calls these methods, never `supabase` directly. Every query here is
// moved mechanically from `VirtualPet/context/GameStateContext.tsx` (and
// `VirtualPetContainer.tsx`'s catalog/currency lookups) — confirmed
// byte-identical (same table names, same column names, same decay/XP/
// coin constants, same soap/soap2-exclusion, same toy-quantity-clamp, same
// adoption-seeding branch) to the source every other migrated app's own
// pre-migration Virtual Pet used, and to the installed shared package's
// own internal runtime (verified directly against `dist/pet.js`), so this
// is the same table/column/mapping shape as every other app's
// `xxxPetRepository.ts` in this migration series, not a rewrite:
//   - inventory_pet     (pet stats/identity snapshot, one row per user)
//   - pet_inventory     (owned items, full delete-then-insert sync)
//   - aiboard_pricing_items      (flat shop catalog)
//   - aiboard_pricing_currencies (currency code -> rate lookup)
//
// This is intentionally the ONLY file in Inventory that imports both
// `@mrburdeveloperteam/molar-experience/contracts` types and the Supabase
// client for pet data — the shared package itself must never see any of
// these table names.
import type { PetRepository } from '@mrburdeveloperteam/molar-experience/contracts';
import type { FoodItem, PetInventoryItem, PetSaveSnapshot } from '@mrburdeveloperteam/molar-experience/contracts';
import { supabase } from '../supabaseClient';

type PricingItemRow = {
  item_id: string;
  name: string;
  emoji?: string | null;
  category_id?: string | null;
  base_price_usd?: string | number | null;
  hunger?: number | null;
  happiness?: number | null;
  hygiene?: number | null;
  energy_gain?: number | null;
  image_src?: string | null;
  unlock_level?: number | null;
};

type PetInventoryRow = {
  item_id: string;
  quantity: number;
};

type InventoryPetRow = {
  pet_name: string | null;
  hunger: number | null;
  energy: number | null;
  happiness: number | null;
  hygiene: number | null;
  level: number | null;
  xp: number | null;
  coins: number | null;
  is_sleeping: boolean | null;
  active_ball_id: string | null;
  active_bed_id: string | null;
  updated_at: string | null;
};

export const inventoryPetRepository: PetRepository = {
  async loadSnapshot(userId: string): Promise<PetSaveSnapshot | null> {
    const { data, error } = await supabase
      .from('inventory_pet')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      // ERROR != EMPTY: a query/auth/network failure must never be treated
      // the same as "no row exists yet" — the latter is what tells the
      // runtime to seed fresh starter stats, so silently returning `null`
      // here on a transient failure would let a real user's existing
      // snapshot be overwritten by starter defaults. Only a genuinely
      // successful query with no matching row (below) means "first login".
      console.error('[inventoryPetRepository] Failed to load inventory_pet:', error);
      throw error;
    }
    if (!data) return null;

    const row = data as InventoryPetRow;
    return {
      globalUserId: userId,
      stats: {
        hunger: row.hunger ?? 100,
        energy: row.energy ?? 100,
        happiness: row.happiness ?? 100,
        hygiene: row.hygiene ?? 100,
        level: row.level ?? 1,
        xp: row.xp ?? 0,
        coins: row.coins ?? 100,
      },
      identity: {
        // Empty string means "not adopted yet" — matches the runtime's
        // exact falsy check against the original `pet_name` column.
        petName: row.pet_name ?? '',
        selectedPetId: row.pet_name ?? '',
        isSleeping: !!row.is_sleeping,
        activeBallId: row.active_ball_id ?? null,
        activeBedId: row.active_bed_id ?? null,
      },
      updatedAt: row.updated_at ?? new Date(0).toISOString(),
    };
  },

  async saveSnapshot(snapshot: PetSaveSnapshot): Promise<void> {
    const { error } = await supabase.from('inventory_pet').upsert({
      user_id: snapshot.globalUserId,
      pet_name: snapshot.identity.petName || null,
      hunger: snapshot.stats.hunger,
      energy: snapshot.stats.energy,
      happiness: snapshot.stats.happiness,
      hygiene: snapshot.stats.hygiene,
      level: snapshot.stats.level,
      xp: snapshot.stats.xp,
      coins: snapshot.stats.coins,
      is_sleeping: snapshot.identity.isSleeping,
      active_ball_id: snapshot.identity.activeBallId,
      active_bed_id: snapshot.identity.activeBedId,
      updated_at: snapshot.updatedAt,
    });
    if (error) throw error;
  },

  async loadInventoryRows(userId: string): Promise<PetInventoryItem[]> {
    const { data, error } = await supabase
      .from('pet_inventory')
      .select('item_id, quantity')
      .eq('user_id', userId);

    if (error) {
      // ERROR != EMPTY: a query/auth/network failure must never be treated
      // as "user owns zero items" — the runtime's full-sync `saveInventory`
      // would later write that false-empty state back as real data, wiping
      // a genuinely non-empty inventory on a transient read failure.
      console.error('[inventoryPetRepository] Failed to load pet_inventory:', error);
      throw error;
    }

    return (data as PetInventoryRow[]).map((row) => ({ itemId: row.item_id, quantity: row.quantity }));
  },

  async saveInventory(userId: string, items: PetInventoryItem[]): Promise<void> {
    // Single atomic upsert+prune RPC (Phase
    // SNABBB-VIRTUAL-PET-INVENTORY-ATOMICITY-AUDIT-AND-HARDENING) —
    // replaces the prior delete-then-insert two-request sequence, which
    // could leave this user's inventory empty if the process failed
    // between the delete and the insert. See public.save_pet_inventory's
    // own definition for the full rationale: it upserts every incoming
    // item (never destroying a row for an item this snapshot didn't
    // know about — e.g. one another app/tab just added) and only prunes
    // rows for items absent from this list, all inside one transaction.
    // `auth.uid()` is derived server-side from the caller's own
    // session — this repository has no way to write another user's
    // inventory even if `userId` here were wrong.
    const { error } = await supabase.rpc('save_pet_inventory', {
      p_items: items.map((item) => ({ itemId: item.itemId, quantity: item.quantity })),
    });
    if (error) throw error;
  },

  async loadCatalog(): Promise<FoodItem[]> {
    const { data, error } = await supabase
      .from('aiboard_pricing_items')
      .select('item_id, name, emoji, category_id, base_price_usd, hunger, happiness, hygiene, energy_gain, image_src, unlock_level')
      .order('unlock_level', { ascending: true });

    if (error || !data || data.length === 0) {
      if (error) console.error('[inventoryPetRepository] Failed to load aiboard_pricing_items:', error);
      return [];
    }

    return (data as PricingItemRow[]).map((row) => ({
      id: row.item_id,
      icon: row.emoji || '🍽️',
      label: row.name,
      hunger: row.hunger ?? 10,
      happiness: row.happiness ?? 0,
      hygiene: row.hygiene ?? 0,
      energyGain: row.energy_gain ?? 0,
      imageSrc: row.image_src || undefined,
      xp: Math.max(1, Math.round(Math.max(row.hunger ?? 0, row.happiness ?? 0, row.hygiene ?? 0, row.energy_gain ?? 0, 2) / 2)),
      price: parseFloat(String(row.base_price_usd ?? 0)) || 0,
      category: row.category_id
        ? row.category_id.charAt(0).toUpperCase() + row.category_id.slice(1)
        : 'Other',
      levelReq: row.unlock_level ?? 1,
    }));
  },

  async loadCurrencyRate(currencyCode: string): Promise<{ code: string; rate: number } | null> {
    const { data, error } = await supabase
      .from('aiboard_pricing_currencies')
      .select('currency_code, rate')
      .ilike('currency_code', currencyCode)
      .maybeSingle();

    if (error || !data) return null;
    return { code: data.currency_code, rate: Number(data.rate) || 1 };
  },
};
