import { useEffect, useState } from 'react';
import { SharedMolarAI } from '@mrburdeveloperteam/molar-experience/ai';
import type { AIAdapter } from '@mrburdeveloperteam/molar-experience/contracts';
import { supabase } from '../supabaseClient';
import { MOLAR_LOGO_URL } from '../aiExperience/molarExperienceAssets';

interface MolarAIFloatProps {
  adapter: AIAdapter;
  onPetToggle?: () => void;
  disabled?: boolean;
}

const DEFAULT_EMPTY_STATE = {
  title: 'Inventory Simulator',
  subtitle: 'Ask a question or try one of the suggestions below to test the Inventory AI.',
  prompts: [
    { label: 'How does it work?', iconName: 'Zap' },
    { label: 'Check expiring stock', iconName: 'ShieldCheck' },
    { label: 'Low supply alerts', iconName: 'AlertCircle' },
    { label: 'Usage analytics', iconName: 'BarChart3' },
  ],
};

/**
 * Thin host wrapper around `@mrburdeveloperteam/molar-experience/ai`'s
 * <SharedMolarAI>. All generic chat UI lifecycle (open/close, history,
 * input draft, loading/error presentation, submit mechanics, scroll,
 * clear/reset, Markdown rendering) now lives in the shared package. This
 * file keeps only what's genuinely Inventory-specific: the empty-state
 * content fetch. The actual General Chat / Data Chat / live `<ACTION>`
 * mutation orchestration lives entirely in `App.tsx`'s
 * `createInventoryMolarAdapter` — this component only receives the
 * already-built `adapter`.
 */
export default function MolarAIFloat({ adapter, onPetToggle, disabled = false }: MolarAIFloatProps) {
  const [emptyState, setEmptyState] = useState(DEFAULT_EMPTY_STATE);

  // TIMING SEAM: the pre-migration MolarChat.tsx fetched this only once the
  // chat panel opened (`if (isOpen) fetchSimConfig()`); SharedMolarAI needs
  // `emptyState` already resolved, so this now fetches once at mount
  // instead — one additional harmless read-only Supabase query per mount,
  // matching the accepted precedent from every other app's Molar AI
  // migration in this session.
  useEffect(() => {
    const fetchSimConfig = async () => {
      try {
        const { data: configs } = await supabase
          .from('aiboard_simulator_configs')
          .select('id, title, subtitle')
          .eq('module_name', 'Inventory')
          .limit(1);

        if (!configs || configs.length === 0) return;

        const nextConfig = configs[0];
        const nextEmptyState = {
          title: nextConfig.title || DEFAULT_EMPTY_STATE.title,
          subtitle: nextConfig.subtitle || DEFAULT_EMPTY_STATE.subtitle,
          prompts: DEFAULT_EMPTY_STATE.prompts,
        };

        const { data: promptData } = await supabase
          .from('aiboard_simulator_prompts')
          .select('text, icon_name, sort_order')
          .eq('config_id', nextConfig.id)
          .order('sort_order', { ascending: true });

        if (promptData && promptData.length > 0) {
          nextEmptyState.prompts = promptData.map((prompt: any) => ({
            label: prompt.text,
            iconName: prompt.icon_name || 'Zap',
          }));
        }

        setEmptyState(nextEmptyState);
      } catch (err) {
        console.error('Error fetching inventory simulator config:', err);
      }
    };

    fetchSimConfig();
  }, []);

  return (
    <SharedMolarAI
      adapter={adapter}
      disabled={disabled}
      onPetToggle={onPetToggle}
      emptyState={emptyState}
      logoUrl={MOLAR_LOGO_URL}
    />
  );
}
