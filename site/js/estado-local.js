// Estado da sala guardado no próprio navegador, para o telão offline (plano B). Tem o mesmo formato de
// salas/{sala} no banco, para reaproveitar atualizacaoDeFase e o desenho do telão. Sem Firebase.
import { FRASE_R1, TAMANHO_GRUPO_PADRAO, CRITERIOS_PADRAO } from './padroes.js';
import { dadosDoGrupo, gidDaOrdem } from './grupos.js';

export function salaInicial(agora = Date.now()) {
  return {
    estado: { fase: 'lobby', timerFim: 0, atualizadoEm: agora },
    config: { tamanhoGrupo: TAMANHO_GRUPO_PADRAO, frase: FRASE_R1 },
    segredo: { criterios: { ...CRITERIOS_PADRAO } },
  };
}

// Como o banco: null apaga, e objeto que fica vazio some.
function limpar(valor) {
  if (valor === null || typeof valor !== 'object') return valor;
  const lista = Array.isArray(valor);
  const saida = lista ? [] : {};
  for (const [k, v] of Object.entries(valor)) {
    const limpo = limpar(v);
    if (limpo === null || limpo === undefined) continue;
    if (typeof limpo === 'object' && !Object.keys(limpo).length) continue;
    if (lista) saida.push(limpo); else saida[k] = limpo;
  }
  return saida;
}

// Aplica uma atualização multi-caminho ({'a/b': valor}, como o update() do Firebase) e devolve uma
// sala nova, sem mexer na original.
export function aplicarAtualizacao(sala, updates) {
  const nova = structuredClone(sala || {});
  for (const [caminho, valor] of Object.entries(updates)) {
    const partes = caminho.split('/').filter(Boolean);
    const ultima = partes.pop();
    let no = nova;
    for (const p of partes) {
      if (no[p] === null || typeof no[p] !== 'object') no[p] = {};
      no = no[p];
    }
    no[ultima] = valor === undefined ? null : structuredClone(valor);
  }
  return limpar(nova) || {};
}

// Atualização que cria o próximo grupo (Azul, Verde, …), como o controle cria no lobby.
export function atualizacaoDeNovoGrupo(grupos) {
  const ordem = Object.values(grupos || {}).reduce((max, g) => Math.max(max, g.ordem + 1), 0);
  return { [`grupos/${gidDaOrdem(ordem)}`]: dadosDoGrupo(ordem) };
}

// Atualização que apaga o último grupo criado.
export function atualizacaoDeRemoverGrupo(grupos) {
  const ultimo = Object.entries(grupos || {}).sort(([, a], [, b]) => b.ordem - a.ordem)[0];
  return ultimo ? { [`grupos/${ultimo[0]}`]: null } : {};
}
