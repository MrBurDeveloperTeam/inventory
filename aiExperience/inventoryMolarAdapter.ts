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

interface CreateInventoryMolarAdapterDeps {
  rooms: Room[];
  history: PurchaseHistory[];
  logs: ActivityLog[];
  isLoadingMain: boolean;
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
  const { rooms, history, logs, isLoadingMain, receiveStock, removeStock, moveItem } = deps;

  return {
    async sendMessage(request: AIRequest): Promise<AIResponse> {
      const userMsg = request.text;

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

      if (actionMatch && actionMatch[1]) {
        try {
          const actionData = JSON.parse(actionMatch[1]);
          if (actionData.type === 'receive') {
            await receiveStock(
              actionData.roomId,
              {
                name: actionData.itemName,
                brand: actionData.brand || '',
                code: actionData.code || '',
                uom: (actionData.uom || 'pcs').toLowerCase() as any,
                vendor: actionData.vendor || '',
                category: (actionData.category || 'consumables').toLowerCase() as any
              },
              actionData.qty,
              actionData.price,
              new Date().toISOString().split('T')[0],
              actionData.expiry,
              actionData.createNewBatch
            );
          } else if (actionData.type === 'remove') {
            await removeStock(
              actionData.roomId,
              actionData.itemName,
              actionData.brand,
              actionData.qty,
              actionData.expiry
            );
          } else if (actionData.type === 'transfer') {
            const fromRoom = rooms.find(r => r.id === actionData.fromRoomId || r.name === (actionData.fromRoomName || actionData.fromRoom));
            const toRoom = rooms.find(r => r.id === actionData.toRoomId || r.name === (actionData.toRoomName || actionData.toRoom));
            if (fromRoom && toRoom) {
              const item = fromRoom.items.find(i =>
                i.name.toLowerCase() === actionData.itemName.toLowerCase() &&
                (actionData.brand ? i.brand.toLowerCase() === actionData.brand.toLowerCase() : true)
              );
              if (item) {
                await moveItem(fromRoom.id, toRoom.id, item.id, actionData.qty);
              }
            }
          }
        } catch (err) {
          console.error('Failed to parse AI action:', err);
        }
        // Strip the `<ACTION>` block from the visible/stored response
        // unconditionally — on both successful dispatch AND a parse/
        // dispatch failure. The pre-migration UI (MolarChat.tsx's
        // MemoizedMessage) always re-stripped this at render time as a
        // safety net even when the parse failed and the raw markup was
        // still present in stored chat history; SharedMolarAI has no
        // equivalent render-time stripping, so this adapter now guarantees
        // the same effective user-visible result by stripping once here,
        // regardless of parse outcome. A malformed/failed action NEVER
        // mutates anything either way — only the console.error above and
        // this stripping happen on failure.
        finalResponseText = response.replace(/<ACTION>.*?<\/ACTION>/s, '').trim();
      }

      return { text: finalResponseText };
    },
  };
}
