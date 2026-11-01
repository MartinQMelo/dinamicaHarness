// Votação no celular: o aluno vê os harnesses dos outros grupos e vota em um (votos/{uid}). Pode trocar o
// voto até o fim da votação; não pode votar no próprio grupo (as regras do banco também impedem).
import { ref, onValue, set } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { db } from './firebase-config.js';
import { harnessesDaSala, desenharHarness } from './harness.js';

const $ = (id) => document.getElementById(id);

export function criarVotacao(sala, uid, gid) {
  let fase = null;
  let oficina = {};
  let grupos = {};
  let meuVoto = null;
  let parar = [];

  const votar = (alvo) => {
    $('erro-votacao').textContent = '';
    set(ref(db, `salas/${sala}/votos/${uid}`), alvo)
      .catch(() => { $('erro-votacao').textContent = 'Não foi possível votar. Tente de novo.'; });
  };

  function desenhar() {
    const aberta = fase === 'votacao';
    const outros = harnessesDaSala(oficina, grupos).filter((g) => g !== gid);
    $('votacao-encerrada').hidden = aberta;
    $('votacao-meu-voto').textContent = grupos[meuVoto]
      ? `Seu voto: ${grupos[meuVoto].nome}`
      : 'Você ainda não votou.';
    $('votacao-vazia').hidden = outros.length > 0;
    $('votacao-harnesses').replaceChildren(...outros.map((g) => {
      const li = document.createElement('li');
      li.dataset.gid = g;
      const cartao = desenharHarness(oficina[g], grupos[g]);
      if (aberta) {
        const botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'botao-largo botao-voto';
        const escolhido = meuVoto === g;
        botao.textContent = escolhido ? `Seu voto ✓ ${grupos[g].nome}` : `Votar em ${grupos[g].nome}`;
        botao.disabled = escolhido;
        botao.addEventListener('click', () => votar(g));
        cartao.append(botao);
      }
      li.append(cartao);
      return li;
    }));
    $('votacao-proprio').replaceChildren(...(oficina[gid] && grupos[gid] ? [desenharHarness(oficina[gid], grupos[gid])] : []));
    $('votacao-proprio-bloco').hidden = !(oficina[gid] && grupos[gid]);
  }

  return {
    mostrar(novaFase) {
      fase = novaFase;
      if (!parar.length) {
        parar = [
          onValue(ref(db, `salas/${sala}/oficina`), (s) => { oficina = s.val() || {}; desenhar(); }),
          onValue(ref(db, `salas/${sala}/grupos`), (s) => { grupos = s.val() || {}; desenhar(); }),
          onValue(ref(db, `salas/${sala}/votos/${uid}`), (s) => { meuVoto = s.val(); desenhar(); }),
        ];
      }
      desenhar();
    },
    esconder() {
      for (const p of parar) p();
      parar = [];
      fase = null;
    },
  };
}
