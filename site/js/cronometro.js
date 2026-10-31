// Cronômetro da fase: estado/timerFim é um instante (ms epoch) no relógio do servidor. Cada página
// corrige o próprio relógio com .info/serverTimeOffset, então todas mostram a mesma contagem.
import { ref, onValue } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { db } from './firebase-config.js';

let offset = 0;
let acompanhandoOffset = false;

function acompanharOffset() {
  if (acompanhandoOffset) return;
  acompanhandoOffset = true;
  onValue(ref(db, '.info/serverTimeOffset'), (s) => { offset = s.val() || 0; });
}

export function agoraNoServidor() {
  acompanharOffset();
  return Date.now() + offset;
}

export function formatarTempo(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Mostra a contagem regressiva da sala no elemento; some quando não há cronômetro (timerFim 0).
// Devolve a função que para de acompanhar.
export function acompanharCronometro(sala, elemento) {
  acompanharOffset();
  let fim = 0;
  const atualizar = () => {
    elemento.hidden = !fim;
    if (!fim) return;
    const restante = Math.max(0, fim - agoraNoServidor());
    elemento.dataset.restante = String(Math.ceil(restante / 1000));
    elemento.classList.toggle('esgotado', restante === 0);
    elemento.textContent = restante ? `⏱ ${formatarTempo(restante)}` : '⏱ Tempo esgotado';
  };
  const parar = onValue(ref(db, `salas/${sala}/estado/timerFim`), (s) => { fim = s.val() || 0; atualizar(); });
  const intervalo = setInterval(atualizar, 250);
  return () => { parar(); clearInterval(intervalo); };
}
