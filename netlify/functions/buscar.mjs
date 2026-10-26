// Busca de episódios de doramas no YouTube e Dailymotion (antigo backend em Python/FastAPI).

const YOUTUBE_KEY = process.env.YOUTUBE_KEY || "";
const TMDB_KEY = process.env.TMDB_KEY || "";

const YT_BUSCA = "https://www.googleapis.com/youtube/v3/search";
const YT_VIDEOS = "https://www.googleapis.com/youtube/v3/videos";
const TMDB = "https://api.themoviedb.org/3";
const DM_BUSCA = "https://api.dailymotion.com/videos";

const PAISES_DORAMA = new Set(["KR", "JP", "CN", "TW", "TH", "HK"]);

// Duração mínima (em minutos) para aceitar um vídeo
const MINUTOS_MINIMOS = 10;

const PALAVRAS_RUINS = [
  "ost", "mv", "music video", "lyrics", "karaoke", "cover", "reaction",
  "react", "tiktok", "edit", "status", "whatsapp", "shorts", "#shorts",
  "meme", "funny", "tutorial", "unboxing", "review", "ranking", "top 10",
  "top 5", "behind the scenes", "making", "interview", "fancam",
  "compilation", "mashup", "slowed", "reverb", "remix", "trailer",
  "teaser", "preview", "recap", "resumo", "highlights", "best moments",
];

const PALAVRAS_BOAS = [
  "ep", "episode", "episódio", "episodio", "capítulo", "capitulo",
  "full", "completo", "eng sub", "legendado", "sub indo", "dorama",
  "drama", "kdrama", "k-drama", "cdrama", "jdrama",
  "dublado", "pt-br", "português", "portugues", "anime",
];

const CANAIS_BONS = [
  "netflix", "viki", "kocowa", "iqiyi", "wetv", "kbs", "sbs", "mbc",
  "tvn", "jtbc", "ena", "cj enm", "asian drama", "kdrama", "k-drama",
  "dorama", "drama", "crunchyroll", "muse", "ani-one", "anime",
];

// Canais e serviços oficiais: ganham destaque (✔) e mais pontos
const CANAIS_OFICIAIS = [
  "netflix", "viki", "kocowa", "iqiyi", "wetv", "kbs", "sbs", "mbc", "tvn",
  "jtbc", "cj enm", "crunchyroll", "muse", "ani-one", "bilibili", "gmm",
  "tv asahi", "nippon tv", "toei animation", "kadokawa",
];

const TIMEOUT_MS = 10000;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function getJson(url, params, opcoes = {}) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, v);
  const r = await fetch(u, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "User-Agent": UA, Accept: "application/json" },
    ...opcoes,
  });
  const texto = await r.text();
  let dados;
  try {
    dados = JSON.parse(texto);
  } catch {
    throw new Error(`HTTP ${r.status} de ${u.hostname}: ${texto.slice(0, 200)}`);
  }
  if (!r.ok && !dados.error) dados.error = { message: `HTTP ${r.status}` };
  return dados;
}

function normalizar(texto) {
  let t = (texto || "").normalize("NFKD").replace(/\p{M}/gu, "");
  t = t.toLowerCase().replace(/[^\p{L}\p{N}_\s]/gu, " ");
  return t.replace(/\s+/g, " ").trim();
}

// Compara por palavras inteiras (evita "ena" casar com "Lena", por exemplo).
function ehOficial(canal) {
  const c = " " + normalizar(canal) + " ";
  return CANAIS_OFICIAIS.some((o) => c.includes(" " + normalizar(o) + " "));
}

function duracaoEmMinutos(iso) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "");
  if (!m) return 0;
  const [h, mi, s] = m.slice(1).map((x) => (x ? parseInt(x, 10) : 0));
  return h * 60 + mi + s / 60;
}

// Converte durações no formato '1:05:20' ou '45:10' para minutos.
function duracaoTextoEmMinutos(textoDuracao) {
  if (!textoDuracao) return 0;
  const partes = (textoDuracao.match(/\d+/g) || []).map(Number);
  if (partes.length === 3) return partes[0] * 60 + partes[1] + partes[2] / 60;
  if (partes.length === 2) return partes[0] + partes[1] / 60;
  return 0;
}

