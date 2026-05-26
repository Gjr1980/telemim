import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { mudanca_id, criado_por } = await req.json();
    if (!mudanca_id) return new Response(JSON.stringify({ ok: false, error: "mudanca_id obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Buscar a data da mudança para expirar à meia-noite
    const { data: mud } = await sb.from("agenda").select("data").eq("id", mudanca_id).single();
    const dataMud = mud?.data || new Date().toISOString().slice(0, 10);
    // Expira à meia-noite do dia da mudança (fuso Recife -03:00)
    const expira = new Date(dataMud + "T23:59:59-03:00");

    await sb.from("magic_links").update({ ativo: false }).eq("mudanca_id", mudanca_id).eq("tipo", "mudanca");
    const token = crypto.randomUUID();
    const { error } = await sb.from("magic_links").insert({
      token,
      tipo: "mudanca",
      mudanca_id,
      expira_em: expira.toISOString(),
      ativo: true,
      criado_por: criado_por || ""
    });
    if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ ok: true, token, expira_em: expira.toISOString() }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
