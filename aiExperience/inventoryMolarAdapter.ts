import { createInventoryMolarAdapter as createSharedInventoryMolarAdapter } from '@mrburdeveloperteam/pet-function/apps/inventory';
import type { CreateInventoryMolarAdapterDeps } from '@mrburdeveloperteam/pet-function/apps/inventory';
import { supabase } from '../supabaseClient';
export function createInventoryMolarAdapter(deps: Omit<CreateInventoryMolarAdapterDeps, 'supabase' | 'chatWithGemini' | 'chatWithGroundedInventoryFacts' | 'routeInventoryCapability'>) {
  return createSharedInventoryMolarAdapter({ ...deps, supabase });
}
