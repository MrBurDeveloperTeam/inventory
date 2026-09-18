import { createInventoryVirtualPet } from '@mrburdeveloperteam/pet-function/apps/inventory';
import { supabase } from '../supabaseClient';
import { inventoryPetRepository } from './inventoryPetRepository';
const InventoryVirtualPet = createInventoryVirtualPet(supabase, inventoryPetRepository);
export default InventoryVirtualPet;
