// Editor de tela do celular: o grupo edita junto, em tempo real, a tela que tem em mãos.
// Toda mudança é uma transação em telas/{tid}/componentes; a lista vive só no banco.
import { ref, onValue, runTransaction } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { db } from './firebase-config.js';
import {
  CATALOGO, TEXTO_MAXIMO, infoDoTipo, telaDoGrupo, listaDeComponentes, novoId,
  adicionar, alterar, mover, remover, desenharTela,
} from './tela.js';

const $ = (id) => document.getElementById(id);
const ESPERA_TEXTO = 250; // ms entre a digitação e a gravação

export function criarEditor(sala, uid) {
  let gid = null;
  let rodada = null;
  let telas = {};
  let nomes = {};
  let selecionado = null; // só a seleção (de interface) fica na página
  let tela = null;
  let textoPendente = null;

  const aplicar = (fn) => {
    if (!tela) return Promise.resolve();
    const caminho = `salas/${sala}/telas/${tela.tid}/componentes`;
    return runTransaction(ref(db, caminho), (atual) => {
      const nova = fn(listaDeComponentes(atual));
      return nova.length ? nova : null;
    }).catch(() => { $('erro-editor').textContent = 'Não foi possível salvar. Tente de novo.'; });
  };

  const gravarTexto = () => {
    if (!textoPendente) return;
    const { id, texto, timer } = textoPendente;
    clearTimeout(timer);
    textoPendente = null;
    aplicar((l) => alterar(l, id, { texto }));
  };

  function selecionar(id) {
    if (id !== selecionado) gravarTexto();
    selecionado = id;
    desenhar();
  }

  function desenhar() {
    tela = gid ? telaDoGrupo(telas, gid, rodada) : null;
    $('editor-aguardando').hidden = !!tela;
    $('editor-area').hidden = !tela;
    if (!tela) return;

    let lista = listaDeComponentes(tela.componentes);
    if (!lista.some((c) => c.id === selecionado)) selecionado = null;
    // Desenha já com o que está sendo digitado, para a moldura não pular quando a gravação chegar.
    if (textoPendente) lista = alterar(lista, textoPendente.id, { texto: textoPendente.texto });

    const moldura = desenharTela(lista, { nomes, eu: uid });
    for (const c of moldura.querySelectorAll('.comp')) {
      c.tabIndex = 0;
      c.setAttribute('role', 'button');
      c.setAttribute('aria-label', `Editar ${infoDoTipo(c.dataset.tipo)?.nome || c.dataset.tipo}`);
      c.classList.toggle('selecionado', c.dataset.id === selecionado);
    }
    $('editor-moldura').replaceChildren(moldura);

    const comp = lista.find((c) => c.id === selecionado);
    $('painel-componente').hidden = !comp;
    if (!comp) return;
    const i = lista.indexOf(comp);
    const info = infoDoTipo(comp.tipo);
    $('painel-tipo').textContent = info?.nome || comp.tipo;
    $('dica-componente').textContent = info?.dica || '';
    const campo = $('texto-componente');
    if (document.activeElement !== campo || campo.dataset.id !== comp.id) {
      campo.value = comp.texto || '';
      campo.dataset.id = comp.id;
    }
    $('mover-cima').disabled = i === 0;
    $('mover-baixo').disabled = i === lista.length - 1;
  }

  // Seleção por delegação: o toque sai do campo de texto, o blur grava e a moldura é redesenhada
  // antes do click, que se perderia. pointerdown e pointerup no mesmo componente (pelo id) valem.
  const moldura = $('editor-moldura');
  const idDo = (ev) => ev.target.closest?.('.comp')?.dataset.id;
  let idPressionado = null;
  moldura.addEventListener('pointerdown', (ev) => { idPressionado = idDo(ev); });
  moldura.addEventListener('pointercancel', () => { idPressionado = null; });
  moldura.addEventListener('pointerup', (ev) => {
    const id = idDo(ev);
    if (id && id === idPressionado) selecionar(id);
    idPressionado = null;
  });
  moldura.addEventListener('keydown', (ev) => {
    const id = idDo(ev);
    if (id && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); selecionar(id); }
  });

  // Catálogo e botões do painel (uma vez só).
  $('catalogo-grade').replaceChildren(...CATALOGO.map(({ tipo, nome }) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'secundario';
    b.dataset.tipo = tipo;
    b.textContent = nome;
    b.addEventListener('click', () => {
      const id = novoId();
      $('catalogo').hidden = true;
      selecionar(id);
      aplicar((l) => adicionar(l, tipo, id));
    });
    return b;
  }));
  $('abrir-catalogo').addEventListener('click', () => { $('catalogo').hidden = !$('catalogo').hidden; });
  $('fechar-catalogo').addEventListener('click', () => { $('catalogo').hidden = true; });
  $('mover-cima').addEventListener('click', () => { gravarTexto(); aplicar((l) => mover(l, selecionado, -1)); });
  $('mover-baixo').addEventListener('click', () => { gravarTexto(); aplicar((l) => mover(l, selecionado, 1)); });
  $('remover').addEventListener('click', () => {
    const id = selecionado;
    textoPendente && clearTimeout(textoPendente.timer);
    textoPendente = null;
    selecionado = null;
    aplicar((l) => remover(l, id));
  });

  const campo = $('texto-componente');
  campo.maxLength = TEXTO_MAXIMO;
  campo.addEventListener('input', () => {
    const id = campo.dataset.id;
    if (textoPendente && textoPendente.id !== id) gravarTexto();
    clearTimeout(textoPendente?.timer);
    textoPendente = { id, texto: campo.value.slice(0, TEXTO_MAXIMO), timer: setTimeout(gravarTexto, ESPERA_TEXTO) };
    desenhar();
  });
  campo.addEventListener('focus', () => {
    const id = campo.dataset.id;
    aplicar((l) => alterar(l, id, { editandoPor: uid }));
  });
  campo.addEventListener('blur', () => {
    const id = campo.dataset.id;
    gravarTexto();
    aplicar((l) => (l.find((c) => c.id === id)?.editandoPor === uid ? alterar(l, id, { editandoPor: null }) : l));
  });

  onValue(ref(db, `salas/${sala}/telas`), (s) => { telas = s.val() || {}; desenhar(); });
  onValue(ref(db, `salas/${sala}/alunos`), (s) => {
    nomes = Object.fromEntries(Object.entries(s.val() || {}).map(([u, a]) => [u, a.nome]));
    desenhar();
  });

  return {
    mostrar(novoGid, novaRodada) {
      gid = novoGid;
      rodada = novaRodada;
      desenhar();
    },
  };
}
