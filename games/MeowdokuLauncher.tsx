import { SharedMeowdokuLauncher } from '@mrburdeveloperteam/pet-function/pet';
import { supabase } from '../supabaseClient';
import { inventoryPetRepository } from '../petExperience/inventoryPetRepository';

// Inventory owns identity and persistence; the shared package owns the game.
export default function MeowdokuLauncher(props: {
  isOpen: boolean;
  onClose: () => void;
  userId: string | null;
}) {
  return <SharedMeowdokuLauncher {...props} repository={inventoryPetRepository} rpcClient={supabase} />;
}
