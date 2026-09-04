// Structured grounded-conversation memory for follow-up questions (see
// SNABBB-CROSS-APP-MOLAR-AI-CONVERSATIONAL-CONTINUITY-ENHANCEMENT).
// Same design as the Todo reference implementation
// (../../../../todo equivalent — see that repo's
// aiExperience/dataChat/context/groundedConversationContext.ts for the
// full rationale): structured, not inferred from rendered text; lives
// only inside the adapter closure created per `useMemo` in App.tsx (one
// per authenticated user — a user switch already produces a fresh
// closure); explicit reset wired via the shared package's
// `AIAdapter.reset()` hook.

import type { InventoryDataIntent } from '../contracts/groundedDataResult';

export interface GroundedConversationContext {
  appId: 'inventory';
  lastIntent: InventoryDataIntent;
  presentedOrder: 'display' | 'ranked';
  lastUserQuestion: string;
  generation: number;
  createdAt: string;
}

// Host-owned (App.tsx `useRef`) small store so the grounded context
// survives `createInventoryMolarAdapter` being rebuilt when its
// rooms/history/logs/isLoadingMain deps change on an ordinary rerender —
// only the store's own `clear()` (wired to explicit reset + identity
// changes, see App.tsx) ever drops the context, never adapter recreation.
export interface GroundedContextStore {
  get(): GroundedConversationContext | null;
  set(ctx: GroundedConversationContext | null): void;
  clear(): void;
}

export function createGroundedContextStore(): GroundedContextStore {
  let current: GroundedConversationContext | null = null;
  return {
    get: () => current,
    set: (ctx) => { current = ctx; },
    clear: () => { current = null; },
  };
}
