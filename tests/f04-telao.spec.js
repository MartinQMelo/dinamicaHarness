import { test, expect } from '@playwright/test';
import { carregarRegras, semearSala } from './emulador.js';

const TELAO = { viewport: { width: 1920, height: 1080 }, isMobile: false, hasTouch: false };

test.beforeAll(carregarRegras);

function registrarErros(page) {
  const erros = [];
  page.on('console', (msg) => { if (msg.type() === 'error') erros.push(msg.text()); });
  page.on('pageerror', (err) => erros.push(err.message));
  return erros;
}

async function abrirTelao(browser, sala) {
  const contexto = await browser.newContext(TELAO);
  const page = await contexto.newPage();
  const erros = registrarErros(page);
  await page.goto(`/telao.html?sala=${sala}`);
  await expect(page.locator('#telao-lobby')).toBeVisible({ timeout: 15_000 });
  return { contexto, page, erros };
}

async function entrar(browser, sala, nome) {
  const contexto = await browser.newContext({ viewport: { width: 360, height: 740 } });
  const page = await contexto.newPage();
  await page.goto(`/index.html?sala=${sala}`);
  await page.getByLabel('Seu nome').fill(nome);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.locator('#tela-grupo')).toBeVisible({ timeout: 20_000 });
  return contexto;
}

test.describe('F04 · telão no lobby', () => {
  test('telao.html?sala=XXXX mostra um QR code que aponta para index.html?sala=XXXX', async ({ browser }) => {
    await semearSala('QRCD');
    const { contexto, page, erros } = await abrirTelao(browser, 'QRCD');
    try {
      const esperado = 'http://localhost:5173/index.html?sala=QRCD';
      await expect(page.locator('#link-telao')).toHaveText(esperado);
      await expect(page.locator('#telao-codigo')).toHaveText('QRCD');

      // Decodifica o QR desenhado no canvas com o jsQR, dentro da própria página.
      await page.addScriptTag({ path: 'node_modules/jsqr/dist/jsQR.js' });
      const lido = await page.locator('#qr-aluno').evaluate((canvas) => {
        const img = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
        return window.jsQR(img.data, img.width, img.height)?.data ?? null;
      });
      expect(lido).toBe(esperado);

      // O QR que leva ao link abre a tela de entrada da sala certa.
      const aluno = await browser.newPage();
      await aluno.goto(lido);
      await expect(aluno.locator('#codigo-sala')).toHaveText('QRCD');
      await aluno.close();
      expect(erros).toEqual([]);
    } finally {
      await contexto.close();
    }
  });

  test('a contagem de alunos e a lista de grupos atualizam sem recarregar quando alunos entram', async ({ browser }) => {
    test.setTimeout(90_000);
    await semearSala('VIVO', { tamanhoGrupo: 2 });
    const { contexto, page, erros } = await abrirTelao(browser, 'VIVO');
    const alunos = [];
    try {
      await expect(page.locator('#contagem-alunos')).toHaveText('0');
      await expect(page.locator('#contagem-grupos')).toHaveText('0');
      await expect(page.locator('#lista-grupos li')).toHaveCount(0);
      // Marca a página: se ela recarregar, a marca some.
      await page.evaluate(() => { window.semRecarregar = true; });

      alunos.push(await entrar(browser, 'VIVO', 'Ana'));
      await expect(page.locator('#contagem-alunos')).toHaveText('1');
      await expect(page.locator('#rotulo-alunos')).toHaveText('aluno');
      await expect(page.locator('#contagem-grupos')).toHaveText('1');
      await expect(page.locator('#lista-grupos li')).toHaveText(['Azul1']);

      alunos.push(await entrar(browser, 'VIVO', 'Bia'));
      alunos.push(await entrar(browser, 'VIVO', 'Caio'));
      await expect(page.locator('#contagem-alunos')).toHaveText('3');
      await expect(page.locator('#rotulo-alunos')).toHaveText('alunos');
      await expect(page.locator('#contagem-grupos')).toHaveText('2');
      await expect(page.locator('#lista-grupos li .telao-grupo-nome')).toHaveText(['Azul', 'Verde']);
      await expect(page.locator('#lista-grupos li .telao-numero')).toHaveText(['2', '1']);

      // Cada grupo aparece na sua cor.
      const fundos = await page.locator('#lista-grupos li').evaluateAll((lis) => lis.map((li) => getComputedStyle(li).backgroundColor));
      expect(fundos).toEqual(['rgb(31, 111, 235)', 'rgb(26, 127, 55)']);

      expect(await page.evaluate(() => window.semRecarregar)).toBe(true);
      expect(erros).toEqual([]);
    } finally {
      await Promise.all([contexto, ...alunos].map((c) => c.close()));
    }
  });

  test('textos do telão legíveis: números com no mínimo 32 px', async ({ browser }) => {
    await semearSala('LETR');
    const { contexto, page } = await abrirTelao(browser, 'LETR');
    const aluno = await entrar(browser, 'LETR', 'Davi');
    try {
      await expect(page.locator('#lista-grupos li')).toHaveCount(1);
      const numeros = page.locator('#telao-codigo, #contagem-alunos, #contagem-grupos, #lista-grupos .telao-numero');
      await expect(numeros).toHaveCount(4);
      const tamanhos = await numeros.evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
      for (const t of tamanhos) expect(t).toBeGreaterThanOrEqual(32);
      // O resto do texto do lobby também fica grande o bastante para o fundo da sala.
      const texto = await page.locator('#link-telao').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(texto).toBeGreaterThanOrEqual(24);
    } finally {
      await Promise.all([contexto.close(), aluno.close()]);
    }
  });

  test('telão sem sala ou com sala inexistente mostra aviso', async ({ page }) => {
    await page.goto('/telao.html');
    await expect(page.locator('#telao-sem-sala')).toBeVisible();
    await page.goto('/telao.html?sala=ZZZW');
    await expect(page.locator('#telao-sem-sala')).toContainText('A sala ZZZW não existe', { timeout: 15_000 });
  });
});
