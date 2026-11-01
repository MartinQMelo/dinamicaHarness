// Oficina "Monte seu harness" no celular: o grupo escolhe o projeto e preenche AGENTS.md, as 3
// funcionalidades (nome, aceite, evidência) e o primeiro passo. Tudo fica em oficina/{gid}, no banco;
// os colegas do grupo editam os mesmos campos ao mesmo tempo.
import { ref, onValue, set } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { db } from './firebase-config.js';
import {
  PROJETOS, LIMITES, AGENTS_MAX_LINHAS, N_FUNCIONALIDADES, limitarLinhas, contarLinhas,
} from './harness.js';

const ESPERA_TEXTO = 250; // ms entre a digitação e a gravação
const ROTULOS = { nome: 'Funcionalidade', aceite: 'Critério de aceite', evidencia: 'Evidência' };

const $ = (id) => document.getElementById(id);

function montarCampos() {
  const projeto = $('oficina-projeto');
  const vazio = new Option('Escolham um projeto…', '');
  vazio.disabled = true;
  projeto.replaceChildren(vazio, ...Object.entries(PROJETOS).map(([chave, nome]) => new Option(nome, chave)));
  $('oficina-features').replaceChildren(...Array.from({ length: N_FUNCIONALIDADES }, (_, i) => {
    const grupo = document.createElement('fieldset');
    grupo.className = 'oficina-feature';
    const legenda = document.createElement('legend');
    legenda.textContent = `Funcionalidade ${i + 1}`;
    grupo.append(legenda);
    for (const parte of ['nome', 'aceite', 'evidencia']) {
      const id = `oficina-f${i}-${parte}`;
      const label = document.createElement('label');
      label.htmlFor = id;
      label.textContent = ROTULOS[parte];
      const campo = parte === 'nome' ? document.createElement('input') : document.createElement('textarea');
      if (parte !== 'nome') campo.rows = 2;
      campo.id = id;
      campo.dataset.campo = `features/${i}/${parte}`;
      campo.maxLength = LIMITES[parte];
      grupo.append(label, campo);
    }
    return grupo;
  }));
  $('oficina-agents').maxLength = LIMITES.agents;
  $('oficina-progresso').maxLength = LIMITES.progresso;
}

// O valor de um campo no banco: 'features/1/aceite' → harness.features[1].aceite.
const valorDe = (harness, campo) => campo.split('/').reduce((o, k) => o?.[k], harness);

// O texto aceito no campo: AGENTS.md até 8 linhas; os outros, até o limite de caracteres.
function limitar(campo, valor) {
  const parte = campo.split('/').pop();
  const texto = parte === 'agents' ? limitarLinhas(valor) : valor;
  return texto.slice(0, LIMITES[parte]);
}

export function criarOficina(sala, gid) {
  let harness = {};
  let parar = null;
  const pendentes = {}; // campo → { valor, timer }: digitado e ainda não gravado

  const erro = () => { $('erro-oficina').textContent = 'Não foi possível salvar. Tente de novo.'; };
  const gravar = (campo, valor) => {
    $('erro-oficina').textContent = '';
    set(ref(db, `salas/${sala}/oficina/${gid}/${campo}`), valor).catch(erro);
  };
  const gravarPendente = (campo) => {
    const p = pendentes[campo];
    if (!p) return;
    clearTimeout(p.timer);
    delete pendentes[campo];
    gravar(campo, p.valor);
  };
  const campos = () => document.querySelectorAll('#tela-oficina [data-campo]');

  function desenhar() {
    for (const e of campos()) {
      const { campo } = e.dataset;
      if (document.activeElement === e || pendentes[campo]) continue;
      e.value = valorDe(harness, campo) ?? '';
    }
    const n = contarLinhas($('oficina-agents').value);
    $('oficina-agents-linhas').textContent = `${n} de ${AGENTS_MAX_LINHAS} linhas`;
    $('oficina-progresso-contagem').textContent = `${$('oficina-progresso').value.length}/${LIMITES.progresso}`;
  }

  montarCampos();
  $('oficina-projeto').addEventListener('change', (ev) => gravar('projeto', ev.target.value));
  for (const e of campos()) {
    if (e.tagName === 'SELECT') continue;
    const { campo } = e.dataset;
    e.addEventListener('input', () => {
      const valor = limitar(campo, e.value);
      if (valor !== e.value) e.value = valor;
      clearTimeout(pendentes[campo]?.timer);
      pendentes[campo] = { valor, timer: setTimeout(() => gravarPendente(campo), ESPERA_TEXTO) };
      desenhar();
    });
    e.addEventListener('blur', () => { gravarPendente(campo); desenhar(); });
  }

  return {
    mostrar() {
      parar ||= onValue(ref(db, `salas/${sala}/oficina/${gid}`), (s) => { harness = s.val() || {}; desenhar(); });
    },
    esconder() {
      // Fora da oficina as regras não aceitam mais a gravação: o texto ainda pendente se perde.
      for (const campo of Object.keys(pendentes)) { clearTimeout(pendentes[campo].timer); delete pendentes[campo]; }
      parar?.();
      parar = null;
    },
  };
}
