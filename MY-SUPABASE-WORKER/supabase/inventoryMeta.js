export async function getInventoryMetaByUserId(env, userId) {
    const url =
      `${env.SUPABASE_URL}/rest/v1/inventory_meta` +
      `?user_id=eq.${encodeURIComponent(userId)}`;
  
    const r = await fetch(url, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
    });
  
    if (!r.ok) {
      throw new Error(`inventory_meta error ${r.status}: ${await r.text()}`);
    }
  
    return await r.json(); // array
  }
  