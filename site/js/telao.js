// Telão: no lobby mostra o QR code, o link e a contagem de alunos e grupos ao vivo. Só lê o banco.
import { signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { ref, onValue } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import qrcode from 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm';
import { auth, db } from './firebase-config.js';
import { contarMembros } from './grupos.js';

const $ = (id) => document.getElementById(id);

function mostrar(secao) {
  for (const id of ['telao-sem-sala', 'telao-lobby', 'telao-outra-fase']) $(id).hidden = id !== secao;
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
  onValue(ref(db, `${raiz}/estado`), (s) => {
    const estado = s.val();
    if (!estado) {
      $('mensagem-telao-sem-sala').textContent = `A sala ${sala} não existe.`;
      mostrar('telao-sem-sala');
    } else if (estado.fase === 'lobby') {
      mostrar('telao-lobby');
    } else {
      $('telao-fase').textContent = estado.fase;
      mostrar('telao-outra-fase');
    }
  });
  onValue(ref(db, `${raiz}/alunos`), (s) => {
    const n = Object.keys(s.val() || {}).length;
    $('contagem-alunos').textContent = n;
    $('rotulo-alunos').textContent = plural(n, 'aluno', 'alunos');
  });
  onValue(ref(db, `${raiz}/grupos`), (s) => desenharGrupos(s.val()));
}
