// BACKUP ORIGINAL — enviar-whatsapp — 2026-05-26
// telemim-promorar (project: netoufukpmmfhzwirogi)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const EVOLUTION_URL = "http://64.181.190.173:8080";
const EVOLUTION_KEY = "B6D711FCDE4D4FD5936544120E713976";
const INSTANCE = "telemim";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }
  try {
    const { numero, mensagem } = await req.json();
    if (!numero || !mensagem) {
      return new Response(JSON.stringify({ error: "numero e mensagem obrigatorios" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
    const clean = numero.replace(/\D/g, "");
    const phone = clean.startsWith("55") ? clean : "55" + clean;
    const resp = await fetch(`${EVOLUTION_URL}/message/sendText/${INSTANCE}`, {
      method: "POST",
      headers: { "apikey": EVOLUTION_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ number: phone, text: mensagem }),
    });
    const data = await resp.json();
    return new Response(JSON.stringify({ ok: true, data }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
