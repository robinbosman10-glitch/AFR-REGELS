const OWNER_ID = "424086753327054849";
const GITHUB_REPOSITORY = "robinbosman10-glitch/AFR-REGELS";
const GITHUB_BRANCH = "main";
const SITE_URL = "https://afrroleplay-apv.nl";

const PAGE_FILES: Record<string, string> = {
  home: "content/index.md",
  informatie: "content/informatie.md",
  apv: "content/apv.md",
  wetboek: "content/wetboek.md",
  onderwereld: "content/onderwereldregels.md",
  hulpdiensten: "content/hulpdienstenregels.md",
  risico: "content/risicogebieden.md",
  wijzigingen: "content/wijzigingen.md",
};

const PAGE_NAMES: Record<string, string> = {
  home: "Home",
  informatie: "Informatie",
  apv: "Algemene Plaatselijke Verordening",
  wetboek: "Wetboek AFR",
  onderwereld: "Onderwereld Regels",
  hulpdiensten: "Hulpdiensten Regels",
  risico: "Risicogebieden",
  wijzigingen: "Wijzigingen",
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function ephemeral(content: string) {
  return { type: 4, data: { content, flags: 64 } };
}

function hexToBytes(hex: string, expectedBytes: number) {
  if (!/^[a-f0-9]+$/i.test(hex) || hex.length !== expectedBytes * 2) {
    throw new Error("Ongeldige Discord-handtekening");
  }
  return Uint8Array.from(hex.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
}

async function verifyDiscordRequest(request: Request, rawBody: string) {
  const publicKeyHex = Deno.env.get("DISCORD_PUBLIC_KEY") ?? "";
  const signatureHex = request.headers.get("x-signature-ed25519") ?? "";
  const timestamp = request.headers.get("x-signature-timestamp") ?? "";
  if (!publicKeyHex || !signatureHex || !timestamp) return false;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      hexToBytes(publicKeyHex, 32),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      hexToBytes(signatureHex, 64),
      encoder.encode(timestamp + rawBody),
    );
  } catch (_error) {
    return false;
  }
}

function actorId(interaction: any) {
  return String(interaction.member?.user?.id ?? interaction.user?.id ?? "");
}

function commandPage(interaction: any) {
  const option = interaction.data?.options?.find((item: any) => item.name === "pagina");
  return String(option?.value ?? "");
}

function modalValues(interaction: any) {
  const values: Record<string, string> = {};
  const walk = (components: any[]) => {
    for (const component of components ?? []) {
      if (component.custom_id && typeof component.value === "string") {
        values[component.custom_id] = component.value;
      }
      if (Array.isArray(component.components)) walk(component.components);
    }
  };
  walk(interaction.data?.components ?? []);
  return values;
}

function articleModal(page: string) {
  return {
    type: 9,
    data: {
      custom_id: `afr_article:${page}`,
      title: `Artikel toevoegen • ${PAGE_NAMES[page]}`.slice(0, 45),
      components: [
        {
          type: 1,
          components: [{
            type: 4,
            custom_id: "article_code",
            label: "Artikelnummer",
            style: 1,
            min_length: 1,
            max_length: 60,
            required: true,
            placeholder: page === "onderwereld" ? "Bijvoorbeeld: 149.OW" : "Bijvoorbeeld: Artikel 12",
          }],
        },
        {
          type: 1,
          components: [{
            type: 4,
            custom_id: "article_title",
            label: "Naam van het artikel",
            style: 1,
            min_length: 2,
            max_length: 160,
            required: true,
            placeholder: "Korte en duidelijke artikelnaam",
          }],
        },
        {
          type: 1,
          components: [{
            type: 4,
            custom_id: "article_category",
            label: "Categorie of straf (optioneel)",
            style: 1,
            max_length: 120,
            required: false,
            placeholder: "Bijvoorbeeld: Categorie 2",
          }],
        },
        {
          type: 1,
          components: [{
            type: 4,
            custom_id: "article_content",
            label: "Artikeltekst",
            style: 2,
            min_length: 5,
            max_length: 4000,
            required: true,
            placeholder: "Schrijf hier de volledige regel. Markdown is toegestaan.",
          }],
        },
        {
          type: 1,
          components: [{
            type: 4,
            custom_id: "article_confirm",
            label: "Typ PUBLICEREN om te bevestigen",
            style: 1,
            min_length: 10,
            max_length: 10,
            required: true,
            placeholder: "PUBLICEREN",
          }],
        },
      ],
    },
  };
}

