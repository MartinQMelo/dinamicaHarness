import { test, expect } from '@playwright/test';
import {
  atualizarComoDono, carregarRegras, criarAdmin, gravarComoDono, lerComoDono, semearSala,
} from './emulador.js';
import { dadosDoGrupo, gidDaOrdem } from '../site/js/grupos.js';
import { FASES, atualizacaoDeFase } from '../site/js/fases.js';
import { CATALOGO, listaDeComponentes } from '../site/js/tela.js';

const CONTROLE = { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false };
const TELAO = { viewport: { width: 1920, height: 1080 }, isMobile: false, hasTouch: false };
const CELULAR = { viewport: { width: 360, height: 740 } };
const FOTOS = process.env.FOTOS; // pasta para guardar uma foto por fase (opcional, para conferir à mão)

test.beforeAll(carregarRegras);

function registrarErros(page) {
  const erros = [];
  page.on('console', (msg) => { if (msg.type() === 'error') erros.push(msg.text()); });
  page.on('pageerror', (err) => erros.push(err.message));
  return erros;
}

async function abrir(browser, opcoes, url) {
  const contexto = await browser.newContext(opcoes);
  const page = await contexto.newPage();
  const erros = registrarErros(page);
  if (url) await page.goto(url);
  return { contexto, page, erros };
}

async function abrirControle(browser) {
  const controle = await abrir(browser, CONTROLE, '/controle.html');
  const { page } = controle;
  const { email, senha } = await criarAdmin();
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('button', { name: 'Criar sala' }).click();
  await expect(page.locator('#sala-codigo')).toHaveText(/^[A-Z]{4}$/);
  return { ...controle, sala: await page.locator('#sala-codigo').textContent() };
}

function esperarSala(sala, condicao, timeout = 60_000) {
  return expect.poll(async () => condicao(await lerComoDono(`salas/${sala}`)), { timeout, intervals: [500] }).toBe(true);
}

const telasDa = (s, rodada) => Object.values(s.telas || {}).filter((t) => t.rodada === rodada);
// As 4 telas dos grupos de bots com pelo menos 5 componentes (a da aluna, sozinha, fica com o que ela fez).
const cheias = (s, rodada) => telasDa(s, rodada).filter((t) => listaDeComponentes(t.componentes).length >= 5).length >= 4;

// Mede a página: largura e altura do documento e a seção que está à vista.
const medir = (page) => page.evaluate(() => {
  const doc = document.documentElement;
  return {
    largura: Math.max(doc.scrollWidth, document.body.scrollWidth),
    altura: Math.max(doc.scrollHeight, document.body.scrollHeight),
  };
});

// No telão: o título da fase e os números (placar, votos, contagens) com pelo menos 32 px de altura
// na tela, já com a redução que faz tudo caber.
const legibilidade = (page) => page.evaluate(() => {
  const visivel = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const secao = [...document.querySelectorAll('main > section')].find((s) => !s.hidden && visivel(s));
  const titulo = secao?.querySelector('h2, .telao-chamada');
  const numeros = [...(secao?.querySelectorAll('.telao-numero, .telao-numero-grande, .telao-votos') || [])]
    .filter((el) => visivel(el) && el.textContent.trim());
  const altura = (el) => el.getBoundingClientRect().height;
  return {
    secao: secao?.id,
    titulo: titulo?.textContent.trim(),
    alturaTitulo: titulo ? altura(titulo) : 0,
    menorNumero: numeros.length ? Math.min(...numeros.map(altura)) : null,
  };
});

