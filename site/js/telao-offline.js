// Telão offline (plano B, telao.html?offline=1): a dinâmica inteira numa tela só, sem Firebase, para
// quando o Wi-Fi cair. O estado fica no navegador (localStorage), no mesmo formato de salas/{sala}, e o
// apresentador faz pela tela o que os celulares fariam: cria os grupos, monta as telas, marca critérios,
// escreve os harnesses e conta os votos. O desenho é o mesmo do modo online (telao-desenho.js).
import {
  nomeDaFase, proximaFase, faseAnterior, atualizacaoDeFase, atualizacaoDeReinicio, atualizacaoDeTroca,
} from './fases.js';
import {
  CATALOGO, TEXTO_MAXIMO, infoDoTipo, listaDeComponentes, adicionar, alterar, mover, remover, desenharTela,
} from './tela.js';
import { listaDeCriterios, marcasDe } from './criterios.js';
import {
  PROJETOS, LIMITES, N_FUNCIONALIDADES, funcionalidades, limitarLinhas, harnessesDaSala, lideres, vencedorDe,
  baixarHarness,
} from './harness.js';
import {
  salaInicial, aplicarAtualizacao, atualizacaoDeNovoGrupo, atualizacaoDeRemoverGrupo,
} from './estado-local.js';
import {
  RODADA_DE_EDICAO, TITULOS_DA_OFICINA, $, mostrar, secaoDaFase, desenharGrupos, desenharTelas,
  desenharPlacarR1, desenharResultado, desenharOficina,
} from './telao-desenho.js';

const CHAVE = 'dinamica-offline';
// Marcação de critérios em cada fase: qual campo da tela, de qual rodada e o título do painel.
const MARCACAO = {
  r1_avaliacao: { rodada: 1, campo: 'avaliacaoR1', titulo: 'Marque os critérios que cada tela cumpre' },
  r2_declaracao: { rodada: 2, campo: 'declarados', titulo: 'Declaração: o que cada grupo diz que está pronto' },
  r3: { rodada: 2, campo: 'revisao/aprovados', titulo: 'Revisão: o que o revisor aprova' },
};
const ROTULOS = { nome: 'Funcionalidade', aceite: 'Aceite', evidencia: 'Evidência' };

let sala = carregar();
let oficinaMontada = null; // fase e grupos do formulário da oficina na tela, para não refazê-lo a cada letra

function carregar() {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE));
    if (salvo?.estado?.fase) return salvo;
  } catch { /* estado salvo inválido: começa do zero */ }
  return salaInicial();
}

// Grava a atualização no estado local. Ao digitar, só a parte afetada é redesenhada (redesenhar: false),
// para o campo não perder o foco.
function atualizar(updates, { redesenhar = true } = {}) {
  sala = aplicarAtualizacao(sala, updates);
  localStorage.setItem(CHAVE, JSON.stringify(sala));
  if (redesenhar) desenhar();
}

function el(tag, { ariaLabel, ...props } = {}, ...filhos) {
  const e = Object.assign(document.createElement(tag), props);
  if (ariaLabel) e.setAttribute('aria-label', ariaLabel);
  e.append(...filhos);
  return e;
}

function botao(texto, aoClicar, props = {}) {
  const b = el('button', { type: 'button', textContent: texto, ...props });
  b.addEventListener('click', aoClicar);
  return b;
}

const nomeDoGrupo = (gid) => sala.grupos?.[gid]?.nome || gid;

function contagemOffline() {
  const harnesses = harnessesDaSala(sala.oficina, sala.grupos);
  return Object.fromEntries(harnesses.map((gid) => [gid, sala.votos?.[gid] || 0]));
}

// Editor de uma tela, embaixo dela no telão: adicionar, editar o texto, mover e remover componentes.
function editorDaTela(tid, li) {
  const tela = sala.telas[tid];
  const quem = nomeDoGrupo(tela.dono);
  const lista = () => listaDeComponentes(sala.telas[tid]?.componentes);
  const gravar = (nova) => atualizar({ [`telas/${tid}/componentes`]: nova.length ? nova : null });

  const tipo = el('select', { ariaLabel: `Componente para a tela do ${quem}` },
    ...CATALOGO.map((c) => new Option(c.nome, c.tipo)));
  const itens = lista().map((comp, i) => {
    const texto = el('textarea', {
      value: comp.texto, maxLength: TEXTO_MAXIMO, rows: 2,
      ariaLabel: `Texto do componente ${i + 1} (${infoDoTipo(comp.tipo)?.nome}) da tela do ${quem}`,
    });
    texto.addEventListener('input', () => {
      atualizar({ [`telas/${tid}/componentes`]: alterar(lista(), comp.id, { texto: texto.value }) }, { redesenhar: false });
      li.querySelector('.moldura').replaceWith(desenharTela(sala.telas[tid].componentes));
    });
    return el('li', { className: 'offline-componente' }, texto,
      botao('↑', () => gravar(mover(lista(), comp.id, -1)), { title: 'Subir', ariaLabel: `Subir componente ${i + 1} da tela do ${quem}` }),
      botao('↓', () => gravar(mover(lista(), comp.id, 1)), { title: 'Descer', ariaLabel: `Descer componente ${i + 1} da tela do ${quem}` }),
      botao('✕', () => gravar(remover(lista(), comp.id)), { className: 'secundario', title: 'Remover', ariaLabel: `Remover componente ${i + 1} da tela do ${quem}` }));
  });
  return el('div', { className: 'offline-editor' },
    el('div', { className: 'offline-adicionar' }, tipo,
      botao('Adicionar', () => gravar(adicionar(lista(), tipo.value)), { ariaLabel: `Adicionar à tela do ${quem}` })),
    el('ol', { className: 'offline-componentes' }, ...itens));
}

