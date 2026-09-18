import { createInventoryMolarAIFloat } from '@mrburdeveloperteam/pet-function/apps/inventory';
import { supabase } from '../supabaseClient';
const MolarAIFloat = createInventoryMolarAIFloat(supabase);
export default MolarAIFloat;
