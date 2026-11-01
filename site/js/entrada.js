// Entrada de um aluno num grupo. Usada pelo celular e pelos alunos-bot do modo ensaio, cada um com o
// seu banco (o db do usuário que entra), para as regras valerem igual para todos.
import { ref, get, runTransaction } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { escolherGrupo, dadosDoGrupo, contarMembros } from './grupos.js';

// Coloca o aluno num grupo com transação, para dois alunos simultâneos não estourarem o limite.
export async function entrarEmGrupo(db, sala, uid) {
  const raiz = `salas/${sala}`;
  for (let tentativa = 0; tentativa < 30; tentativa++) {
    const [grupos, tamanhoGrupo, estado] = (await Promise.all([
      get(ref(db, `${raiz}/grupos`)), get(ref(db, `${raiz}/config/tamanhoGrupo`)), get(ref(db, `${raiz}/estado`)),
    ])).map((s) => s.val());
    const jaMembro = Object.entries(grupos || {}).find(([, g]) => g.membros?.[uid]);
    if (jaMembro) return jaMembro[0];

    const tamanho = tamanhoGrupo || 5;
    const escolha = escolherGrupo(grupos, tamanho, estado?.fase);
    if (!escolha) throw new Error('sem-grupo');

    let resultado;
    try {
      resultado = await runTransaction(ref(db, `${raiz}/grupos/${escolha.gid}`), (atual) => {
        // null pode ser só o cache local vazio: propor a criação faz o servidor mandar o valor real.
        if (!atual) return { ...dadosDoGrupo(escolha.ordem), membros: { [uid]: true } };
        if (atual.membros?.[uid]) return; // já está
        if (estado?.fase === 'lobby' && contarMembros(atual) >= tamanho) return; // lotou: escolhe de novo
        return { ...atual, membros: { ...atual.membros, [uid]: true } };
      }, { applyLocally: false });
    } catch {
      continue; // regras recusaram (ex.: criar grupo fora do lobby): escolhe de novo
    }
    if (resultado.snapshot.child(`membros/${uid}`).val() === true) return escolha.gid;
  }
  throw new Error('sem-grupo');
}
