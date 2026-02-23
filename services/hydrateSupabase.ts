export async function hydrateSupabaseFromSso(supabase, api) {
  const { data: existing } = await supabase.auth.getSession();
  if (existing?.session) return; // already logged in normally

  // try SSO cookie -> supabase session
  const r = await api.get("/supabase-session");
  if (!r.data?.ok) return;

  const { access_token, refresh_token } = r.data;

  await supabase.auth.setSession({ access_token, refresh_token });
}