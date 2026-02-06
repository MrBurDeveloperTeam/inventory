import { APP_CONFIG } from "./config/apps.js";
import { parseJwtPayload, extractEmail } from "./auth/odooJwt.js";
import { getProfileByEmail } from "./supabase/profiles.js";
import { getInventoryMetaByUserId } from "./supabase/inventoryMeta.js";
import { supabaseBootstrapByEmail } from "./supabase/bootstrap.js";
import { inventoryFullSync } from "./supabase/inventorySync.js";
import { createRoom, deleteRoom, updateRoom } from "./supabase/rooms.js";
import { upsertItem, deleteItem, updateItem, receiveStock, transferItem } from "./supabase/items.js";
import { upsertBatch, deleteBatch, updateBatchWithItemSync } from "./supabase/batches.js";
import { insertHistory } from "./supabase/history.js";
import { insertLog } from "./supabase/logs.js";
import { upsertInventoryMeta } from "./supabase/upsertInventoryMeta.js";

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // ==============================
        // ✅ COOKIE CONFIG (SHARED ACROSS SUBDOMAINS)
        // ==============================
        const COOKIE_NAME = "mrbur_sso";
        const COOKIE_DOMAIN = ".mrburstudio.com"; // ✅ shared across all subdomains
        const DEFAULT_MAX_AGE = 60 * 60; // 1 hour

        // ==============================
        // ✅ CORS
        // ==============================
        const origin = request.headers.get("Origin");
        const allowedOrigins = new Set([
            "https://inventory.mrburstudio.com",
            "https://appointment.mrburstudio.com",
            "https://event.mrburstudio.com",
            "https://recruitment.mrburstudio.com",
            "http://localhost:3000",
        ]);

        const isApi = url.pathname.startsWith("/api/");

        // NOTE: for cookies, Origin MUST be echoed (not "*")
        const corsHeaders = isApi
            ? {
                "Access-Control-Allow-Origin": allowedOrigins.has(origin)
                    ? origin
                    : "https://inventory.mrburstudio.com",
                "Access-Control-Allow-Credentials": "true",
                "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
                "Access-Control-Allow-Headers":
                    "Authorization, Content-Type, Accept, X-Requested-With",
                "Access-Control-Max-Age": "86400",
                Vary: "Origin",
            }
            : {};

        // Preflight
        if (isApi && request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: corsHeaders });
        }

        // ==============================
        // ✅ HELPERS
        // ==============================
        function getCookie(req, name) {
            const cookie = req.headers.get("Cookie") || "";
            const parts = cookie.split(";").map((v) => v.trim());
            for (const part of parts) {
                if (part.startsWith(name + "=")) {
                    return decodeURIComponent(part.slice(name.length + 1));
                }
            }
            return null;
        }

        function buildSetCookie({ value, maxAge = DEFAULT_MAX_AGE }) {
            return [
                `${COOKIE_NAME}=${encodeURIComponent(value)}`,
                "Path=/",
                `Domain=${COOKIE_DOMAIN}`, // ✅ share across subdomains
                "HttpOnly",
                "Secure",
                "SameSite=Lax",
                `Max-Age=${maxAge}`,
            ].join("; ");
        }

        function buildClearCookie() {
            return [
                `${COOKIE_NAME}=`,
                "Path=/",
                `Domain=${COOKIE_DOMAIN}`,
                "HttpOnly",
                "Secure",
                "SameSite=Lax",
                "Max-Age=0",
            ].join("; ");
        }

        // Prefer cookie, but temporarily allow Authorization header for migration
        function getTokenFromRequest(req) {
            const cookieToken = getCookie(req, COOKIE_NAME);
            if (cookieToken) return cookieToken;

            const auth = req.headers.get("Authorization");
            if (auth?.startsWith("Bearer ")) return auth.slice(7);

            return null;
        }

        function decodeAndValidateToken(token) {
            let payload;
            try {
                payload = parseJwtPayload(token);
            } catch {
                return { ok: false, error: "invalid_token", payload: null };
            }

            // optional exp check
            if (payload?.exp && payload.exp * 1000 < Date.now()) {
                return { ok: false, error: "expired", payload: null };
            }

            const email = extractEmail(payload);
            if (!email) return { ok: false, error: "missing_email", payload: null };

            return { ok: true, payload, email };
        }

        // ==============================
        // ✅ API: POST /api/logout (clear cookie)
        // ==============================
        if (url.pathname === "/api/logout" && request.method === "POST") {
            return new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                    "Set-Cookie": buildClearCookie(),
                    ...corsHeaders,
                },
            });
        }

        // ==============================
        // ✅ API: GET /api/me (check login quick)
        // ==============================
        if (url.pathname === "/api/me" && request.method === "GET") {
            const token = getTokenFromRequest(request);
            if (!token) {
                return new Response(JSON.stringify({ loggedIn: false, user: null }), {
                    status: 200,
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                });
            }

            const decoded = decodeAndValidateToken(token);
            if (!decoded.ok) {
                return new Response(JSON.stringify({ loggedIn: false, user: null }), {
                    status: 200,
                    headers: {
                        "Content-Type": "application/json",
                        // optional: clear cookie if expired/invalid
                        ...(decoded.error === "expired" || decoded.error === "invalid_token"
                            ? { "Set-Cookie": buildClearCookie() }
                            : {}),
                        ...corsHeaders,
                    },
                });
            }

            // You can return minimal identity info
            return new Response(
                JSON.stringify({
                    loggedIn: true,
                    user: { email: decoded.email, aud: decoded.payload?.aud || null },
                }),
                { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
            );
        }

        /* ==============================
           API: POST /api/inventory/sync
           ============================== */
        if (url.pathname === "/api/inventory/sync" && request.method === "POST") {
            // ✅ Cookie-based auth
            const token = getTokenFromRequest(request);
            if (!token) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

            const decoded = decodeAndValidateToken(token);
            if (!decoded.ok) {
                return new Response("Unauthorized", {
                    status: 401,
                    headers: {
                        ...(decoded.error === "expired" ? { "Set-Cookie": buildClearCookie() } : {}),
                        ...corsHeaders,
                    },
                });
            }

            const body = await request.json();
            await inventoryFullSync(env, body);

            return new Response(JSON.stringify({ ok: true }), {
                headers: { "Content-Type": "application/json", ...corsHeaders },
            });
        }

        /* ==============================
           API: GET /api/bootstrap
           ============================== */
        if (url.pathname === "/api/bootstrap") {
            // ✅ Cookie-based auth
            const token = getTokenFromRequest(request);
            if (!token) {
                return new Response(JSON.stringify({ loggedIn: false }), {
                    status: 401,
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                });
            }

            const decoded = decodeAndValidateToken(token);
            if (!decoded.ok) {
                return new Response(JSON.stringify({ loggedIn: false, error: decoded.error }), {
                    status: 401,
                    headers: {
                        "Content-Type": "application/json",
                        ...(decoded.error === "expired" ? { "Set-Cookie": buildClearCookie() } : {}),
                        ...corsHeaders,
                    },
                });
            }

            try {
                const result = await supabaseBootstrapByEmail(env, decoded.email);

                return new Response(
                    JSON.stringify({
                        loggedIn: true,
                        user: result,
                    }),
                    { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
                );
            } catch (e) {
                return new Response(JSON.stringify({ loggedIn: false, error: e.message }), {
                    status: 500,
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                });
            }
        }

        /* ==============================
          API: GET /api/verify-token
          (kept same shape, but reads cookie)
        ============================== */
        if (url.pathname === "/api/verify-token") {
            const token = getTokenFromRequest(request);
            if (!token) {
                return new Response(JSON.stringify({ loggedIn: false }), {
                    status: 401,
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                });
            }

            const decoded = decodeAndValidateToken(token);
            if (!decoded.ok) {
                return new Response(JSON.stringify({ loggedIn: false }), {
                    status: 401,
                    headers: {
                        "Content-Type": "application/json",
                        ...(decoded.error === "expired" ? { "Set-Cookie": buildClearCookie() } : {}),
                        ...corsHeaders,
                    },
                });
            }

            // fetch profile
            let profile;
            try {
                profile = await getProfileByEmail(env, decoded.email);
            } catch (e) {
                return new Response(JSON.stringify({ loggedIn: false, error: e.message }), {
                    status: 500,
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                });
            }

            if (!profile) {
                return new Response(JSON.stringify({ loggedIn: false }), {
                    status: 403,
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                });
            }

            // fetch meta
            let meta = [];
            try {
                meta = await getInventoryMetaByUserId(env, profile.user_id);
            } catch {
                meta = [];
            }

            return new Response(
                JSON.stringify({
                    loggedIn: true,
                    user: {
                        profiles: {
                            user: {
                                user_id: profile.user_id,
                                email: profile.email,
                                user_metadata: {
                                    name: profile.name,
                                    account_type: profile.account_type,
                                    phone: profile.phone,
                                    position: profile.position,
                                    company_name: profile.company_name,
                                },
                            },
                        },
                        meta,
                        rooms: [],
                        rooms_error: null,
                        items_data: [],
                        history_data: [],
                        log_data: [],
                    },
                }),
                { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
            );
        }

        /* ==============================
           API: GET /api/inventory/meta
           ============================== */
        if (url.pathname === "/api/inventory/meta") {
            const token = getTokenFromRequest(request);
            if (!token) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

            const decoded = decodeAndValidateToken(token);
            if (!decoded.ok) {
                return new Response("Unauthorized", {
                    status: 401,
                    headers: {
                        ...(decoded.error === "expired" ? { "Set-Cookie": buildClearCookie() } : {}),
                        ...corsHeaders,
                    },
                });
            }

            let profile;
            try {
                profile = await getProfileByEmail(env, decoded.email);
            } catch (e) {
                return new Response(e.message, { status: 500, headers: corsHeaders });
            }

            if (!profile) {
                return new Response("User not found", { status: 403, headers: corsHeaders });
            }

            try {
                const meta = await getInventoryMetaByUserId(env, profile.user_id);
                return new Response(JSON.stringify({ profile, meta }), {
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                });
            } catch (e) {
                return new Response(e.message, { status: 500, headers: corsHeaders });
            }
        }

        /* ==============================
           API: POST /api/rooms (Create Room)
           ============================== */
        if (url.pathname === "/api/rooms" && request.method === "POST") {
            const token = getTokenFromRequest(request);
            if (!token) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

            const decoded = decodeAndValidateToken(token);
            if (!decoded.ok) {
                return new Response("Unauthorized", { status: 401, headers: corsHeaders });
            }

            try {
                const body = await request.json();
                const result = await createRoom(env, body);
                return new Response(JSON.stringify(result), {
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), {
                    status: 500,
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                });
            }
        }

        /* ==============================
           API: DELETE /api/rooms/:id
           ============================== */
        if (url.pathname.startsWith("/api/rooms/") && request.method === "DELETE") {
            const token = getTokenFromRequest(request);
            if (!token) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

            const decoded = decodeAndValidateToken(token);
            if (!decoded.ok) {
                return new Response("Unauthorized", { status: 401, headers: corsHeaders });
            }

            try {
                const roomId = url.pathname.split("/").pop();
                const result = await deleteRoom(env, roomId);
                return new Response(JSON.stringify(result), {
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), {
                    status: 500,
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                });
            }
        }

        /* ==============================
           API: PATCH /api/rooms/:id
           ============================== */
        if (url.pathname.startsWith("/api/rooms/") && request.method === "PATCH") {
            const token = getTokenFromRequest(request);
            if (!token) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

            const decoded = decodeAndValidateToken(token);
            if (!decoded.ok) {
                return new Response("Unauthorized", { status: 401, headers: corsHeaders });
            }

            try {
                const roomId = url.pathname.split("/").pop();
                const body = await request.json();
                const result = await updateRoom(env, roomId, body);
                return new Response(JSON.stringify(result), {
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), {
                    status: 500,
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                });
            }
        }

        /* ==============================
           API: POST /api/items (Receive Stock)
           ============================== */
        if (url.pathname === "/api/items" && request.method === "POST") {
            const token = getTokenFromRequest(request);
            if (!token) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

            const decoded = decodeAndValidateToken(token);
            if (!decoded.ok) {
                return new Response("Unauthorized", { status: 401, headers: corsHeaders });
            }

            try {
                const body = await request.json();
                const result = await receiveStock(env, body);
                return new Response(JSON.stringify(result), {
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), {
                    status: 500,
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                });
            }
        }

        /* ==============================
           API: DELETE /api/items/:id
           ============================== */
        if (url.pathname.match(/^\/api\/items\/[^/]+$/) && request.method === "DELETE") {
            const token = getTokenFromRequest(request);
            if (!token) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

            const decoded = decodeAndValidateToken(token);
            if (!decoded.ok) {
                return new Response("Unauthorized", { status: 401, headers: corsHeaders });
            }

            try {
                const itemId = url.pathname.split("/").pop();
                const result = await deleteItem(env, itemId);
                return new Response(JSON.stringify(result), {
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), {
                    status: 500,
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                });
            }
        }

        /* ==============================
           API: PATCH /api/items/:id
           ============================== */
        if (url.pathname.match(/^\/api\/items\/[^/]+$/) && request.method === "PATCH") {
            const token = getTokenFromRequest(request);
            if (!token) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

            const decoded = decodeAndValidateToken(token);
            if (!decoded.ok) {
                return new Response("Unauthorized", { status: 401, headers: corsHeaders });
            }

            try {
                const itemId = url.pathname.split("/").pop();
                const body = await request.json();
                const result = await updateItem(env, itemId, body);
                return new Response(JSON.stringify(result), {
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), {
                    status: 500,
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                });
            }
        }

        /* ==============================
           API: POST /api/items/transfer
           ============================== */
        if (url.pathname === "/api/items/transfer" && request.method === "POST") {
            const token = getTokenFromRequest(request);
            if (!token) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

            const decoded = decodeAndValidateToken(token);
            if (!decoded.ok) {
                return new Response("Unauthorized", { status: 401, headers: corsHeaders });
            }

            try {
                const body = await request.json();
                const result = await transferItem(env, body);
                return new Response(JSON.stringify(result), {
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), {
                    status: 500,
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                });
            }
        }

        /* ==============================
           API: PATCH /api/batches/:id
           ============================== */
        if (url.pathname.startsWith("/api/batches/") && request.method === "PATCH") {
            const token = getTokenFromRequest(request);
            if (!token) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

            const decoded = decodeAndValidateToken(token);
            if (!decoded.ok) {
                return new Response("Unauthorized", { status: 401, headers: corsHeaders });
            }

            try {
                const body = await request.json();
                const result = await updateBatchWithItemSync(env, body);
                return new Response(JSON.stringify(result), {
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), {
                    status: 500,
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                });
            }
        }

        /* ==============================
           API: PATCH /api/meta
           ============================== */
        if (url.pathname === "/api/meta" && request.method === "PATCH") {
            const token = getTokenFromRequest(request);
            if (!token) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

            const decoded = decodeAndValidateToken(token);
            if (!decoded.ok) {
                return new Response("Unauthorized", { status: 401, headers: corsHeaders });
            }

            try {
                const body = await request.json();
                const result = await upsertInventoryMeta(env, body);
                return new Response(JSON.stringify(result), {
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), {
                    status: 500,
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                });
            }
        }

        /* ==============================
           API: POST /api/logs
           ============================== */
        if (url.pathname === "/api/logs" && request.method === "POST") {
            const token = getTokenFromRequest(request);
            if (!token) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

            const decoded = decodeAndValidateToken(token);
            if (!decoded.ok) {
                return new Response("Unauthorized", { status: 401, headers: corsHeaders });
            }

            try {
                const body = await request.json();
                const result = await insertLog(env, body);
                return new Response(JSON.stringify(result), {
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), {
                    status: 500,
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                });
            }
        }

        /* ==============================
           ✅ SSO LOGIN (UPDATED: SET COOKIE + REDIRECT)
           ============================== */
        if (url.pathname === "/sso/login") {
            const token = url.searchParams.get("token");
            if (!token) return new Response("Missing token", { status: 400 });

            const decoded = decodeAndValidateToken(token);
            if (!decoded.ok) {
                return new Response("Invalid Token", { status: 400 });
            }

            // Use aud to route app (same as your current)
            const appCode = decoded.payload.aud;
            const config = APP_CONFIG[appCode];
            if (!config) {
                return new Response(`Unknown App Code: ${appCode}`, { status: 400 });
            }

            // ✅ set cookie shared across subdomains
            // If you want max-age to follow token exp exactly:
            // const now = Math.floor(Date.now() / 1000);
            // const maxAge = decoded.payload?.exp ? Math.max(0, decoded.payload.exp - now) : DEFAULT_MAX_AGE;
            const maxAge = DEFAULT_MAX_AGE;

            // OPTIONAL: ensure user exists (your existing check)
            if (config.type === "supabase") {
                try {
                    const profile = await getProfileByEmail(env, decoded.email);
                    console.log("[SSO] profile:", profile);
                } catch (e) {
                    return new Response(e.message, { status: 500 });
                }

                // redirect to app without token in URL (best practice)
                // ✅ cookie already set so app can call /api/bootstrap with credentials
                const finalUrl = `${config.baseUrl}/login`;

                return new Response(null, {
                    status: 302,
                    headers: {
                        "Set-Cookie": buildSetCookie({ value: token, maxAge }),
                        Location: finalUrl,
                        "Cache-Control": "no-store",
                    },
                });
            }

            // For OAuth apps (kept, but also set cookie if you want)
            const MAIN_ODOO_URL = "https://mrbur-staging-bur-2609087.dev.odoo.com";
            const redirectUri = `${config.baseUrl}/auth_oauth/signin`;

            const oauthUrl =
                `${MAIN_ODOO_URL}/oauth2/auth` +
                `?client_id=${config.clientId}` +
                `&redirect_uri=${encodeURIComponent(redirectUri)}` +
                `&response_type=token&scope=userinfo`;

            return new Response(null, {
                status: 302,
                headers: {
                    "Set-Cookie": buildSetCookie({ value: token, maxAge }),
                    Location: oauthUrl,
                    "Cache-Control": "no-store",
                },
            });
        }

        return new Response("SSO Gateway Active", {
            status: 200,
            headers: corsHeaders,
        });
    },
};