function decodeBase64(value: string) {
  const binary = atob(value.replace(/\s/g, ""));
  return decoder.decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

function encodeBase64(value: string) {
  const bytes = encoder.encode(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function normalizeCode(value: string, page: string) {
  let code = value.replace(/\s+/g, " ").trim().replace(/\.0W\b/gi, ".OW");
  if (!/^artikel\s+/i.test(code)) code = `Artikel ${code}`;
  if (page === "onderwereld" && !/\.OW$/i.test(code)) code += ".OW";
  return code.replace(/^artikel/i, "Artikel");
}

function slug(value: string) {
  return value.toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function updateOriginal(interaction: any, payload: unknown) {
  const url = `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`;
  await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function publishArticle(interaction: any, page: string, values: Record<string, string>) {
  try {
    const githubToken = Deno.env.get("GITHUB_TOKEN");
    if (!githubToken) throw new Error("GITHUB_TOKEN ontbreekt in Supabase Secrets");

    const filePath = PAGE_FILES[page];
    if (!filePath) throw new Error("Onbekende regelpagina");

    const articleCode = normalizeCode(values.article_code ?? "", page);
    const articleTitle = (values.article_title ?? "").replace(/[\r\n]+/g, " ").trim();
    const articleContent = (values.article_content ?? "").trim();
    const category = (values.article_category ?? "").replace(/[\r\n]+/g, " ").trim();
    if (!articleCode || !articleTitle || !articleContent) throw new Error("Niet alle verplichte velden zijn ingevuld");

    const apiUrl = `https://api.github.com/repos/${GITHUB_REPOSITORY}/contents/${filePath}`;
    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "AFR-Discord-Article-Bot/1.0",
    };

    const currentResponse = await fetch(`${apiUrl}?ref=${GITHUB_BRANCH}`, { headers });
    if (!currentResponse.ok) throw new Error("De regelpagina kon niet uit GitHub worden opgehaald");
    const currentFile = await currentResponse.json();
    const currentMarkdown = decodeBase64(currentFile.content ?? "");

    const duplicatePattern = new RegExp(`^#{1,6}\\s+\\*{0,2}${articleCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "im");
    if (duplicatePattern.test(currentMarkdown)) {
      throw new Error(`${articleCode} bestaat al op ${PAGE_NAMES[page]}`);
    }

    const categoryLine = category ? `\n\n**Categorie / straf:** ${category}` : "";
    const addition = `\n\n### ${articleCode} - ${articleTitle}${categoryLine}\n\n${articleContent}\n`;
    const updatedMarkdown = currentMarkdown.trimEnd() + addition;

    const updateResponse = await fetch(apiUrl, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: `Add ${articleCode} via Discord`,
        content: encodeBase64(updatedMarkdown),
        sha: currentFile.sha,
        branch: GITHUB_BRANCH,
      }),
    });
    if (!updateResponse.ok) {
      const details = await updateResponse.text();
      throw new Error(`Publiceren naar GitHub is mislukt (${updateResponse.status}): ${details.slice(0, 180)}`);
    }

    const articleId = slug(`${articleCode} - ${articleTitle}`);
    const articleUrl = `${SITE_URL}/?artikel=${encodeURIComponent(articleId)}#${page}`;
    await updateOriginal(interaction, {
      content: "",
      embeds: [{
        color: 1230836,
        author: { name: "AFR CONTROL • REGELGEVING", icon_url: `${SITE_URL}/logo.png` },
        title: `${articleCode} gepubliceerd`,
        url: articleUrl,
        description: `**${articleTitle}**\n\nHet artikel is veilig toegevoegd aan **${PAGE_NAMES[page]}**.`,
        fields: [
          { name: "PAGINA", value: PAGE_NAMES[page], inline: true },
          { name: "STATUS", value: "🟢 Gepubliceerd", inline: true },
          ...(category ? [{ name: "CATEGORIE / STRAF", value: category, inline: false }] : []),
        ],
        thumbnail: { url: `${SITE_URL}/logo.png` },
        footer: { text: "AmersfoortRolePlay • Discord artikelbeheer" },
        timestamp: new Date().toISOString(),
      }],
      components: [{
        type: 1,
        components: [{ type: 2, style: 5, label: "Open het artikel", url: articleUrl }],
      }],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende fout";
    await updateOriginal(interaction, {
      content: `❌ **Artikel niet gepubliceerd**\n${message}`,
      embeds: [],
      components: [],
    });
  }
}

Deno.serve(async (request) => {
  if (request.method === "GET") {
    return json({ ok: true, service: "AFR Discord article bot" });
  }
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const rawBody = await request.text();
  if (!(await verifyDiscordRequest(request, rawBody))) {
    return new Response("Invalid request signature", { status: 401 });
  }

  let interaction: any;
  try {
    interaction = JSON.parse(rawBody);
  } catch (_error) {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (interaction.type === 1) return json({ type: 1 });
  if (actorId(interaction) !== OWNER_ID) {
    return json(ephemeral("⛔ Alleen de AFR-owner mag via Discord artikelen publiceren."));
  }

  if (interaction.type === 2 && interaction.data?.name === "artikel-toevoegen") {
    const page = commandPage(interaction);
    if (!PAGE_FILES[page]) return json(ephemeral("Deze regelpagina bestaat niet."));
    return json(articleModal(page));
  }

  if (interaction.type === 5 && String(interaction.data?.custom_id ?? "").startsWith("afr_article:")) {
    const page = String(interaction.data.custom_id).split(":")[1] ?? "";
    const values = modalValues(interaction);
    if (!PAGE_FILES[page]) return json(ephemeral("Deze regelpagina bestaat niet."));
    if ((values.article_confirm ?? "").trim().toUpperCase() !== "PUBLICEREN") {
      return json(ephemeral("Publicatie geannuleerd: typ exact `PUBLICEREN` in het laatste veld."));
    }

    (globalThis as any).EdgeRuntime.waitUntil(publishArticle(interaction, page, values));
    return json({ type: 5, data: { flags: 64 } });
  }

  return json(ephemeral("Onbekende Discord-opdracht."));
});