// Procura palavras ruins como palavras inteiras.
function temPalavraRuim(titulo) {
  const t = " " + normalizar(titulo) + " ";
  return PALAVRAS_RUINS.some((p) => {
    const pn = normalizar(p);
    return pn && t.includes(" " + pn + " ");
  });
}

function pontuar(titulo, canal, minutos) {
  const t = titulo.toLowerCase();
  const c = canal.toLowerCase();
  let pontos = 1; // Ponto base se já passou pelos filtros de nome, duração e palavras ruins
  if (PALAVRAS_BOAS.some((p) => t.includes(p))) pontos += 3;
  if (ehOficial(canal)) pontos += 5;
  else if (CANAIS_BONS.some((p) => c.includes(p))) pontos += 2;
  if (minutos >= 30) pontos += 3;
  else if (minutos >= 15) pontos += 2;
  return pontos;
}

function arredondar(minutos) {
  return Math.round(minutos * 10) / 10;
}

async function acharDorama(consulta) {
  if (!TMDB_KEY) return null;
  try {
    const dados = await getJson(TMDB + "/search/tv", {
      api_key: TMDB_KEY, query: consulta, language: "pt-BR",
    });
    const resultados = dados.results || [];
    const escolhido = resultados.find((s) =>
      (s.origin_country || []).some((p) => PAISES_DORAMA.has(p))
    );
    if (!escolhido) return null;

    const tvId = escolhido.id;
    const nomes = new Set([escolhido.name || "", escolhido.original_name || "", consulta]);

    const [alt, en] = await Promise.all([
      getJson(TMDB + `/tv/${tvId}/alternative_titles`, { api_key: TMDB_KEY }),
      getJson(TMDB + `/tv/${tvId}`, { api_key: TMDB_KEY, language: "en-US" }),
    ]);
    for (const t of alt.results || []) nomes.add(t.title || "");
    nomes.add(en.name || "");

    return {
      id: tvId,
      nome: escolhido.name || escolhido.original_name,
      nomes: [...nomes].filter((n) => n && normalizar(n).length >= 2),
    };
  } catch (e) {
    console.log("⚠️ Erro ao consultar TMDB:", e);
    return null;
  }
}

function tituloCombina(tituloVideo, nomes) {
  const tv = normalizar(tituloVideo);
  for (const n of nomes) {
    const nn = normalizar(n);
    if (!nn) continue;
    if (tv.includes(nn)) return true;
    const palavras = nn.split(" ").filter((p) => p.length > 2);
    if (palavras.length > 1 && palavras.every((p) => tv.includes(p))) return true;
  }
  return false;
}

// Cache simples enquanto a instância da função estiver ativa
const cacheTermos = new Map();

async function prepararTermos(titulo) {
  if (cacheTermos.has(titulo)) return cacheTermos.get(titulo);

  const resultadoTmdb = await acharDorama(titulo);
  const nomeDorama = resultadoTmdb ? resultadoTmdb.nome : titulo;
  const nomesAlternativos = resultadoTmdb ? resultadoTmdb.nomes : [titulo];

  const termosBusca = [
    `${nomeDorama} episode 1`,
    `${nomeDorama} legendado`,
    `${nomeDorama} eng sub`,
    `${nomeDorama} dublado pt-br`,
  ];
  const resultado = { termos: termosBusca, nomes: nomesAlternativos };
  if (cacheTermos.size >= 100) cacheTermos.delete(cacheTermos.keys().next().value);
  cacheTermos.set(titulo, resultado);
  return resultado;
}

function aceitarVideo(titulo, nomes, minutos) {
  return minutos >= MINUTOS_MINIMOS && !temPalavraRuim(titulo) && tituloCombina(titulo, nomes);
}

