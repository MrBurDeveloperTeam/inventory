// Deterministic guard against obvious inventory MUTATION requests reaching
// the existing General Chat pipeline during this read-only Phase-3 pilot.
//
// CRITICAL CONTEXT: the existing General Chat (App.tsx's `handleSendChat`,
// services/geminiService.ts's `chatWithGemini`) already parses Gemini-
// authored `<ACTION>{...}</ACTION>` blocks and directly executes real
// mutations (`receiveStock`/`removeStock`/`moveItem`) — that pre-existing
// behavior is NOT changed or removed here (out of scope for this pilot),
// but an obvious execution-shaped request should not silently fall
// through to it unexamined while Data-Driven Chat's own narrow read-only
// scope is active. This guard runs BEFORE intent classification.
//
// FINAL SAFETY DEFAULT (this hardening pass): earlier versions of this
// guard tried to positively identify execution-shaped *sentence
// structure* (imperative-first, or a fixed list of polite-request
// wrappers) — an open-ended language surface that missed phrasings like
// "I want you to remove this item.", "Go ahead and move this item to
// Room B.", "Would you please receive this stock?". The guard now
// defaults to DENY (intercept) whenever a recognized mutation operation
// verb/phrase is present ANYWHERE in the message, UNLESS the message
// first matches a small, explicit, anchored INFORMATIONAL allowlist
// (asking about how an operation works, never a generic question-word/
// question-mark/"can"/"could" exemption). This is intentionally
// conservative — an uncertain phrase like "I need this item deleted."
// is safely refused rather than risked.

/** Explanatory/mechanics questions — checked FIRST and exempted even if a
 *  mutation verb appears later in the same sentence. Deliberately narrow
 *  and anchored to the start of the message — never a bare question-word
 *  or "can/could/should" exemption, which would be far too broad (see
 *  this file's header). */
const INFORMATIONAL_PATTERNS: RegExp[] = [
  /^how (do|does|can|would|could) i?\b/, // "How do I remove stock?", "How does transfer work?"
  /^what happens (if|when)\b/, // "What happens when I delete an item?"
  /^what is the process (for|to)\b/, // "What is the process for removing stock?"
  /^explain\b/, // "Explain how to receive stock."
  /^tell me (about|how)\b/, // "Tell me how stock transfer works."
];

/** STRONG operation words: specific enough to this app's inventory domain
 *  that they trigger the guard on their own, anywhere in the message. */
const STRONG_MUTATION_VERBS = ['remove', 'delete', 'receive', 'transfer'];

/** WEAK/generic operation words: common enough in ordinary English
 *  ("move", "add", "update") that they only count as a mutation signal
 *  when paired with explicit inventory context — otherwise "move"/"add"/
 *  "update" alone would over-intercept unrelated conversation. */
const CONTEXTUAL_MUTATION_VERBS = ['move', 'add', 'update'];
const INVENTORY_CONTEXT_WORDS = ['item', 'items', 'stock', 'inventory', 'room', 'batch', 'quantity', 'units', 'unit'];

function isInformationalPhrasing(normalized: string): boolean {
  return INFORMATIONAL_PATTERNS.some((pattern) => pattern.test(normalized));
}

function containsMutationOperation(normalized: string): boolean {
  if (STRONG_MUTATION_VERBS.some((verb) => normalized.includes(verb))) return true;

  for (const verb of CONTEXTUAL_MUTATION_VERBS) {
    if (!normalized.includes(verb)) continue;
    if (INVENTORY_CONTEXT_WORDS.some((word) => normalized.includes(word))) return true;
  }

  return false;
}

export function isInventoryMutationRequest(message: string): boolean {
  // Strip trailing punctuation only — "Can you remove 5 units of X?" and
  // "Can you remove 5 units of X" must classify identically.
  const normalized = message.trim().toLowerCase().replace(/[?.!]+$/, '');
  if (!normalized) return false;

  if (isInformationalPhrasing(normalized)) return false;

  // Default-deny: any recognized mutation operation vocabulary anywhere
  // in the message (that isn't exempted by the informational allowlist
  // above) is treated as an execution request or genuinely ambiguous —
  // and this pilot resolves ambiguity toward the safe/intercepted side.
  // A digit is NOT required to trigger this — see this file's header.
  return containsMutationOperation(normalized);
}
