// Top 10 da página inicial: popularidade no TMDB + o que os visitantes do site realmente assistiram.
import { getStore } from "@netlify/blobs";

const TMDB_KEY = process.env.TMDB_KEY || "";

// Cada visualização no site vale 3 pontos; o TMDB dá de 20 (1º) a 1 ponto (20º).
const PONTOS_POR_VISTA = 3;

async function doTmdb(anime) {
  if (!TMDB_KEY) return [];
  try {
    const u = new URL("https://api.themoviedb.org/3/discover/tv");
    u.searchParams.set("api_key", TMDB_KEY);
    u.searchParams.set("language", "pt-BR");
    u.searchParams.set("sort_by", "popularity.desc");
    if (anime) {
      u.searchParams.set("with_origin_country", "JP");
      u.searchParams.set("with_genres", "16"); // animação
      u.searchParams.set("vote_count.gte", "50");
    } else {
      u.searchParams.set("with_origin_country", "KR|CN|JP|TW|TH");
      // tira animações, reality, talk shows, notícias e infantis
      u.searchParams.set("without_genres", "16,10764,10767,10763,10762");
      u.searchParams.set("vote_count.gte", "20");
    }
    const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
    const dados = await r.json();
    return (dados.results || [])
      .filter((s) => s.backdrop_path || s.poster_path)
      .map((s) => ({
        id: s.id,
        titulo: s.name || s.original_name,
        imagem: s.backdrop_path
          ? "https://image.tmdb.org/t/p/w780" + s.backdrop_path
          : "https://image.tmdb.org/t/p/w500" + s.poster_path,
        ano: (s.first_air_date || "").slice(0, 4),
        nota: s.vote_average ? Math.round(s.vote_average * 10) / 10 : null,
      }));
  } catch (e) {
    console.log("⚠️ Erro no TMDB (Top 10):", e);
    return [];
  }
}

async function doSite(anime) {
  try {
    const store = getStore("doramas");
    const { blobs } = await store.list({ prefix: anime ? "a-" : "d-" });
    const itens = await Promise.all(
      blobs.slice(0, 200).map((b) => store.get(b.key, { type: "json" }).catch(() => null))
    );
    return itens.filter(Boolean);
  } catch (e) {
    console.log("⚠️ Erro ao ler visualizações do site:", e);
    return [];
  }
}

export default async (req) => {
  const anime = new URL(req.url).searchParams.get("tipo") === "anime";
  const [tmdb, site] = await Promise.all([doTmdb(anime), doSite(anime)]);

  const mapa = new Map();
  tmdb.slice(0, 20).forEach((d, i) => {
    mapa.set(d.id, { ...d, vistas: 0, pontos: 20 - i });
  });
  for (const s of site) {
    const extra = (s.vistas || 0) * PONTOS_POR_VISTA;
    const existente = mapa.get(s.id);
    if (existente) {
      existente.vistas = s.vistas || 0;
      existente.pontos += extra;
    } else {
      mapa.set(s.id, { ...s, pontos: extra });
    }
  }

  const lista = [...mapa.values()]
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, 10)
    .map(({ titulo, imagem, ano, nota, vistas }) => ({ titulo, imagem, ano, nota, vistas }));

  return Response.json(lista, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
};

export const config = { path: "/top10" };
