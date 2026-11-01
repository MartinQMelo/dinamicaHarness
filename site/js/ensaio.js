// Modo ensaio: alunos-bot que entram na sala e jogam sozinhos enquanto o controle estiver aberto.
// Cada bot é um usuário anônimo de verdade, com a sua conexão, e grava pelas mesmas regras dos alunos.
// O que fazer em cada fase vem de bots.js, olhando a sala inteira como o controle a lê.
import { signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  ref, set, onValue, runTransaction, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { db, criarConexaoExtra } from './firebase-config.js';
import { entrarEmGrupo } from './entrada.js';
import { acaoDoBot, AGORA } from './bots.js';

const RITMO = 1500; // cada bot age, em média, a cada RITMO ms

let sala = null;
let estadoDaSala = null; // a sala inteira, lida pelo apresentador
let pararLeitura = null;
let relogio = null;
let bots = [];
let criados = 0;
let aoMudar = () => {};

const sortearEspera = () => RITMO * (0.5 + Math.random());

function trocarValor(valor) {
  if (valor === AGORA) return serverTimestamp();
  if (valor && typeof valor === 'object') return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, trocarValor(v)]));
  return valor;
}

async function agir(bot) {
  const acao = acaoDoBot(estadoDaSala, bot.uid);
  if (!acao) return;
  const raiz = `salas/${sala}`;
  if (acao.tipo === 'componentes') {
    await runTransaction(ref(bot.db, `${raiz}/telas/${acao.tid}/componentes`), (atual) => {
      const nova = acao.mudar(atual);
      return nova.length ? nova : null;
    });
  } else {
    await set(ref(bot.db, `${raiz}/${acao.caminho}`), trocarValor(acao.valor));
  }
}

function desligar(bot) {
  bots = bots.filter((b) => b !== bot);
  bot.conexao.fechar().catch(() => {});
  aoMudar(bots.length);
}

// A cada volta do relógio, cada bot que já pode agir faz uma coisa. Uma gravação recusada (a fase
// mudou no meio do caminho, outro bot do grupo foi mais rápido) só conta como falha e o bot segue.
function rodar() {
  if (!estadoDaSala) return;
  const agora = Date.now();
  for (const bot of [...bots]) {
    if (!bot.uid) continue;
    const presente = !!estadoDaSala.alunos?.[bot.uid];
    if (presente) bot.visto = true;
    else if (bot.visto) { desligar(bot); continue; } // removido ou sala reiniciada
    if (bot.ocupado || agora < bot.proxima) continue;
    bot.ocupado = true;
    agir(bot)
      .catch(() => { bot.falhas++; })
      .finally(() => { bot.ocupado = false; bot.proxima = Date.now() + sortearEspera(); });
  }
}

async function criarBot(numero) {
  const conexao = criarConexaoExtra(`bot-${sala}-${numero}`);
  const bot = {
    conexao, db: conexao.db, uid: null, nome: `Bot ${numero}`, ocupado: false, proxima: 0, falhas: 0, visto: false,
  };
  bots.push(bot);
  try {
    const { user } = await signInAnonymously(conexao.auth);
    const gid = await entrarEmGrupo(conexao.db, sala, user.uid);
    await set(ref(conexao.db, `salas/${sala}/alunos/${user.uid}`), { nome: bot.nome, grupo: gid, entrouEm: serverTimestamp() });
    bot.uid = user.uid;
    bot.proxima = Date.now() + sortearEspera();
  } catch {
    desligar(bot);
  }
}

// Liga os bots na sala aberta no controle (desliga os de outra sala). aoMudarBots(n) recebe quantos
// bots estão ativos.
export function usarSala(codigo, aoMudarBots) {
  if (codigo === sala) return;
  pararBots();
  sala = codigo;
  aoMudar = aoMudarBots;
  pararLeitura = onValue(ref(db, `salas/${codigo}`), (s) => { estadoDaSala = s.val(); });
  relogio = setInterval(rodar, 200);
}

export function pararBots() {
  for (const bot of [...bots]) desligar(bot);
  pararLeitura?.();
  clearInterval(relogio);
  sala = null;
  estadoDaSala = null;
}

// Cria n bots de uma vez. Os nomes continuam a numeração dos bots que já estão na sala.
export async function adicionarBots(n) {
  for (const aluno of Object.values(estadoDaSala?.alunos || {})) {
    const numero = Number(/^Bot (\d+)$/.exec(aluno.nome)?.[1]);
    if (numero > criados) criados = numero;
  }
  const criando = Promise.all(Array.from({ length: n }, () => criarBot(++criados)));
  aoMudar(bots.length);
  await criando;
  aoMudar(bots.length);
  return bots.length;
}

export function falhasDosBots() {
  return bots.reduce((total, b) => total + b.falhas, 0);
}
