// Avaliação da rodada 1 no celular: os critérios revelados e a tela em mãos, com uma caixa por critério.
// Cada marcação grava telas/{tid}/avaliacaoR1/{c}; as caixas só refletem o banco.
import { ref, onValue, set } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { db } from './firebase-config.js';
import { telaDoGrupo, desenharTela } from './tela.js';
import { listaDeCriterios, contarMarcados } from './criterios.js';

const $ = (id) => document.getElementById(id);

export function criarAvaliacao(sala, gid) {
  let criterios = null;
  let telas = {};
  let parar = [];

  function desenhar() {
    const tela = telaDoGrupo(telas, gid, 1);
    const lista = listaDeCriterios(criterios);
    $('avaliacao-aguardando').hidden = !!(tela && lista.length);
    $('avaliacao-area').hidden = !(tela && lista.length);
    if (!tela || !lista.length) return;
    $('avaliacao-moldura').replaceChildren(desenharTela(tela.componentes));
    const marcas = tela.avaliacaoR1 || {};
    $('avaliacao-criterios').replaceChildren(...lista.map(({ chave, texto }, i) => {
      const li = document.createElement('li');
      const label = document.createElement('label');
      const caixa = document.createElement('input');
      caixa.type = 'checkbox';
      caixa.dataset.criterio = chave;
      caixa.checked = marcas[chave] === true;
      caixa.addEventListener('change', () => {
        $('erro-avaliacao').textContent = '';
        set(ref(db, `salas/${sala}/telas/${tela.tid}/avaliacaoR1/${chave}`), caixa.checked)
          .catch(() => { $('erro-avaliacao').textContent = 'Não foi possível salvar. Tente de novo.'; });
      });
      const rotulo = document.createElement('span');
      rotulo.textContent = `${i + 1}. ${texto}`;
      label.append(caixa, rotulo);
      li.append(label);
      return li;
    }));
    const n = contarMarcados(marcas);
    $('avaliacao-total').textContent = `${n} de ${lista.length} ${lista.length === 1 ? 'critério cumprido' : 'critérios cumpridos'}`;
  }

  return {
    // config/criterios só pode ser lido da r1_avaliacao em diante: a escuta começa ao entrar na fase
    // e acaba ao sair (uma escuta negada pelas regras é cancelada e não volta sozinha).
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
