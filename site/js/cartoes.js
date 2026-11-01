// Rodada 2 no celular: os três cartões de harness (AGENTS.md, feature_list e progress.md), a saída da
// sessão na r2_troca e a declaração na r2_declaracao. Tudo é lido e gravado na tela em mãos, no banco.
import { ref, onValue, set, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { db } from './firebase-config.js';
import { telaDoGrupo, desenharTela } from './tela.js';
import { listaDeCriterios, contarMarcados } from './criterios.js';

export const TEXTO_AGENTS = 'Tela de celular em pé. No máximo 6 componentes. Nunca invente funcionalidade fora da lista. '
  + 'Antes de sair, escreva no progress.md o que fez e o que falta.';
export const PROGRESSO_MAXIMO = 280;
const ESPERA_TEXTO = 250; // ms entre a digitação e a gravação
const SEM_PROGRESSO = '(o agente anterior não escreveu nada)';
// progress.md preenchido = tem ao menos uma letra ou dígito. As regras do banco usam o mesmo teste
// (o regex delas não entende \s) para aceitar a saída da sessão.
const PREENCHIDO = /[a-zA-Z0-9]/;

const $ = (id) => document.getElementById(id);

// A feature_list: cada critério com uma caixa "pronto?" que reflete telas/{tid}/declarados.
function desenharFeatures(ul, criterios, marcas, aoMarcar) {
  ul.replaceChildren(...listaDeCriterios(criterios).map(({ chave, texto }, i) => {
    const li = document.createElement('li');
    const label = document.createElement('label');
    const caixa = document.createElement('input');
    caixa.type = 'checkbox';
    caixa.dataset.criterio = chave;
    caixa.checked = marcas?.[chave] === true;
    caixa.disabled = !aoMarcar;
    caixa.addEventListener('change', () => aoMarcar(chave, caixa.checked));
    const rotulo = document.createElement('span');
    rotulo.textContent = `${i + 1}. ${texto}`;
    const pronto = document.createElement('span');
    pronto.className = 'pronto';
    pronto.textContent = 'pronto?';
    label.append(caixa, rotulo, pronto);
    li.append(label);
    return li;
  }));
}

export function criarCartoes(sala, uid, gid) {
  let fase = null;
  let trocaFeita = false; // trocas/r2_troca existe: o grupo tem em mãos a tela herdada
  let criterios = null;
  let telas = {};
  let parar = [];
  let pendente = null; // progress.md digitado e ainda não gravado: { tid, texto, timer }

  const erro = () => { $('erro-cartoes').textContent = 'Não foi possível salvar. Tente de novo.'; };
  const caminho = (tid, resto) => ref(db, `salas/${sala}/telas/${tid}/${resto}`);

  const gravarProgresso = () => {
    if (!pendente) return Promise.resolve();
    const { tid, texto, timer } = pendente;
    clearTimeout(timer);
    pendente = null;
    return set(caminho(tid, 'progresso'), texto);
  };
  const marcar = (tid) => (chave, valor) => {
    $('erro-cartoes').textContent = '';
    set(caminho(tid, `declarados/${chave}`), valor).catch(erro);
  };

  function desenharDeclaracao(tela) {
    const lista = listaDeCriterios(criterios);
    $('declaracao-anterior').hidden = !(trocaFeita && tela);
    $('declaracao-anterior-texto').textContent = tela?.progresso || SEM_PROGRESSO;
    const pronto = !!(tela && lista.length);
    $('declaracao-aguardando').hidden = pronto;
    $('declaracao-area').hidden = !pronto;
    if (!pronto) return;
    desenharFeatures($('declaracao-features'), criterios, tela.declarados, marcar(tela.tid));
    const n = contarMarcados(tela.declarados);
    $('declaracao-total').textContent = `${n} de ${lista.length} ${lista.length === 1 ? 'critério pronto' : 'critérios prontos'}`;
    $('declaracao-moldura').replaceChildren(desenharTela(tela.componentes));
  }

  function desenhar() {
    const tela = telaDoGrupo(telas, gid, 2);
    if (pendente && pendente.tid !== tela?.tid) { clearTimeout(pendente.timer); pendente = null; }
    if (fase === 'r2_declaracao') { desenharDeclaracao(tela); return; }

    const herdada = fase === 'r2_troca' && trocaFeita;
    const saiu = fase === 'r2_troca' && !trocaFeita && !!tela?.saiu;
    $('progresso-anterior').hidden = !(herdada && tela);
    $('progresso-anterior-texto').textContent = tela?.progresso || SEM_PROGRESSO;
    $('sessao-encerrada').hidden = !saiu;
    $('editor-sessao').hidden = saiu;
    // Depois da troca o progress.md da tela é o do agente anterior: aparece em destaque, só para ler.
    $('cartao-progresso').hidden = herdada;
    desenharFeatures($('features-r2'), criterios, tela?.declarados, tela && marcar(tela.tid));

    const campo = $('progresso');
    if (document.activeElement !== campo) campo.value = pendente ? pendente.texto : (tela?.progresso || '');
    campo.readOnly = saiu || !tela;
    $('progresso-contagem').textContent = `${campo.value.length}/${PROGRESSO_MAXIMO}`;
    $('saida-sessao').hidden = !(fase === 'r2_troca' && !trocaFeita && tela && !saiu);
    const preenchido = PREENCHIDO.test(campo.value);
    $('botao-sair-sessao').disabled = !preenchido;
    $('dica-sair').textContent = preenchido
      ? 'Depois de sair, o grupo não edita mais esta tela.'
      : 'Preencham o progress.md antes de sair.';
  }

  $('texto-agents').textContent = TEXTO_AGENTS;
  const campo = $('progresso');
  campo.maxLength = PROGRESSO_MAXIMO;
  campo.addEventListener('input', () => {
    const tela = telaDoGrupo(telas, gid, 2);
    if (!tela) return;
    clearTimeout(pendente?.timer);
    pendente = {
      tid: tela.tid,
      texto: campo.value.slice(0, PROGRESSO_MAXIMO),
      timer: setTimeout(() => gravarProgresso().catch(erro), ESPERA_TEXTO),
    };
    desenhar();
  });
  campo.addEventListener('blur', () => { gravarProgresso().catch(erro); });
  $('botao-sair-sessao').addEventListener('click', async () => {
    const tela = telaDoGrupo(telas, gid, 2);
    if (!tela) return;
    $('erro-cartoes').textContent = '';
    try {
      await gravarProgresso(); // as regras só aceitam a saída com o progress.md no banco
      await set(caminho(tela.tid, 'saiu'), { por: uid, em: serverTimestamp() });
    } catch {
      $('erro-cartoes').textContent = 'Não foi possível sair agora. Confira o progress.md e tente de novo.';
    }
  });

  return {
    // config/criterios só pode ser lido da r1_avaliacao em diante; a rodada 2 vem depois.
    mostrar(novaFase, novaTrocaFeita) {
      fase = novaFase;
      trocaFeita = novaTrocaFeita;
      if (!parar.length) {
        parar = [
          onValue(ref(db, `salas/${sala}/config/criterios`), (s) => { criterios = s.val(); desenhar(); },
            () => { criterios = null; desenhar(); }),
          onValue(ref(db, `salas/${sala}/telas`), (s) => { telas = s.val() || {}; desenhar(); }),
        ];
      }
      $('cartoes-r2').hidden = fase === 'r2_declaracao';
      desenhar();
    },
    esconder() {
      for (const p of parar) p();
      parar = [];
      criterios = null;
      clearTimeout(pendente?.timer);
      pendente = null;
      fase = null;
      for (const id of ['cartoes-r2', 'progresso-anterior', 'sessao-encerrada']) $(id).hidden = true;
      $('editor-sessao').hidden = false;
    },
  };
}
