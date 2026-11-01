// Controle do apresentador: login, criação de sala, fases, cronômetro e grupos.
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  ref, get, set, update, onValue, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { auth, db } from './firebase-config.js';
import {
  nomeDaFase, proximaFase, faseAnterior, atualizacaoDeFase, atualizacaoDeReinicio, atualizacaoDeTroca,
  contarProntos, TROCA_AO_ENTRAR,
} from './fases.js';
import { acompanharCronometro, agoraNoServidor } from './cronometro.js';
import { contarMembros } from './grupos.js';

export const FRASE_R1 = 'Monte a tela inicial de um app de caronas para alunos da UnB.';
export const TAMANHO_GRUPO_PADRAO = 5;
export const CRITERIOS_PADRAO = {
  c1: 'O botão "Oferecer carona" é o primeiro componente da tela.',
  c2: 'A lista de caronas mostra horário e ponto de saída em cada item (ex.: "18h · ICC Norte").',
  c3: 'Existe um filtro por campus com Darcy Ribeiro, Gama, Ceilândia e Planaltina.',
  c4: 'Não há componente de Chat nem de Pagamento (fora do escopo).',
  c5: 'A tela tem no máximo 6 componentes.',
};

const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sem I e O, que confundem com 1 e 0

export function codificarEmail(email) {
  return email.toLowerCase().replaceAll('.', ',');
}

function gerarCodigo() {
  let codigo = '';
  for (let i = 0; i < 4; i++) codigo += LETRAS[Math.floor(Math.random() * LETRAS.length)];
  return codigo;
}

async function criarSala() {
  let codigo;
  for (let tentativa = 0; tentativa < 20; tentativa++) {
    const candidato = gerarCodigo();
    if (!(await get(ref(db, `salas/${candidato}/estado`))).exists()) { codigo = candidato; break; }
  }
  if (!codigo) throw new Error('Não foi possível gerar um código livre.');
  await set(ref(db, `salas/${codigo}`), {
    estado: { fase: 'lobby', timerFim: 0, atualizadoEm: serverTimestamp() },
    config: { tamanhoGrupo: TAMANHO_GRUPO_PADRAO, frase: FRASE_R1 },
    segredo: { criterios: CRITERIOS_PADRAO },
  });
  return codigo;
}

const $ = (id) => document.getElementById(id);

function mostrar(secao) {
  for (const id of ['tela-login', 'tela-painel']) $(id).hidden = id !== secao;
}

let sala = null; // código da sala aberta; também fica na URL (?sala=) para sobreviver ao recarregar
let pararSala = [];

function desenharFase(fase) {
  const proxima = proximaFase(fase);
  $('fase-atual').textContent = nomeDaFase(fase);
  $('fase-atual').dataset.fase = fase || '';
  $('botao-avancar').disabled = !proxima;
  $('botao-voltar').disabled = !faseAnterior(fase);
  $('proxima-fase').textContent = proxima ? `Próxima: ${nomeDaFase(proxima)}` : 'Última fase.';
  // Na R1, a troca de sessão é a passagem para a fase de troca: muda a fase e os donos juntos.
  $('acao-troca').hidden = !TROCA_AO_ENTRAR.includes(proxima);
}

// Na r2_troca, os grupos saem da sessão e o apresentador troca as telas quando quiser (Decisão 3).
function desenharTrocaR2(fase, telas, grupos, trocas) {
  $('acao-troca-r2').hidden = fase !== 'r2_troca';
  const { prontos, total } = contarProntos(telas, grupos);
  $('controle-prontos').textContent = `${prontos} de ${total} ${total === 1 ? 'grupo pronto' : 'grupos prontos'}`;
  const feita = !!trocas?.r2_troca;
  const botao = $('botao-trocar-r2');
  botao.hidden = feita;
  botao.textContent = prontos === total ? 'Trocar sessão' : 'Forçar troca';
  $('dica-troca-r2').textContent = feita
    ? 'Troca feita. Voltar para a Rodada 2 desfaz a troca.'
    : 'Cada tela passa para o próximo grupo, mesmo a de quem ainda não saiu.';
}

