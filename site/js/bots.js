// Alunos-bot do modo ensaio: o que cada bot faz em cada fase. Sem Firebase, para os testes importarem;
// quem grava é site/js/ensaio.js, com o usuário do próprio bot (as regras valem igual para ele).
import {
  CATALOGO, telaDoGrupo, listaDeComponentes, adicionar, alterar, mover, remover,
} from './tela.js';
import { listaDeCriterios } from './criterios.js';
import { PROJETOS, N_FUNCIONALIDADES, harnessesDaSala } from './harness.js';

export const AGORA = { agora: true }; // marca o valor que vira serverTimestamp() na gravação

const TEXTOS = {
  titulo: ['Caronas UnB', 'Vai de carona', 'Carona Fácil'],
  botao: ['Oferecer carona', 'Pedir carona', 'Entrar'],
  lista: ['18h · ICC Norte\n19h · Gama', 'Carona para o Darcy\nCarona para Ceilândia', '7h · Planaltina\n12h · ICC Sul\n18h · Rodoviária'],
  filtro: ['Darcy Ribeiro, Gama, Ceilândia, Planaltina', 'Manhã, Tarde, Noite', 'Darcy Ribeiro, Gama'],
  busca: ['Para onde?', 'Buscar carona…'],
  mapa: ['Campus Darcy Ribeiro', 'Pontos de saída'],
  perfil: ['Motorista Bot', 'Seu perfil'],
  chat: ['Oi! Tem vaga?\nTenho sim!', 'Saio às 18h'],
  pagamento: ['R$ 5,00', 'Pix'],
  aviso: ['Use o cinto de segurança', 'Carona só para alunos da UnB'],
};

const PROGRESSOS = [
  'Fiz o título e o botão. Falta a lista de caronas.',
  'Coloquei a lista e o filtro. Falta conferir o limite de 6 componentes.',
  'Tirei o chat. Falta o filtro por campus.',
  'Tela quase pronta. Falta revisar a ordem dos componentes.',
];

const OFICINA = {
  agents: [
    'App de celular em pé.\nNo máximo 5 telas.\nNada fora da lista de funcionalidades.',
    'Use só HTML e CSS.\nAntes de sair, atualize o progresso.',
    'Uma funcionalidade por vez.\nTeste antes de marcar como pronta.\nNão invente telas novas.',
  ],
  nome: ['Ver o cardápio do dia', 'Publicar uma carona', 'Listar as provas da semana', 'Marcar presença', 'Filtrar por campus'],
  aceite: ['Mostra os itens do dia com o preço', 'A carona aparece no mural com horário e saída', 'Lista ordenada por data'],
  evidencia: ['Teste e2e abrindo a tela', 'Captura de tela no celular de 360 px', 'Teste que confere a ordem'],
  progresso: ['Começar pela tela inicial com a lista.', 'Primeiro passo: montar o AGENTS.md e o teste da primeira funcionalidade.'],
};

const sortear = (lista, sorteio) => lista[Math.floor(sorteio() * lista.length)];

// Uma mudança na lista de componentes: adiciona, edita o texto, move ou remove, sempre deixando a tela
// com 3 a 8 componentes.
export function mudancaAleatoria(lista, sorteio = Math.random) {
  const n = lista.length;
  const opcoes = [];
  if (n < 8) opcoes.push('adicionar');
  if (n < 3) return adicionar(lista, sortear(CATALOGO, sorteio).tipo);
  opcoes.push('editar', 'editar', 'mover');
  if (n > 3) opcoes.push('remover');
  const comp = sortear(lista, sorteio);
  switch (sortear(opcoes, sorteio)) {
    case 'adicionar': return adicionar(lista, sortear(CATALOGO, sorteio).tipo);
    case 'editar': return alterar(lista, comp.id, { texto: sortear(TEXTOS[comp.tipo] || ['Texto'], sorteio) });
    case 'mover': return mover(lista, comp.id, sorteio() < 0.5 ? -1 : 1);
    default: return remover(lista, comp.id);
  }
}

const temLetra = (texto) => typeof texto === 'string' && /[a-zA-Z0-9]/.test(texto);

function editar(tela, sorteio) {
  return { tipo: 'componentes', tid: tela.tid, mudar: (atual) => mudancaAleatoria(listaDeComponentes(atual), sorteio) };
}

function marcar(caminho, criterios, sorteio) {
  const chaves = listaDeCriterios(criterios).map((c) => c.chave);
  if (!chaves.length) return null;
  return { tipo: 'set', caminho: `${caminho}/${sortear(chaves, sorteio)}`, valor: sorteio() < 0.5 };
}

