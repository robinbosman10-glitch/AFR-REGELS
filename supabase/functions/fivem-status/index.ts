const JOIN_CODE = "rlvgdj";
const JOIN_URL = "https://cfx.re/join/" + JOIN_CODE;
const LISTING_API = "https://servers-frontend.fivem.net/api/servers/single/" + JOIN_CODE;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=20, s-maxage=20",
  "Content-Type": "application/json; charset=utf-8",
};

const jsonResponse = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status: 200, headers: corsHeaders });

const offline = () =>
  jsonResponse({
    online: false,
    players: 0,
    maxPlayers: 0,
    joinUrl: JOIN_URL,
    updatedAt: new Date().toISOString(),
  });

function cleanNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

async function fetchFromConnectEndpoint() {
  const joinResponse = await fetch(JOIN_URL, {
    headers: { Accept: "text/html", "User-Agent": "AFR-Website-Status/2.0" },
    signal: AbortSignal.timeout(8000),
  });

  if (!joinResponse.ok) throw new Error("Cfx joinpagina niet bereikbaar");

  const endpointHeader = joinResponse.headers.get("x-citizenfx-url");
  const joinHtml = await joinResponse.text();
  const playerMatch = joinHtml.match(
    /<span class=["']players["']>\s*<span[^>]*>[\s\S]*?<\/span>\s*(\d+)\s*<\/span>/i,
  );
  const titleMatch = joinHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const joinPlayers = playerMatch ? cleanNumber(playerMatch[1]) : 0;
  const joinHostname = titleMatch
    ? titleMatch[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim()
    : "AmersfoortRolePlay";

  if (endpointHeader) {
    try {
      const endpoint = new URL(endpointHeader);
      if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
        throw new Error("Ongeldig connect endpoint");
      }
      const dynamicUrl = new URL("dynamic.json", endpoint);
      const dynamicResponse = await fetch(dynamicUrl, {
        headers: { Accept: "application/json", "User-Agent": "AFR-Website-Status/3.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (!dynamicResponse.ok) throw new Error("dynamic.json niet bereikbaar");

      const data = await dynamicResponse.json();
      return {
        online: true,
        players: cleanNumber(data.clients, joinPlayers),
        maxPlayers: cleanNumber(data.sv_maxclients),
        hostname: String(data.hostname ?? joinHostname),
        joinUrl: JOIN_URL,
        updatedAt: new Date().toISOString(),
      };
    } catch (_dynamicError) {
      // De Cfx-joinpagina blijft een betrouwbare fallback voor het live aantal.
    }
  }

  return {
    online: true,
    players: joinPlayers,
    maxPlayers: 0,
    hostname: joinHostname,
    joinUrl: JOIN_URL,
    updatedAt: new Date().toISOString(),
  };
}

async function fetchFromListing() {
  const response = await fetch(LISTING_API, {
    headers: { Accept: "application/json", "User-Agent": "AFR-Website-Status/2.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Cfx listing niet bereikbaar");

  const payload = await response.json();
  const data = payload?.Data ?? payload?.data ?? payload ?? {};
  const playerList = Array.isArray(data.players) ? data.players : [];

  return {
    online: true,
    players: cleanNumber(data.clients ?? data.selfReportedClients, playerList.length),
    maxPlayers: cleanNumber(
      data.sv_maxclients ?? data.vars?.sv_maxClients ?? data.vars?.sv_maxclients
    ),
    hostname: String(data.hostname ?? data.vars?.sv_projectName ?? "AmersfoortRolePlay"),
    joinUrl: JOIN_URL,
    updatedAt: new Date().toISOString(),
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "GET") {
    return jsonResponse({ online: false, error: "Method not allowed", joinUrl: JOIN_URL });
  }

  try {
    return jsonResponse(await fetchFromConnectEndpoint());
  } catch (_connectError) {
    try {
      return jsonResponse(await fetchFromListing());
    } catch (_listingError) {
      return offline();
    }
  }
});
