// PHASE 7D (Molar AI migration): the LOCAL orchestration adapter connecting
// the shared `@mrburdeveloperteam/molar-experience/ai` chat UI runtime to
// Inventory's own General Chat + Data-Driven Chat + LIVE HOST ACTION
// pipelines. The shared package only ever calls `sendMessage` and renders
// the returned `AIResponse.text` — every business decision below (mutation
// guard, deterministic intent classification, grounded facts resolution,
// deterministic fallback, AIBoard keyword lookup, Gemini calls, and the
// `<ACTION>{...}</ACTION>` live-mutation protocol) is moved mechanically
// from the pre-migration `App.tsx`'s own `handleSendChat`, in the exact
// same priority order, not redesigned.
//
// CRITICAL — LIVE ACTION SURFACE: a fresh repo-wide audit confirmed
// Inventory has NO `window.__MOLAR_ACTIONS__` global bridge at all (unlike
// the shape Phase 4A's findings assumed) — the `<ACTION>` block is parsed
// and dispatched entirely inline, right here, by directly calling the
// host's own `receiveStock`/`removeStock`/`moveItem` handlers passed in as
// adapter dependencies. There is exactly ONE parser/executor for this
// protocol, both before and after this migration — this file does not
// duplicate it, and no global bridge exists to remove or retain.
import type { AIAdapter, AIMessage, AIRequest, AIResponse } from '@mrburdeveloperteam/molar-experience/contracts';
import type { Room, Item, PurchaseHistory, ActivityLog } from '../types';
import { supabase } from '../supabaseClient';
import { chatWithGemini, chatWithGroundedInventoryFacts } from '../services/geminiService';
import { isInventoryMutationRequest } from './dataChat/router/isInventoryMutationRequest';
import { classifyInventoryDataIntent } from './dataChat/router/classifyInventoryDataIntent';
import { resolveInventoryDataQuery } from './dataChat/resolver/resolveInventoryDataQuery';
import { formatGroundedInventoryFallback } from './dataChat/utils/formatGroundedInventoryFallback';
import { buildUnsupportedParameterMessage } from './dataChat/utils/unsupportedParameterMessage';
import { parseInventoryActionProposal } from './inventoryConfirmedActionParser';
import { resolveInventoryFollowUp } from './dataChat/router/resolveInventoryFollowUp';
import { matchInventoryCapability } from './dataChat/semantic/matchInventoryCapability';
import { matchInventoryCapabilityLLM } from './dataChat/semantic/matchInventoryCapabilityLLM';
import type { GroundedContextStore } from './dataChat/context/groundedConversationContext';
import type { InventoryDataIntent } from './dataChat/contracts/groundedDataResult';

const CLARIFICATION_LABEL: Record<InventoryDataIntent, string> = {
  inventory_expired: 'expired items',
  inventory_out_of_stock: 'out-of-stock items',
  inventory_low_stock: 'low-stock items',
  inventory_expiring_soon: 'items expiring soon',
  inventory_summary: 'an inventory summary',
};

interface CreateInventoryMolarAdapterDeps {
  rooms: Room[];
  history: PurchaseHistory[];
  logs: ActivityLog[];
  isLoadingMain: boolean;
  /** Host-owned (App.tsx `useRef`) store — keeps the grounded follow-up
   *  context alive across adapter recreation (see this file's own header
   *  and groundedConversationContext.ts). Cleared by App.tsx on
   *  user/inventory identity changes and by this adapter's `reset()`. */
  groundedContextStore: GroundedContextStore;
  /** Host-owned proposal sink (Phase INVENTORY-DETERMINISTIC-CONFIRMED-AI-ACTIONS-1).
   *  Called ONLY with a proposal the deterministic parser derived from the
   *  user's own message — never from Gemini output. The caller (App.tsx)
   *  owns rendering the confirmation UI and performing fresh-state
   *  revalidation before any executor runs; this adapter never mutates
   *  inventory itself. */
  onProposeAction: (action: ReturnType<typeof parseInventoryActionProposal>) => void;
  receiveStock: (
    roomId: string,
    itemData: Partial<Item>,
    qty: number,
    price: number,
    purchaseDate: string,
    expiry?: string,
    createNewBatch?: boolean
  ) => Promise<void>;
  removeStock: (
    roomId: string,
    itemName: string,
    brand: string | undefined,
    qty: number,
    targetExpiry?: string
  ) => Promise<void>;
  moveItem: (
    fromRoomId: string,
    toRoomId: string,
    itemId: string,
    quantity: number,
    batchIndex?: number
  ) => Promise<void>;
}

