// Desenho do telão a partir dos dados da sala, igual no modo online (telao.js) e no offline
// (telao-offline.js). Sem Firebase: o modo offline não pode depender da rede.
import { contarMembros } from './grupos.js';
import { desenharTela } from './tela.js';
import { contarProntos } from './fases.js';
import {
  listaDeCriterios, contarMarcados, mediaDeCriterios, formatarMedia, vitoriasFalsas,
} from './criterios.js';
import {
  harnessesDaSala, lideres, vencedorDe, desenharHarness,
} from './harness.js';

export const RODADA_DE_EDICAO = {
  r1: 1, r1_troca: 1, r2: 2, r2_troca: 2,
};
export const TITULOS_DA_OFICINA = { oficina: 'Oficina · monte seu harness', votacao: 'Votação', fim: 'Fim' };

export const $ = (id) => document.getElementById(id);

export function mostrar(secao) {
  for (const id of ['telao-sem-sala', 'telao-lobby', 'telao-rodada', 'telao-avaliacao', 'telao-resultado', 'telao-oficina', 'telao-outra-fase']) {
    $(id).hidden = id !== secao;
  }
}

export function plural(n, um, varios) {
  return n === 1 ? um : varios;
}

export function desenharGrupos(grupos) {
  const lista = Object.entries(grupos || {}).sort(([, a], [, b]) => a.ordem - b.ordem);
  $('contagem-grupos').textContent = lista.length;
  $('rotulo-grupos').textContent = plural(lista.length, 'grupo', 'grupos');
  $('lista-grupos').replaceChildren(...lista.map(([gid, g]) => {
    const li = document.createElement('li');
    li.dataset.gid = gid;
    li.style.setProperty('--cor-grupo', g.cor);
    const nome = document.createElement('span');
    nome.className = 'telao-grupo-nome';
    nome.textContent = g.nome;
    const membros = document.createElement('strong');
    membros.className = 'telao-numero';
    membros.textContent = contarMembros(g);
    li.append(nome, membros);
    return li;
  }));
}

// As telas da rodada, cada uma com o nome e a cor do grupo que a tem em mãos.
export function desenharTelas(telas, grupos, alunos, rodada) {
  const nomes = Object.fromEntries(Object.entries(alunos || {}).map(([u, a]) => [u, a.nome]));
  const lista = Object.entries(telas || {})
    .filter(([, t]) => t.rodada === rodada && grupos?.[t.dono])
    .sort(([, a], [, b]) => grupos[a.dono].ordem - grupos[b.dono].ordem);
  $('telao-telas').replaceChildren(...lista.map(([tid, t]) => {
    const li = document.createElement('li');
    li.dataset.tid = tid;
    li.style.setProperty('--cor-grupo', grupos[t.dono].cor);
    const nome = document.createElement('p');
    nome.className = 'telao-tela-grupo';
    nome.textContent = grupos[t.dono].nome;
    li.append(nome, desenharTela(t.componentes, { nomes }));
    return li;
  }));
}

// Na r2_troca: quantos grupos já saíram da sessão (Decisão 3).
export function desenharProntos(telas, grupos, fase) {
  $('telao-prontos').hidden = fase !== 'r2_troca';
  const { prontos, total } = contarProntos(telas, grupos);
  $('telao-prontos-n').textContent = `${prontos} de ${total}`;
  $('telao-prontos-rotulo').textContent = total === 1 ? 'grupo pronto' : 'grupos prontos';
}

// Placar da R1: a média de critérios cumpridos, os critérios revelados e quanto cada tela cumpriu.
export function desenharPlacarR1(telas, grupos, criterios) {
  const total = listaDeCriterios(criterios).length || 5;
  $('placar-r1-media').textContent = formatarMedia(mediaDeCriterios(telas, grupos, 1, 'avaliacaoR1'));
  $('placar-r1-total').textContent = total;
  $('telao-criterios').replaceChildren(...listaDeCriterios(criterios).map(({ chave, texto }) => {
    const li = document.createElement('li');
    li.dataset.criterio = chave;
    li.textContent = texto;
    return li;
  }));
  const lista = Object.entries(telas || {})
    .filter(([, t]) => t.rodada === 1 && grupos?.[t.dono])
    .sort(([, a], [, b]) => grupos[a.autor]?.ordem - grupos[b.autor]?.ordem);
  $('placar-r1-telas').replaceChildren(...lista.map(([tid, t]) => {
    const li = document.createElement('li');
    li.dataset.tid = tid;
    li.style.setProperty('--cor-grupo', grupos[t.dono].cor);
    const nome = document.createElement('span');
    nome.className = 'telao-grupo-nome';
    nome.textContent = `Tela de ${grupos[t.autor]?.nome || t.autor}`;
    const n = document.createElement('strong');
    n.className = 'telao-numero';
    n.textContent = `${contarMarcados(t.avaliacaoR1)}/${total}`;
    li.append(nome, n);
    return li;
  }));
}

