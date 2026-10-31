import { test, expect } from '@playwright/test';
import {
  atualizarComoDono, carregarRegras, criarAdmin, gravarComoDono, lerComoDono,
} from './emulador.js';
import { FASES, NOMES_DAS_FASES, atualizacaoDeFase } from '../site/js/fases.js';

const TELAO = { viewport: { width: 1920, height: 1080 }, isMobile: false, hasTouch: false };
const CONTROLE = { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false };
const ATRASO_DO_RELOGIO = 3 * 60_000; // um celular com o relógio 3 min adiantado

test.beforeAll(carregarRegras);

function registrarErros(page) {
  const erros = [];
  page.on('console', (msg) => { if (msg.type() === 'error') erros.push(msg.text()); });
  page.on('pageerror', (err) => erros.push(err.message));
  return erros;
}

// Abre o controle, faz login e cria uma sala. Aceita sozinho os confirm() de remover e reiniciar.
async function abrirControle(browser) {
  const contexto = await browser.newContext(CONTROLE);
  const page = await contexto.newPage();
  const erros = registrarErros(page);
  page.on('dialog', (d) => d.accept());
  const { email, senha } = await criarAdmin();
  await page.goto('/controle.html');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('button', { name: 'Criar sala' }).click();
  await expect(page.locator('#sala-codigo')).toHaveText(/^[A-Z]{4}$/);
  const sala = await page.locator('#sala-codigo').textContent();
  return { contexto, page, erros, sala };
}

async function entrar(browser, sala, nome, { relogioAdiantado = false } = {}) {
  const contexto = await browser.newContext({ viewport: { width: 360, height: 740 } });
  if (relogioAdiantado) {
    await contexto.addInitScript((atraso) => {
      const Real = Date;
      class Adiantado extends Real {
        constructor(...args) { if (args.length) super(...args); else super(Real.now() + atraso); }
        static now() { return Real.now() + atraso; }
      }
      globalThis.Date = Adiantado;
    }, ATRASO_DO_RELOGIO);
  }
  const page = await contexto.newPage();
  const erros = registrarErros(page);
  await page.goto(`/index.html?sala=${sala}`);
  await page.getByLabel('Seu nome').fill(nome);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.locator('#tela-grupo')).toBeVisible({ timeout: 20_000 });
  return { contexto, page, erros };
}

const segundos = async (locator) => Number(await locator.getAttribute('data-restante'));

