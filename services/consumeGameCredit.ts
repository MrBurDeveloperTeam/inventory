import { callSnabbbApi } from './snabbbApi';
import { supabase } from '../supabaseClient';

export async function consumeGameCredit(
  odooPartnerId: number,
  userId: string,      // Supabase auth user id
  sessionId: string    // your game session uuid
): Promise<boolean> {
  const externalRef = `game-${sessionId}-${Date.now()}`;

  try {
    // Step 1: Deduct credit from Odoo (source of truth)
    const result = await callSnabbbApi<{ ok: boolean; snabbb_balance: number }>(
      '/snabbb/api/consume',
      'POST',
      {
        partner_id: odooPartnerId,
        app_code: 'inventory',   // your app's code in Odoo
        feature_code: 'game_play',   // your feature's code in Odoo
        external_ref: externalRef,
      }
    );

    // Step 2: Log the action in Supabase (audit trail)
    await supabase.from('miniapp_paid_actions').insert({
      user_id: userId,
      mini_app_code: 'inventory',
      feature_code: 'game_play',
      external_ref: externalRef,
      odoo_status: 'success',
    });

    // Step 3: Update local wallet cache in Supabase
    await supabase
      .from('miniapp_wallet_cache')
      .upsert({
        user_id: userId,
        odoo_partner_id: odooPartnerId,
        snabbb_balance: result.snabbb_balance,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    return true;

  } catch (err: any) {
    // Odoo rejected — block the action, show error to user
    console.error('Credit consume failed:', err.message);
    return false;
  }
}