async function trocarSessaoR2() {
  const [estado, grupos, telas, trocas] = (await Promise.all(['estado', 'grupos', 'telas', 'trocas']
    .map((filho) => get(ref(db, `salas/${sala}/${filho}`))))).map((s) => s.val());
  if (estado?.fase !== 'r2_troca' || trocas?.r2_troca) return;
  await update(ref(db, `salas/${sala}`), atualizacaoDeTroca('r2_troca', { grupos, telas }));
}

function desenharGrupos(grupos, alunos) {
  const lista = Object.entries(grupos || {}).sort(([, a], [, b]) => a.ordem - b.ordem);
  $('sem-grupos').hidden = lista.length > 0;
  $('controle-grupos').replaceChildren(...lista.map(([gid, g]) => {
    const li = document.createElement('li');
    li.dataset.gid = gid;
    li.style.setProperty('--cor-grupo', g.cor);
    const titulo = document.createElement('p');
    titulo.className = 'controle-grupo-nome';
    const n = contarMembros(g);
    titulo.textContent = `${g.nome} · ${n} ${n === 1 ? 'aluno' : 'alunos'}`;
    const membros = document.createElement('ul');
    const chegada = (uid) => alunos?.[uid]?.entrouEm ?? Infinity;
    const uids = Object.keys(g.membros || {}).sort((a, b) => chegada(a) - chegada(b));
    membros.append(...uids.map((uid) => {
      const m = document.createElement('li');
      m.dataset.uid = uid;
      const nome = alunos?.[uid]?.nome || '(sem nome)';
      const rotulo = document.createElement('span');
      rotulo.textContent = nome;
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'perigo';
      botao.textContent = 'Remover';
      botao.setAttribute('aria-label', `Remover ${nome} do grupo ${g.nome}`);
      botao.addEventListener('click', () => removerAluno(gid, uid, nome));
      m.append(rotulo, ' ', botao);
      return m;
    }));
    li.append(titulo, membros);
    return li;
  }));
}

// O aluno sai do grupo e perde o registro; o celular volta à tela de nome e entra de novo.
async function removerAluno(gid, uid, nome) {
  if (!confirm(`Remover ${nome} do grupo?`)) return;
  await executar(() => update(ref(db, `salas/${sala}`), {
    [`grupos/${gid}/membros/${uid}`]: null,
    [`alunos/${uid}`]: null,
  }));
}

async function irParaFase(para) {
  if (!para) return;
  const [grupos, telas, trocas, segredo, config] = (await Promise.all(['grupos', 'telas', 'trocas', 'segredo', 'config']
    .map((filho) => get(ref(db, `salas/${sala}/${filho}`))))).map((s) => s.val());
  await update(ref(db, `salas/${sala}`), atualizacaoDeFase(para, {
    grupos, telas, trocas, segredo, config,
  }, serverTimestamp()));
}

async function executar(acao) {
  $('erro-painel').textContent = '';
  try {
    await acao();
  } catch {
    $('erro-painel').textContent = 'Não foi possível gravar. Confira a conexão e tente de novo.';
  }
}

