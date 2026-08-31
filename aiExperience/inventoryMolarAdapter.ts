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

interface CreateInventoryMolarAdapterDeps {
  rooms: Room[];
  history: PurchaseHistory[];
  logs: ActivityLog[];
  isLoadingMain: boolean;
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
  const { rooms, history, logs, isLoadingMain, onProposeAction, receiveStock, removeStock, moveItem } = deps;

  return {
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
        const result = resolveInventoryDataQuery(dataRoute.intent, rooms, isLoadingMain);

        let dataChatResponseText: string;
        if (result.status === 'unavailable') {
          // Unknown/unavailable inventory state is never reinterpreted as a
          // zero-result answer — a matched grounded intent owns this
          // request even when its provider is temporarily unavailable; it
          // does not fall through to General Chat.
          dataChatResponseText = "I couldn't check your inventory data right now.";
        } else {
          try {
            // 3. Grounded Gemini phrasing — receives ONLY the question, the
            // approved intent, and the already-minimized facts. Plain text
            // only; never scanned for `<ACTION>` blocks.
            dataChatResponseText = await chatWithGroundedInventoryFacts(userMsg, result.intent, result.facts);
          } catch (groundedErr) {
            // Mandatory deterministic fallback — never falls through to
            // General Chat on a Gemini failure at this stage.
            console.error('Grounded inventory response failed:', groundedErr);
            dataChatResponseText = formatGroundedInventoryFallback(result.intent, result.facts);
          }
        }

        return { text: dataChatResponseText };
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
