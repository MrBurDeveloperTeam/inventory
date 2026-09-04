// Single reusable pure helper both Inventory AI Experience providers
// consume — avoids three independent implementations of "batch quantity /
// expiry source selection" across App.tsx, expiredInventoryProvider.ts, and
// outOfStockInventoryProvider.ts.
//
// CRITICAL SOURCE FINDING (batch-authoritative semantics): unlike the
// Gallery reference implementation — which queries raw `inventory_items`/
// `inventory_item_batches` rows directly and must itself branch on "does
// this item have any batch rows at all" — this app's own App.tsx already
// normalizes every item before it ever reaches `rooms` state. See
// App.tsx's `ensureBatches(item)` (called by `normalizeRooms`): if
// `item.batches` is empty, it SYNTHESIZES a single batch that mirrors the
// item's own legacy `quantity`/`price`/`expiryDate` fields, then
// recomputes `item.quantity`/`price`/`expiryDate` FROM that batch list via
// `summarizeBatches()`. The practical consequence: by the time this
// snapshot helper ever sees a `Room`/`Item`, `item.batches` is GUARANTEED
// non-empty (real batches from the database, or exactly one synthesized
// batch equal to the old item-level fields) — so there is no separate
// "zero batches → item-level fallback" branch to implement here; evaluating
// `item.batches` directly IS the correct handling of both cases at once.
//
// One nuance this snapshot corrects for: App.tsx's own `summarizeBatches()`
// computes `earliestExpiry` from ALL batches with a parseable expiry date,
// WITHOUT filtering out qty<=0 batches first — so `item.expiryDate` alone
// is not reliably "the earliest expiry among usable stock". This snapshot
// re-derives the expired-qualifying batch directly from `item.batches`,
// filtering to `qty > 0` batches only, exactly mirroring the Gallery
// reference's own batch-authoritative filter
// (`b.qty > 0 && isExpiredBeforeToday(b.expiryDate)`).

import type { Room, ItemBatch } from '../../types';
import { isExpiredBeforeToday, toCalendarDateKey, toValidatedDateKey } from './dateUtils';

export interface InventorySnapshotItem {
  itemId: string;
  itemName: string;
  roomId: string;
  /** Sum of qty across every batch — the authoritative "usable quantity",
   *  independent of (and re-derived from) `item.quantity`. */
  usableQuantity: number;
  /** The earliest qualifying (qty > 0, already-expired) batch for this
   *  item, or `null` if none qualifies. Deterministic selection when
   *  multiple qualify: earliest `expiryDate`, then batch `id` (ItemBatch
   *  has no `createdAt` field in this repo's data model — see types.ts). */
  expiredBatch: { batchId: string; expiryDate: string; qty: number } | null;
  /**
   * The earliest qualifying (qty > 0, valid date, NOT already expired —
   * i.e. expiry >= today) upcoming batch for this item, or `null` if none
   * qualifies. Deliberately not restricted to any warning window here —
   * this snapshot describes authoritative state only; the Expiring Soon
   * provider is what applies the 30-day product rule (see
   * expiringSoonInventoryProvider.ts). An item that already has an
   * `expiredBatch` may still separately have an `upcomingExpiryBatch` from
   * a different, later batch — callers that must not double-classify an
   * already-expired item (Expired must win) are responsible for checking
   * `expiredBatch` first, exactly like the resolver does.
   */
  upcomingExpiryBatch: { batchId: string; expiryDate: string; qty: number } | null;
  createdAt: string | null;
}

function toFiniteNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function compareBatchesForExpirySelection(a: ItemBatch, b: ItemBatch): number {
  const aExpiry = a.expiryDate ?? '';
  const bExpiry = b.expiryDate ?? '';
  if (aExpiry !== bExpiry) return aExpiry < bExpiry ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function isUpcomingQualifyingBatch(batch: ItemBatch, todayKey: string): boolean {
  if (toFiniteNumber(batch.qty) <= 0) return false;
  const key = toValidatedDateKey(batch.expiryDate);
  if (!key) return false;
  // "Not already expired" — expiry today or later. Strictly the complement
  // of isExpiredBeforeToday's `< today` check, so a batch is never counted
  // as both expired and upcoming.
  return key >= todayKey;
}

export function buildInventorySnapshot(rooms: Room[], now: Date = new Date()): InventorySnapshotItem[] {
  const snapshot: InventorySnapshotItem[] = [];
  const todayKey = toCalendarDateKey(now);

  for (const room of rooms) {
    for (const item of room.items) {
      // Defensive only — ensureBatches() already guarantees this is
      // non-empty for every item reaching `rooms` state; this pure helper
      // does not assume that invariant blindly.
      const batches = item.batches ?? [];

      const usableQuantity = batches.reduce((sum, b) => sum + toFiniteNumber(b.qty), 0);

      const expiredQualifying = batches
        .filter((b) => toFiniteNumber(b.qty) > 0 && isExpiredBeforeToday(b.expiryDate, now))
        .sort(compareBatchesForExpirySelection);
      const earliestExpired = expiredQualifying[0] ?? null;

      const upcomingQualifying = batches
        .filter((b) => isUpcomingQualifyingBatch(b, todayKey))
        .sort(compareBatchesForExpirySelection);
      const earliestUpcoming = upcomingQualifying[0] ?? null;

      snapshot.push({
        itemId: item.id,
        itemName: item.name,
        roomId: room.id,
        usableQuantity,
        expiredBatch: earliestExpired
          ? { batchId: earliestExpired.id, expiryDate: earliestExpired.expiryDate as string, qty: toFiniteNumber(earliestExpired.qty) }
          : null,
        upcomingExpiryBatch: earliestUpcoming
          ? { batchId: earliestUpcoming.id, expiryDate: earliestUpcoming.expiryDate as string, qty: toFiniteNumber(earliestUpcoming.qty) }
          : null,
        createdAt: item.createdAt ?? null,
      });
    }
  }

  return snapshot;
}
