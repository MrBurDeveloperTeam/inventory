import { createInventoryMolarAdapter as createSharedInventoryMolarAdapter } from '@mrburdeveloperteam/pet-function/apps/inventory';
import type { CreateInventoryMolarAdapterDeps } from '@mrburdeveloperteam/pet-function/apps/inventory';
import { supabase } from '../supabaseClient';
import { chatWithGemini, chatWithGroundedInventoryFacts, routeInventoryCapability } from '../services/geminiService';
export function createInventoryMolarAdapter(deps: Omit<CreateInventoryMolarAdapterDeps, 'supabase' | 'chatWithGemini' | 'chatWithGroundedInventoryFacts' | 'routeInventoryCapability'>) {
  return createSharedInventoryMolarAdapter({ ...deps, supabase, chatWithGemini, chatWithGroundedInventoryFacts, routeInventoryCapability });
}
