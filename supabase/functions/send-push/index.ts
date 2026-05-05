import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const VAPID_PUBLIC = "BDSrV6DR3T2UHFejPkdxILOhX2642QKjU4FFIepZNt0FF7Zq3FGmYEwFyr3GShvvvBFJSiLvvSHWHij6rFixouk";
const VAPID_PRIVATE = "9A9IDnj2kpeFY6pfJqYXllULNSnPkT-9MLN4ZmHpF_E";
const VAPID_SUBJECT = "mailto:telemim@promorar.com";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://netoufukpmmfhzwirogi.supabase.co";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";

function base64UrlEncode(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  const padding = "=".repeat((4 - (str.length % 4)) % 4);
  const base64 = (str + padding).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function createJWT(endpoint: string): Promise<string> {
  const audience = new URL(endpoint).origin;
  const header = { alg: "ES256", typ: "JWT" };
  const payload = { aud: audience, exp: Math.floor(Date.now() / 1000) + 86400, sub: VAPID_SUBJECT };

  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const privateKeyBytes = base64UrlDecode(VAPID_PRIVATE);
  const key = await crypto.subtle.importKey("raw", privateKeyBytes, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(unsignedToken)));

  return `${unsignedToken}.${base64UrlEncode(signature)}`;
}

async function sendWebPush(subscription: { endpoint: string; p256dh: string; auth: string }, payload: string): Promise<boolean> {
  try {
    const jwt = await createJWT(subscription.endpoint);
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "TTL": "86400",
        "Authorization": `vapid t=${jwt}, k=${VAPID_PUBLIC}`,
      },
      body: new TextEncoder().encode(payload),
    });
    return response.status === 201 || response.status === 200;
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" } });
  }

  try {
    const { user_ids, title, body } = await req.json();
    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return new Response(JSON.stringify({ error: "user_ids required" }), { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }

    // Fetch subscriptions for the target users
    const ids = user_ids.map((id: string) => `"${id}"`).join(",");
    const subRes = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?user_id=in.(${user_ids.join(",")})&select=*`, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
    });
    const subs = await subRes.json();

    if (!Array.isArray(subs) || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no subscriptions" }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }

    const payload = JSON.stringify({ title: title || "TELEMIM", body: body || "" });
    let sent = 0;

    for (const sub of subs) {
      const ok = await sendWebPush({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, payload);
      if (ok) sent++;
    }

    return new Response(JSON.stringify({ sent, total: subs.length }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  }
});
