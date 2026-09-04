// Local, network-free semantic capability matcher — see Todo's
// matchTodoCapability.ts (the reference implementation) for the full
// architecture rationale: no Gemini call, so there is no router-network
// failure mode to guard against; never receives live inventory data,
// only the message and static capability descriptions.

import type { InventoryCapability } from './capabilityRegistry';
import { INVENTORY_CAPABILITIES } from './capabilityRegistry';
import type { InventoryDataIntent } from '../contracts/groundedDataResult';

const CONFIDENT_THRESHOLD = 2;
const AMBIGUOUS_GAP = 1;

function normalize(message: string): string {
  return message
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreCapability(normalized: string, capability: InventoryCapability): number {
  let score = 0;
  for (const phrase of capability.keywords) {
    if (normalized.includes(phrase)) score += phrase.split(' ').length;
  }
  return score;
}

export type InventorySemanticRouteResult =
  | { type: 'grounded_capability'; capability: InventoryDataIntent; confidence: number }
  | { type: 'clarification'; candidates: InventoryDataIntent[] }
  | { type: 'general_chat' };

export function matchInventoryCapability(
  message: string,
  capabilities: InventoryCapability[] = INVENTORY_CAPABILITIES
): InventorySemanticRouteResult {
  const normalized = normalize(message);
  if (!normalized) return { type: 'general_chat' };

  const scored = capabilities
    .map((c) => ({ id: c.id, score: scoreCapability(normalized, c) }))
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  const second = scored[1];

  if (!top || top.score === 0) return { type: 'general_chat' };

  if (second && second.score > 0 && top.score - second.score <= AMBIGUOUS_GAP) {
    return { type: 'clarification', candidates: [top.id, second.id] };
  }

  if (top.score >= CONFIDENT_THRESHOLD) {
    return { type: 'grounded_capability', capability: top.id, confidence: top.score };
  }

  return { type: 'general_chat' };
}
