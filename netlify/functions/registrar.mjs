// Registra que um visitante assistiu a um dorama (contagem compartilhada entre todos os visitantes).
import { getStore } from "@netlify/blobs";

const TMDB_KEY = process.env.TMDB_KEY || "";
const PAISES_DORAMA = new Set(["KR", "JP", "CN", "TW", "TH", "HK"]);

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Método não permitido", { status: 405 });
  }

  let titulo = "";
  try {
    ({ titulo } = await req.json());
  } catch {}
  titulo = String(titulo || "").trim().slice(0, 100);
  if (titulo.length < 2 || !TMDB_KEY) return Response.json({ ok: false });

  try {
    // Descobre qual dorama é, para juntar buscas diferentes do mesmo título
    const u = new URL("https://api.themoviedb.org/3/search/tv");
    u.searchParams.set("api_key", TMDB_KEY);
    u.searchParams.set("query", titulo);
    u.searchParams.set("language", "pt-BR");
    const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
    const dados = await r.json();

    const ehAnime = (x) =>
      (x.genre_ids || []).includes(16) && (x.origin_country || []).includes("JP");
    const ehDorama = (x) =>
      (x.origin_country || []).some((p) => PAISES_DORAMA.has(p)) &&
      !(x.genre_ids || []).includes(16);

    const s = (dados.results || []).find((x) => ehAnime(x) || ehDorama(x));
    if (!s || !(s.backdrop_path || s.poster_path)) return Response.json({ ok: false });

    const store = getStore("doramas");
    const chave = `${ehAnime(s) ? "a" : "d"}-${s.id}`;
    const atual = (await store.get(chave, { type: "json" })) || {};

    await store.setJSON(chave, {
      id: s.id,
      titulo: s.name || s.original_name,
      imagem: s.backdrop_path
        ? "https://image.tmdb.org/t/p/w780" + s.backdrop_path
        : "https://image.tmdb.org/t/p/w500" + s.poster_path,
      ano: (s.first_air_date || "").slice(0, 4),
      nota: s.vote_average ? Math.round(s.vote_average * 10) / 10 : null,
      vistas: (atual.vistas || 0) + 1,
      atualizadoEm: Date.now(),
    });
    return Response.json({ ok: true });
  } catch (e) {
    console.log("⚠️ Erro ao registrar visualização:", e);
    return Response.json({ ok: false });
  }
};

export const config = { path: "/registrar" };
