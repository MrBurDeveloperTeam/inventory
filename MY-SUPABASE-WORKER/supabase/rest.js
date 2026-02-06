function buildUrl(env, table, params = {}) {
    const base = `${env.SUPABASE_URL}/rest/v1/${table}`;
    const qs = new URLSearchParams();
  
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      qs.set(k, String(v));
    }
  
    return `${base}?${qs.toString()}`;
  }
  
  async function sbFetch(env, url) {
    const r = await fetch(url, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
    });
  
    if (!r.ok) {
      throw new Error(`Supabase ${r.status}: ${await r.text()}`);
    }
  
    return r;
  }
  
  export async function sbGetList(env, table, params) {
    const url = buildUrl(env, table, params);
    const r = await sbFetch(env, url);
    return await r.json(); // array
  }
  
  export async function sbGetMaybeSingle(env, table, params) {
    const url = buildUrl(env, table, params);
    const r = await sbFetch(env, url);
    const rows = await r.json();
    return rows?.[0] ?? null;
  }

  function sbHeaders(env) {
    return {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    };
  }
  
  export async function sbDelete(env, table, filters) {
    const qs = new URLSearchParams(filters).toString();
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/${table}?${qs}`,
      { method: "DELETE", headers: sbHeaders(env) }
    );
    if (!res.ok) throw new Error(await res.text());
  }
  
  export async function sbInsert(env, table, rows) {
    if (!rows.length) return;
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/${table}`,
      {
        method: "POST",
        headers: {
          ...sbHeaders(env),
          Prefer: "return=minimal",
        },
        body: JSON.stringify(rows),
      }
    );
    if (!res.ok) throw new Error(await res.text());
  }
  
  export async function sbUpsert(env, table, rows, conflict = null) {
    if (!rows.length) return;
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/${table}`,
      {
        method: "POST",
        headers: {
          ...sbHeaders(env),
          Prefer: `resolution=merge-duplicates,return=minimal${conflict ? `,on_conflict=${conflict}` : ""}`,
        },
        body: JSON.stringify(rows),
      }
    );
    if (!res.ok) throw new Error(await res.text());
  }
  