/** Maps SharedMolarAI's normalized `{role, text}` history into Gemini's
 *  native `{role, parts:[{text}]}` shape — kept entirely inside this
 *  adapter so the Gemini SDK's message shape never crosses the shared
 *  package boundary. */
function toGeminiHistory(history: AIMessage[]) {
  return history.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
}

/** Unchanged from the pre-migration `App.tsx` — a self-contained AIBoard
 *  keyword lookup with no dependency on host component state. */
async function getPredefinedChatResponse(message: string): Promise<string | null> {
  const normalizedMessage = message.toLowerCase();

  const { data: targetApps, error: targetAppsError } = await supabase
    .from('aiboard_response_target_apps')
    .select('response_id')
    .in('app_name', ['Inventory', 'All']);

  if (targetAppsError) {
    console.error('Failed to fetch response target apps:', targetAppsError);
    return null;
  }

  const responseIds = [...new Set((targetApps || []).map((app: any) => app.response_id).filter(Boolean))];
  if (responseIds.length === 0) return null;

  const { data: keywords, error: keywordsError } = await supabase
    .from('aiboard_response_keywords')
    .select('keyword, response_id')
    .in('response_id', responseIds);

  if (keywordsError) {
    console.error('Failed to fetch response keywords:', keywordsError);
    return null;
  }

  const matchedKeyword = (keywords || [])
    .filter((item: any) => item.keyword && normalizedMessage.includes(String(item.keyword).toLowerCase()))
    .sort((a: any, b: any) => String(b.keyword).length - String(a.keyword).length)[0];

  if (!matchedKeyword?.response_id) return null;

  const { data: responseData, error: responseError } = await supabase
    .from('aiboard_responses')
    .select('response')
    .eq('id', matchedKeyword.response_id)
    .maybeSingle();

  if (responseError) {
    console.error('Failed to fetch predefined response:', responseError);
    return null;
  }

  return responseData?.response || null;
}

