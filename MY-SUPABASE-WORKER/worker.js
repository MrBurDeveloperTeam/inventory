export default {
    async fetch(request, env) {
      const url = new URL(request.url);
  
      if (url.pathname !== "/sso/supabase") {
        return new Response("Not found", { status: 404 });
      }
  
      // Where to send user after Supabase finishes auth
      const next = url.searchParams.get("next") || "https://gallery.mrburstudio.com";
      const redirectTo = `${env.SUPABASE_REDIRECT_BASE}?next=${encodeURIComponent(next)}`;
  
      // 1) Verify Odoo session (requires browser to send Odoo cookies)
      // If your Worker is on a different domain, Odoo cookies usually won't be sent.
      // In that case, use your existing Odoo-issued token approach instead (see section 4).
      const { email } = await getOdooSessionEmail(request, env);
      if (!email) return new Response("Not logged in on Odoo", { status: 401 });
  
      // 2) Generate Supabase magic link (Admin API) and redirect user to it
      const actionLink = await supabaseGenerateMagicLink(env, email, redirectTo);
      return Response.redirect(actionLink, 302);
    },
  };
  
  async function getOdooSessionEmail(request, env) {
    // Pass through cookies from the browser request (if present)
    const cookie = request.headers.get("Cookie") || "";
  
    // Odoo "get_session_info" is a common way to confirm session
    // (Works only if the request carries valid Odoo session cookie)
    const payload = {
      jsonrpc: "2.0",
      method: "call",
      params: {},
      id: Date.now(),
    };
  
    const res = await fetch(`${env.ODOO_URL}/web/session/get_session_info`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify(payload),
    });
  
    if (!res.ok) return { email: null };
  
    const data = await res.json();
    const result = data?.result;
  
    // Depending on Odoo config, you might have username/login; email may be in user_context/user fields.
    // If this returns only login, you can query res.users by uid to get email.
    const login = result?.username || result?.user_login || null;
    const uid = result?.uid || null;
  
    // If login is already an email, use it:
    if (login && login.includes("@")) return { email: login };
  
    // Otherwise: read user email from res.users
    if (!uid) return { email: null };
  
    const email = await odooReadUserEmail(env, cookie, uid);
    return { email };
  }
  
  async function odooReadUserEmail(env, cookie, uid) {
    const payload = {
      jsonrpc: "2.0",
      method: "call",
      params: {
        model: "res.users",
        method: "read",
        args: [[uid]],
        kwargs: { fields: ["email", "login"] },
      },
      id: Date.now(),
    };
  
    const res = await fetch(`${env.ODOO_URL}/web/dataset/call_kw`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(payload),
    });
  
    if (!res.ok) return null;
    const data = await res.json();
    const user = Array.isArray(data?.result) ? data.result[0] : null;
    return user?.email || (user?.login?.includes("@") ? user.login : null) || null;
  }
  
  async function supabaseGenerateMagicLink(env, email, redirectTo) {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        type: "magiclink",
        email,
        options: {
          redirectTo, // where Supabase sends the browser after confirming
        },
      }),
    });
  
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Supabase generate_link failed: ${errText}`);
    }
  
    const data = await res.json();
    const actionLink = data?.data?.properties?.action_link;
    if (!actionLink) throw new Error("Missing action_link from Supabase");
  
    return actionLink;
  }
  