test.describe('F15 · acabamento para celular e projetor', () => {
  test('celular em 360x740 e telão em 1920x1080 em todas as fases, com 21 alunos', async ({ browser }) => {
    test.setTimeout(420_000);
    const controle = await abrirControle(browser);
    const { page, sala } = controle;
    const telao = await abrir(browser, TELAO, `/telao.html?sala=${sala}`);
    const aluno = await abrir(browser, CELULAR, `/index.html?sala=${sala}`);
    try {
      // 20 bots e depois uma aluna de verdade: 5 grupos, ela sozinha no 5º (os bots não mexem na tela dela).
      await page.getByRole('button', { name: 'Adicionar 20 alunos falsos' }).click();
      await expect(page.locator('#status-bots')).toContainText('20 alunos falsos jogando', { timeout: 30_000 });
      await esperarSala(sala, (s) => Object.keys(s.alunos || {}).length === 20);
      await aluno.page.getByLabel('Seu nome').fill('Maria Eduarda Albuquerque de Souza Lima');
      await aluno.page.getByRole('button', { name: 'Entrar' }).click();
      await expect(aluno.page.locator('#tela-grupo')).toBeVisible({ timeout: 20_000 });

      const vistas = [];
      const conferir = async (fase) => {
        await expect(telao.page.locator('body')).toHaveAttribute('data-fase', fase);
        await expect(aluno.page.locator('#barra-fase')).toHaveAttribute('data-fase', fase);
        await telao.page.waitForTimeout(800); // deixa o telão terminar de redesenhar e caber
        const celular = await medir(aluno.page);
        const projetor = await medir(telao.page);
        const leitura = await legibilidade(telao.page);
        vistas.push({ fase, celular, projetor, ...leitura });
        if (FOTOS) {
          await aluno.page.screenshot({ path: `${FOTOS}/${FASES.indexOf(fase)}-${fase}-celular.png`, fullPage: true });
          await telao.page.screenshot({ path: `${FOTOS}/${FASES.indexOf(fase)}-${fase}-telao.png`, fullPage: true });
        }
        expect.soft(celular.largura, `celular sem rolagem lateral em ${fase}`).toBeLessThanOrEqual(360);
        expect.soft(projetor.largura, `telão sem rolagem lateral em ${fase}`).toBeLessThanOrEqual(1920);
        expect.soft(projetor.altura, `telão sem rolagem vertical em ${fase}`).toBeLessThanOrEqual(1080);
        expect.soft(leitura.alturaTitulo, `título legível no telão em ${fase}`).toBeGreaterThanOrEqual(32);
        if (leitura.menorNumero !== null) {
          expect.soft(leitura.menorNumero, `números legíveis no telão em ${fase}`).toBeGreaterThanOrEqual(32);
        }
      };
      const avancar = async (fase) => {
        await page.locator('#botao-avancar').click({ timeout: 15_000 });
        await expect(page.locator('#fase-atual')).toHaveAttribute('data-fase', fase);
      };

      await conferir('lobby');

      // R1: a aluna escreve um texto comprido sem espaços; os bots enchem as telas.
      await avancar('r1');
      await aluno.page.getByRole('button', { name: '+ componente' }).click({ timeout: 15_000 });
      await aluno.page.locator('#catalogo-grade button[data-tipo="titulo"]').click({ timeout: 15_000 });
      await aluno.page.locator('#editor-moldura .comp[data-tipo="titulo"]').click({ timeout: 15_000 });
      await aluno.page.getByLabel('Texto do componente').fill('Caronassolidáriasdauniversidadedebrasília'.repeat(2), { timeout: 15_000 });
      await esperarSala(sala, (s) => cheias(s, 1));
      await conferir('r1');
      await avancar('r1_troca');
      await conferir('r1_troca');
      await avancar('r1_avaliacao');
      await esperarSala(sala, (s) => telasDa(s, 1).filter((t) => t.avaliacaoR1).length >= 4);
      await conferir('r1_avaliacao');
      await avancar('r2');
      await esperarSala(sala, (s) => cheias(s, 2));
      await conferir('r2');
      await avancar('r2_troca');
      await conferir('r2_troca');
      await page.locator('#botao-trocar-r2').click({ timeout: 15_000 });
      await expect(page.locator('#dica-troca-r2')).toContainText('Troca feita');
      await avancar('r2_declaracao');
      await esperarSala(sala, (s) => telasDa(s, 2).filter((t) => t.declarados).length >= 4);
      await conferir('r2_declaracao');
      // Declaração e revisão: o projetor não fica vazio; mostra as telas da rodada 2 e o que fazer.
      await expect(telao.page.locator('#telao-rodada-titulo')).toHaveText('Rodada 2 · declaração');
      await expect(telao.page.locator('#telao-instrucao')).toContainText('marca no celular');
      await expect(telao.page.locator('#telao-telas > li')).toHaveCount(5);
      await avancar('r3');
      await esperarSala(sala, (s) => telasDa(s, 2).filter((t) => t.revisao?.enviadoEm).length >= 4);
      await conferir('r3');
      await expect(telao.page.locator('#telao-rodada-titulo')).toHaveText('Rodada 3 · revisão');
      await expect(telao.page.locator('#telao-instrucao')).toContainText('revisa a tela de outro grupo');
      await expect(telao.page.locator('#telao-telas > li')).toHaveCount(5);
      await avancar('resultado');
      await conferir('resultado');
      await avancar('oficina');
      await esperarSala(sala, (s) => Object.values(s.oficina || {}).filter((h) => h.progresso
        && [0, 1, 2].every((i) => h.features?.[i]?.evidencia)).length >= 4, 120_000);
      await conferir('oficina');
      await avancar('votacao');
      await esperarSala(sala, (s) => Object.keys(s.votos || {}).length >= 20);
      await conferir('votacao');
      await avancar('fim');
      await conferir('fim');

      console.log(JSON.stringify(vistas, null, 1));
      expect(vistas.map((v) => v.fase)).toEqual(FASES);
      expect(aluno.erros).toEqual([]);
      expect(telao.erros).toEqual([]);
    } finally {
      for (const c of [controle, telao, aluno]) await c.contexto.close();
    }
  });
  test('telão com 12 grupos ainda cabe em 1920x1080, sem rolagem, com números legíveis', async ({ browser }) => {
    test.setTimeout(90_000);
    const sala = `G${Math.floor(Math.random() * 900 + 100)}`;
    await semearSala(sala, { fase: 'lobby' });
    const grupos = {};
    const telas = {};
    const criterios = { c1: 'Tem busca', c2: 'Tem botão', c3: 'Tem mapa', c4: 'Tem preço', c5: 'Tem aviso' };
    for (let ordem = 0; ordem < 12; ordem++) {
      const gid = gidDaOrdem(ordem);
      grupos[gid] = { ...dadosDoGrupo(ordem), membros: Object.fromEntries([1, 2, 3, 4, 5].map((i) => [`u${ordem}_${i}`, true])) };
      telas[`r2_${gid}`] = {
        rodada: 2, autor: gid, dono: gid,
        componentes: CATALOGO.slice(0, 8).map(({ tipo }, i) => ({ id: `${gid}c${i}`, tipo, texto: `Texto bem comprido do componente ${i} do grupo` })),
        declarados: { c1: true, c2: true, c3: true },
        revisao: { revisor: gidDaOrdem((ordem + 1) % 12), aprovados: { c1: true, c2: false, c3: false, c4: false, c5: false }, enviadoEm: 1 },
      };
    }
    await gravarComoDono(`salas/${sala}/grupos`, grupos);
    await gravarComoDono(`salas/${sala}/telas`, telas);
    const telao = await abrir(browser, TELAO, `/telao.html?sala=${sala}`);
    try {
      for (const fase of ['lobby', 'r2', 'r2_declaracao', 'r3', 'resultado']) {
        if (fase === 'resultado') await gravarComoDono(`salas/${sala}/config/criterios`, criterios);
        await gravarComoDono(`salas/${sala}/estado/fase`, fase);
        await expect(telao.page.locator('body')).toHaveAttribute('data-fase', fase);
        await telao.page.waitForTimeout(800);
        if (FOTOS) await telao.page.screenshot({ path: `${FOTOS}/12grupos-${fase}.png`, fullPage: true });
        const { largura, altura } = await medir(telao.page);
        const leitura = await legibilidade(telao.page);
        expect.soft(largura, `sem rolagem lateral em ${fase}`).toBeLessThanOrEqual(1920);
        expect.soft(altura, `sem rolagem vertical em ${fase}`).toBeLessThanOrEqual(1080);
        expect.soft(leitura.alturaTitulo, `título legível em ${fase}`).toBeGreaterThanOrEqual(32);
        if (leitura.menorNumero !== null) expect.soft(leitura.menorNumero, `números legíveis em ${fase}`).toBeGreaterThanOrEqual(32);
      }
      await expect(telao.page.locator('#resultado-telas > li')).toHaveCount(12);
      expect(telao.erros).toEqual([]);
    } finally {
      await telao.contexto.close();
    }
  });
});

