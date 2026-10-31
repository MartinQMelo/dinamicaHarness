// Tela do app montada pelos grupos: catálogo de componentes, operações na lista e a renderização
// dentro da moldura de celular. É a mesma no celular, no telão e na revisão. Não usa o Firebase,
// para poder ser importada também pelos testes.

export const CATALOGO = [
  { tipo: 'titulo', nome: 'Título', textoPadrao: 'Título', dica: 'O texto do título.' },
  { tipo: 'botao', nome: 'Botão', textoPadrao: 'Botão', dica: 'O rótulo do botão.' },
  { tipo: 'lista', nome: 'Lista de caronas', textoPadrao: 'Carona 1\nCarona 2\nCarona 3', dica: 'Um item por linha.' },
  { tipo: 'filtro', nome: 'Filtro', textoPadrao: 'Opção 1, Opção 2', dica: 'As opções separadas por vírgula.' },
  { tipo: 'busca', nome: 'Busca', textoPadrao: 'Buscar…', dica: 'O texto de dentro da busca.' },
  { tipo: 'mapa', nome: 'Mapa', textoPadrao: 'Mapa', dica: 'A legenda do mapa.' },
  { tipo: 'perfil', nome: 'Perfil', textoPadrao: 'Seu nome', dica: 'O nome mostrado no perfil.' },
  { tipo: 'chat', nome: 'Chat', textoPadrao: 'Oi! Tem vaga?', dica: 'Uma mensagem por linha.' },
  { tipo: 'pagamento', nome: 'Pagamento', textoPadrao: 'R$ 0,00', dica: 'O valor ou a forma de pagamento.' },
  { tipo: 'aviso', nome: 'Aviso', textoPadrao: 'Aviso', dica: 'O texto do aviso.' },
];

export const TEXTO_MAXIMO = 300;
export const COMPONENTES_MAXIMO = 30;

export function infoDoTipo(tipo) {
  return CATALOGO.find((c) => c.tipo === tipo);
}

export function tidDe(rodada, gid) {
  return `r${rodada}_${gid}`;
}

// Atualização multi-caminho que dá a cada grupo uma tela em branco da rodada (autor = dono = grupo).
export function telasIniciais(grupos, rodada) {
  const updates = {};
  for (const gid of Object.keys(grupos || {})) {
    updates[`telas/${tidDe(rodada, gid)}`] = { rodada, autor: gid, dono: gid };
  }
  return updates;
}

// A tela que o grupo tem em mãos na rodada, ou null.
export function telaDoGrupo(telas, gid, rodada) {
  const achada = Object.entries(telas || {}).find(([, t]) => t.dono === gid && t.rodada === rodada);
  return achada ? { tid: achada[0], ...achada[1] } : null;
}

// O banco devolve a lista como array ou, se os índices tiverem buracos, como objeto.
export function listaDeComponentes(valor) {
  if (!valor) return [];
  if (Array.isArray(valor)) return valor.filter(Boolean);
  return Object.keys(valor).sort((a, b) => Number(a) - Number(b)).map((k) => valor[k]).filter(Boolean);
}

export function novoId() {
  return Math.random().toString(36).slice(2, 10);
}

// Operações sobre a lista: recebem a lista atual e devolvem a nova, sem mexer na original.
export function adicionar(lista, tipo, id = novoId()) {
  if (!infoDoTipo(tipo) || lista.length >= COMPONENTES_MAXIMO) return lista;
  return [...lista, { id, tipo, texto: infoDoTipo(tipo).textoPadrao }];
}

// Campo com valor null é apagado (ex.: { editandoPor: null }).
export function alterar(lista, id, campos) {
  return lista.map((c) => {
    if (c.id !== id) return c;
    const novo = { ...c, ...campos };
    for (const [k, v] of Object.entries(novo)) if (v === null) delete novo[k];
    return novo;
  });
}

export function mover(lista, id, passo) {
  const i = lista.findIndex((c) => c.id === id);
  const j = i + passo;
  if (i < 0 || j < 0 || j >= lista.length) return lista;
  const nova = [...lista];
  [nova[i], nova[j]] = [nova[j], nova[i]];
  return nova;
}

export function remover(lista, id) {
  return lista.filter((c) => c.id !== id);
}

function el(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

const linhas = (texto) => String(texto || '').split('\n').map((l) => l.trim()).filter(Boolean);
const opcoes = (texto) => String(texto || '').split(',').map((o) => o.trim()).filter(Boolean);

function desenharComponente({ tipo, texto }) {
  const c = el('div', `comp comp-${tipo}`);
  c.dataset.tipo = tipo;
  switch (tipo) {
    case 'titulo': c.append(el('strong', 'comp-titulo-texto', texto)); break;
    case 'botao': c.append(el('span', 'comp-botao-rotulo', texto)); break;
    case 'lista': {
      const ul = el('ul', 'comp-lista-itens');
      ul.append(...linhas(texto).map((l) => el('li', null, l)));
      c.append(ul);
      break;
    }
    case 'filtro': c.append(...opcoes(texto).map((o) => el('span', 'comp-chip', o))); break;
    case 'busca': c.append(el('span', 'comp-busca-campo', `🔍 ${texto}`)); break;
    case 'mapa': c.append(el('span', 'comp-mapa-legenda', `📍 ${texto}`)); break;
    case 'perfil': c.append(el('span', 'comp-perfil-foto', '👤'), el('span', 'comp-perfil-nome', texto)); break;
    case 'chat': c.append(...linhas(texto).map((l) => el('span', 'comp-balao', l))); break;
    case 'pagamento': c.append(el('span', 'comp-pagamento-texto', `💳 ${texto}`)); break;
    case 'aviso': c.append(el('span', 'comp-aviso-texto', `⚠️ ${texto}`)); break;
    default: c.append(el('span', null, texto));
  }
  return c;
}

// Desenha a tela dentro da moldura de celular. nomes: {uid: nome}, para o "editando: Fulano";
// eu: uid de quem está vendo, que não precisa ver o aviso sobre si mesmo.
export function desenharTela(componentes, { nomes = {}, eu = null } = {}) {
  const moldura = el('div', 'moldura');
  const visor = el('div', 'moldura-visor');
  const lista = listaDeComponentes(componentes);
  if (!lista.length) visor.append(el('p', 'moldura-vazia', 'Tela vazia'));
  for (const comp of lista) {
    const c = desenharComponente(comp);
    c.dataset.id = comp.id;
    if (comp.editandoPor && comp.editandoPor !== eu) c.append(el('span', 'comp-editando', `editando: ${nomes[comp.editandoPor] || 'alguém'}`));
    visor.append(c);
  }
  moldura.append(visor);
  return moldura;
}