// Resultado: placar da R1 contra a R2 e, na R2, "declarado pronto" contra "aprovado pelo revisor". A
// diferença (critério declarado pronto e não aprovado) é a vitória falsa, em destaque.
export function desenharResultado(telas, grupos, criterios) {
  const total = listaDeCriterios(criterios).length || 5;
  for (const e of document.querySelectorAll('.resultado-total')) e.textContent = total;
  $('resultado-r1').textContent = formatarMedia(mediaDeCriterios(telas, grupos, 1, 'avaliacaoR1'));
  $('resultado-r2-declarados').textContent = formatarMedia(mediaDeCriterios(telas, grupos, 2, 'declarados'));
  $('resultado-r2-aprovados').textContent = formatarMedia(mediaDeCriterios(telas, grupos, 2, 'revisao/aprovados'));
  const lista = Object.entries(telas || {})
    .filter(([, t]) => t.rodada === 2 && grupos?.[t.dono])
    .sort(([, a], [, b]) => grupos[a.autor]?.ordem - grupos[b.autor]?.ordem);
  const falsas = lista.reduce((soma, [, t]) => soma + vitoriasFalsas(t).length, 0);
  $('resultado-falsas-n').textContent = falsas;
  $('resultado-falsas-rotulo').textContent = falsas === 1
    ? 'critério declarado pronto e reprovado pelo revisor'
    : 'critérios declarados prontos e reprovados pelo revisor';
  $('resultado-telas').replaceChildren(...lista.map(([tid, t]) => {
    const li = document.createElement('li');
    li.dataset.tid = tid;
    li.style.setProperty('--cor-grupo', grupos[t.autor]?.cor || grupos[t.dono].cor);
    const nome = document.createElement('p');
    nome.className = 'telao-grupo-nome';
    nome.textContent = `Tela de ${grupos[t.autor]?.nome || t.autor}`;
    const numeros = document.createElement('p');
    const n = vitoriasFalsas(t).length;
    numeros.textContent = `declarado pronto ${contarMarcados(t.declarados)}/${total} · aprovado ${contarMarcados(t.revisao?.aprovados)}/${total}`;
    if (n) {
      const falsa = document.createElement('strong');
      falsa.className = 'telao-falsa';
      falsa.textContent = ` · ${n} ${n === 1 ? 'vitória falsa' : 'vitórias falsas'}`;
      numeros.append(falsa);
    }
    li.append(nome, numeros);
    return li;
  }));
}

// Oficina, votação e fim: os harnesses ao vivo; na votação e no fim, os votos de cada um; no fim, o vencedor
// (ou os empatados, enquanto o controle não escolhe: Decisão 9). contagem: {gid: votos}.
export function desenharOficina(fase, oficina, contagem, grupos, escolhido) {
  $('telao-oficina-titulo').textContent = TITULOS_DA_OFICINA[fase];
  const comVotos = fase !== 'oficina';
  const harnesses = harnessesDaSala(oficina, grupos);
  const vencedor = harnesses.length ? vencedorDe(contagem, escolhido) : null;
  const empatados = harnesses.length ? lideres(contagem) : [];
  const nomes = (gids) => gids.map((g) => grupos[g].nome).join(', ').replace(/, ([^,]*)$/, ' e $1');
  $('telao-vencedor').hidden = fase !== 'fim';
  $('telao-vencedor').textContent = !harnesses.length ? 'Nenhum harness foi montado.'
    : vencedor ? `Vencedor: ${grupos[vencedor].nome}`
      : `Empate entre ${nomes(empatados)}. O apresentador escolhe o vencedor.`;
  $('telao-oficina-vazia').hidden = harnesses.length > 0;
  $('telao-harnesses').replaceChildren(...harnesses.map((gid) => {
    const li = document.createElement('li');
    li.dataset.gid = gid;
    if (fase === 'fim' && (vencedor ? gid === vencedor : empatados.includes(gid))) li.classList.add('lider');
    const cartao = desenharHarness(oficina[gid], grupos[gid]);
    if (comVotos) {
      const p = document.createElement('p');
      p.className = 'telao-votos';
      const n = document.createElement('strong');
      n.className = 'telao-numero';
      n.textContent = contagem[gid];
      p.append(n, ` ${plural(contagem[gid], 'voto', 'votos')}`);
      cartao.insertBefore(p, cartao.children[1]);
    }
    li.append(cartao);
    return li;
  }));
}

// A seção do telão que mostra a fase.
export function secaoDaFase(fase) {
  if (fase === 'lobby') return 'telao-lobby';
  if (RODADA_DE_EDICAO[fase]) return 'telao-rodada';
  if (fase === 'r1_avaliacao') return 'telao-avaliacao';
  if (fase === 'resultado') return 'telao-resultado';
  if (TITULOS_DA_OFICINA[fase]) return 'telao-oficina';
  return 'telao-outra-fase';
}