// Lighthouse (acessibilidade) no index.html, em vários estados do celular. O Chromium do Playwright
// abre uma porta de depuração e o Lighthouse navega nele; o contexto é persistente para a aluna
// continuar logada (disableStorageReset) e o Lighthouse ver a tela da fase, não só a de entrada.
test.describe('F15 · Lighthouse', () => {
  test('acessibilidade do index.html com nota mínima 90 na entrada, no editor, nos cartões e na votação', async ({ playwright }, info) => {
    test.setTimeout(240_000);
    const { default: lighthouse } = await import('lighthouse');
    const porta = 9300 + Math.floor(Math.random() * 500);
    const contexto = await playwright.chromium.launchPersistentContext(info.outputPath('perfil'), {
      ...CELULAR, args: [`--remote-debugging-port=${porta}`],
    });
    const sala = `L${Math.floor(Math.random() * 900 + 100)}`;
    const url = `http://localhost:5173/index.html?sala=${sala}`;
    const auditar = async (estado) => {
      const { lhr } = await lighthouse(url, {
        port: porta, onlyCategories: ['accessibility'], disableStorageReset: true, logLevel: 'error',
      });
      const falhas = Object.values(lhr.audits)
        .filter((a) => a.score !== null && a.score < 1 && a.scoreDisplayMode === 'binary').map((a) => a.id);
      const nota = Math.round(lhr.categories.accessibility.score * 100);
      console.log(`Lighthouse ${estado}: ${nota}`, falhas.join(', '));
      if (process.env.LH_DETALHE) for (const id of falhas) console.log(id, JSON.stringify(lhr.audits[id].details?.items?.map((i) => [i.node?.selector, i.node?.explanation])));
      return nota;
    };
    try {
      await semearSala(sala, { fase: 'lobby' });
      await gravarComoDono(`salas/${sala}/segredo/criterios`, { c1: 'Tem busca', c2: 'Tem botão' });
      expect(await auditar('entrada')).toBeGreaterThanOrEqual(90);

      // A aluna entra; daí em diante o Lighthouse abre a página já no grupo.
      const page = contexto.pages()[0] || await contexto.newPage();
      await page.goto(url);
      await page.getByLabel('Seu nome').fill('Ana');
      await page.getByRole('button', { name: 'Entrar' }).click();
      await expect(page.locator('#tela-grupo')).toBeVisible({ timeout: 20_000 });
      const irPara = async (fase) => {
        const s = await lerComoDono(`salas/${sala}`);
        await atualizarComoDono(`salas/${sala}`, atualizacaoDeFase(fase, s));
      };

      await irPara('r1');
      await atualizarComoDono(`salas/${sala}/telas/r1_g1`, {
        componentes: [{ id: 'a', tipo: 'titulo', texto: 'Caronas UnB' }, { id: 'b', tipo: 'botao', texto: 'Oferecer carona' }],
      });
      expect(await auditar('editor (r1)')).toBeGreaterThanOrEqual(90);
      for (const fase of ['r1_troca', 'r1_avaliacao', 'r2']) await irPara(fase);
      expect(await auditar('cartões (r2)')).toBeGreaterThanOrEqual(90);
      for (const fase of ['r2_troca', 'r2_declaracao', 'r3', 'resultado', 'oficina', 'votacao']) await irPara(fase);
      expect(await auditar('votação')).toBeGreaterThanOrEqual(90);
    } finally {
      await contexto.close();
    }
  });
});
