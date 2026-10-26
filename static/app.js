const campo = document.getElementById("campo");
const botao = document.getElementById("botao");
const statusEl = document.getElementById("status");
const lista = document.getElementById("lista");
const tela = document.getElementById("tela");
const moldura = document.getElementById("moldura");
const telaTitulo = document.getElementById("tela-titulo");
const telaCanal = document.getElementById("tela-canal");
const filtros = document.getElementById("filtros");
const btnFiltros = document.querySelectorAll(".btn-filtro");
const secaoRetomar = document.getElementById("secao-retomar");
const listaRetomar = document.getElementById("lista-retomar");

let videosGlobais = [];

// ---------- Gestão do LocalStorage (Histórico e Favoritos) ----------
function obterHistorico() {
  try {
    const h = localStorage.getItem("doramas_historico");
    return h ? JSON.parse(h) : {};
  } catch (e) {
    return {};
  }
}

function salvarHistorico(id, dados) {
  let h = obterHistorico();
  h[id] = { ...dados, atualizadoEm: Date.now() };
  localStorage.setItem("doramas_historico", JSON.stringify(h));
  carregarContinuarAssistindo();
}

function removerDoHistorico(id, evento) {
  evento.stopPropagation();
  let h = obterHistorico();
  if (h[id]) {
    delete h[id];
    localStorage.setItem("doramas_historico", JSON.stringify(h));
    carregarContinuarAssistindo();
  }
}

function obterFavoritos() {
  try {
    const favs = localStorage.getItem("doramas_favoritos");
    return favs ? JSON.parse(favs) : [];
  } catch (e) {
    return [];
  }
}

function salvarFavoritos(favs) {
  localStorage.setItem("doramas_favoritos", JSON.stringify(favs));
}

// ---------- Utilitários ----------
function formatarDuracao(min) {
  if (!min) return "";
  if (min < 60) return min + " min";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h + "h" + (m < 10 ? "0" : "") + m;
}

// Limpa o título do vídeo para extrair o nome principal do dorama para novas buscas
function limparTituloParaBusca(titulo) {
  if (!titulo) return "";
  let limpo = titulo
    .replace(/ep\.?\s*\d+/gi, '')
    .replace(/epis[oó]dio\s*\d+/gi, '')
    .replace(/legendado/gi, '')
    .replace(/eng\s*sub/gi, '')
    .replace(/full\s*hd/gi, '')
    .replace(/[-|•|｜]/g, ' ')
    .trim();
  
  // Pega as primeiras palavras principais para garantir uma boa busca no TMDB/YouTube
  let palavras = limpo.split(/\s+/).slice(0, 4).join(' ');
  return palavras || titulo;
}

// ---------- Criador de Cartões ----------
function criarCard(v, isHistorico = false) {
  const card = document.createElement("div");
  card.className = "card";
  
  const favoritos = obterFavoritos();
  const ehFavorito = favoritos.includes(v.id);
  if (ehFavorito && !isHistorico) card.classList.add("visto");

  const thumb = document.createElement("div");
  thumb.className = "thumb";

  const img = document.createElement("img");
  const mini = v.miniatura || "";
  if (mini.includes("mqdefault")) {
    img.src = mini.replace("mqdefault", "hqdefault");
  } else {
    img.src = mini || "https://via.placeholder.com/640x360?text=Sem+Capa";
  }
  img.alt = v.titulo || "Dorama";
  img.loading = "lazy";

  const dur = document.createElement("div");
  dur.className = "duracao";
  dur.textContent = isHistorico ? "Retomar" : formatarDuracao(v.minutos);

  const play = document.createElement("div");
  play.className = "play";
  play.innerHTML = "<span>▶</span>";

  const platLogo = document.createElement("div");
  if (v.plataforma === "dailymotion") {
    platLogo.className = "tag-plataforma tag-dm";
    platLogo.textContent = "Dailymotion";
  } else {
    platLogo.className = "tag-plataforma tag-yt";
    platLogo.textContent = "YouTube";
  }

  thumb.appendChild(img);
  thumb.appendChild(dur);

  if (isHistorico) {
    const btnDel = document.createElement("button");
    btnDel.className = "btn-remover-historico";
    btnDel.innerHTML = "✕";
    btnDel.title = "Remover do histórico";
    btnDel.addEventListener("click", (e) => removerDoHistorico(v.id, e));
    thumb.appendChild(btnDel);
  } else {
    const btnFav = document.createElement("button");
    btnFav.className = "btn-favorito " + (ehFavorito ? "favorito" : "");
    btnFav.innerHTML = ehFavorito ? "★" : "☆";
    btnFav.title = ehFavorito ? "Remover dos vistos" : "Marcar como visto/favorito";

    btnFav.addEventListener("click", function (e) {
      e.stopPropagation();
      let favs = obterFavoritos();
      if (favs.includes(v.id)) {
        favs = favs.filter(id => id !== v.id);
        btnFav.classList.remove("favorito");
        btnFav.innerHTML = "☆";
        card.classList.remove("visto");
      } else {
        favs.push(v.id);
        btnFav.classList.add("favorito");
        btnFav.innerHTML = "★";
        card.classList.add("visto");
      }
      salvarFavoritos(favs);
    });
    thumb.appendChild(btnFav);
  }

  thumb.appendChild(platLogo);
  thumb.appendChild(play);

  const info = document.createElement("div");
  info.className = "info";

  const t = document.createElement("div");
  t.className = "titulo";
  t.textContent = v.titulo;

  const c = document.createElement("div");
  c.className = "canal";
  c.textContent = v.canal;

  info.appendChild(t);
  info.appendChild(c);

  card.appendChild(thumb);
  card.appendChild(info);
  card.addEventListener("click", function () { tocar(v); });
  return card;
}

