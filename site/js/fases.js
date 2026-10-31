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

// Atualização multi-caminho (relativa a salas/{sala}) para ir à fase `para`. Mudar de fase zera o
// cronômetro. Ao entrar na r1, cria a tela em branco dos grupos que ainda não têm a sua (voltar e
// avançar de novo não apaga o que já foi feito).
export function atualizacaoDeFase(para, { grupos, telas } = {}, agora = Date.now()) {
  const updates = { 'estado/fase': para, 'estado/timerFim': 0, 'estado/atualizadoEm': agora };
  if (para === 'r1') {
    for (const [caminho, tela] of Object.entries(telasIniciais(grupos, 1))) {
      if (!telas?.[caminho.slice('telas/'.length)]) updates[caminho] = tela;
    }
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
