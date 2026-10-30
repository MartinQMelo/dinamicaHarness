// Controle do apresentador: login com e-mail e senha e criação de sala.
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  ref, get, set, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { auth, db } from './firebase-config.js';

export const FRASE_R1 = 'Monte a tela inicial de um app de caronas para alunos da UnB.';
export const TAMANHO_GRUPO_PADRAO = 5;
export const CRITERIOS_PADRAO = {
  1: 'O botão "Oferecer carona" é o primeiro componente da tela.',
  2: 'A lista de caronas mostra horário e ponto de saída em cada item (ex.: "18h · ICC Norte").',
  3: 'Existe um filtro por campus com Darcy Ribeiro, Gama, Ceilândia e Planaltina.',
  4: 'Não há componente de Chat nem de Pagamento (fora do escopo).',
  5: 'A tela tem no máximo 6 componentes.',
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

function mostrarSala(codigo) {
  $('sala-codigo').textContent = codigo;
  const base = new URL('.', location.href);
  $('link-telao').href = new URL(`telao.html?sala=${codigo}`, base).href;
  $('link-aluno').textContent = new URL(`index.html?sala=${codigo}`, base).href;
  $('sala-criada').hidden = false;
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
      mostrarSala(await criarSala());
    } catch {
      $('erro-painel').textContent = 'Não foi possível criar a sala. Confira se seu e-mail está cadastrado como admin.';
    } finally {
      $('botao-criar-sala').disabled = false;
    }
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
  });
}
