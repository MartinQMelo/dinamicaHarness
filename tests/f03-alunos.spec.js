import { test, expect } from '@playwright/test';
import { carregarRegras, gravarComoDono, lerComoDono, semearSala } from './emulador.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1';

test.beforeAll(carregarRegras);

function registrarErros(page) {
  const erros = [];
  page.on('console', (msg) => { if (msg.type() === 'error') erros.push(msg.text()); });
  page.on('pageerror', (err) => erros.push(err.message));
  return erros;
}

async function entrar(page, sala, nome) {
  await page.goto(`/index.html?sala=${sala}`);
  await page.getByLabel('Seu nome').fill(nome);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.locator('#tela-grupo')).toBeVisible({ timeout: 20_000 });
}

test.describe('F03 · entrada dos alunos e grupos', () => {
  test('aluno abre index.html?sala=XXXX, digita o nome e entra com Auth anônimo', async ({ page }) => {
    const erros = registrarErros(page);
    await semearSala('ALNA');
    await entrar(page, 'ALNA', 'Ana');
    await expect(page.locator('#aluno-nome')).toHaveText('Ana');

    const uid = await page.evaluate(async () => {
      const { auth } = await import(new URL('js/firebase-config.js', location.href).href);
      return { uid: auth.currentUser.uid, anonimo: auth.currentUser.isAnonymous };
    });
    expect(uid.anonimo).toBe(true);
    const aluno = await lerComoDono(`salas/ALNA/alunos/${uid.uid}`);
    expect(aluno.nome).toBe('Ana');
    expect(aluno.grupo).toBe('g1');
    expect(typeof aluno.entrouEm).toBe('number');
    expect(erros).toEqual([]);
  });

  test('sala inexistente mostra aviso', async ({ page }) => {
    await page.goto('/index.html?sala=ZZZQ');
    await expect(page.locator('#tela-sem-sala')).toContainText('A sala ZZZQ não existe');
  });

  test('com tamanho 5, 12 alunos entrando juntos formam 3 grupos (5, 5, 2) com cor e nome, e o celular mostra grupo e colegas', async ({ browser }) => {
    test.setTimeout(120_000);
    await semearSala('DOZE', { tamanhoGrupo: 5 });
    const nomes = Array.from({ length: 12 }, (_, i) => `Aluno ${i + 1}`);
    const contextos = await Promise.all(nomes.map(() => browser.newContext({ viewport: { width: 360, height: 740 } })));
    const paginas = await Promise.all(contextos.map((c) => c.newPage()));
    const erros = paginas.flatMap((p) => registrarErros(p));
    try {
      // Todos entram ao mesmo tempo: a transação não pode deixar grupo passar de 5.
      await Promise.all(paginas.map((p, i) => entrar(p, 'DOZE', nomes[i])));

      const grupos = await lerComoDono('salas/DOZE/grupos');
      const lista = Object.entries(grupos).sort(([, a], [, b]) => a.ordem - b.ordem);
      expect(lista.map(([, g]) => Object.keys(g.membros).length)).toEqual([5, 5, 2]);
      expect(lista.map(([, g]) => g.nome)).toEqual(['Azul', 'Verde', 'Laranja']);
      for (const [, g] of lista) expect(g.cor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(new Set(lista.map(([, g]) => g.cor)).size).toBe(3);

      const alunos = await lerComoDono('salas/DOZE/alunos');
      expect(Object.keys(alunos)).toHaveLength(12);
      for (const [uid, a] of Object.entries(alunos)) expect(grupos[a.grupo].membros[uid]).toBe(true);

      // Cada celular mostra a cor, o nome do grupo e os colegas.
      const nomePorUid = Object.fromEntries(Object.entries(alunos).map(([uid, a]) => [uid, a.nome]));
      for (const p of paginas) {
        const nome = await p.locator('#aluno-nome').textContent();
        const [uid, aluno] = Object.entries(alunos).find(([, a]) => a.nome === nome);
        const grupo = grupos[aluno.grupo];
        await expect(p.locator('#grupo-nome')).toHaveText(grupo.nome);
        const fundo = await p.locator('#cartao-grupo').evaluate((el) => getComputedStyle(el).backgroundColor);
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(grupo.cor.slice(i, i + 2), 16));
        expect(fundo).toBe(`rgb(${r}, ${g}, ${b})`);
        const colegas = Object.keys(grupo.membros).filter((m) => m !== uid).map((m) => nomePorUid[m]).sort();
        await expect.poll(async () => (await p.locator('#lista-colegas li').allTextContents()).sort(), { timeout: 10_000 })
          .toEqual(colegas);
      }
      expect(erros).toEqual([]);
    } finally {
      await Promise.all(contextos.map((c) => c.close()));
    }
  });

  test('colegas aparecem sem recarregar quando alguém entra no grupo', async ({ browser }) => {
    await semearSala('VIVO');
    const [c1, c2] = await Promise.all([browser.newContext(), browser.newContext()]);
    try {
      const [p1, p2] = await Promise.all([c1.newPage(), c2.newPage()]);
      await entrar(p1, 'VIVO', 'Bia');
      await expect(p1.locator('#sem-colegas')).toBeVisible();
      await entrar(p2, 'VIVO', 'Caio');
      await expect(p1.locator('#lista-colegas li')).toHaveText(['Caio']);
      await expect(p2.locator('#lista-colegas li')).toHaveText(['Bia']);
    } finally {
      await Promise.all([c1.close(), c2.close()]);
    }
  });

  test('recarregar a página mantém o aluno no mesmo grupo', async ({ page }) => {
    await semearSala('RECA', { tamanhoGrupo: 1 });
    await entrar(page, 'RECA', 'Duda');
    const antes = await page.locator('#grupo-nome').textContent();
    const uid = await page.evaluate(async () => {
      const { auth } = await import(new URL('js/firebase-config.js', location.href).href);
      return auth.currentUser.uid;
    });

    await page.reload();
    await expect(page.locator('#tela-grupo')).toBeVisible();
    await expect(page.locator('#tela-entrada')).toBeHidden();
    await expect(page.locator('#aluno-nome')).toHaveText('Duda');
    await expect(page.locator('#grupo-nome')).toHaveText(antes);

    const depois = await page.evaluate(async () => {
      const { auth } = await import(new URL('js/firebase-config.js', location.href).href);
      return auth.currentUser.uid;
    });
    expect(depois).toBe(uid);
    const grupos = await lerComoDono('salas/RECA/grupos');
    expect(Object.keys(grupos)).toHaveLength(1); // não criou outro grupo nem entrou de novo
    expect(Object.keys(grupos.g1.membros)).toEqual([uid]);
  });

  test('regras: aluno não mexe em grupo alheio nem cria grupo fora do lobby', async ({ page }) => {
    await semearSala('RGRD');
    await entrar(page, 'RGRD', 'Eva');
    const resultados = await page.evaluate(async (SDK) => {
      const { db } = await import(new URL('js/firebase-config.js', location.href).href);
      const { ref, set, update } = await import(`${SDK}/firebase-database.js`);
      const tentar = async (fn) => {
        try { await fn(); return 'ok'; } catch (e) { return /permission.denied/i.test(String(e.code || e.message)) ? 'negado' : String(e); }
      };
      const r = (c) => ref(db, `salas/RGRD/${c}`);
      return {
        mudarCor: await tentar(() => set(r('grupos/g1/cor'), '#000000')),
        incluirOutro: await tentar(() => set(r('grupos/g1/membros/intruso'), true)),
        escreverOutroAluno: await tentar(() => set(r('alunos/intruso'), { nome: 'X', grupo: 'g1' })),
        grupoSemSerMembro: await tentar(() => set(r('grupos/g9'), { nome: 'Falso', cor: '#000000', ordem: 8, membros: { intruso: true } })),
        mudarEstado: await tentar(() => update(r('estado'), { fase: 'r1' })),
      };
    }, SDK);
    expect(resultados).toEqual({
      mudarCor: 'negado', incluirOutro: 'negado', escreverOutroAluno: 'negado', grupoSemSerMembro: 'negado', mudarEstado: 'negado',
    });

    // Fora do lobby, nem um grupo só com o próprio aluno pode ser criado.
    await gravarComoDono('salas/RGRD/estado/fase', 'r1');
    const criarNaR1 = await page.evaluate(async (SDK) => {
      const { auth, db } = await import(new URL('js/firebase-config.js', location.href).href);
      const { ref, set } = await import(`${SDK}/firebase-database.js`);
      try {
        await set(ref(db, 'salas/RGRD/grupos/g2'), { nome: 'Verde', cor: '#1a7f37', ordem: 1, membros: { [auth.currentUser.uid]: true } });
        return 'ok';
      } catch (e) { return /permission.denied/i.test(String(e.code || e.message)) ? 'negado' : String(e); }
    }, SDK);
    expect(criarNaR1).toBe('negado');
    expect(await lerComoDono('salas/RGRD/grupos/g2')).toBeNull();
  });
});
