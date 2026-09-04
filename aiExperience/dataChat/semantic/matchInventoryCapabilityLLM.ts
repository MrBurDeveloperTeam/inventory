// LLM-based semantic capability router — see Todo's
// matchTodoCapabilityLLM.ts for the full architecture rationale. Never
// throws to its caller; any failure resolves to `{type:'unavailable'}`
// so the adapter falls back to the local keyword matcher
// (matchInventoryCapability.ts).

import { routeInventoryCapability } from '../../../services/geminiService';
import { INVENTORY_CAPABILITIES } from './capabilityRegistry';
import type { InventoryDataIntent } from '../contracts/groundedDataResult';

export type InventoryLLMRouteResult =
  | { type: 'grounded_capability'; capability: InventoryDataIntent }
  | { type: 'clarification'; text: string }
  | { type: 'general_chat' }
  | { type: 'unavailable' };

const ALLOWED_CAPABILITY_IDS: ReadonlySet<string> = new Set(INVENTORY_CAPABILITIES.map((c) => c.id));

export async function matchInventoryCapabilityLLM(
  message: string,
  recentContext: string[],
  previousCapability: string | null
): Promise<InventoryLLMRouteResult> {
  try {
    const result = await routeInventoryCapability(
      message,
      INVENTORY_CAPABILITIES.map((c) => ({ id: c.id, description: c.description })),
      recentContext,
      previousCapability
    );

    if (result.route === 'general_chat') return { type: 'general_chat' };

    if (result.route === 'clarification') {
      if (typeof result.clarification !== 'string' || !result.clarification.trim()) {
        return { type: 'unavailable' };
      }
      return { type: 'clarification', text: result.clarification };
    }

    // Independent client-side re-validation against the LOCAL registry —
    // never trust the network response alone to gate code execution.
    if (!result.capability || !ALLOWED_CAPABILITY_IDS.has(result.capability)) {
      return { type: 'unavailable' };
    }

    return { type: 'grounded_capability', capability: result.capability as InventoryDataIntent };
  } catch {
    return { type: 'unavailable' };
  }
}
