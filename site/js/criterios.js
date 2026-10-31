// Critérios escondidos: quando são revelados e o placar das marcações. Sem Firebase, para os testes.
export const CHAVES_DOS_CRITERIOS = ['c1', 'c2', 'c3', 'c4', 'c5'];

// Os critérios em ordem (c1..c5), como [{chave, texto}], ignorando os que não existem.
export function listaDeCriterios(criterios) {
  return CHAVES_DOS_CRITERIOS.filter((c) => criterios?.[c]).map((chave) => ({ chave, texto: criterios[chave] }));
}

export function contarMarcados(marcas) {
  return CHAVES_DOS_CRITERIOS.filter((c) => marcas?.[c] === true).length;
}

// Média de critérios marcados (campo, ex.: 'avaliacaoR1') nas telas da rodada que têm dono num grupo.
// Tela sem nenhuma marcação conta como 0. Sem telas, 0.
export function mediaDeCriterios(telas, grupos, rodada, campo) {
  const lista = Object.values(telas || {}).filter((t) => t.rodada === rodada && grupos?.[t.dono]);
  if (!lista.length) return 0;
  return lista.reduce((soma, t) => soma + contarMarcados(t[campo]), 0) / lista.length;
}

// 2.5 → "2,5"; 3 → "3".
export function formatarMedia(media) {
  return (Math.round(media * 10) / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}
