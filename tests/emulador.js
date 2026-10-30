// Utilidades para preparar os emuladores nos testes (nunca o Firebase real).
import { readFileSync } from 'node:fs';

export const NS = 'demo-dinamica-default-rtdb';
const BANCO = 'http://127.0.0.1:9000';
const AUTH = 'http://127.0.0.1:9099';
const DONO = { Authorization: 'Bearer owner' }; // ignora as regras no emulador

export function urlBanco(caminho) {
  return `${BANCO}/${caminho}.json?ns=${NS}`;
}

// Carrega database.rules.json no emulador, para testar sempre a versão do arquivo.
export async function carregarRegras() {
  const r = await fetch(`${BANCO}/.settings/rules.json?ns=${NS}`, {
    method: 'PUT', headers: DONO, body: readFileSync('database.rules.json', 'utf8'),
  });
  if (!r.ok) throw new Error(`regras: ${r.status} ${await r.text()}`);
}

export async function gravarComoDono(caminho, valor) {
  const r = await fetch(urlBanco(caminho), { method: 'PUT', headers: DONO, body: JSON.stringify(valor) });
  if (!r.ok) throw new Error(`gravar ${caminho}: ${r.status}`);
}

export async function lerComoDono(caminho) {
  const r = await fetch(urlBanco(caminho), { headers: DONO });
  return r.json();
}

export async function criarUsuario(email, senha) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: senha, returnSecureToken: true }),
  });
  if (!r.ok) throw new Error(`criar usuário: ${r.status} ${await r.text()}`);
}

// Cria um apresentador com e-mail único e o cadastra em admins/.
export async function criarAdmin() {
  const email = `prof.${Date.now()}.${Math.floor(Math.random() * 1e6)}@unb.br`;
  const senha = 'senha-de-teste-123';
  await criarUsuario(email, senha);
  await gravarComoDono(`admins/${email.replaceAll('.', ',')}`, true);
  return { email, senha };
}
