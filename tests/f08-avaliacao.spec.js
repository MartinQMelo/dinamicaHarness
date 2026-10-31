import { test, expect } from '@playwright/test';
import {
  atualizarComoDono, carregarRegras, criarAdmin, gravarComoDono, lerComoDono,
} from './emulador.js';
import { atualizacaoDeFase, criteriosRevelados, FASES } from '../site/js/fases.js';
import { mediaDeCriterios, formatarMedia } from '../site/js/criterios.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1';
const CONTROLE = { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false };
const TELAO = { viewport: { width: 1920, height: 1080 }, isMobile: false, hasTouch: false };
const CRITERIO_EDITADO = 'O título da tela diz "Caronas UnB".';

test.beforeAll(carregarRegras);

function registrarErros(page) {
  const erros = [];
  page.on('console', (msg) => { if (msg.type() === 'error') erros.push(msg.text()); });
  page.on('pageerror', (err) => erros.push(err.message));
  return erros;
}

async function abrirControle(browser, { tamanhoGrupo } = {}) {
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
  if (tamanhoGrupo) await gravarComoDono(`salas/${sala}/config/tamanhoGrupo`, tamanhoGrupo);
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

// Lê um caminho como o usuário da página (aluno ou telão), com o SDK e as regras de verdade.
const ler = (page, caminho) => page.evaluate(async ({ SDK, caminho }) => {
  const { db } = await import(new URL('js/firebase-config.js', location.href).href);
  const { ref, get } = await import(`${SDK}/firebase-database.js`);
  try { return { ok: (await get(ref(db, caminho))).val() }; } catch (e) {
    return /permission.denied/i.test(String(e.code || e.message)) ? 'negado' : String(e);
  }
}, { SDK, caminho });

// Tenta gravar como o usuário da página.
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

const caixa = (page, c) => page.locator(`#avaliacao-criterios input[data-criterio="${c}"]`);

test.describe('F08 · revelação dos critérios e placar da rodada 1', () => {
  test('na r1_avaliacao o controle copia os critérios de segredo para config e os celulares passam a vê-los', async ({ browser }) => {
    test.setTimeout(90_000);
    const controle = await abrirControle(browser, { tamanhoGrupo: 1 });
    const { page, sala } = controle;
    const ana = await entrar(browser, sala, 'Ana');
    const beto = await entrar(browser, sala, 'Beto');
    try {
      // O apresentador edita um critério em segredo antes de revelar: a revelação copia o que está lá.
      await gravarComoDono(`salas/${sala}/segredo/criterios/c1`, CRITERIO_EDITADO);
      await irAte(page, 'r1_troca');
      expect(await lerComoDono(`salas/${sala}/config/criterios`)).toBeNull();

      await irAte(page, 'r1_avaliacao');
      const segredo = await lerComoDono(`salas/${sala}/segredo/criterios`);
      await expect.poll(() => lerComoDono(`salas/${sala}/config/criterios`)).toEqual(segredo);
      expect(segredo.c1).toBe(CRITERIO_EDITADO);
      expect(Object.keys(segredo)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5']);

      // Os celulares mostram os 5 critérios sem recarregar, na ordem.
      for (const { page: p } of [ana, beto]) {
        await expect(p.locator('#tela-avaliacao')).toBeVisible();
        await expect(p.locator('#avaliacao-criterios li')).toHaveCount(5);
        await expect(p.locator('#avaliacao-criterios li').first()).toContainText(CRITERIO_EDITADO);
        await expect(p.locator('#avaliacao-criterios li').nth(4)).toContainText('no máximo 6 componentes');
        expect(await ler(p, `salas/${sala}/config/criterios`)).toEqual({ ok: segredo });
      }

      // Voltar para a troca apaga config/criterios (Decisão 1); avançar de novo revela outra vez.
      await page.getByRole('button', { name: '← Voltar fase' }).click();
      await expect.poll(() => lerComoDono(`salas/${sala}/config/criterios`)).toBeNull();
      await expect(ana.page.locator('#tela-editor')).toBeVisible();
      await page.getByRole('button', { name: 'Avançar fase →' }).click();
      await expect(ana.page.locator('#avaliacao-criterios li')).toHaveCount(5);
      await expect(ana.page.locator('#avaliacao-criterios li').first()).toContainText(CRITERIO_EDITADO);

      // Depois da avaliação os critérios continuam em config.
      await page.getByRole('button', { name: 'Avançar fase →' }).click();
      await expect(page.locator('#fase-atual')).toHaveAttribute('data-fase', 'r2');
      expect(await lerComoDono(`salas/${sala}/config/criterios`)).toEqual(segredo);
      expect(await ler(ana.page, `salas/${sala}/config/criterios`)).toEqual({ ok: segredo });

      for (const { page: p, erros } of [ana, beto]) {
        expect(await p.evaluate(() => window.semRecarregar)).toBe(true);
        expect(erros).toEqual([]);
      }
      expect(controle.erros).toEqual([]);

      // A função: copia da r1_avaliacao em diante, apaga antes dela só se existir.
      expect(FASES.filter(criteriosRevelados)).toEqual(FASES.slice(FASES.indexOf('r1_avaliacao')));
      const criterios = { c1: 'x' };
      expect(atualizacaoDeFase('r1_avaliacao', { segredo: { criterios } }, 1)['config/criterios']).toEqual(criterios);
      expect(atualizacaoDeFase('fim', { segredo: { criterios } }, 1)['config/criterios']).toEqual(criterios);
      expect(atualizacaoDeFase('r1_troca', { config: { criterios } }, 1)).toHaveProperty('config/criterios', null);
      expect(atualizacaoDeFase('r1', { config: {} }, 1)).not.toHaveProperty('config/criterios');
    } finally {
      for (const c of [controle, ana, beto]) await c.contexto.close();
    }
  });

  test('antes da r1_avaliacao os critérios não chegam ao celular: a leitura falha', async ({ browser }) => {
    test.setTimeout(90_000);
    const controle = await abrirControle(browser, { tamanhoGrupo: 1 });
    const { page, sala } = controle;
    const ana = await entrar(browser, sala, 'Ana');
    const telao = await abrirTelao(browser, sala);
    try {
      // Mesmo que alguém grave config/criterios antes da hora, as regras negam a leitura.
      await gravarComoDono(`salas/${sala}/config/criterios`, { c1: 'vazou' });
      for (const fase of ['lobby', 'r1', 'r1_troca']) {
        await irAte(page, fase);
        await expect.poll(() => lerComoDono(`salas/${sala}/estado/fase`)).toBe(fase);
        await gravarComoDono(`salas/${sala}/config/criterios`, { c1: 'vazou' });
        for (const p of [ana.page, telao.page]) {
          expect(await ler(p, `salas/${sala}/config/criterios`)).toBe('negado');
          expect(await ler(p, `salas/${sala}/config`)).toBe('negado');
          expect(await ler(p, `salas/${sala}/segredo/criterios`)).toBe('negado');
          expect(await ler(p, `salas/${sala}/config/frase`)).toEqual({ ok: expect.stringContaining('caronas') });
          expect(await ler(p, `salas/${sala}/config/tamanhoGrupo`)).toEqual({ ok: 1 });
        }
        await expect(ana.page.locator('#avaliacao-criterios li')).toHaveCount(0);
        await expect(ana.page.locator('body')).not.toContainText('vazou');
      }

      // Na r1_avaliacao, a leitura passa; o segredo continua fechado.
      await irAte(page, 'r1_avaliacao');
      await expect.poll(() => ler(ana.page, `salas/${sala}/config/criterios`)).toEqual({ ok: expect.objectContaining({ c5: expect.any(String) }) });
      expect(await ler(ana.page, `salas/${sala}/segredo/criterios`)).toBe('negado');

      // Voltar para antes fecha a leitura de novo.
      await page.getByRole('button', { name: '← Voltar fase' }).click();
      await expect.poll(() => ler(ana.page, `salas/${sala}/config/criterios`)).toBe('negado');

      // O aluno não grava config nem segredo, em nenhuma fase.
      expect(await tentar(ana.page, sala, {
        config: ['config/criterios', { c1: 'meu' }],
        segredo: ['segredo/criterios/c1', 'meu'],
      })).toEqual({ config: 'negado', segredo: 'negado' });
      expect(ana.erros).toEqual([]);
      expect(telao.erros).toEqual([]);
    } finally {
      for (const c of [controle, ana, telao]) await c.contexto.close();
    }
  });

  test('cada grupo marca os critérios que a tela em mãos cumpre e o telão mostra a média ao vivo', async ({ browser }) => {
    test.setTimeout(120_000);
    const controle = await abrirControle(browser, { tamanhoGrupo: 2 });
    const { page, sala } = controle;
    const ana = await entrar(browser, sala, 'Ana'); // g1
    const beto = await entrar(browser, sala, 'Beto'); // g1
    const caio = await entrar(browser, sala, 'Caio'); // g2
    const duda = await entrar(browser, sala, 'Duda'); // g2
    const telao = await abrirTelao(browser, sala);
    try {
      await irAte(page, 'r1');
      await atualizarComoDono(`salas/${sala}/telas`, {
        'r1_g1/componentes': [{ id: 'a1', tipo: 'titulo', texto: 'Tela feita pelo Azul' }],
        'r1_g2/componentes': [{ id: 'b1', tipo: 'botao', texto: 'Tela feita pelo Verde' }],
      });
      await irAte(page, 'r1_avaliacao');
      // Depois da troca o g1 tem a tela do g2 em mãos, e vice-versa.
      await expect(ana.page.locator('#avaliacao-moldura')).toContainText('Tela feita pelo Verde');
      await expect(caio.page.locator('#avaliacao-moldura')).toContainText('Tela feita pelo Azul');
      await expect(ana.page.locator('#avaliacao-total')).toHaveText('0 de 5 critérios cumpridos');

      // Telão: placar com média 0 e os critérios revelados.
      await expect(telao.page.locator('#telao-avaliacao')).toBeVisible();
      await expect(telao.page.locator('#telao-lobby')).toBeHidden(); // o QR do lobby não fica por baixo
      await expect(telao.page.locator('#telao-criterios li')).toHaveCount(5);
      await expect(telao.page.locator('#placar-r1-media')).toHaveText('0');

      // Ana marca 3 critérios; o Beto (mesmo grupo) vê as marcas; o banco grava na tela em mãos.
      for (const c of ['c1', 'c4', 'c5']) await caixa(ana.page, c).check();
      for (const c of ['c1', 'c4', 'c5']) await expect(caixa(beto.page, c)).toBeChecked();
      await expect(caixa(beto.page, 'c2')).not.toBeChecked();
      await expect(beto.page.locator('#avaliacao-total')).toHaveText('3 de 5 critérios cumpridos');
      await expect.poll(() => lerComoDono(`salas/${sala}/telas/r1_g2/avaliacaoR1`))
        .toEqual({ c1: true, c4: true, c5: true });
      await expect(telao.page.locator('#placar-r1-media')).toHaveText('1,5');

      // Duda marca 2 na tela do g1; a média vira 2,5. Beto desmarca um: 2.
      await caixa(duda.page, 'c2').check();
      await caixa(duda.page, 'c3').check();
      await expect(caixa(caio.page, 'c3')).toBeChecked();
      await expect.poll(() => lerComoDono(`salas/${sala}/telas/r1_g1/avaliacaoR1`)).toEqual({ c2: true, c3: true });
      await expect(telao.page.locator('#placar-r1-media')).toHaveText('2,5');
      await caixa(beto.page, 'c5').uncheck();
      await expect(caixa(ana.page, 'c5')).not.toBeChecked();
      await expect(telao.page.locator('#placar-r1-media')).toHaveText('2');
      await expect(telao.page.locator('#placar-r1-telas li[data-tid="r1_g1"] .telao-numero')).toHaveText('2/5');
      await expect(telao.page.locator('#placar-r1-telas li[data-tid="r1_g2"] .telao-numero')).toHaveText('2/5');

      // Números do placar legíveis do fundo do auditório (≥ 32 px).
      for (const seletor of ['#placar-r1-media', '#placar-r1-total', '#placar-r1-telas .telao-numero']) {
        const tamanhos = await telao.page.locator(seletor).evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
        expect(tamanhos.length).toBeGreaterThan(0);
        for (const t of tamanhos) expect(t).toBeGreaterThanOrEqual(32);
      }

      // Regras: só a tela em mãos, só c1..c5 booleanos.
      expect(await tentar(ana.page, sala, {
        telaEmMaos: ['telas/r1_g2/avaliacaoR1/c2', true],
        telaDoOutro: ['telas/r1_g1/avaliacaoR1/c1', true],
        chaveInvalida: ['telas/r1_g2/avaliacaoR1/c9', true],
        naoBooleano: ['telas/r1_g2/avaliacaoR1/c3', 'sim'],
      })).toEqual({ telaEmMaos: 'ok', telaDoOutro: 'negado', chaveInvalida: 'negado', naoBooleano: 'negado' });
      await expect(telao.page.locator('#placar-r1-media')).toHaveText('2,5');

      // Fora da r1_avaliacao, ninguém marca.
      await page.getByRole('button', { name: 'Avançar fase →' }).click();
      await expect.poll(() => lerComoDono(`salas/${sala}/estado/fase`)).toBe('r2');
      expect(await tentar(ana.page, sala, { depois: ['telas/r1_g2/avaliacaoR1/c3', true] })).toEqual({ depois: 'negado' });

      // A média do telão é a mesma da função pura.
      const banco = await lerComoDono(`salas/${sala}`);
      expect(formatarMedia(mediaDeCriterios(banco.telas, banco.grupos, 1, 'avaliacaoR1'))).toBe('2,5');
      expect(formatarMedia(mediaDeCriterios({}, {}, 1, 'avaliacaoR1'))).toBe('0');

      for (const c of [ana, beto, caio, duda, telao]) {
        expect(await c.page.evaluate(() => window.semRecarregar)).toBe(true);
        expect(c.erros).toEqual([]);
      }
      expect(controle.erros).toEqual([]);
    } finally {
      for (const c of [controle, ana, beto, caio, duda, telao]) await c.contexto.close();
    }
  });
});
