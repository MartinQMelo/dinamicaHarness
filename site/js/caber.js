// Telão no projetor: a seção à vista sempre cabe na tela, sem rolagem, com qualquer número de grupos.
// Se não couber, reduz o conteúdo da seção com CSS zoom (o layout refaz as colunas) até caber.
const MENOR_ZOOM = 0.3;

// O título da fase e as frases nunca encolhem: o zoom vale só para o resto da seção.
const FIXOS = 'h2, .telao-frase, .telao-instrucao';

function caber() {
  const secoes = [...document.querySelectorAll('main > section')];
  const secao = secoes.find((s) => !s.hidden);
  for (const s of secoes) for (const filho of s.children) filho.style.zoom = '';
  if (!secao) return;
  const corpo = [...secao.children].filter((filho) => !filho.matches(FIXOS));
  const doc = document.documentElement;
  const cabe = () => doc.scrollHeight <= innerHeight && doc.scrollWidth <= innerWidth;
  const aplicar = (zoom) => { for (const filho of corpo) filho.style.zoom = String(zoom); };
  if (cabe()) return;
  // Busca binária pelo maior zoom que cabe.
  let cabeEm = MENOR_ZOOM;
  let naoCabeEm = 1;
  for (let i = 0; i < 8; i++) {
    const meio = (cabeEm + naoCabeEm) / 2;
    aplicar(meio);
    if (cabe()) cabeEm = meio; else naoCabeEm = meio;
  }
  aplicar(cabeEm);
}

let pedido = 0;

// Pede um ajuste para o próximo quadro (vários redesenhos seguidos viram um ajuste só).
export function caberNaTela() {
  cancelAnimationFrame(pedido);
  pedido = requestAnimationFrame(caber);
}

export function ajustarSempre() {
  addEventListener('resize', caberNaTela);
  document.fonts?.ready.then(caberNaTela);
}