// O que o bot `uid` faz agora, olhando a sala inteira (como o controle a lê). Devolve null (nada),
// { tipo: 'set', caminho, valor } ou { tipo: 'componentes', tid, mudar(atual) } (uma transação).
// Os caminhos são relativos a salas/{sala}. Só propõe o que as regras deixam o grupo do bot fazer.
export function acaoDoBot(sala, uid, sorteio = Math.random) {
  const gid = sala?.alunos?.[uid]?.grupo;
  const fase = sala?.estado?.fase;
  if (!gid || !sala.grupos?.[gid]) return null;
  const { telas, config } = sala;
  const criterios = config?.criterios;
  switch (fase) {
    case 'r1':
    case 'r1_troca': {
      const tela = telaDoGrupo(telas, gid, 1);
      return tela ? editar(tela, sorteio) : null;
    }
    case 'r1_avaliacao': {
      const tela = telaDoGrupo(telas, gid, 1);
      return tela ? marcar(`telas/${tela.tid}/avaliacaoR1`, criterios, sorteio) : null;
    }
    case 'r2':
    case 'r2_troca': {
      const tela = telaDoGrupo(telas, gid, 2);
      if (!tela) return null;
      const trocou = !!sala.trocas?.r2_troca;
      if (fase === 'r2_troca' && !trocou) {
        if (tela.saiu) return null; // o grupo já saiu da sessão: espera a troca
        if (!temLetra(tela.progresso)) return { tipo: 'set', caminho: `telas/${tela.tid}/progresso`, valor: sortear(PROGRESSOS, sorteio) };
        if (sorteio() < 0.5) return { tipo: 'set', caminho: `telas/${tela.tid}/saiu`, valor: { por: uid, em: AGORA } };
        return editar(tela, sorteio);
      }
      const dado = sorteio();
      if (fase === 'r2' && (dado < 0.2 || (dado < 0.4 && !temLetra(tela.progresso)))) {
        return { tipo: 'set', caminho: `telas/${tela.tid}/progresso`, valor: sortear(PROGRESSOS, sorteio) };
      }
      if (dado > 0.8) return marcar(`telas/${tela.tid}/declarados`, criterios, sorteio);
      return editar(tela, sorteio);
    }
    case 'r2_declaracao': {
      const tela = telaDoGrupo(telas, gid, 2);
      return tela ? marcar(`telas/${tela.tid}/declarados`, criterios, sorteio) : null;
    }
    case 'r3': {
      const achada = Object.entries(telas || {})
        .find(([, t]) => t.rodada === 2 && t.revisao?.revisor === gid && !t.revisao.enviadoEm);
      if (!achada) return null;
      const [tid, tela] = achada;
      const chaves = listaDeCriterios(criterios).map((c) => c.chave);
      const falta = chaves.filter((c) => typeof tela.revisao.aprovados?.[c] !== 'boolean');
      if (!falta.length) return { tipo: 'set', caminho: `telas/${tid}/revisao/enviadoEm`, valor: AGORA };
      return { tipo: 'set', caminho: `telas/${tid}/revisao/aprovados/${sortear(falta, sorteio)}`, valor: sorteio() < 0.5 };
    }
    case 'oficina': {
      const caminho = `oficina/${gid}`;
      const harness = sala.oficina?.[gid] || {};
      if (!harness.projeto) return { tipo: 'set', caminho: `${caminho}/projeto`, valor: sortear(Object.keys(PROJETOS), sorteio) };
      const campos = ['projeto', 'agents', 'progresso'];
      for (let i = 0; i < N_FUNCIONALIDADES; i++) campos.push(`features/${i}/nome`, `features/${i}/aceite`, `features/${i}/evidencia`);
      const campo = sortear(campos, sorteio);
      const parte = campo.split('/').pop();
      const valor = parte === 'projeto' ? sortear(Object.keys(PROJETOS), sorteio) : sortear(OFICINA[parte], sorteio);
      return { tipo: 'set', caminho: `${caminho}/${campo}`, valor };
    }
    case 'votacao': {
      const opcoes = harnessesDaSala(sala.oficina, sala.grupos).filter((g) => g !== gid);
      if (!opcoes.length || (sala.votos?.[uid] && sorteio() < 0.8)) return null;
      return { tipo: 'set', caminho: `votos/${uid}`, valor: sortear(opcoes, sorteio) };
    }
    default:
      return null;
  }
}
