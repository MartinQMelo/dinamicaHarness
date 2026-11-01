// Telão: no lobby mostra o QR code, o link e a contagem de alunos e grupos ao vivo. Só lê o banco.
import { signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { ref, onValue } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import qrcode from 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm';
import { auth, db } from './firebase-config.js';
import { nomeDaFase } from './fases.js';
import { acompanharCronometro } from './cronometro.js';
import { contarVotos } from './harness.js';
import {
  RODADA_DE_EDICAO, TITULOS_DA_OFICINA, $, mostrar, plural, secaoDaFase, desenharGrupos, desenharTelas,
  desenharProntos, desenharPlacarR1, desenharResultado, desenharOficina,
} from './telao-desenho.js';

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
  let resultado = false;
  let oficina = {};
  let votos = {};
  let vencedor = null;
  const redesenhar = () => {
    if (TITULOS_DA_OFICINA[fase]) desenharOficina(fase, oficina, contarVotos(votos, alunos, oficina, grupos), grupos, vencedor);
    if (rodada) desenharTelas(telas, grupos, alunos, rodada);
    desenharProntos(telas, grupos, fase);
    if (placar) desenharPlacarR1(telas, grupos, criterios);
    if (resultado) desenharResultado(telas, grupos, criterios);
  };
  // config/criterios só pode ser lido da r1_avaliacao em diante: escuta só enquanto mostra um placar.
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
    vencedor = estado?.vencedor || null;
    document.body.dataset.fase = estado?.fase || '';
    placar = estado?.fase === 'r1_avaliacao';
    resultado = estado?.fase === 'resultado';
    escutarCriterios(placar || resultado);
    rodada = RODADA_DE_EDICAO[estado?.fase] || null;
    if (!estado) {
      $('mensagem-telao-sem-sala').textContent = `A sala ${sala} não existe.`;
      mostrar('telao-sem-sala');
      return;
    }
    if (rodada) $('telao-rodada-titulo').textContent = `Rodada ${rodada}`;
    $('telao-fase').textContent = nomeDaFase(estado.fase);
    redesenhar();
    mostrar(secaoDaFase(estado.fase));
  });
  acompanharCronometro(sala, $('cronometro'));
  onValue(ref(db, `${raiz}/config/frase`), (s) => { $('telao-frase').textContent = s.val() || ''; });
  onValue(ref(db, `${raiz}/telas`), (s) => { telas = s.val() || {}; redesenhar(); });
  onValue(ref(db, `${raiz}/oficina`), (s) => { oficina = s.val() || {}; redesenhar(); });
  onValue(ref(db, `${raiz}/votos`), (s) => { votos = s.val() || {}; redesenhar(); });
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