// ---------- Carregar secção "Continuar a Assistir" ----------
function carregarContinuarAssistindo() {
  if (!secaoRetomar || !listaRetomar) return;
  
  const historico = obterHistorico();
  const chaves = Object.keys(historico);

  if (chaves.length === 0) {
    secaoRetomar.style.display = "none";
    return;
  }

  // Ordena do mais recentemente assistido para o mais antigo
  chaves.sort((a, b) => historico[b].atualizadoEm - historico[a].atualizadoEm);

  listaRetomar.innerHTML = "";
  // Mostra todo o histórico sem limitar, permitindo deslizar horizontalmente
  chaves.forEach(id => {
    listaRetomar.appendChild(criarCard(historico[id], true));
  });

  secaoRetomar.style.display = "block";
}

// ---------- Renderização da Lista de Resultados ----------
function renderizarLista(filtro) {
  lista.innerHTML = "";
  const favoritos = obterFavoritos();

  videosGlobais.forEach(v => {
    if (filtro === "todos") {
      lista.appendChild(criarCard(v));
    } else if (filtro === "favoritos") {
      if (favoritos.includes(v.id)) {
        lista.appendChild(criarCard(v));
      }
    } else if (v.plataforma === filtro) {
      lista.appendChild(criarCard(v));
    }
  });

  if (filtro === "favoritos" && lista.children.length === 0) {
    lista.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #a09abc; padding: 40px;">Ainda não marcou nenhum episódio como visto ou favorito.</div>`;
  }
}

btnFiltros.forEach(btn => {
  btn.addEventListener("click", function() {
    btnFiltros.forEach(b => b.classList.remove("ativo"));
    this.classList.add("ativo");
    renderizarLista(this.getAttribute("data-plataforma"));
  });
});

