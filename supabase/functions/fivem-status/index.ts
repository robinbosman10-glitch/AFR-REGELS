const JOIN_CODE = "rlvgdj";
const JOIN_URL = "https://cfx.re/join/" + JOIN_CODE;
const SERVER_API = "https://servers-frontend.fivem.net/api/servers/single/" + JOIN_CODE;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=20, s-maxage=20",
  "Content-Type": "application/json; charset=utf-8",
};

const response = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status: 200, headers: corsHeaders });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "GET") {
    return response({ online: false, error: "Method not allowed", joinUrl: JOIN_URL });
  }

  try {
    const upstream = await fetch(SERVER_API, {
      headers: {
        Accept: "application/json",
        "User-Agent": "AFR-Website-Status/1.0",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!upstream.ok) {
      return response({
        online: false,
        players: 0,
        maxPlayers: 0,
        joinUrl: JOIN_URL,
        updatedAt: new Date().toISOString(),
      });
    }

    const payload = await upstream.json();
    const data = payload?.Data ?? payload?.data ?? payload ?? {};
    const playerList = Array.isArray(data.players) ? data.players : [];
    const players = Number(data.clients ?? data.selfReportedClients ?? playerList.length ?? 0);
    const maxPlayers = Number(
      data.sv_maxclients ??
      data.vars?.sv_maxClients ??
      data.vars?.sv_maxclients ??
      0
    );

    return response({
      online: true,
      players: Number.isFinite(players) ? players : playerList.length,
      maxPlayers: Number.isFinite(maxPlayers) ? maxPlayers : 0,
      hostname: String(data.hostname ?? data.vars?.sv_projectName ?? "AmersfoortRolePlay"),
      joinUrl: JOIN_URL,
      updatedAt: new Date().toISOString(),
    });
  } catch (_error) {
    return response({
      online: false,
      players: 0,
      maxPlayers: 0,
      joinUrl: JOIN_URL,
      updatedAt: new Date().toISOString(),
    });
  }
});
