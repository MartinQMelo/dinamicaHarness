// Tela do aluno: entrada com nome, Auth anônimo e distribuição em grupos.
import { signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  ref, get, set, onValue, runTransaction, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { auth, db } from './firebase-config.js';
import { escolherGrupo, dadosDoGrupo, contarMembros } from './grupos.js';
import { criarEditor } from './editor.js';
import { nomeDaFase, RODADA_DA_TROCA } from './fases.js';
import { acompanharCronometro } from './cronometro.js';

// Fases em que o grupo edita a tela, e de qual rodada é a tela.
const RODADA_DE_EDICAO = { r1: 1, r1_troca: 1 };

const $ = (id) => document.getElementById(id);

function mostrar(secao) {
  for (const id of ['tela-sem-sala', 'tela-entrada', 'tela-grupo', 'tela-editor']) $(id).hidden = id !== secao;
}

function esperarUsuario() {
  return new Promise((resolve) => {
    const parar = onAuthStateChanged(auth, (user) => { parar(); resolve(user); });
  });
}

// Coloca o aluno num grupo com transação, para dois alunos simultâneos não estourarem o limite.
async function entrarEmGrupo(sala, uid) {
  const raiz = `salas/${sala}`;
  for (let tentativa = 0; tentativa < 30; tentativa++) {
    const [grupos, config, estado] = (await Promise.all([
      get(ref(db, `${raiz}/grupos`)), get(ref(db, `${raiz}/config`)), get(ref(db, `${raiz}/estado`)),
    ])).map((s) => s.val());
    const jaMembro = Object.entries(grupos || {}).find(([, g]) => g.membros?.[uid]);
    if (jaMembro) return jaMembro[0];

    const tamanho = config?.tamanhoGrupo || 5;
    const escolha = escolherGrupo(grupos, tamanho, estado?.fase);
    if (!escolha) throw new Error('sem-grupo');

    let resultado;
    try {
      resultado = await runTransaction(ref(db, `${raiz}/grupos/${escolha.gid}`), (atual) => {
        // null pode ser só o cache local vazio: propor a criação faz o servidor mandar o valor real.
        if (!atual) return { ...dadosDoGrupo(escolha.ordem), membros: { [uid]: true } };
        if (atual.membros?.[uid]) return; // já está
        if (estado?.fase === 'lobby' && contarMembros(atual) >= tamanho) return; // lotou: escolhe de novo
        return { ...atual, membros: { ...atual.membros, [uid]: true } };
      }, { applyLocally: false });
    } catch {
      continue; // regras recusaram (ex.: criar grupo fora do lobby): escolhe de novo
    }
    if (resultado.snapshot.child(`membros/${uid}`).val() === true) return escolha.gid;
  }
  throw new Error('sem-grupo');
}

function acompanharGrupo(sala, uid, gid) {
  let grupo = null;
  let alunos = {};
  const desenhar = () => {
    if (!grupo) return;
    $('grupo-nome').textContent = grupo.nome;
    $('editor-grupo').textContent = grupo.nome;
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

// A fase decide o que o celular mostra: espera no grupo ou o editor da tela.
function acompanharFase(sala, uid, gid) {
  let editor = null;
  let faseAnterior;
  $('fechar-aviso-sessao').addEventListener('click', () => { $('aviso-sessao').hidden = true; });
  onValue(ref(db, `salas/${sala}/config/frase`), (s) => { $('frase-tarefa').textContent = s.val() || ''; });
  acompanharCronometro(sala, $('cronometro'));
  onValue(ref(db, `salas/${sala}/estado/fase`), (s) => {
    $('fase-aluno').textContent = nomeDaFase(s.val());
    $('barra-fase').dataset.fase = s.val() || '';
    $('barra-fase').hidden = false;
    // Ao chegar numa fase de troca (ou abrir a página nela), o aviso de sessão nova aparece.
    if (s.val() !== faseAnterior) $('aviso-sessao').hidden = !RODADA_DA_TROCA[s.val()];
    faseAnterior = s.val();
    const rodada = RODADA_DE_EDICAO[s.val()];
    if (!rodada) { mostrar('tela-grupo'); return; }
    editor ||= criarEditor(sala, uid);
    editor.mostrar(gid, rodada);
    mostrar('tela-editor');
  });
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
      const gid = await entrarEmGrupo(sala, user.uid);
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
