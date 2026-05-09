import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const TRACCAR_URL = "http://64.181.190.173:8082";
const TRACCAR_USER = "falejr@gmail.com";
const TRACCAR_PASS = "170604";
const AUTH = "Basic " + btoa(TRACCAR_USER + ":" + TRACCAR_PASS);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { deviceId } = await req.json();

    if (!deviceId) {
      return new Response(JSON.stringify({ error: "deviceId obrigatorio" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Get device info
    const devResp = await fetch(`${TRACCAR_URL}/api/devices?uniqueId=${deviceId}`, {
      headers: { "Authorization": AUTH },
    });
    const devices = await devResp.json();
    if (!devices || devices.length === 0) {
      // Auto-create device in Traccar
      try {
        await fetch(`${TRACCAR_URL}/api/devices`, {
          method: "POST",
          headers: { "Authorization": AUTH, "Content-Type": "application/json" },
          body: JSON.stringify({ name: deviceId, uniqueId: deviceId }),
        });
      } catch (_) {}
      return new Response(JSON.stringify({ ok: true, position: null, status: "new", message: "Dispositivo criado, aguardando primeira posicao" }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const device = devices[0];
    if (!device.positionId || device.positionId === 0) {
      return new Response(JSON.stringify({ ok: true, position: null, status: device.status }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Get latest position
    const posResp = await fetch(`${TRACCAR_URL}/api/positions?deviceId=${device.id}`, {
      headers: { "Authorization": AUTH },
    });
    const positions = await posResp.json();
    const pos = positions && positions.length > 0 ? positions[0] : null;

    return new Response(JSON.stringify({
      ok: true,
      status: device.status,
      position: pos ? {
        lat: pos.latitude,
        lng: pos.longitude,
        speed: pos.speed,
        course: pos.course,
        battery: pos.attributes?.batteryLevel || null,
        time: pos.deviceTime,
      } : null,
    }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
