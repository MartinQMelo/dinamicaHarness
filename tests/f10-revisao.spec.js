import { test, expect } from '@playwright/test';
import {
  atualizarComoDono, carregarRegras, criarAdmin, gravarComoDono, lerComoDono,
} from './emulador.js';
import { atualizacaoDeFase, escolherRevisores } from '../site/js/fases.js';
import { dadosDoGrupo, gidDaOrdem } from '../site/js/grupos.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1';
const CONTROLE = { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false };
const TELAO = { viewport: { width: 1920, height: 1080 }, isMobile: false, hasTouch: false };
const AGORA = { '.sv': 'timestamp' };

test.beforeAll(carregarRegras);

function registrarErros(page) {
  const erros = [];
  page.on('console', (msg) => { if (msg.type() === 'error') erros.push(msg.text()); });
  page.on('pageerror', (err) => erros.push(err.message));
  return erros;
}

async function abrirControle(browser) {
  const contexto = await browser.newContext(CONTROLE);
  const page = await contexto.newPage();
  const erros = registrarErros(page);
  const { email, senha } = await criarAdmin();
  await page.goto('/controle.html');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('button', { name: 'Criar sala' }).click();
  await expect(page.locator('#sala-codigo')).toHaveText(/^[A-Z]{4}$/);
  const sala = await page.locator('#sala-codigo').textContent();
  await gravarComoDono(`salas/${sala}/config/tamanhoGrupo`, 1); // um aluno por grupo
  return { contexto, page, erros, sala };
}

async function entrar(browser, sala, nome) {
  const contexto = await browser.newContext({ viewport: { width: 360, height: 740 } });
  const page = await contexto.newPage();
  const erros = registrarErros(page);
  await page.goto(`/index.html?sala=${sala}`);
  await page.getByLabel('Seu nome').fill(nome);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.locator('#tela-grupo')).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => { window.semRecarregar = true; });
  return { contexto, page, erros };
}

async function abrirTelao(browser, sala) {
  const contexto = await browser.newContext(TELAO);
  const page = await contexto.newPage();
  const erros = registrarErros(page);
  await page.goto(`/telao.html?sala=${sala}`);
  await page.evaluate(() => { window.semRecarregar = true; });
  return { contexto, page, erros };
}

// Tenta gravar como o usuário da página, com o SDK e as regras de verdade.
const tentar = (page, sala, casos) => page.evaluate(async ({ SDK, sala, casos }) => {
  const { db } = await import(new URL('js/firebase-config.js', location.href).href);
  const { ref, set } = await import(`${SDK}/firebase-database.js`);
  const saida = {};
  for (const [nome, [caminho, valor]] of Object.entries(casos)) {
    try { await set(ref(db, `salas/${sala}/${caminho}`), valor); saida[nome] = 'ok'; } catch (e) {
      saida[nome] = /permission.denied/i.test(String(e.code || e.message)) ? 'negado' : String(e);
    }
  }
  return saida;
}, { SDK, sala, casos });

async function irAte(page, fase) {
  const avancar = page.getByRole('button', { name: 'Avançar fase →' });
  for (;;) {
    const atual = await page.locator('#fase-atual').getAttribute('data-fase');
    if (atual === fase) return;
    await avancar.click();
    await expect(page.locator('#fase-atual')).not.toHaveAttribute('data-fase', atual);
  }
}

function gruposFalsos(n) {
  return Object.fromEntries(Array.from({ length: n }, (_, i) => [gidDaOrdem(i), { ...dadosDoGrupo(i), membros: {} }]));
}

// Telas da R2 com autor gN e dono = o grupo `desloc` posições à frente (desloc 1 = troca feita).
function telasR2(n, desloc) {
  return Object.fromEntries(Array.from({ length: n }, (_, i) => [`r2_${gidDaOrdem(i)}`,
    { rodada: 2, autor: gidDaOrdem(i), dono: gidDaOrdem((i + desloc) % n) }]));
}

const revisores = async (sala) => Object.fromEntries(Object.entries(await lerComoDono(`salas/${sala}/telas`))
  .filter(([, t]) => t.rodada === 2).map(([tid, t]) => [tid, t.revisao?.revisor]));
const opcao = (page, c, valor) => page.locator(`#revisao-criterios input[name="revisao-${c}"][value="${valor}"]`);

