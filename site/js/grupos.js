// Grupos: cores, nomes e a escolha do grupo de quem entra.
export const PALETA = [
  { nome: 'Azul', cor: '#1f6feb' },
  { nome: 'Verde', cor: '#1a7f37' },
  { nome: 'Laranja', cor: '#e16f24' },
  { nome: 'Roxo', cor: '#8250df' },
  { nome: 'Rosa', cor: '#d6409f' },
  { nome: 'Amarelo', cor: '#d4a72c' },
  { nome: 'Ciano', cor: '#1b9aaa' },
  { nome: 'Vermelho', cor: '#cf222e' },
];

// Grupo de ordem n (0, 1, 2…): Azul, Verde, …, Vermelho, Azul 2, Verde 2…
export function dadosDoGrupo(ordem) {
  const { nome, cor } = PALETA[ordem % PALETA.length];
  const volta = Math.floor(ordem / PALETA.length);
  return { nome: volta ? `${nome} ${volta + 1}` : nome, cor, ordem };
}

export function gidDaOrdem(ordem) {
  return `g${ordem + 1}`;
}

export function contarMembros(grupo) {
  return Object.keys(grupo?.membros || {}).length;
}

// Decide para qual grupo vai quem entra. No lobby: o grupo não cheio com menos membros; se todos
// estiverem cheios, um grupo novo. Depois do lobby: o grupo com menos membros, mesmo cheio.
// Devolve { gid, ordem, novo } ou null se não houver grupo possível.
export function escolherGrupo(grupos, tamanhoGrupo, fase) {
  const lista = Object.entries(grupos || {})
    .map(([gid, g]) => ({ gid, ordem: g.ordem, membros: contarMembros(g) }))
    .sort((a, b) => a.membros - b.membros || a.ordem - b.ordem);
  if (fase !== 'lobby') return lista.length ? { ...lista[0], novo: false } : null;
  const aberto = lista.find((g) => g.membros < tamanhoGrupo);
  if (aberto) return { ...aberto, novo: false };
  const ordem = lista.reduce((max, g) => Math.max(max, g.ordem + 1), 0);
  return { gid: gidDaOrdem(ordem), novo: true, ordem };
}