// ---------- Pesquisa Simultânea ----------
async function buscar() {
  const titulo = campo.value.trim();
  if (!titulo) return;

  let qtdYT = 0;
  let qtdDM = 0;
  let ytPronto = false;
  let dmPronto = false;
  videosGlobais = [];

  function atualizarStatus() {
    let icone = (ytPronto && dmPronto) ? '✅' : '<span class="spinner"></span>';
    let texto = (ytPronto && dmPronto) ? 'Busca concluída' : 'A vasculhar os catálogos...';
    
    statusEl.innerHTML = `
      <div class="status-painel">
        <div class="status-texto">
          ${icone} <span style="margin-left: 10px;">${texto}</span>
        </div>
        <div class="status-badges">
          <div class="badge-result yt"><span>▶</span> ${qtdYT} YouTube</div>
          <div class="badge-result dm"><span>d</span> ${qtdDM} Dailymotion</div>
        </div>
      </div>
    `;
  }

  atualizarStatus();

  tela.style.display = "none";
  moldura.innerHTML = "";
  lista.innerHTML = "";
  filtros.style.display = "none";
  if (secaoRetomar) secaoRetomar.style.display = "none";

  for (let i = 0; i < 6; i++) {
    const e = document.createElement("div");
    e.className = "esqueleto";
    lista.appendChild(e);
  }

  const pYT = fetch("/buscar/youtube?titulo=" + encodeURIComponent(titulo))
    .then(res => res.ok ? res.json() : [])
    .then(data => {
      if (Array.isArray(data)) {
        qtdYT = data.length;
        videosGlobais = videosGlobais.concat(data);
        videosGlobais.sort((a, b) => b.pontos - a.pontos);
      }
      ytPronto = true;
      atualizarStatus();
      if (videosGlobais.length > 0) renderizarLista("todos"); 
      filtros.style.display = "flex";
    })
    .catch(() => { ytPronto = true; atualizarStatus(); });

  const pDM = fetch("/buscar/dailymotion?titulo=" + encodeURIComponent(titulo))
    .then(res => res.ok ? res.json() : [])
    .then(data => {
      if (Array.isArray(data)) {
        qtdDM = data.length;
        videosGlobais = videosGlobais.concat(data);
        videosGlobais.sort((a, b) => b.pontos - a.pontos);
      }
      dmPronto = true;
      atualizarStatus();
      if (videosGlobais.length > 0) renderizarLista("todos");
      filtros.style.display = "flex"; 
    })
    .catch(() => { dmPronto = true; atualizarStatus(); });

  await Promise.all([pYT, pDM]);

  if (!videosGlobais.length) {
    statusEl.innerHTML = "Nenhum episódio encontrado ou erro de servidor. Tente outro nome.";
    filtros.style.display = "none";
    lista.innerHTML = "";
  }
}