export function createInventoryMolarAdapter(deps: CreateInventoryMolarAdapterDeps): AIAdapter {
  const { rooms, history, logs, isLoadingMain, onProposeAction, receiveStock, removeStock, moveItem, groundedContextStore } = deps;

  // Shared by the fast-path classifier match AND the semantic capability
  // matcher below — a matched capability executes identically regardless
  // of which tier selected it.
  async function executeGroundedIntent(intent: InventoryDataIntent, userMsg: string): Promise<AIResponse> {
    const result = resolveInventoryDataQuery(intent, rooms, isLoadingMain);

    let dataChatResponseText: string;
    if (result.status === 'unavailable') {
      dataChatResponseText = "I couldn't check your inventory data right now.";
    } else {
      try {
        dataChatResponseText = await chatWithGroundedInventoryFacts(userMsg, result.intent, result.facts);
      } catch (groundedErr) {
        console.error('Grounded inventory response failed:', groundedErr);
        dataChatResponseText = formatGroundedInventoryFallback(result.intent, result.facts);
      }
    }

    groundedContextStore.set({
      appId: 'inventory',
      lastIntent: intent,
      presentedOrder: 'display',
      lastUserQuestion: userMsg,
      generation: (groundedContextStore.get()?.generation ?? 0) + 1,
      createdAt: new Date().toISOString(),
    });

    return { text: dataChatResponseText };
  }

  return {
    reset() {
      groundedContextStore.clear();
    },
    async sendMessage(request: AIRequest): Promise<AIResponse> {
      const userMsg = request.text;

      // ── Phase INVENTORY-DETERMINISTIC-CONFIRMED-AI-ACTIONS-1 ──────────
      // Deterministic parse of the RAW USER MESSAGE ONLY — no Gemini call
      // happens for this turn at all when a proposal is produced. Runs
      // BEFORE the Data-Driven Chat mutation-refusal below so an
      // unambiguous, fully-specified command is handled by the real
      // confirm/execute path instead of the read-only "can't make
      // changes" message; anything that doesn't parse into a full
      // proposal falls through unchanged to the existing checks below,
      // including that same refusal for vaguer mutation-sounding text.
      const proposal = parseInventoryActionProposal(userMsg, rooms);
      if (proposal) {
        onProposeAction(proposal);
        return {
          text: "I've prepared that for you — please review and confirm below. No stock has been changed yet.",
        };
      }

      // ── Phase-3 Data-Driven Chat (read-only pilot) ────────────────────
      // Runs BEFORE the General Chat pipeline below, and is fully separate
      // from it: a matched request here never builds
      // `simpleInventory`/purchase-history/activity-log context, never
      // calls `getPredefinedChatResponse`/`chatWithGemini`, and never
      // touches the `<ACTION>` mutation parser further down.

      // 1. Explicit inventory MUTATION requests are intercepted with a
      // deterministic refusal — zero Gemini calls, zero mutation. The
      // General Chat's own `<ACTION>`-block execution path below is
      // untouched for anything that doesn't match this guard.
      if (isInventoryMutationRequest(userMsg)) {
        return { text: "This data chat can check inventory information, but it can't make inventory changes." };
      }

      // 2. Deterministic LOCAL intent classification (no Gemini call).
      const dataRoute = classifyInventoryDataIntent(userMsg);

      // 2a. A message that matched an approved intent's keywords but ALSO
      // carried an explicit user-supplied threshold/window override
      // ("below 5", "within 7 days") is answered deterministically —
      // ZERO Gemini calls, and it does NOT fall through to General Chat.
      if (dataRoute.kind === 'unsupported_parameter') {
        return { text: buildUnsupportedParameterMessage(dataRoute.intent) };
      }

      // 2b. Approved standard data intent -> grounded provider -> grounded response.
      if (dataRoute.kind === 'matched') {
        return executeGroundedIntent(dataRoute.intent, userMsg);
      }

      // ── Tier C: Grounded conversational follow-up ─────────────────────
      // Tried BEFORE falling through to General Chat — e.g. "which
      // should I restock first?" or "what about the second one?" never
      // matches classifyInventoryDataIntent's own phrase tables, but is
      // answerable deterministically from the active groundedContext,
      // revalidated against the CURRENT live `rooms` array.
      const groundedContext = groundedContextStore.get();
      const followUp = resolveInventoryFollowUp(userMsg, groundedContext, rooms, isLoadingMain);
      if (followUp && groundedContext) {
        groundedContextStore.set({
          ...groundedContext,
          presentedOrder: followUp.presentedOrder,
          lastUserQuestion: userMsg,
          generation: groundedContext.generation + 1,
        });
        return { text: followUp.text };
      }

      // ── Tier D: Server-side LLM semantic capability router ─────────────
      // For genuinely natural wording the fast path/follow-up tier can't
      // resolve. Sends ONLY the message, capability descriptions, and a
      // few of the USER's OWN recent chat messages (never rendered
      // assistant text) to the Edge Function's capability_route mode.
      // Any failure resolves to 'unavailable' and falls through to the
      // local keyword router below — a Gemini routing outage must never
      // make a previously-supported grounded question stop working.
      const recentUserContext = request.history
        .filter((m) => m.role === 'user')
        .slice(-3)
        .map((m) => m.text);
      const llmRoute = await matchInventoryCapabilityLLM(userMsg, recentUserContext, groundedContext?.lastIntent ?? null);

      if (llmRoute.type === 'grounded_capability') {
        return executeGroundedIntent(llmRoute.capability, userMsg);
      }
      if (llmRoute.type === 'clarification') {
        return { text: llmRoute.text };
      }
      if (llmRoute.type !== 'general_chat') {
        // ── Tier E: Local keyword capability router (fallback) ──────────
        // Only reached when the LLM router was unavailable.
        const semanticRoute = matchInventoryCapability(userMsg);
        if (semanticRoute.type === 'grounded_capability') {
          return executeGroundedIntent(semanticRoute.capability, userMsg);
        }
        if (semanticRoute.type === 'clarification') {
          const [a, b] = semanticRoute.candidates;
          return { text: `Do you mean ${CLARIFICATION_LABEL[a]} or ${CLARIFICATION_LABEL[b]}?` };
        }
      }
      // ── End Phase-3 Data-Driven Chat ──────────────────────────────────

      const simpleInventory = rooms.map(r => ({
        id: r.id,
        room: r.name,
        items: r.items.map(i => ({
          name: i.name,
          brand: i.brand,
          code: i.code,
          category: i.category,
          uom: i.uom,
          totalQty: i.quantity,
          avgPrice: i.price,
          location: r.name,
          batches: i.batches?.map(b => ({
            qty: b.qty,
            unitPrice: b.unitPrice,
            expiryDate: b.expiryDate
          }))
        }))
      }));

      // Prepare purchase history (last 100 records for performance)
      const recentPurchases = history.slice(0, 100).map(h => ({
        date: h.timestamp,
        product: h.productName,
        brand: h.brand,
        vendor: h.vendor,
        qty: h.qty,
        unitPrice: h.unitPrice,
        total: h.totalPrice,
        location: h.location,
        category: h.category
      }));

      // Prepare activity logs (last 100 records for performance)
      const recentLogs = logs.slice(0, 100).map(l => ({
        date: l.timestamp,
        room: l.roomName,
        action: l.action,
        details: l.details,
        actor: l.actorName
      }));

      const contextStr = JSON.stringify(simpleInventory);
      const purchaseHistoryStr = recentPurchases.length ? JSON.stringify(recentPurchases) : undefined;
      const activityLogsStr = recentLogs.length ? JSON.stringify(recentLogs) : undefined;

      const response = await getPredefinedChatResponse(userMsg)
        || await chatWithGemini(toGeminiHistory(request.history), userMsg, contextStr, purchaseHistoryStr, activityLogsStr);

      let finalResponseText = response;
      const actionMatch = response.match(/<ACTION>(.*?)<\/ACTION>/s);

      // CONTAINMENT (Phase INVENTORY-AI-MUTATION-AUTHORITY-CONTAINMENT-1):
      // Gemini-produced `<ACTION>` blocks are NEVER dispatched to
      // receiveStock/removeStock/moveItem anymore — model output must not
      // choose or authorize a real inventory mutation. This is a
      // structural removal of the dispatch call sites below, not a
      // prompt-level restriction: even a well-formed, well-intentioned
      // `<ACTION>` block from Gemini has no code path left that can reach
      // a mutation method. Deterministic, host-confirmed AI-assisted
      // mutations are a separate, later phase (see
      // INVENTORY_DETERMINISTIC_CONFIRMED_AI_ACTIONS_PENDING) — until then
      // AI-assisted stock changes are intentionally unavailable; manual
      // inventory UI controls are untouched and still call these same
      // executor functions directly.
      if (actionMatch && actionMatch[1]) {
        console.warn('[inventoryMolarAdapter] Gemini returned a legacy <ACTION> block; mutation execution is disabled pending the deterministic confirmed-action phase.');
        // Strip the block from the visible/stored response unconditionally
        // — mirrors the prior stripping behavior so no raw JSON markup is
        // ever shown, but no parse/dispatch of its contents occurs at all.
        finalResponseText = response.replace(/<ACTION>.*?<\/ACTION>/s, '').trim();
        // The remaining prose (if any) may still claim the change was
        // made, since it was generated before this containment existed in
        // the model's own reasoning — never let that stand as the final
        // user-facing answer. Replace with an explicit, honest host
        // message instead of trusting/echoing Gemini's success wording.
        finalResponseText = "Inventory changes require confirmation and aren't available through chat right now. No stock was changed. Please use the inventory screens to receive, remove, or transfer stock.";
      }

      return { text: finalResponseText };
    },
  };
}
