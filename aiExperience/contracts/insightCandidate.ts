// Inventory — local AI Experience candidate contract.
//
// Conforms semantically to the Gallery reference's canonical
// InsightCandidate<TFacts> (features/aiExperience/contracts/insightCandidate.ts
// in the Gallery repo: app, triggerId, priority, facts, messageTemplate,
// message, action, dedupeKey, sourceRecordId, evaluatedAt) but is this
// repo's OWN independently-typed definition — per the completed Phase-2A
// design pass's Option C recommendation (no shared npm package, no
// cross-repo dependency; mirrors the same approach already used and
// browser-validated in the To-Do repo's aiExperience/contracts/insightCandidate.ts).
//
// Deliberately excludes every Gallery Pet-Dialogue-only field:
// `bypassEntryWalk` (CatMascot entry-walk animation gate — this repo has no
// mascot entry-walk), `autoCloseMs` (Welcome Fallback auto-dismiss timer —
// this is a persistent landing banner, not a timed popup), `userState`/
// `dialogueId`/`source`/`ruleVersion`/`expiresAt` (Pet Dialogue backward-
// compatibility relics with no meaning here). Only the fields this local UI
// actually needs are present.
//
// `priority` is intentionally NOT typed as Gallery's `DialoguePriority`
// ('P0'|'P1'|'PROFILE'|'P2'|'LEGACY_INTRO'|'FALLBACK') — that enum encodes
// Gallery's own GLOBAL nine-tier cross-app ranking and importing it here
// would incorrectly imply these local candidates participate in it. This
// repo owns its own local-only severity scale.

/** This repo only ever produces `inventory` candidates. */
export type InsightApp = 'inventory';

/** Canonical trigger identity. Extend only when a new provider is actually
 *  implemented — never speculatively. `inventory_expired` and
 *  `inventory_low_stock`/`inventory_expiring_soon` reuse the Gallery
 *  reference's existing trigger identities for the same conditions;
 *  `inventory_out_of_stock` and `inventory_summary` are new local-only
 *  identifiers not yet present in Gallery (Gallery's Phase 1 scope never
 *  included Out of Stock or a non-urgent Summary). */
export type InsightTriggerId =
  | 'inventory_expired'
  | 'inventory_out_of_stock'
  | 'inventory_low_stock'
  | 'inventory_expiring_soon'
  | 'inventory_summary';

/** Local-only severity scale for Inventory's own resolver — NOT Gallery's
 *  global DialoguePriority. `CRITICAL` (Expired) and `HIGH` (Out of Stock)
 *  were used in the first slice; `MEDIUM` (Low Stock), `LOW` (Expiring
 *  Soon), and `INFO` (Summary) are now used in the second slice. */
export type InsightPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

/**
 * A real, already-existing local navigation target — never a fabricated
 * route/filter. Both values reuse state App.tsx/MasterInventory.tsx already
 * had before this action was added:
 *   - `'inventory'` — App.tsx's existing `currentView` ('dashboard' |
 *     'profile'); the action returns to 'dashboard', the only view
 *     MasterInventory/ClinicMap render in. This is the only destination
 *     available for families with no more specific existing filter (Out of
 *     Stock, Low Stock, Summary — MasterInventory's own `activeTab` state
 *     has no matching value for either).
 *   - `'inventory_expiring'` — same 'dashboard' switch, PLUS
 *     MasterInventory's existing `activeTab === 'expiring'` tab, which
 *     already lists every batch expiring within 30 days INCLUDING already
 *     expired ones (see MasterInventory.tsx's `expiringItems` — expiry
 *     `<= now+30days`, no lower bound) — a genuine, if combined, existing
 *     destination for both Expired and Expiring Soon, exposed externally
 *     via App.tsx's new `focusExpiringTabRequestId` prop rather than any
 *     new tab/filter being invented.
 */
export interface InsightAction {
  label: string;
  view: 'inventory' | 'inventory_expiring';
}

export interface InsightCandidate<TFacts = unknown> {
  app: InsightApp;
  triggerId: InsightTriggerId;
  priority: InsightPriority;
  /** Structured facts the deterministic rule used to decide this candidate
   *  exists — never a raw item/batch record, Supabase session, or JWT. */
  facts: TFacts;
  /** Canonical template form (with `{placeholder}` tokens) — distinct from
   *  `message`, the already-rendered string. No AI ever touches either. */
  messageTemplate: string;
  message: string;
  action?: InsightAction;
  dedupeKey: string;
  /** `null` for a future aggregate candidate with no single backing record
   *  (e.g. a later Inventory Summary) — matches the Gallery canonical
   *  contract's nullable semantics. Both candidates in this first slice
   *  always have a real item id. */
  sourceRecordId: string | null;
  evaluatedAt: string;
}
