import { createInventorySNAIService } from '@mrburdeveloperteam/pet-function/apps/inventory';
import { supabase } from '../supabaseClient';
export const { chatWithGemini, chatWithGroundedInventoryFacts, routeInventoryCapability } = createInventorySNAIService(supabase);
export type ChatHistory = { role: 'user' | 'model'; parts: { text: string }[] };
export type CapabilityRouteResult = Awaited<ReturnType<typeof routeInventoryCapability>>;

import type { ExtractedItem } from "../types";

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
