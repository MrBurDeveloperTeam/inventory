export async function getProfileByEmail(env, email) {
    const url =
      `${env.SUPABASE_URL}/rest/v1/profiles` +
      `?email=eq.${encodeURIComponent(email)}` +
      `&select=*`;
  
    const r = await fetch(url, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
    });
  
    if (!r.ok) {
      throw new Error(`Supabase error ${r.status}: ${await r.text()}`);
    }
  
    const rows = await r.json();
    console.log('this rows: ',JSON.stringify(rows[0]))
    return rows[0] ?? null;
  }
  