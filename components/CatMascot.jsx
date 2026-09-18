import { InventoryCatMascot } from '@mrburdeveloperteam/pet-function/apps/inventory';
import { supabase } from '../lib/supabaseClient';
export default function CatMascot(props) { return <InventoryCatMascot {...props} supabase={supabase} />; }
