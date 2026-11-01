// Telão: no lobby mostra o QR code, o link e a contagem de alunos e grupos ao vivo. Só lê o banco.
import { signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { ref, onValue } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import qrcode from 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm';
import { auth, db } from './firebase-config.js';
import { contarMembros } from './grupos.js';
import { desenharTela } from './tela.js';
import { nomeDaFase, contarProntos } from './fases.js';
import {
  listaDeCriterios, contarMarcados, mediaDeCriterios, formatarMedia,
} from './criterios.js';
import { acompanharCronometro } from './cronometro.js';

const RODADA_DE_EDICAO = {
  r1: 1, r1_troca: 1, r2: 2, r2_troca: 2,
};

const $ = (id) => document.getElementById(id);

function mostrar(secao) {
  for (const id of ['telao-sem-sala', 'telao-lobby', 'telao-rodada', 'telao-avaliacao', 'telao-outra-fase']) {
    $(id).hidden = id !== secao;
  }
}

function esperarUsuario() {
  return new Promise((resolve) => {
    const parar = onAuthStateChanged(auth, (user) => { parar(); resolve(user); });
  });
}

// Desenha o QR no canvas, com margem branca de 4 módulos para os leitores de celular.
function desenharQr(canvas, texto) {
  const qr = qrcode(0, 'M');
  qr.addData(texto);
  qr.make();
  const n = qr.getModuleCount();
  const margem = 4;
  const modulo = Math.floor(canvas.width / (n + 2 * margem));
  const lado = modulo * (n + 2 * margem);
  canvas.width = lado;
  canvas.height = lado;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, lado, lado);
  ctx.fillStyle = '#000';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect((c + margem) * modulo, (r + margem) * modulo, modulo, modulo);
    }
  }
}

function plural(n, um, varios) {
  return n === 1 ? um : varios;
}

function desenharGrupos(grupos) {
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
function desenharTelas(telas, grupos, alunos, rodada) {
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
function desenharProntos(telas, grupos, fase) {
  $('telao-prontos').hidden = fase !== 'r2_troca';
  const { prontos, total } = contarProntos(telas, grupos);
  $('telao-prontos-n').textContent = `${prontos} de ${total}`;
  $('telao-prontos-rotulo').textContent = total === 1 ? 'grupo pronto' : 'grupos prontos';
}

// Placar da R1: a média de critérios cumpridos, os critérios revelados e quanto cada tela cumpriu.
function desenharPlacarR1(telas, grupos, criterios) {
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

export async function iniciarTelao() {
  if (!auth) return;
  const sala = (new URLSearchParams(location.search).get('sala') || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(sala)) { mostrar('telao-sem-sala'); return; }

  if (!(await esperarUsuario())) await signInAnonymously(auth);

  const link = new URL(`index.html?sala=${sala}`, location.href).href;
  $('telao-codigo').textContent = sala;
  $('link-telao').textContent = link;
  desenharQr($('qr-aluno'), link);

  const raiz = `salas/${sala}`;
  let rodada = null;
  let fase = null;
  let telas = {};
  let grupos = {};
  let alunos = {};
  let criterios = null;
  let pararCriterios = null;
  let placar = false;
  const redesenhar = () => {
    if (rodada) desenharTelas(telas, grupos, alunos, rodada);
    desenharProntos(telas, grupos, fase);
    if (placar) desenharPlacarR1(telas, grupos, criterios);
  };
  // config/criterios só pode ser lido da r1_avaliacao em diante: escuta só enquanto mostra o placar.
  const escutarCriterios = (ligar) => {
    if (ligar && !pararCriterios) {
      pararCriterios = onValue(ref(db, `${raiz}/config/criterios`), (s) => { criterios = s.val(); redesenhar(); },
        () => { criterios = null; redesenhar(); });
    } else if (!ligar && pararCriterios) {
      pararCriterios();
      pararCriterios = null;
      criterios = null;
    }
  };

  onValue(ref(db, `${raiz}/estado`), (s) => {
    const estado = s.val();
    fase = estado?.fase || null;
    document.body.dataset.fase = estado?.fase || '';
    placar = estado?.fase === 'r1_avaliacao';
    escutarCriterios(placar);
    if (!estado) {
      $('mensagem-telao-sem-sala').textContent = `A sala ${sala} não existe.`;
      mostrar('telao-sem-sala');
    } else if (estado.fase === 'lobby') {
      rodada = null;
      mostrar('telao-lobby');
    } else if (RODADA_DE_EDICAO[estado.fase]) {
      rodada = RODADA_DE_EDICAO[estado.fase];
      $('telao-rodada-titulo').textContent = `Rodada ${rodada}`;
      redesenhar();
      mostrar('telao-rodada');
    } else if (placar) {
      rodada = null;
      redesenhar();
      mostrar('telao-avaliacao');
    } else {
      rodada = null;
      $('telao-fase').textContent = nomeDaFase(estado.fase);
      mostrar('telao-outra-fase');
    }
  });
  acompanharCronometro(sala, $('cronometro'));
  onValue(ref(db, `${raiz}/config/frase`), (s) => { $('telao-frase').textContent = s.val() || ''; });
  onValue(ref(db, `${raiz}/telas`), (s) => { telas = s.val() || {}; redesenhar(); });
  onValue(ref(db, `${raiz}/alunos`), (s) => {
    alunos = s.val() || {};
    redesenhar();
    const n = Object.keys(alunos).length;
    $('contagem-alunos').textContent = n;
    $('rotulo-alunos').textContent = plural(n, 'aluno', 'alunos');
  });
  onValue(ref(db, `${raiz}/grupos`), (s) => {
    grupos = s.val() || {};
    desenharGrupos(grupos);
    redesenhar();
  });
}