// Busca diretamente no YouTube caso a chave da API atinja o limite de cota.
async function buscarYoutubeWebFallback(termo, nomes, achados) {
  try {
    const u = new URL("https://www.youtube.com/results");
    u.searchParams.set("search_query", termo);
    const r = await fetch(u, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });
    const html = await r.text();
    const m = /var ytInitialData = (\{.*?\});<\/script>/s.exec(html);
    if (!m) return;

    const dados = JSON.parse(m[1]);
    const conteudos =
      dados?.contents?.twoColumnSearchResultsRenderer?.primaryContents
        ?.sectionListRenderer?.contents || [];

    for (const secao of conteudos) {
      for (const item of secao?.itemSectionRenderer?.contents || []) {
        const v = item.videoRenderer;
        if (!v) continue;

        const vidId = v.videoId;
        const titulo = v.title?.runs?.[0]?.text || "";
        const canal = v.ownerText?.runs?.[0]?.text || "";
        const minutos = duracaoTextoEmMinutos(v.lengthText?.simpleText || "");

        if (!aceitarVideo(titulo, nomes, minutos)) continue;

        const thumbs = v.thumbnail?.thumbnails || [];
        achados.set(vidId, {
          id: vidId,
          titulo,
          canal,
          minutos: arredondar(minutos),
          miniatura: thumbs.length
            ? thumbs[thumbs.length - 1].url
            : `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`,
          pontos: pontuar(titulo, canal, minutos),
          oficial: ehOficial(canal),
          plataforma: "youtube",
        });
      }
    }
  } catch (e) {
    console.log("⚠️ Erro no fallback do YouTube:", e);
  }
}

async function buscarYoutube(termos, nomes) {
  const achados = new Map();
  let usarFallback = !YOUTUBE_KEY;

  for (const termo of termos) {
    if (usarFallback) {
      await buscarYoutubeWebFallback(termo, nomes, achados);
      continue;
    }

    try {
      const dados = await getJson(YT_BUSCA, {
        part: "snippet",
        q: termo,
        type: "video",
        videoEmbeddable: "true",
        key: YOUTUBE_KEY,
        maxResults: 15,
        relevanceLanguage: "pt",
        regionCode: "BR",
      });
      if (dados.error) {
        console.log("⚠️ Aviso API YouTube (usando modo alternativo):", dados.error.message);
        usarFallback = true;
        await buscarYoutubeWebFallback(termo, nomes, achados);
        continue;
      }

      const videoIds = (dados.items || []).map((i) => i.id?.videoId).filter(Boolean);
      if (!videoIds.length) continue;

      const vids = await getJson(YT_VIDEOS, {
        part: "contentDetails,snippet",
        id: videoIds.join(","),
        key: YOUTUBE_KEY,
      });

      for (const v of vids.items || []) {
        const titulo = v.snippet.title;
        const canal = v.snippet.channelTitle;
        const minutos = duracaoEmMinutos(v.contentDetails.duration);

        if (!aceitarVideo(titulo, nomes, minutos)) continue;

        achados.set(v.id, {
          id: v.id,
          titulo,
          canal,
          minutos: arredondar(minutos),
          miniatura: v.snippet.thumbnails?.medium?.url || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
          pontos: pontuar(titulo, canal, minutos),
          oficial: ehOficial(canal),
          plataforma: "youtube",
        });
      }
    } catch (e) {
      console.log("⚠️ Falha na conexão com YouTube API:", e);
      await buscarYoutubeWebFallback(termo, nomes, achados);
    }
  }

  console.log(`✅ YouTube retornou ${achados.size} vídeos.`);
  return [...achados.values()];
}

async function buscarDailymotion(termos, nomes) {
  const achados = new Map();
  await Promise.all(
    termos.map(async (termo) => {
      try {
        const dados = await getJson(DM_BUSCA, {
          search: termo,
          fields: "id,title,owner.username,duration,thumbnail_720_url,allow_embed",
          limit: 15,
        });
        if (dados.error) {
          console.log("⚠️ Dailymotion respondeu com erro:", JSON.stringify(dados.error));
          return;
        }
        for (const v of dados.list || []) {
          if (v.allow_embed === false) continue; // não pode ser tocado dentro do site
          const titulo = v.title || "";
          const canal = v["owner.username"] || "";
          const minutos = (v.duration || 0) / 60;

          if (!aceitarVideo(titulo, nomes, minutos)) continue;

          achados.set(v.id, {
            id: v.id,
            titulo,
            canal,
            minutos: arredondar(minutos),
            miniatura: v.thumbnail_720_url || "https://via.placeholder.com/640x360?text=Sem+Capa",
            pontos: pontuar(titulo, canal, minutos),
          oficial: ehOficial(canal),
            plataforma: "dailymotion",
          });
        }
      } catch (e) {
        console.log("⚠️ Falha na conexão com Dailymotion:", e);
      }
    })
  );

  console.log(`✅ Dailymotion retornou ${achados.size} vídeos.`);
  return [...achados.values()];
}