test.describe('F10 · rodada 3 de revisão e resultado', () => {
  test('na r3 cada tela da R2 ganha um revisor diferente do autor e do dono, sem mudar o dono', async ({ browser }) => {
    // A escolha, com 3 a 6 grupos, com e sem a troca feita: revisor ≠ autor, ≠ dono, um por grupo.
    for (let n = 3; n <= 6; n++) {
      for (const desloc of [0, 1, 2]) {
        const telas = telasR2(n, desloc);
        const escolha = escolherRevisores(gruposFalsos(n), telas);
        expect(Object.keys(escolha).sort()).toEqual(Object.keys(telas).sort());
        for (const [tid, g] of Object.entries(escolha)) {
          expect(g).not.toBe(telas[tid].autor);
          expect(g).not.toBe(telas[tid].dono);
        }
        expect(new Set(Object.values(escolha)).size).toBe(n);
      }
    }
    // Com 2 grupos não dá: o revisor é ao menos diferente do dono. Com 1, o próprio grupo.
    expect(escolherRevisores(gruposFalsos(2), telasR2(2, 1))).toEqual({ r2_g1: 'g1', r2_g2: 'g2' });
    expect(escolherRevisores(gruposFalsos(1), telasR2(1, 0))).toEqual({ r2_g1: 'g1' });
    // Tela da R1 e tela de grupo que não existe mais ficam de fora.
    expect(escolherRevisores(gruposFalsos(3), {
      ...telasR2(3, 1), r1_g1: { rodada: 1, autor: 'g1', dono: 'g2' }, r2_g9: { rodada: 2, autor: 'g9', dono: 'g9' },
    })).toEqual({ r2_g1: 'g3', r2_g2: 'g1', r2_g3: 'g2' });

    // Pelo controle, com 3 grupos e a troca da R2 feita.
    test.setTimeout(90_000);
    const controle = await abrirControle(browser);
    const { page, sala } = controle;
    try {
      await gravarComoDono(`salas/${sala}/grupos`, gruposFalsos(3));
      await irAte(page, 'r2_troca');
      await page.getByRole('button', { name: 'Forçar troca' }).click();
      await expect.poll(() => lerComoDono(`salas/${sala}/trocas/r2_troca`)).not.toBeNull();
      await irAte(page, 'r2_declaracao');
      expect(await revisores(sala)).toEqual({ r2_g1: undefined, r2_g2: undefined, r2_g3: undefined });
      await irAte(page, 'r3');

      await expect.poll(() => revisores(sala)).toEqual({ r2_g1: 'g3', r2_g2: 'g1', r2_g3: 'g2' });
      const telas = await lerComoDono(`salas/${sala}/telas`);
      expect(Object.fromEntries(['r2_g1', 'r2_g2', 'r2_g3'].map((t) => [t, telas[t].dono])))
        .toEqual({ r2_g1: 'g2', r2_g2: 'g3', r2_g3: 'g1' }); // Decisão 5: o dono não muda
      expect(telas.r1_g1.revisao).toBeUndefined();

      // Voltar e avançar não troca o revisor nem apaga a revisão começada.
      await atualizarComoDono(`salas/${sala}/telas`, { 'r2_g1/revisao/revisor': 'g2', 'r2_g1/revisao/aprovados': { c1: true } });
      await page.getByRole('button', { name: '← Voltar fase' }).click();
      await expect(page.locator('#fase-atual')).toHaveAttribute('data-fase', 'r2_declaracao');
      await page.getByRole('button', { name: 'Avançar fase →' }).click();
      await expect(page.locator('#fase-atual')).toHaveAttribute('data-fase', 'r3');
      expect(await lerComoDono(`salas/${sala}/telas/r2_g1/revisao`)).toEqual({ revisor: 'g2', aprovados: { c1: true } });
      // Sem revisor gravado, a atualização da fase escolhe só para quem falta.
      const { revisao: _, ...r2g1SemRevisor } = telas.r2_g1;
      const semUm = { ...telas, r2_g1: r2g1SemRevisor, r2_g2: { ...telas.r2_g2, revisao: { revisor: 'g1' } }, r2_g3: { ...telas.r2_g3, revisao: { revisor: 'g2' } } };
      expect(Object.keys(atualizacaoDeFase('r3', { grupos: gruposFalsos(3), telas: semUm }, 1))
        .filter((k) => k.startsWith('telas/'))).toEqual(['telas/r2_g1/revisao/revisor']);
      expect(controle.erros).toEqual([]);
    } finally {
      await controle.contexto.close();
    }
  });

  test('o revisor aprova ou reprova cada critério sem ver as marcações do autor antes de enviar', async ({ browser }) => {
    test.setTimeout(150_000);
    const controle = await abrirControle(browser);
    const { page, sala } = controle;
    const ana = await entrar(browser, sala, 'Ana'); // g1
    const beto = await entrar(browser, sala, 'Beto'); // g2
    const caio = await entrar(browser, sala, 'Caio'); // g3
    const telao = await abrirTelao(browser, sala);
    try {
      await irAte(page, 'r2_troca');
      await page.getByRole('button', { name: 'Forçar troca' }).click();
      await expect.poll(() => lerComoDono(`salas/${sala}/trocas/r2_troca`)).not.toBeNull();
      await irAte(page, 'r2_declaracao');
      // r2_g2 é do Beto (autor g2) e está com o Caio (g3), que declarou c1, c2 e c4.
      await atualizarComoDono(`salas/${sala}/telas`, {
        'r1_g1/avaliacaoR1': { c1: true, c5: true },
        'r1_g2/avaliacaoR1': { c5: true },
        'r2_g2/componentes': [
          { id: 'b1', tipo: 'botao', texto: 'Oferecer carona' },
          { id: 'b2', tipo: 'lista', texto: 'Carona 1\nCarona 2' },
          { id: 'b3', tipo: 'chat', texto: 'Oi!' },
        ],
        'r2_g2/declarados': { c1: true, c2: true, c4: true, c5: false },
        'r2_g3/declarados': { c1: true },
      });
      await irAte(page, 'r3');
      await expect.poll(() => revisores(sala)).toEqual({ r2_g1: 'g3', r2_g2: 'g1', r2_g3: 'g2' });

      // A Ana (g1) revisa a tela r2_g2: vê a tela e os 5 critérios, sem as marcações do autor.
      const p = ana.page;
      await expect(p.locator('#tela-revisao')).toBeVisible();
      await expect(p.locator('#revisao-moldura')).toContainText('Oferecer carona');
      await expect(p.locator('#revisao-moldura .comp[data-tipo="chat"]')).toHaveCount(1);
      await expect(p.locator('#revisao-criterios > li')).toHaveCount(5);
      await expect(p.locator('#revisao-criterios > li').first()).toContainText('Oferecer carona');
      await expect(p.locator('#tela-revisao')).not.toContainText('O agente disse');
      await expect(p.locator('#tela-revisao')).not.toContainText('pronto');
      await expect(p.locator('#tela-revisao .vitoria-falsa')).toHaveCount(0);
      await expect(p.locator('#revisao-criterios input:checked')).toHaveCount(0);
      await expect(p.locator('#revisao-total')).toHaveText('0 de 5 critérios avaliados');
      await expect(p.getByRole('button', { name: 'Enviar revisão' })).toBeDisabled();
      expect(await p.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
      // Os outros revisam as telas deles.
      await expect(beto.page.locator('#tela-revisao')).toBeVisible();
      await expect(caio.page.locator('#tela-revisao')).toBeVisible();
      await expect(caio.page.locator('#revisao-criterios > li')).toHaveCount(5);

      // Aprovar e reprovar grava em revisao/aprovados; mudar de ideia antes de enviar vale.
      await opcao(p, 'c1', 'aprova').check();
      await opcao(p, 'c2', 'aprova').check();
      await opcao(p, 'c2', 'reprova').check();
      await opcao(p, 'c3', 'reprova').check();
      await opcao(p, 'c4', 'reprova').check();
      await expect.poll(() => lerComoDono(`salas/${sala}/telas/r2_g2/revisao/aprovados`))
        .toEqual({ c1: true, c2: false, c3: false, c4: false });
      await expect(p.locator('#revisao-total')).toHaveText('4 de 5 critérios avaliados');
      await expect(p.getByRole('button', { name: 'Enviar revisão' })).toBeDisabled();
      await expect(p.locator('#tela-revisao')).not.toContainText('O agente disse');

      // Regras: só o revisor, só c1..c5 booleanos, não envia incompleta, e o revisor é do apresentador.
      expect(await tentar(p, sala, {
        enviarIncompleta: ['telas/r2_g2/revisao/enviadoEm', AGORA],
        telaDeOutroRevisor: ['telas/r2_g1/revisao/aprovados/c1', true],
        telaEmMaos: ['telas/r2_g3/revisao/aprovados/c1', true],
        chaveInvalida: ['telas/r2_g2/revisao/aprovados/c9', true],
        naoBooleano: ['telas/r2_g2/revisao/aprovados/c1', 'sim'],
        mudarRevisor: ['telas/r2_g2/revisao/revisor', 'g2'],
        tirarRevisor: ['telas/r2_g1/revisao/revisor', 'g1'],
        mudarDono: ['telas/r2_g2/dono', 'g1'],
      })).toEqual({
        enviarIncompleta: 'negado', telaDeOutroRevisor: 'negado', telaEmMaos: 'negado', chaveInvalida: 'negado',
        naoBooleano: 'negado', mudarRevisor: 'negado', tirarRevisor: 'negado', mudarDono: 'negado',
      });

      await opcao(p, 'c5', 'aprova').check();
      await expect(p.locator('#revisao-total')).toHaveText('5 de 5 critérios avaliados');
      await p.getByRole('button', { name: 'Enviar revisão' }).click();
      await expect.poll(() => lerComoDono(`salas/${sala}/telas/r2_g2/revisao/enviadoEm`)).toEqual(expect.any(Number));

      // Depois de enviar: aparece o que o agente declarou e as vitórias falsas (c2 e c4).
      await expect(p.locator('#revisao-total')).toHaveText('Revisão enviada: 2 de 5 aprovados.');
      await expect(p.getByRole('button', { name: 'Enviar revisão' })).toBeHidden();
      await expect(p.locator('#revisao-criterios li[data-criterio="c1"]')).toContainText('O agente disse: pronto');
      await expect(p.locator('#revisao-criterios li[data-criterio="c3"]')).toContainText('O agente disse: não pronto');
      await expect(p.locator('#revisao-criterios li.vitoria-falsa')).toHaveCount(2);
      await expect(p.locator('#revisao-criterios li[data-criterio="c2"]')).toContainText('Vitória falsa');
      await expect(p.locator('#revisao-criterios li[data-criterio="c4"]')).toContainText('Vitória falsa');
      await expect(p.locator('#revisao-falsas')).toContainText('2 vitórias falsas');
      await expect(p.locator('#revisao-criterios input:not(:disabled)')).toHaveCount(0);
      expect(await p.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

      // Enviada, a revisão não muda mais. Recarregar mostra o mesmo.
      expect(await tentar(p, sala, {
        mudarDepois: ['telas/r2_g2/revisao/aprovados/c2', true],
        enviarDeNovo: ['telas/r2_g2/revisao/enviadoEm', AGORA],
      })).toEqual({ mudarDepois: 'negado', enviarDeNovo: 'negado' });
      await p.reload();
      await expect(p.locator('#revisao-total')).toHaveText('Revisão enviada: 2 de 5 aprovados.');
      await expect(p.locator('#revisao-criterios li.vitoria-falsa')).toHaveCount(2);

      // O Beto (g2) revisa r2_g3 e envia tudo aprovado; o Caio (g3) não envia.
      for (const c of ['c1', 'c2', 'c3', 'c4', 'c5']) await opcao(beto.page, c, 'aprova').check();
      await beto.page.getByRole('button', { name: 'Enviar revisão' }).click();
      await expect(beto.page.locator('#revisao-falsas')).toContainText('Nenhuma vitória falsa');
      await opcao(caio.page, 'c1', 'aprova').check();
      await expect.poll(() => lerComoDono(`salas/${sala}/telas/r2_g1/revisao/aprovados`)).toEqual({ c1: true });

      // Fora da r3 ninguém revisa.
      await page.getByRole('button', { name: 'Avançar fase →' }).click();
      await expect(page.locator('#fase-atual')).toHaveAttribute('data-fase', 'resultado');
      expect(await tentar(caio.page, sala, { depois: ['telas/r2_g1/revisao/aprovados/c2', true] })).toEqual({ depois: 'negado' });
      await expect(caio.page.locator('#tela-revisao')).toBeHidden();

      // Resultado no telão: R1 (2 + 1 + 0) / 3 = 1; R2 declarado (3 + 1 + 0) / 3 ≈ 1,3;
      // aprovado (2 + 5 + 1) / 3 ≈ 2,7; vitórias falsas: c2 e c4 da tela do Beto.
      const t = telao.page;
      await expect(t.locator('#telao-resultado')).toBeVisible();
      await expect(t.locator('#resultado-r1')).toHaveText('1');
      await expect(t.locator('#resultado-r2-declarados')).toHaveText('1,3');
      await expect(t.locator('#resultado-r2-aprovados')).toHaveText('2,7');
      await expect(t.locator('#resultado-falsas-n')).toHaveText('2');
      await expect(t.locator('#resultado-telas li[data-tid="r2_g2"]')).toContainText('Tela de Verde');
      await expect(t.locator('#resultado-telas li[data-tid="r2_g2"]')).toContainText('2 vitórias falsas');

      for (const c of [ana, beto, caio, telao]) {
        if (c !== ana) expect(await c.page.evaluate(() => window.semRecarregar)).toBe(true);
        expect(c.erros).toEqual([]);
      }
      expect(controle.erros).toEqual([]);
    } finally {
      for (const c of [controle, ana, beto, caio, telao]) await c.contexto.close();
    }
  });

  test('no resultado o telão mostra R1 vs R2 e declarado vs aprovado, com a vitória falsa em destaque', async ({ browser }) => {
    test.setTimeout(90_000);
    const controle = await abrirControle(browser);
    const { page, sala } = controle;
    const telao = await abrirTelao(browser, sala);
    try {
      await gravarComoDono(`salas/${sala}/grupos`, gruposFalsos(2));
      await irAte(page, 'r3');
      await atualizarComoDono(`salas/${sala}/telas`, {
        'r1_g1/avaliacaoR1': { c1: true },
        'r1_g2/avaliacaoR1': { c2: true, c3: false },
        'r2_g1/declarados': { c1: true, c2: true, c3: true, c4: true, c5: true },
        'r2_g1/revisao/aprovados': { c1: true, c2: false, c3: true, c4: false, c5: true },
        'r2_g2/declarados': { c1: true, c2: true },
        'r2_g2/revisao/aprovados': { c1: true, c2: true, c3: true },
      });
      // Na r3 o telão ainda não mostra o resultado (nem os critérios).
      await expect(telao.page.locator('#telao-resultado')).toBeHidden();
      await irAte(page, 'resultado');

      const t = telao.page;
      await expect(t.locator('#telao-resultado')).toBeVisible();
      await expect(t.locator('#telao-resultado')).toContainText('Rodada 1');
      await expect(t.locator('#telao-resultado')).toContainText('Rodada 2');
      await expect(t.locator('#resultado-r1')).toHaveText('1'); // (1 + 1) / 2
      await expect(t.locator('#resultado-r2-declarados')).toHaveText('3,5'); // (5 + 2) / 2
      await expect(t.locator('#resultado-r2-aprovados')).toHaveText('3'); // (3 + 3) / 2
      await expect(t.locator('#telao-resultado')).toContainText('declarado pronto');
      await expect(t.locator('#telao-resultado')).toContainText('aprovado pelo revisor');
      await expect(t.locator('#resultado-falsas')).toContainText('Vitória falsa');
      await expect(t.locator('#resultado-falsas-n')).toHaveText('2'); // c2 e c4 da tela do Azul
      await expect(t.locator('#resultado-falsas')).toContainText('critérios declarados prontos e reprovados pelo revisor');
      await expect(t.locator('#resultado-telas li')).toHaveCount(2);
      await expect(t.locator('#resultado-telas li[data-tid="r2_g1"]')).toContainText('Tela de Azul');
      await expect(t.locator('#resultado-telas li[data-tid="r2_g1"]')).toContainText('declarado pronto 5/5 · aprovado 3/5');
      await expect(t.locator('#resultado-telas li[data-tid="r2_g1"] .telao-falsa')).toHaveText(' · 2 vitórias falsas');
      await expect(t.locator('#resultado-telas li[data-tid="r2_g2"] .telao-falsa')).toHaveCount(0);
      // A vitória falsa se destaca: fundo vermelho; números do placar com pelo menos 32 px.
      expect(await t.locator('#resultado-falsas').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(207, 34, 46)');
      for (const id of ['#resultado-r1', '#resultado-r2-declarados', '#resultado-r2-aprovados', '#resultado-falsas-n']) {
        expect(parseFloat(await t.locator(id).evaluate((e) => getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(32);
      }

      // Ao vivo: uma reprovação a mais vira mais uma vitória falsa (o singular também).
      await gravarComoDono(`salas/${sala}/telas/r2_g2/revisao/aprovados/c2`, false);
      await expect(t.locator('#resultado-falsas-n')).toHaveText('3');
      await expect(t.locator('#resultado-r2-aprovados')).toHaveText('2,5');
      await expect(t.locator('#resultado-telas li[data-tid="r2_g2"] .telao-falsa')).toHaveText(' · 1 vitória falsa');

      // Voltar para a r3 esconde o resultado.
      await page.getByRole('button', { name: '← Voltar fase' }).click();
      await expect(t.locator('#telao-resultado')).toBeHidden();
      expect(await t.evaluate(() => window.semRecarregar)).toBe(true);
      expect(telao.erros).toEqual([]);
      expect(controle.erros).toEqual([]);
    } finally {
      for (const c of [controle, telao]) await c.contexto.close();
    }
  });
});
