// Fases da dinâmica, na ordem em que o controle avança. Sem Firebase, para os testes importarem.
import { telasIniciais } from './tela.js';

export const FASES = [
  'lobby', 'r1', 'r1_troca', 'r1_avaliacao', 'r2', 'r2_troca', 'r2_declaracao',
  'r3', 'resultado', 'oficina', 'votacao', 'fim',
];

export const NOMES_DAS_FASES = {
  lobby: 'Entrada (lobby)',
  r1: 'Rodada 1',
  r1_troca: 'Rodada 1 · troca de sessão',
  r1_avaliacao: 'Rodada 1 · avaliação',
  r2: 'Rodada 2',
  r2_troca: 'Rodada 2 · troca de sessão',
  r2_declaracao: 'Rodada 2 · declaração',
  r3: 'Rodada 3 · revisão',
  resultado: 'Resultado',
  oficina: 'Oficina',
  votacao: 'Votação',
  fim: 'Fim',
};

export function nomeDaFase(fase) {
  return NOMES_DAS_FASES[fase] || fase || '';
}

export function proximaFase(fase) {
  const i = FASES.indexOf(fase);
  return i >= 0 && i < FASES.length - 1 ? FASES[i + 1] : null;
}

export function faseAnterior(fase) {
  const i = FASES.indexOf(fase);
  return i > 0 ? FASES[i - 1] : null;
}

// config/criterios existe da r1_avaliacao em diante (Decisão 1). As regras do banco usam a mesma lista.
export function criteriosRevelados(fase) {
  return FASES.indexOf(fase) >= FASES.indexOf('r1_avaliacao');
}

// Fases em que acontece a troca de sessão, e de qual rodada são as telas trocadas.
export const RODADA_DA_TROCA = { r1_troca: 1 };

// Para cada grupo, o próximo na ordem (rotação circular). Com 1 grupo, ele mesmo.
export function proximoGrupo(grupos) {
  const gids = Object.keys(grupos || {}).sort((a, b) => grupos[a].ordem - grupos[b].ordem);
  return Object.fromEntries(gids.map((gid, i) => [gid, gids[(i + 1) % gids.length]]));
}

// Troca de sessão: cada tela da rodada passa para o próximo grupo. Grava trocas/{fase} com o dono de
// antes (para "voltar fase" desfazer) e apaga os "editando: Fulano" de quem perdeu a tela.
export function atualizacaoDeTroca(fase, { grupos, telas } = {}) {
  const rodada = RODADA_DA_TROCA[fase];
  const proximo = proximoGrupo(grupos);
  const updates = {};
  const donosAntes = {};
  for (const [tid, tela] of Object.entries(telas || {})) {
    if (tela.rodada !== rodada || !proximo[tela.dono]) continue;
    donosAntes[tid] = tela.dono;
    updates[`telas/${tid}/dono`] = proximo[tela.dono];
    for (const [i, comp] of Object.entries(tela.componentes || {})) {
      if (comp?.editandoPor) updates[`telas/${tid}/componentes/${i}/editandoPor`] = null;
    }
  }
  updates[`trocas/${fase}`] = Object.keys(donosAntes).length ? donosAntes : null;
  return updates;
}

// Desfaz a troca gravada em trocas/{fase}: devolve cada tela que ainda existe ao dono de antes.
export function atualizacaoDeDesfazerTroca(fase, { telas, trocas } = {}) {
  const updates = { [`trocas/${fase}`]: null };
  for (const [tid, dono] of Object.entries(trocas?.[fase] || {})) {
    if (telas?.[tid]) updates[`telas/${tid}/dono`] = dono;
  }
  return updates;
}

// Atualização multi-caminho (relativa a salas/{sala}) para ir à fase `para`. Mudar de fase zera o
// cronômetro. Ao entrar na r1, cria a tela em branco dos grupos que ainda não têm a sua (voltar e
// avançar de novo não apaga o que já foi feito). Entrar numa fase de troca troca as sessões, se a
// troca ainda não foi feita (voltar da fase seguinte não troca de novo); voltar para a fase de antes
// da troca a desfaz. Da r1_avaliacao em diante, config/criterios é a cópia de segredo/criterios; antes
// dela, é apagado se existir (os alunos não podem ler os critérios antes da hora).
export function atualizacaoDeFase(para, {
  grupos, telas, trocas, segredo, config,
} = {}, agora = Date.now()) {
  const updates = { 'estado/fase': para, 'estado/timerFim': 0, 'estado/atualizadoEm': agora };
  if (criteriosRevelados(para)) updates['config/criterios'] = segredo?.criterios || null;
  else if (config?.criterios) updates['config/criterios'] = null;
  if (para === 'r1') {
    for (const [caminho, tela] of Object.entries(telasIniciais(grupos, 1))) {
      if (!telas?.[caminho.slice('telas/'.length)]) updates[caminho] = tela;
    }
  }
  if (RODADA_DA_TROCA[para] && !trocas?.[para]) Object.assign(updates, atualizacaoDeTroca(para, { grupos, telas }));
  const trocaSeguinte = proximaFase(para);
  if (RODADA_DA_TROCA[trocaSeguinte] && trocas?.[trocaSeguinte]) {
    Object.assign(updates, atualizacaoDeDesfazerTroca(trocaSeguinte, { telas, trocas }));
  }
  return updates;
}

// Reiniciar: volta ao lobby e apaga alunos, grupos e tudo o que foi produzido. Config e segredo ficam.
export function atualizacaoDeReinicio(agora = Date.now()) {
  return {
    estado: { fase: 'lobby', timerFim: 0, atualizadoEm: agora },
    'config/criterios': null,
    alunos: null, grupos: null, telas: null, trocas: null, oficina: null, votos: null,
  };
}
