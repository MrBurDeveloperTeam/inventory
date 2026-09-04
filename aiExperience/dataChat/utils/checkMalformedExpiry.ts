// Data-Driven Chat's OWN, STRICTER integrity check — deliberately NOT a
// change to Phase-2A's proactive eligibility rules (buildInventorySnapshot,
// isExpiredBeforeToday, etc. are untouched). Direct factual "do I have
// expired stock?"-style answers have a stronger completeness requirement
// than a proactive banner: Phase-2A's own `isExpiredBeforeToday`/
// `toValidatedDateKey` (see ../../utils/dateUtils.ts) already, correctly,
// treat an unparseable expiry as simply "does not qualify as expired" —
// appropriate for a banner that should never fabricate a false alert. But
// that same silent exclusion means a batch whose expiry is genuinely
// UNKNOWN (present but malformed, not legitimately absent) could make a
// direct chat answer's "count" look clean when one relevant record was
// actually never evaluated at all — see this feature's implementation
// report for the full "silently ignored → false known-zero" risk.
//
// EXPIRY FIELD SEMANTICS (confirmed from types.ts / this app's own save
// paths): `ItemBatch.expiryDate?: string | null` — a legitimately absent
// expiry (`null`/`undefined`/an empty string) is a real, allowed "no
// expiry recorded" product state, NOT corruption, and is never flagged
// here. Only a NON-EMPTY value that fails `toValidatedDateKey` (i.e. it
// was clearly meant to be a date but isn't a well-formed `YYYY-MM-DD`) is
// treated as malformed/unevaluable.
//
// Only batches actually carrying usable stock (`qty > 0`) are checked —
// a zero/negative-qty batch's expiry can never become `expiredBatch`/
// `upcomingExpiryBatch` in the first place (see inventorySnapshot.ts), so
// its expiry validity has no bearing on any grounded fact regardless.

import { toValidatedDateKey } from '../../utils/dateUtils';
import type { Room } from '../../../types';

function toFiniteNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Returns `true` if any usable (`qty > 0`) batch across the whole
 *  inventory has a non-empty but unparseable `expiryDate`. */
export function hasMalformedExpiryData(rooms: Room[]): boolean {
  for (const room of rooms) {
    for (const item of room.items) {
      const batches = item.batches ?? [];
      for (const batch of batches) {
        if (toFiniteNumber(batch.qty) <= 0) continue;

        const raw = batch.expiryDate;
        const isPresent = typeof raw === 'string' && raw.trim().length > 0;
        if (!isPresent) continue; // legitimately absent — not malformed

        if (!toValidatedDateKey(raw)) return true;
      }
    }
  }
  return false;
}
