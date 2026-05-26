import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { token } = await req.json();
    if (!token) return new Response(JSON.stringify({ ok: false, error: "Token obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Validar token
    const { data: ml, error: mlErr } = await sb.from("magic_links").select("*").eq("token", token).eq("ativo", true).eq("tipo", "mudanca").single();
    if (mlErr || !ml) return new Response(JSON.stringify({ ok: false, error: "Link inválido ou expirado." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (new Date() > new Date(ml.expira_em)) {
      await sb.from("magic_links").update({ ativo: false }).eq("id", ml.id);
      return new Response(JSON.stringify({ ok: false, error: "Link expirado." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Iniciar mudança — só se ainda não foi iniciada
    const agora = new Date().toISOString();
    const { error: upErr } = await sb.from("agenda").update({
      status: "Realizando",
      inicio_mudanca_em: agora
    }).eq("id", ml.mudanca_id);

    if (upErr) return new Response(JSON.stringify({ ok: false, error: upErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Retornar mudança atualizada
    const { data: mud } = await sb.from("agenda").select("*").eq("id", ml.mudanca_id).single();
    return new Response(JSON.stringify({ ok: true, mudanca: mud }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