const AR_BUSCA = "https://archive.org/advancedsearch.php";

function minutosArchive(runtime) {
  if (!runtime) return 0;
  const txt = String(Array.isArray(runtime) ? runtime[0] : runtime);
  if (txt.includes(":")) return duracaoTextoEmMinutos(txt);
  const n = parseFloat(txt);
  return Number.isFinite(n) ? n : 0; // número solto = minutos
}

async function buscarArchive(nomes) {
  const achados = new Map();
  const nomesBusca = [
    ...new Set(nomes.map((n) => n.replace(/["\\]/g, " ").trim()).filter((n) => n.length >= 2)),
  ].slice(0, 4);
  if (!nomesBusca.length) return [];

  try {
    const u = new URL(AR_BUSCA);
    u.searchParams.set(
      "q",
      `(${nomesBusca.map((n) => `title:"${n}"`).join(" OR ")}) AND mediatype:movies`
    );
    for (const f of ["identifier", "title", "creator", "runtime"]) u.searchParams.append("fl[]", f);
    u.searchParams.set("rows", "20");
    u.searchParams.set("output", "json");
    u.searchParams.set("sort[]", "downloads desc");

    const r = await fetch(u, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    const dados = await r.json();

    for (const d of dados?.response?.docs || []) {
      const titulo = String(Array.isArray(d.title) ? d.title[0] : d.title || "");
      const canal = String(Array.isArray(d.creator) ? d.creator[0] : d.creator || "Internet Archive");
      const minutos = minutosArchive(d.runtime);

      // Sem duração informada (0) também é aceito: muitos itens do Archive não trazem esse dado.
      if (minutos !== 0 && minutos < MINUTOS_MINIMOS) continue;
      if (temPalavraRuim(titulo) || !tituloCombina(titulo, nomes)) continue;

      achados.set(d.identifier, {
        id: d.identifier,
        titulo,
        canal,
        minutos: arredondar(minutos),
        miniatura: `https://archive.org/services/img/${d.identifier}`,
        pontos: pontuar(titulo, canal, minutos),
        oficial: false,
        plataforma: "archive",
      });
    }
  } catch (e) {
    console.log("⚠️ Falha na conexão com Internet Archive:", e);
  }

  console.log(`✅ Internet Archive retornou ${achados.size} vídeos.`);
  return [...achados.values()];
}

export default async (req) => {
  const url = new URL(req.url);
  const titulo = (url.searchParams.get("titulo") || "").trim();
  if (!titulo) {
    return Response.json({ erro: "Parâmetro 'titulo' é obrigatório." }, { status: 400 });
  }

  if (url.searchParams.get("debug") === "1") {
    const u = new URL(DM_BUSCA);
    u.searchParams.set("search", titulo);
    u.searchParams.set("fields", "id,title,allow_embed");
    u.searchParams.set("limit", "3");
    const r = await fetch(u, { headers: { "User-Agent": UA, Accept: "application/json" } });
    return Response.json({ status: r.status, corpo: (await r.text()).slice(0, 500) });
  }

  const { termos, nomes } = await prepararTermos(titulo);
  const rota = url.pathname.replace(/\/+$/, "");

  let videos;
  if (rota === "/buscar/youtube") {
    videos = await buscarYoutube(termos, nomes);
  } else if (rota === "/buscar/dailymotion") {
    videos = await buscarDailymotion(termos, nomes);
  } else if (rota === "/buscar/archive") {
    videos = await buscarArchive(nomes);
  } else {
    // Rota unificada caso o app.js antigo seja usado
    const [yt, dm, ar] = await Promise.all([
      buscarYoutube(termos, nomes), buscarDailymotion(termos, nomes), buscarArchive(nomes),
    ]);
    videos = [...yt, ...dm, ...ar].sort((a, b) => b.pontos - a.pontos);
  }

  return Response.json(videos, { headers: { "Access-Control-Allow-Origin": "*" } });
};

export const config = {
  path: ["/buscar", "/buscar/youtube", "/buscar/dailymotion", "/buscar/archive"],
};