test.describe('F06 · controle das fases e cronômetro', () => {
  test('o controle mostra a fase atual e botões para avançar, voltar e reiniciar a sala', async ({ browser }) => {
    test.setTimeout(90_000);
    const controle = await abrirControle(browser);
    const { page, sala } = controle;
    const aluno = await entrar(browser, sala, 'Ana');
    try {
      const faseAtual = page.locator('#fase-atual');
      const avancar = page.getByRole('button', { name: 'Avançar fase →' });
      const voltar = page.getByRole('button', { name: '← Voltar fase' });
      await expect(faseAtual).toHaveText('Entrada (lobby)');
      await expect(voltar).toBeDisabled();
      await expect(avancar).toBeEnabled();
      await expect(page.getByRole('button', { name: 'Reiniciar sala' })).toBeVisible();

      // Avançar para a r1 cria a tela em branco do grupo, na mesma atualização da fase.
      await avancar.click();
      await expect(faseAtual).toHaveText('Rodada 1');
      await expect.poll(() => lerComoDono(`salas/${sala}/estado/fase`)).toBe('r1');
      expect(await lerComoDono(`salas/${sala}/telas/r1_g1`)).toEqual({ rodada: 1, autor: 'g1', dono: 'g1' });

      // Avança por todas as fases, na ordem, até o fim.
      for (const fase of FASES.slice(2)) {
        await avancar.click();
        await expect(faseAtual).toHaveText(NOMES_DAS_FASES[fase]);
        await expect.poll(() => lerComoDono(`salas/${sala}/estado/fase`)).toBe(fase);
      }
      await expect(avancar).toBeDisabled();
      await expect(page.locator('#proxima-fase')).toHaveText('Última fase.');

      // Voltar uma fase.
      await voltar.click();
      await expect(faseAtual).toHaveText('Votação');
      await expect.poll(() => lerComoDono(`salas/${sala}/estado/fase`)).toBe('votacao');

      // Recarregar o controle reabre a mesma sala (?sala= na URL).
      await page.reload();
      await expect(page.locator('#sala-codigo')).toHaveText(sala);
      await expect(faseAtual).toHaveText('Votação');

      // Reiniciar: volta ao lobby e apaga alunos, grupos e telas; config e segredo ficam.
      await page.getByRole('button', { name: 'Reiniciar sala' }).click();
      await expect(faseAtual).toHaveText('Entrada (lobby)');
      await expect.poll(() => lerComoDono(`salas/${sala}/alunos`)).toBeNull();
      const depois = await lerComoDono(`salas/${sala}`);
      expect(depois.estado.fase).toBe('lobby');
      expect(depois.estado.timerFim).toBe(0);
      expect(depois.grupos).toBeUndefined();
      expect(depois.telas).toBeUndefined();
      expect(depois.config.frase).toContain('app de caronas');
      expect(Object.keys(depois.segredo.criterios)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5']);
      await expect(page.locator('#sem-grupos')).toBeVisible();

      // O celular do aluno volta à tela de nome e consegue entrar de novo.
      await expect(aluno.page.locator('#tela-entrada')).toBeVisible({ timeout: 10_000 });
      await aluno.page.getByLabel('Seu nome').fill('Ana');
      await aluno.page.getByRole('button', { name: 'Entrar' }).click();
      await expect(aluno.page.locator('#grupo-nome')).toHaveText('Azul');
      expect(controle.erros).toEqual([]);
      expect(aluno.erros).toEqual([]);
    } finally {
      await aluno.contexto.close();
      await controle.contexto.close();
    }
  });

  test('o controle define um cronômetro em minutos; telão e celulares mostram a contagem sincronizada', async ({ browser }) => {
    test.setTimeout(90_000);
    const controle = await abrirControle(browser);
    const { page, sala } = controle;
    const ana = await entrar(browser, sala, 'Ana');
    const beto = await entrar(browser, sala, 'Beto', { relogioAdiantado: true });
    const telaoContexto = await browser.newContext(TELAO);
    const telao = await telaoContexto.newPage();
    const errosTelao = registrarErros(telao);
    await telao.goto(`/telao.html?sala=${sala}`);
    try {
      // O relógio do Beto está mesmo adiantado.
      const diferenca = await beto.page.evaluate(() => Date.now()) - Date.now();
      expect(Math.abs(diferenca - ATRASO_DO_RELOGIO)).toBeLessThan(5_000);

      const relogios = {
        controle: page.locator('#cronometro'),
        telao: telao.locator('#cronometro'),
        ana: ana.page.locator('#cronometro'),
        beto: beto.page.locator('#cronometro'),
      };
      for (const r of Object.values(relogios)) await expect(r).toBeHidden();

      await page.getByLabel('Minutos').fill('2');
      await page.getByRole('button', { name: 'Iniciar cronômetro' }).click();
      for (const r of Object.values(relogios)) await expect(r).toHaveText(/^⏱ (2:00|1:5\d)$/);

      // Todos contam do mesmo instante do servidor, inclusive o celular com o relógio errado.
      const fim = await lerComoDono(`salas/${sala}/estado/timerFim`);
      expect(Math.abs(fim - (Date.now() + 120_000))).toBeLessThan(5_000);
      const lidos = [];
      for (const r of Object.values(relogios)) lidos.push(await segundos(r));
      expect(Math.max(...lidos) - Math.min(...lidos)).toBeLessThanOrEqual(1);
      for (const s of lidos) expect(s).toBeGreaterThan(110);

      // A contagem anda.
      const antes = await segundos(relogios.telao);
      await expect.poll(() => segundos(relogios.telao), { timeout: 5_000 }).toBeLessThan(antes);

      // Com pouco tempo, o número cai até "Tempo esgotado" em todas as telas.
      await page.getByLabel('Minutos').fill('0.05'); // 3 segundos
      await page.getByRole('button', { name: 'Iniciar cronômetro' }).click();
      for (const r of Object.values(relogios)) {
        await expect(r).toHaveText('⏱ Tempo esgotado', { timeout: 8_000 });
        await expect(r).toHaveClass(/esgotado/);
      }

      // Parar esconde o cronômetro; mudar de fase também zera.
      await page.getByLabel('Minutos').fill('5');
      await page.getByRole('button', { name: 'Iniciar cronômetro' }).click();
      await expect(relogios.ana).toHaveText(/^⏱ (5:00|4:5\d)$/);
      await page.getByRole('button', { name: 'Parar' }).click();
      for (const r of Object.values(relogios)) await expect(r).toBeHidden();
      await page.getByRole('button', { name: 'Iniciar cronômetro' }).click();
      await expect(relogios.telao).toBeVisible();
      await page.getByRole('button', { name: 'Avançar fase →' }).click();
      for (const r of Object.values(relogios)) await expect(r).toBeHidden();
      expect(await lerComoDono(`salas/${sala}/estado/timerFim`)).toBe(0);

      expect(controle.erros).toEqual([]);
      expect(ana.erros).toEqual([]);
      expect(beto.erros).toEqual([]);
      expect(errosTelao).toEqual([]);
    } finally {
      await telaoContexto.close();
      await ana.contexto.close();
      await beto.contexto.close();
      await controle.contexto.close();
    }
  });

  test('mudar a fase no controle muda a tela de todos os celulares sem recarregar', async ({ browser }) => {
    test.setTimeout(90_000);
    const controle = await abrirControle(browser);
    const { page, sala } = controle;
    await gravarComoDono(`salas/${sala}/config/tamanhoGrupo`, 1); // um aluno por grupo
    const celulares = [await entrar(browser, sala, 'Ana'), await entrar(browser, sala, 'Beto')];
    const telaoContexto = await browser.newContext(TELAO);
    const telao = await telaoContexto.newPage();
    await telao.goto(`/telao.html?sala=${sala}`);
    await expect(telao.locator('#telao-lobby')).toBeVisible();
    try {
      for (const { page: p } of celulares) {
        await expect(p.locator('#fase-aluno')).toHaveText('Entrada (lobby)');
        await p.evaluate(() => { window.semRecarregar = true; });
      }
      await expect(celulares[0].page.locator('#editor-grupo')).toBeHidden();
      await telao.evaluate(() => { window.semRecarregar = true; });

      const avancar = page.getByRole('button', { name: 'Avançar fase →' });
      const voltar = page.getByRole('button', { name: '← Voltar fase' });
      const grupos = { 0: 'Azul', 1: 'Verde' };

      // lobby → r1: cada celular abre o editor da tela do seu grupo.
      await avancar.click();
      for (const [i, { page: p }] of celulares.entries()) {
        await expect(p.locator('#tela-editor')).toBeVisible();
        await expect(p.locator('#editor-grupo')).toHaveText(grupos[i]);
        await expect(p.locator('#fase-aluno')).toHaveText('Rodada 1');
        await expect(p.locator('#editor-area')).toBeVisible(); // a tela do grupo já existe
      }
      await expect(telao.locator('#telao-rodada')).toBeVisible();
      await expect(telao.locator('#telao-telas > li')).toHaveCount(2);

      // r1 → r1_troca: o editor continua e o nome da fase muda.
      await avancar.click();
      for (const { page: p } of celulares) {
        await expect(p.locator('#fase-aluno')).toHaveText('Rodada 1 · troca de sessão');
        await expect(p.locator('#tela-editor')).toBeVisible();
      }

      // r1_troca → r1_avaliacao: sai do editor e vai para a avaliação (F08).
      await avancar.click();
      for (const { page: p } of celulares) {
        await expect(p.locator('#fase-aluno')).toHaveText('Rodada 1 · avaliação');
        await expect(p.locator('#tela-editor')).toBeHidden();
        await expect(p.locator('#tela-avaliacao')).toBeVisible();
      }
      await expect(telao.locator('#telao-avaliacao')).toBeVisible();

      // Voltar duas vezes leva de volta ao editor e depois ao lobby.
      await voltar.click();
      for (const { page: p } of celulares) await expect(p.locator('#tela-editor')).toBeVisible();
      await voltar.click();
      await voltar.click();
      for (const { page: p } of celulares) {
        await expect(p.locator('#fase-aluno')).toHaveText('Entrada (lobby)');
        await expect(p.locator('#tela-grupo')).toBeVisible();
      }
      await expect(telao.locator('#telao-lobby')).toBeVisible();

      for (const { page: p, erros } of celulares) {
        expect(await p.evaluate(() => window.semRecarregar)).toBe(true);
        expect(erros).toEqual([]);
      }
      expect(await telao.evaluate(() => window.semRecarregar)).toBe(true);
      expect(controle.erros).toEqual([]);
    } finally {
      await telaoContexto.close();
      for (const { contexto } of celulares) await contexto.close();
      await controle.contexto.close();
    }
  });

  test('voltar para o lobby e avançar de novo não apaga a tela da r1', async ({ browser }) => {
    const controle = await abrirControle(browser);
    const { page, sala } = controle;
    const aluno = await entrar(browser, sala, 'Ana');
    try {
      await page.getByRole('button', { name: 'Avançar fase →' }).click();
      await expect.poll(() => lerComoDono(`salas/${sala}/telas/r1_g1/dono`)).toBe('g1');
      await atualizarComoDono(`salas/${sala}/telas/r1_g1`, { componentes: [{ id: 'a1', tipo: 'titulo', texto: 'Caronas' }] });

      await page.getByRole('button', { name: '← Voltar fase' }).click();
      await expect(page.locator('#fase-atual')).toHaveText('Entrada (lobby)');
      await page.getByRole('button', { name: 'Avançar fase →' }).click();
      await expect(page.locator('#fase-atual')).toHaveText('Rodada 1');
      await expect(aluno.page.locator('#editor-moldura .comp-titulo')).toContainText('Caronas');
      expect((await lerComoDono(`salas/${sala}/telas/r1_g1`)).componentes).toHaveLength(1);

      // A função só cria telas de grupos que ainda não têm a sua.
      const updates = atualizacaoDeFase('r1', {
        grupos: { g1: { ordem: 0 }, g2: { ordem: 1 } }, telas: { r1_g1: { rodada: 1, dono: 'g1' } },
      }, 123);
      expect(updates).toEqual({
        'estado/fase': 'r1', 'estado/timerFim': 0, 'estado/atualizadoEm': 123,
        'telas/r1_g2': { rodada: 1, autor: 'g2', dono: 'g2' },
      });
    } finally {
      await aluno.contexto.close();
      await controle.contexto.close();
    }
  });

  test('o controle mostra o tamanho de cada grupo e remove um aluno do grupo', async ({ browser }) => {
    test.setTimeout(60_000);
    const controle = await abrirControle(browser);
    const { page, sala } = controle;
    const ana = await entrar(browser, sala, 'Ana');
    const beto = await entrar(browser, sala, 'Beto');
    try {
      const grupo = page.locator('#controle-grupos > li[data-gid="g1"]');
      await expect(grupo.locator('.controle-grupo-nome')).toHaveText('Azul · 2 alunos');
      await expect(grupo.locator('li span')).toHaveText(['Ana', 'Beto']);
      await expect(ana.page.locator('#lista-colegas li')).toHaveText(['Beto']);

      await page.getByRole('button', { name: 'Remover Beto do grupo Azul' }).click();
      await expect(grupo.locator('.controle-grupo-nome')).toHaveText('Azul · 1 aluno');
      const salaDepois = await lerComoDono(`salas/${sala}`);
      expect(Object.values(salaDepois.alunos).map((a) => a.nome)).toEqual(['Ana']);
      expect(Object.keys(salaDepois.grupos.g1.membros)).toHaveLength(1);

      // O celular do Beto volta à tela de nome; o da Ana deixa de mostrar o colega.
      await expect(beto.page.locator('#tela-entrada')).toBeVisible({ timeout: 10_000 });
      await expect(ana.page.locator('#sem-colegas')).toBeVisible();
      await expect(ana.page.locator('#tela-grupo')).toBeVisible();

      // Beto entra de novo pela distribuição.
      await beto.page.getByLabel('Seu nome').fill('Beto');
      await beto.page.getByRole('button', { name: 'Entrar' }).click();
      await expect(beto.page.locator('#grupo-nome')).toHaveText('Azul');
      await expect(grupo.locator('.controle-grupo-nome')).toHaveText('Azul · 2 alunos');
      expect(controle.erros).toEqual([]);
    } finally {
      await ana.contexto.close();
      await beto.contexto.close();
      await controle.contexto.close();
    }
  });
});
