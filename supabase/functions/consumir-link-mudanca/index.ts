import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, GET, OPTIONS"};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    let token = url.searchParams.get("token");
    if (!token && req.method === "POST") { const body = await req.json(); token = body.token; }
    if (!token) return new Response(JSON.stringify({ ok: false, error: "Token obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);
    const { data: ml, error: mlErr } = await sb.from("magic_links").select("*").eq("token", token).eq("ativo", true).eq("tipo", "mudanca").single();
    if (mlErr || !ml) return new Response(JSON.stringify({ ok: false, error: "Link inválido ou expirado.", expired: true }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (new Date() > new Date(ml.expira_em)) {
      await sb.from("magic_links").update({ ativo: false }).eq("id", ml.id);
      return new Response(JSON.stringify({ ok: false, error: "Este link já expirou (24h).", expired: true }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: mud, error: mudErr } = await sb.from("agenda").select("*").eq("id", ml.mudanca_id).single();
    if (mudErr || !mud) return new Response(JSON.stringify({ ok: false, error: "Mudança não encontrada." }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ ok: true, mudanca: mud, criado_por: ml.criado_por || "", expira_em: ml.expira_em }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
