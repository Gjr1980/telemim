import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPA_URL = Deno.env.get("SUPABASE_URL") || "https://netoufukpmmfhzwirogi.supabase.co";
const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
const EVOLUTION_URL = "http://64.181.190.173:8080";
const EVOLUTION_KEY = "B6D711FCDE4D4FD5936544120E713976";
const INSTANCE = "telemim";

async function enviarWA(numero: string, mensagem: string) {
  const clean = numero.replace(/\D/g, "");
  const phone = clean.startsWith("55") ? clean : "55" + clean;
  try {
    await fetch(`${EVOLUTION_URL}/message/sendText/${INSTANCE}`, {
      method: "POST",
      headers: { "apikey": EVOLUTION_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ number: phone, text: mensagem }),
    });
  } catch (_e) { /* silent */ }
}

function substituirVars(msg: string, vars: Record<string, string>): string {
  let out = msg;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, v || "");
  }
  return out;
}

serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabase = createClient(SUPA_URL, SUPA_KEY);

    // Get wa_auto_config
    const { data: cfgRows } = await supabase
      .from("configuracoes")
      .select("chave,valor")
      .in("chave", ["wa_auto_config", "whatsapp_ativo", "admin_whatsapp"]);

    const cfg: Record<string, string> = {};
    (cfgRows || []).forEach((r: { chave: string; valor: string }) => { cfg[r.chave] = r.valor || ""; });

    if (cfg.whatsapp_ativo !== "true") {
      return new Response(JSON.stringify({ ok: true, msg: "WhatsApp inativo" }), { headers: cors });
    }

    let waAuto: Record<string, { ativo: boolean; dest: string[]; msg: string }> = {};
    try { waAuto = JSON.parse(cfg.wa_auto_config || "{}"); } catch (_e) { /* */ }

    const lembrete = waAuto.lembrete;
    if (!lembrete || !lembrete.ativo) {
      return new Response(JSON.stringify({ ok: true, msg: "Lembrete inativo" }), { headers: cors });
    }

    // Calculate tomorrow's date in sa-east-1 timezone (UTC-3)
    const now = new Date();
    const brNow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const tomorrow = new Date(brNow);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    // Get agenda items for tomorrow
    const { data: agItems } = await supabase
      .from("agenda")
      .select("*")
      .eq("data", tomorrowStr)
      .is("deleted_at", null);

    if (!agItems || agItems.length === 0) {
      return new Response(JSON.stringify({ ok: true, msg: "Sem mudancas amanha", data: tomorrowStr }), { headers: cors });
    }

    // Get all active users for resolving IDs
    const { data: usuarios } = await supabase
      .from("usuarios")
      .select("id,nome,perfil,contato,tipo_veiculo,ativo")
      .eq("ativo", true);

    const userMap: Record<string, { nome: string; perfil: string; contato: string }> = {};
    (usuarios || []).forEach((u: { id: string; nome: string; perfil: string; contato: string }) => {
      userMap[u.id] = u;
    });

    let enviados = 0;

    for (const ag of agItems) {
      // Resolve destinations
      const nums: string[] = [];
      for (const d of lembrete.dest) {
        if (d === "mot_van" && ag.motorista_van_id && userMap[ag.motorista_van_id]?.contato) {
          nums.push(userMap[ag.motorista_van_id].contato);
        }
        if (d === "mot_caminhao" && ag.motorista_caminhao_id && userMap[ag.motorista_caminhao_id]?.contato) {
          nums.push(userMap[ag.motorista_caminhao_id].contato);
        }
        if (d === "admin" && cfg.admin_whatsapp) {
          nums.push(cfg.admin_whatsapp);
        }
        if (d === "supervisor" && ag.supervisor_id && userMap[ag.supervisor_id]?.contato) {
          nums.push(userMap[ag.supervisor_id].contato);
        }
        if (d === "promorar") {
          (usuarios || []).filter((u: { perfil: string; ativo: boolean; contato: string }) => u.perfil === "promorar" && u.ativo && u.contato).forEach((u: { contato: string }) => nums.push(u.contato));
        }
        if (d === "social") {
          (usuarios || []).filter((u: { perfil: string; ativo: boolean; contato: string }) => u.perfil === "social" && u.ativo && u.contato).forEach((u: { contato: string }) => nums.push(u.contato));
        }
        if (d === "cliente" && ag.contato) {
          nums.push(ag.contato);
        }
      }

      const uniqueNums = [...new Set(nums)];
      if (uniqueNums.length === 0) continue;

      // Build vars
      const supNome = ag.supervisor_id && userMap[ag.supervisor_id] ? userMap[ag.supervisor_id].nome : "";
      const motVanNome = ag.motorista_van_id && userMap[ag.motorista_van_id] ? userMap[ag.motorista_van_id].nome : "";
      const motCamNome = ag.motorista_caminhao_id && userMap[ag.motorista_caminhao_id] ? userMap[ag.motorista_caminhao_id].nome : "";

      const vars = {
        cliente: ag.nome || "",
        data: ag.data || "",
        hora: ag.horario || "",
        origem: ag.origem || "",
        destino: ag.destino || "",
        motorista: motVanNome || motCamNome || "",
        metragem: ag.medicao || "",
        supervisor: supNome,
        caminhao: motCamNome,
        van: motVanNome,
      };

      const msg = substituirVars(lembrete.msg, vars);

      for (const n of uniqueNums) {
        await enviarWA(n, msg);
        enviados++;
      }
    }

    return new Response(JSON.stringify({ ok: true, data: tomorrowStr, agendas: agItems.length, enviados }), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: cors });
  }
});
