import { createInventoryPetRepository } from '@mrburdeveloperteam/pet-function/apps';
import { supabase } from '../supabaseClient';
export const inventoryPetRepository = createInventoryPetRepository(supabase);