// ---------- Reprodutor (Player) ----------
function tocar(v) {
  let src = "";
  const historico = obterHistorico();
  const progressoSalvo = historico[v.id] ? historico[v.id].tempo : 0;

  if (v.plataforma === "dailymotion") {
    src = `https://www.dailymotion.com/embed/video/${v.id}?autoplay=1`;
    if (progressoSalvo > 0) src += `&start=${Math.floor(progressoSalvo)}`;
  } else {
    src = `https://www.youtube.com/embed/${v.id}?autoplay=1&rel=0&playsinline=1&hl=pt-BR&cc_lang_pref=pt&cc_load_policy=1`;
    if (progressoSalvo > 0) src += `&start=${Math.floor(progressoSalvo)}`;
    if (location.origin && location.origin !== "null") {
      src += "&origin=" + encodeURIComponent(location.origin);
    }
  }

  moldura.innerHTML = "";
  if (v.plataforma === "dailymotion") {
    // Dailymotion bloqueia a incorporação: mostra capa e abre o vídeo em outra aba
    const link = `https://www.dailymotion.com/video/${v.id}`;
    const caixa = document.createElement("a");
    caixa.href = link;
    caixa.target = "_blank";
    caixa.rel = "noopener";
    caixa.style.cssText =
      "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;" +
      "text-decoration:none;color:#fff;text-align:center;padding:20px;" +
      (v.miniatura
        ? `background:linear-gradient(rgba(0,0,0,.55),rgba(0,0,0,.75)),url('${v.miniatura}') center/cover;`
        : "background:#141414;");
    caixa.innerHTML =
      '<div style="font-size:3rem;line-height:1">▶</div>' +
      '<div style="font-weight:bold;font-size:1.1rem">Assistir no Dailymotion</div>' +
      '<div style="font-size:.85rem;opacity:.8">O vídeo abre em outra aba</div>';
    moldura.appendChild(caixa);
  } else {
    const iframe = document.createElement("iframe");
    iframe.src = src;
    iframe.title = v.titulo || "Vídeo";
    iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen; presentation; remote-playback";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    moldura.appendChild(iframe);
  }

  const favoritos = obterFavoritos();
  const ehFavorito = favoritos.includes(v.id);

  if (telaTitulo) {
    telaTitulo.innerHTML = `
      ${v.titulo} 
      <button id="btn-fav-tela" style="margin-left: 12px; background: none; border: 1px solid rgba(255,255,255,0.2); color: ${ehFavorito ? '#ff3366' : '#fff'}; padding: 4px 10px; border-radius: 20px; cursor: pointer; font-size: 0.9rem; vertical-align: middle; transition: all 0.2s;">
        ${ehFavorito ? '★ Favorito / Visto' : '☆ Marcar como Visto'}
      </button>
    `;
  }

  if (telaCanal) {
    telaCanal.innerHTML = `
      ${v.canal} 
      <button id="btn-similares" style="margin-left: 10px; padding: 6px 14px; background: linear-gradient(90deg, #3b82f6, #8b5cf6); border: none; color: white; border-radius: 20px; cursor: pointer; font-size: 0.8rem; font-weight: bold; box-shadow: 0 4px 10px rgba(59, 130, 246, 0.3);">
        🔍 Episódios Parecidos
      </button>
      <button id="btn-cast" style="margin-left: 10px; padding: 6px 14px; background: linear-gradient(90deg, #8b5cf6, #ec4899); border: none; color: white; border-radius: 20px; cursor: pointer; font-size: 0.8rem; font-weight: bold; box-shadow: 0 4px 10px rgba(236, 72, 153, 0.3);">
        <span style="font-size: 1rem; vertical-align: middle; margin-right: 4px;">📺</span> Transmitir para TV
      </button>
    `;
  }
  
  if (tela) tela.style.display = "block";
  
  const voltarEl = document.getElementById("voltar");
  if (voltarEl) voltarEl.style.display = "inline-block";

  if (tela) tela.scrollIntoView({ behavior: "smooth", block: "start" });

  // Registo automático do progresso de tempo
  let segundosAssistidos = progressoSalvo;
  const intervaloProgresso = setInterval(() => {
    segundosAssistidos += 5;
    salvarHistorico(v.id, {
      id: v.id,
      titulo: v.titulo,
      canal: v.canal,
      minutos: v.minutos,
      miniatura: v.miniatura,
      plataforma: v.plataforma,
      tempo: segundosAssistidos
    });
  }, 5000);

  const limparIntervaloAnterior = window.intervaloAtualAssiste;
  if (limparIntervaloAnterior) clearInterval(limparIntervaloAnterior);
  window.intervaloAtualAssiste = intervaloProgresso;

  const btnFavTela = document.getElementById("btn-fav-tela");
  if (btnFavTela) {
    btnFavTela.addEventListener("click", () => {
      let favs = obterFavoritos();
      if (favs.includes(v.id)) {
        favs = favs.filter(id => id !== v.id);
        btnFavTela.style.color = "#fff";
        btnFavTela.innerHTML = "☆ Marcar como Visto";
      } else {
        favs.push(v.id);
        btnFavTela.style.color = "#ff3366";
        btnFavTela.innerHTML = "★ Favorito / Visto";
      }
      salvarFavoritos(favs);
    });
  }

  // Ação do Botão "Episódios Parecidos"
  const btnSimilares = document.getElementById("btn-similares");
  if (btnSimilares) {
    btnSimilares.addEventListener("click", () => {
      const termoLimpo = limparTituloParaBusca(v.titulo);
      if (campo) campo.value = termoLimpo;
      
      // Fecha a tela de reprodução e dispara a busca refinada
      if (tela) tela.style.display = "none";
      if (moldura) moldura.innerHTML = "";
      if (voltarEl) voltarEl.style.display = "none";
      
      buscar();
    });
  }

  const btnCast = document.getElementById("btn-cast");
  if (btnCast) {
    btnCast.addEventListener("click", () => {
      alert("COMO TRANSMITIR PARA A TV:\n\n1. Certifique-se de que a TV e o seu telemóvel/computador estão no mesmo Wi-Fi.\n\n2. Dê Play no vídeo.\n\n3. Clique no ícone de 'Cast' (o quadrado com ondinhas) que irá aparecer DENTRO do reprodutor de vídeo.");
    });
  }
}

// ---------- Eventos Globais ----------
if (botao) botao.addEventListener("click", buscar);
if (campo) {
  campo.addEventListener("keydown", function (e) {
    if (e.key === "Enter") buscar();
  });
}

const voltar = document.getElementById("voltar");
if (voltar) {
  voltar.addEventListener("click", function () {
    lista.innerHTML = "";
    moldura.innerHTML = "";
    if (tela) tela.style.display = "none";
    if (statusEl) statusEl.innerHTML = "";
    if (campo) campo.value = "";
    voltar.style.display = "none";
    if (filtros) filtros.style.display = "none";
    if (secaoRetomar) secaoRetomar.style.display = "block";
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (campo) campo.focus();
  });
}

if (botao && voltar) {
  botao.addEventListener("click", () => { voltar.style.display = "inline-block"; });
}
if (campo && voltar) {
  campo.addEventListener("keydown", function (e) {
    if (e.key === "Enter") voltar.style.display = "inline-block";
  });
}

// Inicialização ao carregar a página
carregarContinuarAssistindo();