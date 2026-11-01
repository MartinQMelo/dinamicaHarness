// Revisão da rodada 3 no celular: o grupo revisor vê só a tela da R2 que recebeu e aprova ou reprova cada
// critério (telas/{tid}/revisao/aprovados). As marcações do autor (declarados) só aparecem depois de
// enviar (revisao/enviadoEm). As escolhas ficam no banco, para o grupo inteiro ver as mesmas.
import { ref, onValue, set, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { db } from './firebase-config.js';
import { desenharTela } from './tela.js';
import { listaDeCriterios, contarMarcados, vitoriasFalsas } from './criterios.js';

const $ = (id) => document.getElementById(id);

// A tela da rodada 2 que o grupo revisa, ou null.
export function telaParaRevisar(telas, gid) {
  const achada = Object.entries(telas || {}).find(([, t]) => t.rodada === 2 && t.revisao?.revisor === gid);
  return achada ? { tid: achada[0], ...achada[1] } : null;
}

function el(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

export function criarRevisao(sala, gid) {
  let criterios = null;
  let telas = {};
  let parar = [];

  const erro = () => { $('erro-revisao').textContent = 'Não foi possível salvar. Tente de novo.'; };

  function desenhar() {
    const tela = telaParaRevisar(telas, gid);
    const lista = listaDeCriterios(criterios);
    $('revisao-aguardando').hidden = !!(tela && lista.length);
    $('revisao-area').hidden = !(tela && lista.length);
    if (!tela || !lista.length) return;
    const aprovados = tela.revisao?.aprovados || {};
    const enviada = !!tela.revisao?.enviadoEm;
    const falsas = vitoriasFalsas(tela);
    $('revisao-moldura').replaceChildren(desenharTela(tela.componentes));
    $('revisao-criterios').replaceChildren(...lista.map(({ chave, texto }, i) => {
      const li = el('li');
      li.dataset.criterio = chave;
      li.append(el('p', 'revisao-texto', `${i + 1}. ${texto}`));
      const opcoes = el('div', 'revisao-opcoes');
      for (const [valor, rotulo] of [[true, 'Aprova'], [false, 'Reprova']]) {
        const label = el('label', 'revisao-opcao');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = `revisao-${chave}`;
        radio.value = valor ? 'aprova' : 'reprova';
        radio.checked = aprovados[chave] === valor;
        radio.disabled = enviada;
        radio.addEventListener('change', () => {
          $('erro-revisao').textContent = '';
          set(ref(db, `salas/${sala}/telas/${tela.tid}/revisao/aprovados/${chave}`), valor).catch(erro);
        });
        label.append(radio, ` ${rotulo}`);
        opcoes.append(label);
      }
      li.append(opcoes);
      // Só depois de enviar: o que o agente declarou, e a vitória falsa quando declarou e foi reprovado.
      if (enviada) {
        const declarado = tela.declarados?.[chave] === true;
        li.append(el('p', 'revisao-declarado', `O agente disse: ${declarado ? 'pronto' : 'não pronto'}`));
        if (falsas.includes(chave)) {
          li.classList.add('vitoria-falsa');
          li.append(el('p', 'selo-vitoria-falsa', 'Vitória falsa'));
        }
      }
      return li;
    }));
    const decididos = lista.filter(({ chave }) => typeof aprovados[chave] === 'boolean').length;
    $('revisao-total').textContent = enviada
      ? `Revisão enviada: ${contarMarcados(aprovados)} de ${lista.length} aprovados.`
      : `${decididos} de ${lista.length} critérios avaliados`;
    $('botao-enviar-revisao').hidden = enviada;
    $('botao-enviar-revisao').disabled = decididos < lista.length;
    $('revisao-falsas').hidden = !enviada;
    // Antes de enviar, nem no texto escondido: a página não pode conter as marcações do autor.
    $('revisao-falsas').textContent = !enviada ? '' : falsas.length
      ?`${falsas.length} ${falsas.length === 1 ? 'vitória falsa' : 'vitórias falsas'}: o agente disse que estava pronto, mas não estava.`
      : 'Nenhuma vitória falsa: tudo o que o agente disse que estava pronto estava mesmo.';
  }

  $('botao-enviar-revisao').addEventListener('click', () => {
    const tela = telaParaRevisar(telas, gid);
    if (!tela) return;
    $('erro-revisao').textContent = '';
    set(ref(db, `salas/${sala}/telas/${tela.tid}/revisao/enviadoEm`), serverTimestamp()).catch(erro);
  });

  return {
    mostrar() {
      if (parar.length) return;
      parar = [
        onValue(ref(db, `salas/${sala}/config/criterios`), (s) => { criterios = s.val(); desenhar(); },
          () => { criterios = null; desenhar(); }),
        onValue(ref(db, `salas/${sala}/telas`), (s) => { telas = s.val() || {}; desenhar(); }),
      ];
    },
    esconder() {
      for (const p of parar) p();
      parar = [];
      criterios = null;
    },
  };
}
