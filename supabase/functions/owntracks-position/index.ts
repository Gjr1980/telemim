import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ── OwnTracks HTTP ingestion ────────────────────────────────────────────────
// O app OwnTracks (modo HTTP / mode 3) faz POST aqui a cada mudança de posição.
// Autenticação: ?token=<rastreio_token do motorista> (por motorista, revogável).
// A posição é gravada em gps_tracking, anexada à agenda ativa do motorista
// (ou como "heartbeat" com agenda_id nulo quando não há mudança em andamento).
// Resposta: [] (OwnTracks espera um array de comandos/friends; vazio = ok).

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-limit-d, x-limit-u",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

async function rest(path: string, init: RequestInit = {}) {
  return fetch(`${SUPA_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      "apikey": SERVICE_KEY,
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") || "";
    if (!token) return json({ error: "token obrigatorio" }, 401);

    // ── Config: OwnTracks "Load configuration from URL" (GET ?config=1) ──────
    // Retorna a configuração pronta (modo HTTP apontando de volta pra cá).
    if (url.searchParams.get("config") === "1") {
      const uResp = await rest(
        `usuarios?rastreio_token=eq.${encodeURIComponent(token)}&select=id,nome&limit=1`,
      );
      const us = await uResp.json();
      if (!Array.isArray(us) || us.length === 0) return json({ error: "token invalido" }, 403);
      const nome = (us[0].nome || "TM").toString().trim();
      const tid = (nome.replace(/[^A-Za-zÀ-ÿ]/g, "").slice(0, 2) || "TM").toUpperCase();
      const endpoint = `${SUPA_URL}/functions/v1/owntracks-position?token=${encodeURIComponent(token)}`;
      return json({
        _type: "configuration",
        mode: 3,               // HTTP
        url: endpoint,
        auth: false,
        tid,
        deviceId: "telemim",
        clientId: String(us[0].id).slice(0, 8),
        // Rastreio mais fino durante a mudança (mantém boa economia de bateria):
        locatorInterval: 20,          // segundos entre tentativas de fix
        locatorDisplacement: 25,      // metros mínimos p/ registrar novo ponto (trajeto mais detalhado)
        ignoreInaccurateLocations: 100, // descarta fix com precisão pior que 100 m (menos "zigue-zague")
        monitoring: 1,                // significant changes (bom em background)
        pubExtendedData: true,        // envia bateria (batt) e precisão (acc) no payload
        cmd: false,
      });
    }

    // OwnTracks envia _type=location; ignora transition/waypoint/lwt/etc.
    let payload: any = {};
    try { payload = await req.json(); } catch (_) { payload = {}; }
    if (payload._type && payload._type !== "location") return json([]);

    const lat = payload.lat, lon = payload.lon;
    if (typeof lat !== "number" || typeof lon !== "number") {
      // Sem coordenadas válidas — nada a gravar, mas responde ok pro app.
      return json([]);
    }

    // 1) Resolve motorista pelo token
    const uResp = await rest(
      `usuarios?rastreio_token=eq.${encodeURIComponent(token)}&select=id&limit=1`,
    );
    const users = await uResp.json();
    if (!Array.isArray(users) || users.length === 0) {
      return json({ error: "token invalido" }, 403);
    }
    const motoristaId = users[0].id;

    // 2) Resolve agenda ativa (pode ser null = heartbeat)
    let agendaId: number | null = null;
    try {
      const aResp = await rest(
        `rpc/rastreio_agenda_ativa`,
        { method: "POST", body: JSON.stringify({ p_mid: motoristaId }) },
      );
      if (aResp.ok) {
        const a = await aResp.json();
        if (typeof a === "number") agendaId = a;
      }
    } catch (_) { /* heartbeat */ }

    // 3) Grava a posição
    const row: Record<string, unknown> = {
      motorista_id: motoristaId,
      agenda_id: agendaId,
      lat,
      lng: lon,
      heading: typeof payload.cog === "number" ? payload.cog : null,
      speed: typeof payload.vel === "number" ? payload.vel : null,
    };
    if (typeof payload.tst === "number") {
      row.created_at = new Date(payload.tst * 1000).toISOString();
    }

    const ins = await rest(`gps_tracking`, {
      method: "POST",
      headers: { "Prefer": "return=minimal" },
      body: JSON.stringify(row),
    });
    if (!ins.ok) {
      const t = await ins.text();
      return json({ error: "falha ao gravar", detail: t }, 500);
    }

    // OwnTracks espera um array (comandos/friends). Vazio = ok.
    return json([]);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
