// Small, deterministic calendar-date helper for the AI Experience
// providers — consistent with the Gallery reference's own
// features/petDialogue/dateUtils.ts approach (pure YYYY-MM-DD string
// comparison, never a parsed Date-object time-of-day comparison).
//
// Deliberately NOT reusing this repo's own existing `isExpired` pattern
// (see MasterInventory.tsx, e.g. line ~671: `const expiryDateObj =
// item.expiryDate ? new Date(item.expiryDate) : null; ... expiryDateObj <
// now`). That pattern parses a bare `'YYYY-MM-DD'` string with `new Date()`,
// which JavaScript interprets as UTC midnight — compared against `now =
// new Date()` (the current local instant), this is timezone-sensitive: in
// any UTC+ timezone (e.g. Malaysia, UTC+8), an item expiring "today" is
// already parsed as a UTC midnight that has already passed relative to
// local "now", so it would incorrectly read as already-expired the moment
// local midnight passes, hours before the item's actual local expiry day
// ends. This helper avoids that entirely: `expiry < today` is a plain
// string comparison between two already-local calendar-date keys, no Date
// object is ever compared to another Date object.

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Local calendar-date key (YYYY-MM-DD) from a Date's own local
 *  year/month/day fields — never `toISOString()`, which reads UTC fields. */
export function toCalendarDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Normalizes a raw expiry value down to a trustworthy YYYY-MM-DD key, or
 *  `null` if it isn't a real, well-formed calendar date. */
function toValidatedDateKey(rawDate: string | null | undefined): string | null {
  if (typeof rawDate !== 'string') return null;
  const key = rawDate.slice(0, 10);
  return DATE_KEY_PATTERN.test(key) ? key : null;
}

/** True only when `expiryDate` is strictly before today's local calendar
 *  date. An item expiring today is not yet treated as expired. */
export function isExpiredBeforeToday(expiryDate: string | null | undefined, now: Date = new Date()): boolean {
  const validated = toValidatedDateKey(expiryDate);
  if (!validated) return false;
  return validated < toCalendarDateKey(now);
}
