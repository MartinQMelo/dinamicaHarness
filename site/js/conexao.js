// Marca no <html> se a página está conectada ao banco (data-conectado="sim"/"nao").
import { ref, onValue } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { db } from './firebase-config.js';

export function acompanharConexao() {
  if (!db) return;
  onValue(ref(db, '.info/connected'), (snap) => {
    document.documentElement.dataset.conectado = snap.val() ? 'sim' : 'nao';
  });
}