// Telas da rodada com uma caixa por critério, que grava no campo da fase (MARCACAO).
function desenharMarcacao(fase) {
  const { rodada, campo, titulo } = MARCACAO[fase];
  $('offline-marcacao-titulo').textContent = titulo;
  const criterios = listaDeCriterios(sala.config?.criterios);
  const grupos = sala.grupos || {};
  const lista = Object.entries(sala.telas || {})
    .filter(([, t]) => t.rodada === rodada && grupos[t.dono])
    .sort(([, a], [, b]) => (grupos[a.autor]?.ordem ?? 0) - (grupos[b.autor]?.ordem ?? 0));
  $('offline-marcacao-telas').replaceChildren(...lista.map(([tid, t]) => {
    const li = el('li', { className: 'offline-marcacao-tela' });
    li.dataset.tid = tid;
    li.style.setProperty('--cor-grupo', grupos[t.autor]?.cor || grupos[t.dono].cor);
    const cabeca = `Tela de ${nomeDoGrupo(t.autor)} · com ${nomeDoGrupo(t.dono)}`
      + (fase === 'r3' && t.revisao?.revisor ? ` · revisor: ${nomeDoGrupo(t.revisao.revisor)}` : '');
    const marcas = marcasDe(t, campo) || {};
    const caixas = criterios.map(({ chave, texto }) => {
      const caixa = el('input', { type: 'checkbox', checked: marcas[chave] === true });
      caixa.dataset.criterio = chave;
      caixa.addEventListener('change', () => atualizar({ [`telas/${tid}/${campo}/${chave}`]: caixa.checked || null }));
      return el('label', { className: 'offline-criterio' }, caixa, ` ${texto}`);
    });
    li.append(el('p', { className: 'telao-grupo-nome', textContent: cabeca }),
      el('div', { className: 'offline-marcacao-corpo' }, desenharTela(t.componentes), el('div', {}, ...caixas)));
    return li;
  }));
}

// Formulário do harness de cada grupo. Cada campo grava em oficina/{gid}, como no celular.
function montarOficina() {
  const grupos = Object.entries(sala.grupos || {}).sort(([, a], [, b]) => a.ordem - b.ordem);
  $('offline-oficina-grupos').replaceChildren(...grupos.map(([gid, g]) => {
    const harness = sala.oficina?.[gid] || {};
    const gravar = (campo, valor) => {
      atualizar({ [`oficina/${gid}/${campo}`]: valor || null }, { redesenhar: false });
      desenharOficinaAoVivo();
    };
    const campo = (tag, rotulo, valor, caminho, props = {}) => {
      const e = el(tag, { value: valor || '', ariaLabel: `${rotulo} do ${g.nome}`, ...props });
      e.addEventListener('input', () => {
        if (caminho === 'agents' && e.value !== limitarLinhas(e.value)) e.value = limitarLinhas(e.value);
        gravar(caminho, e.value);
      });
      return el('label', { className: 'offline-campo' }, `${rotulo} `, e);
    };
    const projeto = el('select', { ariaLabel: `Projeto do ${g.nome}` }, new Option('Escolha o projeto…', ''),
      ...Object.entries(PROJETOS).map(([chave, nome]) => new Option(nome, chave)));
    projeto.value = harness.projeto || '';
    projeto.addEventListener('change', () => gravar('projeto', projeto.value));
    const feats = funcionalidades(harness);
    const fieldset = el('fieldset', { className: 'offline-oficina-grupo' },
      el('legend', { textContent: g.nome }),
      el('label', { className: 'offline-campo' }, 'Projeto ', projeto),
      campo('textarea', 'AGENTS.md', harness.agents, 'agents', { rows: 4, maxLength: LIMITES.agents }),
      ...Array.from({ length: N_FUNCIONALIDADES }, (_, i) => el('div', { className: 'offline-feature' },
        ...Object.entries(ROTULOS).map(([k, rotulo]) => campo('input', `${rotulo} ${i + 1}`, feats[i][k],
          `features/${i}/${k}`, { maxLength: LIMITES[k] })))),
      campo('textarea', 'Primeiro passo', harness.progresso, 'progresso', { rows: 2, maxLength: LIMITES.progresso }));
    fieldset.style.setProperty('--cor-grupo', g.cor);
    return fieldset;
  }));
}

function desenharOficinaAoVivo() {
  const fase = sala.estado.fase;
  if (TITULOS_DA_OFICINA[fase]) desenharOficina(fase, sala.oficina || {}, contagemOffline(), sala.grupos || {}, sala.estado.vencedor);
}