function abrirSala(codigo) {
  for (const parar of pararSala) parar();
  sala = codigo;
  $('sala-codigo').textContent = codigo;
  const base = new URL('.', location.href);
  $('link-telao').href = new URL(`telao.html?sala=${codigo}`, base).href;
  $('link-aluno').textContent = new URL(`index.html?sala=${codigo}`, base).href;
  $('sala-criada').hidden = false;
  history.replaceState(null, '', `?sala=${codigo}`);

  let fase = null;
  let grupos = {};
  let alunos = {};
  let telas = {};
  let trocas = {};
  const desenharTroca = () => desenharTrocaR2(fase, telas, grupos, trocas);
  pararSala = [
    onValue(ref(db, `salas/${codigo}/estado/fase`), (s) => { fase = s.val(); desenharFase(fase); desenharTroca(); }),
    onValue(ref(db, `salas/${codigo}/grupos`), (s) => {
      grupos = s.val() || {};
      desenharGrupos(grupos, alunos);
      desenharTroca();
    }),
    onValue(ref(db, `salas/${codigo}/telas`), (s) => { telas = s.val() || {}; desenharTroca(); }),
    onValue(ref(db, `salas/${codigo}/trocas`), (s) => { trocas = s.val() || {}; desenharTroca(); }),
    onValue(ref(db, `salas/${codigo}/alunos`), (s) => { alunos = s.val() || {}; desenharGrupos(grupos, alunos); }),
    acompanharCronometro(codigo, $('cronometro')),
  ];
  $('botao-avancar').onclick = () => executar(() => irParaFase(proximaFase(fase)));
  $('botao-voltar').onclick = () => executar(() => irParaFase(faseAnterior(fase)));
  $('botao-trocar-sessao').onclick = () => {
    if (TROCA_AO_ENTRAR.includes(proximaFase(fase))) executar(() => irParaFase(proximaFase(fase)));
  };
  $('botao-trocar-r2').onclick = () => executar(trocarSessaoR2);
}

export function iniciarControle() {
  if (!auth) return;

  $('form-login').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    $('erro-login').textContent = '';
    try {
      await signInWithEmailAndPassword(auth, $('email').value.trim(), $('senha').value);
    } catch {
      $('erro-login').textContent = 'E-mail ou senha incorretos.';
    }
  });

  $('botao-sair').addEventListener('click', () => signOut(auth));

  $('botao-criar-sala').addEventListener('click', async () => {
    $('erro-painel').textContent = '';
    $('botao-criar-sala').disabled = true;
    try {
      abrirSala(await criarSala());
    } catch {
      $('erro-painel').textContent = 'Não foi possível criar a sala. Confira se seu e-mail está cadastrado como admin.';
    } finally {
      $('botao-criar-sala').disabled = false;
    }
  });

  $('botao-reiniciar').addEventListener('click', () => {
    if (!confirm(`Reiniciar a sala ${sala}? Todos os alunos, grupos e telas serão apagados.`)) return;
    executar(() => update(ref(db, `salas/${sala}`), atualizacaoDeReinicio(serverTimestamp())));
  });

  $('botao-cronometro').addEventListener('click', () => {
    const minutos = Number($('minutos').value);
    if (!(minutos > 0)) { $('erro-painel').textContent = 'Informe os minutos do cronômetro.'; return; }
    executar(() => set(ref(db, `salas/${sala}/estado/timerFim`), Math.round(agoraNoServidor() + minutos * 60_000)));
  });
  $('botao-parar-cronometro').addEventListener('click', () => {
    executar(() => set(ref(db, `salas/${sala}/estado/timerFim`), 0));
  });

  onAuthStateChanged(auth, async (user) => {
    if (!user || user.isAnonymous || !user.email) { mostrar('tela-login'); return; }
    $('usuario-email').textContent = user.email;
    $('sala-criada').hidden = true;
    $('erro-painel').textContent = '';
    mostrar('tela-painel');
    let admin = false;
    try {
      admin = (await get(ref(db, `admins/${codificarEmail(user.email)}`))).val() === true;
    } catch { /* sem permissão de leitura = não é admin */ }
    $('aviso-nao-admin').hidden = admin;
    $('botao-criar-sala').disabled = !admin;

    const pedida = (new URLSearchParams(location.search).get('sala') || '').trim().toUpperCase();
    if (admin && /^[A-Z0-9]{4}$/.test(pedida) && (await get(ref(db, `salas/${pedida}/estado`))).exists()) {
      abrirSala(pedida);
    }
  });
}
