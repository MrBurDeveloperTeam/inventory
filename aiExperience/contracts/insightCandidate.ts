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
 *  implemented — never speculatively. `inventory_expired` reuses the
 *  Gallery reference's existing trigger identity for the same condition;
 *  `inventory_out_of_stock` is a new local-only identifier not yet present
 *  in Gallery (Gallery's Phase 1 scope never included Out of Stock). */
export type InsightTriggerId = 'inventory_expired' | 'inventory_out_of_stock';

/** Local-only severity scale for Inventory's own resolver — NOT Gallery's
 *  global DialoguePriority. `CRITICAL` (Expired) and `HIGH` (Out of Stock)
 *  are used in this first slice; `MEDIUM` (Low Stock), `LOW` (Expiring
 *  Soon), and `INFO` (Summary) are reserved for later slices and
 *  deliberately not used yet. */
export type InsightPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

/**
 * Minimal placeholder action shape. No first-slice candidate populates
 * `action` — Inventory's current landing surface (App.tsx's `dashboard`
 * view) has no separate list/detail state to navigate to beyond what's
 * already always visible (MasterInventory is rendered inline, not behind a
 * togglable view) — see the implementation report's "Actions" section. Kept
 * as an optional field on the contract, not removed, so a later slice with
 * a real navigation target doesn't require a contract shape change.
 */
export interface InsightAction {
  label: string;
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
