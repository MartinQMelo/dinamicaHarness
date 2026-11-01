// Tela do aluno: entrada com nome, Auth anônimo e distribuição em grupos.
import { signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  ref, get, set, onValue, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { auth, db } from './firebase-config.js';
import { entrarEmGrupo } from './entrada.js';
import { criarEditor } from './editor.js';
import { criarAvaliacao } from './avaliacao.js';
import { criarCartoes } from './cartoes.js';
import { criarRevisao } from './revisao.js';
import { criarOficina } from './oficina.js';
import { criarVotacao } from './votacao.js';
import { nomeDaFase } from './fases.js';
import { acompanharCronometro } from './cronometro.js';

// Fases em que o grupo edita a tela, e de qual rodada é a tela.
const RODADA_DE_EDICAO = {
  r1: 1, r1_troca: 1, r2: 2, r2_troca: 2,
};
const FASES_DOS_CARTOES = ['r2', 'r2_troca', 'r2_declaracao'];
const FASES_DA_VOTACAO = ['votacao', 'fim']; // no fim, os harnesses continuam à vista, sem votar

const $ = (id) => document.getElementById(id);

function mostrar(secao) {
  for (const id of ['tela-sem-sala', 'tela-entrada', 'tela-grupo', 'tela-editor', 'tela-avaliacao', 'tela-declaracao', 'tela-revisao', 'tela-oficina', 'tela-votacao']) {
    $(id).hidden = id !== secao;
  }
}

function esperarUsuario() {
  return new Promise((resolve) => {
    const parar = onAuthStateChanged(auth, (user) => { parar(); resolve(user); });
  });
}

function acompanharGrupo(sala, uid, gid) {
  let grupo = null;
  let alunos = {};
  const desenhar = () => {
    if (!grupo) return;
    $('grupo-nome').textContent = grupo.nome;
    $('editor-grupo').textContent = grupo.nome;
    $('avaliacao-grupo').textContent = grupo.nome;
    $('declaracao-grupo').textContent = grupo.nome;
    $('revisao-grupo').textContent = grupo.nome;
    $('oficina-grupo').textContent = grupo.nome;
    $('votacao-grupo').textContent = grupo.nome;
    $('cartao-grupo').style.background = grupo.cor;
    document.documentElement.style.setProperty('--cor-grupo', grupo.cor);
    const colegas = Object.keys(grupo.membros || {}).filter((m) => m !== uid);
    const lista = $('lista-colegas');
    lista.replaceChildren(...colegas.map((m) => {
      const li = document.createElement('li');
      li.textContent = alunos[m]?.nome || '…';
      return li;
    }));
    $('sem-colegas').hidden = colegas.length > 0;
  };
  onValue(ref(db, `salas/${sala}/grupos/${gid}`), (s) => { grupo = s.val(); desenhar(); });
  onValue(ref(db, `salas/${sala}/alunos`), (s) => { alunos = s.val() || {}; desenhar(); });
}

// A fase decide o que o celular mostra: espera no grupo, o editor da tela (com os cartões na
// rodada 2), a avaliação da R1, a declaração da R2, a revisão da r3, a oficina ou a votação.
function acompanharFase(sala, uid, gid) {
  let editor = null;
  const avaliacao = criarAvaliacao(sala, gid);
  const cartoes = criarCartoes(sala, uid, gid);
  const revisao = criarRevisao(sala, gid);
  const oficina = criarOficina(sala, gid);
  const votacao = criarVotacao(sala, uid, gid);
  let fase;
  let trocaR2 = false; // na r2_troca, a troca só acontece quando o controle aperta o botão
  let sessaoAnterior;
  $('fechar-aviso-sessao').addEventListener('click', () => { $('aviso-sessao').hidden = true; });
  onValue(ref(db, `salas/${sala}/config/frase`), (s) => { $('frase-tarefa').textContent = s.val() || ''; });
  acompanharCronometro(sala, $('cronometro'));

  const atualizar = () => {
    $('fase-aluno').textContent = nomeDaFase(fase);
    $('barra-fase').dataset.fase = fase || '';
    $('barra-fase').hidden = !fase;
    // Ao receber uma tela herdada (ou abrir a página depois disso), o aviso de sessão nova aparece.
    const sessao = fase === 'r1_troca' || (fase === 'r2_troca' && trocaR2) ? fase : null;
    if (sessao !== sessaoAnterior) $('aviso-sessao').hidden = !sessao;
    sessaoAnterior = sessao;
    if (fase === 'r1_avaliacao') avaliacao.mostrar(); else avaliacao.esconder();
    if (FASES_DOS_CARTOES.includes(fase)) cartoes.mostrar(fase, trocaR2); else cartoes.esconder();
    if (fase === 'r3') revisao.mostrar(); else revisao.esconder();
    if (fase === 'oficina') oficina.mostrar(); else oficina.esconder();
    if (FASES_DA_VOTACAO.includes(fase)) votacao.mostrar(fase); else votacao.esconder();
    if (fase === 'oficina') { mostrar('tela-oficina'); return; }
    if (FASES_DA_VOTACAO.includes(fase)) { mostrar('tela-votacao'); return; }
    if (fase === 'r1_avaliacao') { mostrar('tela-avaliacao'); return; }
    if (fase === 'r3') { mostrar('tela-revisao'); return; }
    if (fase === 'r2_declaracao') { mostrar('tela-declaracao'); return; }
    const rodada = RODADA_DE_EDICAO[fase];
    if (!rodada) { mostrar('tela-grupo'); return; }
    editor ||= criarEditor(sala, uid);
    editor.mostrar(gid, rodada);
    mostrar('tela-editor');
  };
  onValue(ref(db, `salas/${sala}/estado/fase`), (s) => { fase = s.val(); atualizar(); });
  onValue(ref(db, `salas/${sala}/trocas/r2_troca`), (s) => { trocaR2 = s.exists(); atualizar(); });
}

function mostrarGrupo(sala, uid, aluno) {
  $('aluno-nome').textContent = aluno.nome;
  // O apresentador removeu o aluno (ou reiniciou a sala): recomeça pela tela de nome.
  onValue(ref(db, `salas/${sala}/alunos/${uid}`), (s) => { if (!s.exists()) location.reload(); });
  acompanharGrupo(sala, uid, aluno.grupo);
  acompanharFase(sala, uid, aluno.grupo);
}

export async function iniciarAluno() {
  if (!auth) return;
  const sala = (new URLSearchParams(location.search).get('sala') || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(sala)) { mostrar('tela-sem-sala'); return; }
  $('codigo-sala').textContent = sala;

  const user = (await esperarUsuario()) || (await signInAnonymously(auth)).user;
  const estado = await get(ref(db, `salas/${sala}/estado`));
  if (!estado.exists()) {
    $('mensagem-sem-sala').textContent = `A sala ${sala} não existe. Confira o código no telão.`;
    mostrar('tela-sem-sala');
    return;
  }

  const salvo = (await get(ref(db, `salas/${sala}/alunos/${user.uid}`))).val();
  if (salvo?.grupo) { mostrarGrupo(sala, user.uid, salvo); return; }

  mostrar('tela-entrada');
  $('form-entrada').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const nome = $('nome').value.trim().slice(0, 30);
    if (!nome) return;
    $('erro-entrada').textContent = '';
    $('botao-entrar').disabled = true;
    try {
      const gid = await entrarEmGrupo(db, sala, user.uid);
      const aluno = { nome, grupo: gid, entrouEm: serverTimestamp() };
      await set(ref(db, `salas/${sala}/alunos/${user.uid}`), aluno);
      mostrarGrupo(sala, user.uid, aluno);
    } catch {
      $('erro-entrada').textContent = 'Não foi possível entrar agora. Tente de novo.';
    } finally {
      $('botao-entrar').disabled = false;
    }
  });
}
