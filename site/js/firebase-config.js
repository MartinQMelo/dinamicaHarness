// Configuração do Firebase. Não é segredo: pode ficar no repositório.
// Troque os valores "COLE_AQUI" pelo objeto firebaseConfig do console
// (Configurações do projeto → Seus apps → Web). Em localhost nada disso é usado:
// a página conecta nos emuladores.
import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, initializeAuth, inMemoryPersistence, connectAuthEmulator,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getDatabase, connectDatabaseEmulator } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';

export const firebaseConfig = {
  apiKey: 'COLE_AQUI',
  authDomain: 'COLE_AQUI',
  databaseURL: 'COLE_AQUI',
  projectId: 'COLE_AQUI',
  storageBucket: 'COLE_AQUI',
  messagingSenderId: 'COLE_AQUI',
  appId: 'COLE_AQUI',
};

const PROJETO_EMULADOR = 'demo-dinamica';

export const usaEmulador = ['localhost', '127.0.0.1'].includes(location.hostname);
export const configPreenchida = !Object.values(firebaseConfig).some((v) => String(v).includes('COLE_AQUI'));

function mostrarAvisoConfig() {
  const aviso = document.createElement('div');
  aviso.setAttribute('role', 'alert');
  aviso.className = 'aviso-config';
  aviso.textContent =
    'Firebase não configurado: preencha site/js/firebase-config.js com o firebaseConfig do seu projeto.';
  document.body.prepend(aviso);
}

let app = null;
let auth = null;
let db = null;

if (usaEmulador) {
  app = initializeApp({
    apiKey: 'demo-api-key',
    authDomain: `${PROJETO_EMULADOR}.firebaseapp.com`,
    databaseURL: `https://${PROJETO_EMULADOR}-default-rtdb.firebaseio.com`,
    projectId: PROJETO_EMULADOR,
  });
  auth = getAuth(app);
  connectAuthEmulator(auth, `http://${location.hostname}:9099`, { disableWarnings: true });
  db = getDatabase(app);
  connectDatabaseEmulator(db, location.hostname, 9000);
} else if (configPreenchida) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);
} else {
  mostrarAvisoConfig();
}

document.documentElement.dataset.firebase = usaEmulador ? 'emulador' : configPreenchida ? 'real' : 'sem-config';

// Outra conexão, com o seu próprio usuário (só na memória: some ao fechar a página). Usada pelos
// alunos-bot do modo ensaio. fechar() desliga a conexão.
export function criarConexaoExtra(nome) {
  if (!app) return null;
  const extra = initializeApp(app.options, nome);
  const authExtra = initializeAuth(extra, { persistence: inMemoryPersistence });
  const dbExtra = getDatabase(extra);
  if (usaEmulador) {
    connectAuthEmulator(authExtra, `http://${location.hostname}:9099`, { disableWarnings: true });
    connectDatabaseEmulator(dbExtra, location.hostname, 9000);
  }
  return { auth: authExtra, db: dbExtra, fechar: () => deleteApp(extra) };
}

export { app, auth, db };
