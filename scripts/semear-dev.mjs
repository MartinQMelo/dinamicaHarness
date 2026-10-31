// Semeia no emulador um apresentador de teste (só desenvolvimento, nunca o Firebase real).
// Pode rodar várias vezes: se o usuário já existe, só garante o cadastro em admins/.
const NS = 'demo-dinamica-default-rtdb';
const BANCO = 'http://127.0.0.1:9000';
const AUTH = 'http://127.0.0.1:9099';
const EMAIL = 'admin@teste.com';
const SENHA = 'senha123';

const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: SENHA }),
});
if (!r.ok) {
  const erro = await r.text();
  if (!erro.includes('EMAIL_EXISTS')) throw new Error(`criar usuário: ${r.status} ${erro}`);
}

const chave = EMAIL.replaceAll('.', ',');
const a = await fetch(`${BANCO}/admins/${chave}.json?ns=${NS}`, {
  method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: 'true',
});
if (!a.ok) throw new Error(`cadastrar admin: ${a.status} ${await a.text()}`);

console.log(`OK: apresentador de teste ${EMAIL} / ${SENHA} em admins/.`);
console.log('Controle: http://localhost:5173/controle.html');
