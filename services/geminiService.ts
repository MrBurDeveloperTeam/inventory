// Client-side transport layer only. This file must NEVER import
// @google/genai, construct a GoogleGenAI client, read
// VITE_GEMINI_API_KEY, or call generateContent directly — all of that
// now lives exclusively in the server-only Supabase Edge Function at
// supabase/functions/molar-chat-inventory/index.ts, which this file
// calls via supabase.functions.invoke(). That invocation automatically
// carries the browser's current authenticated Supabase session as the
// Authorization bearer token — no token is ever placed into the request
// body/prompt here. Public function signatures are preserved so
// aiExperience/inventoryMolarAdapter.ts and RoomModal.tsx require no
// change.
//
// Namespaced as "molar-chat-inventory", matching the established
// per-app naming convention on this shared Supabase project — a shared
// generic "molar-chat" name would let one app's deploy silently
// overwrite another's system prompt (confirmed to have actually
// happened to Todo/Calculator before they were each namespaced).
import { supabase } from "../supabaseClient";
import { ExtractedItem } from "../types";

async function invokeMolarChatInventory(payload: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke('molar-chat-inventory', {
    body: payload,
  });

  if (error || !data?.ok) {
    throw new Error(data?.error || error?.message || 'AI service request failed');
  }

  return data;
}

const generateId = () => {
  try {
    return window.crypto.randomUUID();
  } catch (e) {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
};

export const extractDataFromImage = async (base64Image: string, mimeType: string): Promise<ExtractedItem[]> => {
  try {
    const { items } = await invokeMolarChatInventory({ mode: 'ocr', base64Image, mimeType });

    // Add IDs to items — unchanged from the pre-migration client-side logic.
    const data: ExtractedItem[] = (items || []).map((item: any) => ({
      ...item,
      id: generateId(),
      category: item.category || 'Consumables',
      expiryDate: item.expiryDate || '',
      purchaseDate: item.purchaseDate || '',
      uom: item.uom || 'ea'
    }));

    return data;
  } catch (error) {
    console.error("Gemini Extraction Error:", error);
    throw error;
  }
};

export type ChatHistory = {
  role: "user" | "model";
  parts: { text: string }[];
};

export const chatWithGemini = async (
  history: ChatHistory[],
  message: string,
  inventoryContext: string,
  purchaseHistory?: string,
  activityLogs?: string,
  userContext?: string,
): Promise<string> => {
  try {
    const { text } = await invokeMolarChatInventory({
      mode: 'general',
      history,
      message,
      inventoryContext,
      purchaseHistory,
      activityLogs,
      userContext,
    });
    return text;
  } catch (error) {
    console.error("Gemini Chat Error:", error);
    return "I'm having trouble connecting to the Snabbb Assistant Intelligent servers right now. Please try again shortly.";
  }
};

// ─────────────────────────────────────────────────────────────
// DATA-DRIVEN CHAT — grounded response phrasing ONLY.
//
// Architecturally SEPARATE from `chatWithGemini` above: this function is
// called only AFTER a deterministic local intent router + deterministic
// Inventory data provider have already produced minimized structured
// facts (see aiExperience/dataChat/). The server never decides which
// records are expired/low-stock/expiring-soon, never computes counts,
// never picks the intent, and never receives the full inventory/purchase-
// history/activity-log context `chatWithGemini` does — only the user's
// question, the approved intent name, and the already-computed facts.
//
// CRITICAL: unlike `chatWithGemini`, this function THROWS on failure
// (network error, empty response) rather than swallowing it into a
// friendly fallback string — the caller (App.tsx) needs to distinguish
// success from failure so it can render a deterministic
// facts-only fallback instead (see
// aiExperience/dataChat/utils/formatGroundedInventoryFallback.ts) rather
// than ever falling through to the full General Chat pipeline.
//
// The returned text is plain assistant text ONLY. It is never scanned
// for `<ACTION>` blocks and the system instruction explicitly forbids
// emitting any — this function has no path to `receiveStock`/
// `removeStock`/`moveItem` or any other mutation, even if the model
// unexpectedly tried to emit one.
export const chatWithGroundedInventoryFacts = async (
  question: string,
  intent: string,
  facts: unknown,
): Promise<string> => {
  const { text } = await invokeMolarChatInventory({ mode: 'grounded', question, intent, facts });
  return text;
};

// ─────────────────────────────────────────────────────────────
// SEMANTIC CAPABILITY ROUTING — selection only, never data.
//
// Calls the Edge Function's "capability_route" mode: the message, a
// small set of {id, description} capability descriptors, a few recent
// model-safe conversation turns, and the previously-selected capability
// id (if any). The Edge Function NEVER sees an inventory row and
// returns structured JSON, already validated server-side against the
// supplied capability id allowlist.
//
// THROWS on any failure exactly like chatWithGroundedInventoryFacts —
// the caller (see dataChat/semantic/matchInventoryCapabilityLLM.ts)
// must fall back to the local keyword capability matcher on any throw.
export interface CapabilityRouteResult {
  route: 'grounded' | 'general_chat' | 'clarification';
  capability: string | null;
  confidence: 'high' | 'low';
  clarification: string | null;
}

interface CapabilityDescriptor {
  id: string;
  description: string;
}

export const routeInventoryCapability = async (
  message: string,
  capabilities: CapabilityDescriptor[],
  recentContext: string[],
  previousCapability: string | null,
): Promise<CapabilityRouteResult> => {
  const data = await invokeMolarChatInventory({
    mode: 'capability_route',
    message,
    capabilities,
    recentContext,
    previousCapability,
  });

  const { route, capability, confidence, clarification } = data as CapabilityRouteResult;
  if (route !== 'grounded' && route !== 'general_chat' && route !== 'clarification') {
    throw new Error('Capability routing returned an unsupported route');
  }
  if (confidence !== 'high' && confidence !== 'low') {
    throw new Error('Capability routing returned an invalid confidence');
  }

  return { route, capability: route === 'grounded' ? capability : null, confidence, clarification: clarification ?? null };
};