function desenharVotacao() {
  const contagem = contagemOffline();
  $('offline-votos').replaceChildren(...Object.keys(contagem).map((gid) => {
    const n = contagem[gid];
    const li = el('li', {},
      botao('−1', () => atualizar({ [`votos/${gid}`]: n > 1 ? n - 1 : null }), { className: 'secundario', ariaLabel: `Tirar um voto do ${nomeDoGrupo(gid)}`, disabled: !n }),
      el('span', { textContent: ` ${nomeDoGrupo(gid)}: ${n} ` }),
      botao('+1', () => atualizar({ [`votos/${gid}`]: n + 1 }), { ariaLabel: `Um voto para o ${nomeDoGrupo(gid)}` }));
    li.dataset.gid = gid;
    li.style.setProperty('--cor-grupo', sala.grupos[gid].cor);
    return li;
  }));
}

function desenharFim() {
  const contagem = contagemOffline();
  const temHarness = Object.keys(contagem).length > 0;
  const vencedor = temHarness ? vencedorDe(contagem, sala.estado.vencedor) : null;
  const empatados = temHarness ? lideres(contagem) : [];
  $('offline-empate').replaceChildren(...(empatados.length > 1 ? empatados : []).map((gid) => botao(
    `Escolher ${nomeDoGrupo(gid)}`, () => atualizar({ 'estado/vencedor': gid }),
    { className: gid === vencedor ? '' : 'secundario' },
  )));
  $('offline-baixar-zip').disabled = !vencedor;
  $('offline-baixar-zip').onclick = () => baixarHarness(sala.oficina[vencedor], sala.grupos[vencedor]);
}

function desenhar() {
  const { fase } = sala.estado;
  const grupos = sala.grupos || {};
  const telas = sala.telas || {};
  document.body.dataset.fase = fase;
  $('offline-fase').textContent = nomeDaFase(fase);
  $('offline-voltar').disabled = !faseAnterior(fase);
  $('offline-avancar').disabled = !proximaFase(fase);
  $('telao-frase').textContent = sala.config?.frase || '';
  $('telao-fase').textContent = nomeDaFase(fase);
  desenharGrupos(grupos);

  const rodada = RODADA_DE_EDICAO[fase];
  if (rodada) {
    $('telao-rodada-titulo').textContent = `Rodada ${rodada}`;
    desenharTelas(telas, grupos, {}, rodada);
    for (const li of $('telao-telas').children) li.append(editorDaTela(li.dataset.tid, li));
  }
  if (fase === 'r1_avaliacao') desenharPlacarR1(telas, grupos, sala.config?.criterios);
  if (fase === 'resultado') desenharResultado(telas, grupos, sala.config?.criterios);
  desenharOficinaAoVivo();
  mostrar(secaoDaFase(fase));

  $('offline-lobby').hidden = fase !== 'lobby';
  $('offline-troca').hidden = fase !== 'r2_troca';
  $('offline-trocar-r2').hidden = !!sala.trocas?.r2_troca;
  $('offline-troca-feita').hidden = !sala.trocas?.r2_troca;
  $('offline-marcacao').hidden = !MARCACAO[fase];
  if (MARCACAO[fase]) desenharMarcacao(fase);
  $('offline-oficina').hidden = fase !== 'oficina';
  const chaveOficina = fase === 'oficina' ? Object.keys(grupos).sort().join() : null;
  if (chaveOficina !== oficinaMontada) {
    oficinaMontada = chaveOficina;
    if (chaveOficina !== null) montarOficina();
  }
  $('offline-votacao').hidden = fase !== 'votacao';
  if (fase === 'votacao') desenharVotacao();
  $('offline-fim').hidden = fase !== 'fim';
  if (fase === 'fim') desenharFim();
}

function irPara(para) {
  if (para) atualizar(atualizacaoDeFase(para, sala));
}

export function iniciarTelaoOffline() {
  document.body.classList.add('offline');
  $('offline-controle').hidden = false;
  $('qr-aluno').closest('.telao-entrada').hidden = true;
  $('contagem-alunos').parentElement.hidden = true;
  $('offline-avancar').addEventListener('click', () => irPara(proximaFase(sala.estado.fase)));
  $('offline-voltar').addEventListener('click', () => irPara(faseAnterior(sala.estado.fase)));
  $('offline-reiniciar').addEventListener('click', () => {
    if (!confirm('Reiniciar apaga os grupos, as telas e os harnesses. Continuar?')) return;
    atualizar(atualizacaoDeReinicio());
  });
  $('offline-novo-grupo').addEventListener('click', () => atualizar(atualizacaoDeNovoGrupo(sala.grupos)));
  $('offline-remover-grupo').addEventListener('click', () => atualizar(atualizacaoDeRemoverGrupo(sala.grupos)));
  $('offline-trocar-r2').addEventListener('click', () => {
    if (sala.estado.fase === 'r2_troca' && !sala.trocas?.r2_troca) atualizar(atualizacaoDeTroca('r2_troca', sala));
  });
  desenhar();
}
