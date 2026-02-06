export async function upsertInventoryMeta(env, metaPayload) {
    const url = `${env.SUPABASE_URL}/rest/v1/inventory_meta`;
  
    const res = await fetch(url, {
      method: "POST", // POST + Prefer header => UPSERT
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(metaPayload),
    });
  
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Upsert inventory_meta failed ${res.status}: ${text}`);
    }
  
    const data = await res.json();
    // if you upsert 1 row, representation returns array
    return data?.[0] ?? null;
  }
  