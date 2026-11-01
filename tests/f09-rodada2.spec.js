import { test, expect } from '@playwright/test';
import {
  atualizarComoDono, carregarRegras, criarAdmin, gravarComoDono, lerComoDono,
} from './emulador.js';
import { atualizacaoDeFase, contarProntos } from '../site/js/fases.js';
import { listaDeComponentes } from '../site/js/tela.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1';
const CONTROLE = { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false };
const TELAO = { viewport: { width: 1920, height: 1080 }, isMobile: false, hasTouch: false };
const AVISO = 'Sua sessão acabou. Você é um agente novo, sem memória.';
const AGENTS = 'Tela de celular em pé. No máximo 6 componentes. Nunca invente funcionalidade fora da lista. '
  + 'Antes de sair, escreva no progress.md o que fez e o que falta.';
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
  const uid = await page.evaluate(async () => {
    const { auth } = await import(new URL('js/firebase-config.js', location.href).href);
    return auth.currentUser.uid;
  });
  return { contexto, page, erros, uid };
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

async function adicionar(page, tipo) {
  await page.getByRole('button', { name: '+ componente' }).click();
  await page.locator(`#catalogo-grade button[data-tipo="${tipo}"]`).click();
}

async function escrever(page, tipo, texto) {
  await page.locator(`#editor-moldura .comp[data-tipo="${tipo}"]`).last().click();
  await page.getByLabel('Texto do componente').fill(texto);
}

const pronto = (page, c, lista = '#features-r2') => page.locator(`${lista} input[data-criterio="${c}"]`);
const donos = async (sala) => Object.fromEntries(Object.entries(await lerComoDono(`salas/${sala}/telas`))
  .filter(([, t]) => t.rodada === 2).map(([tid, t]) => [tid, t.dono]));

test.describe('F09 · rodada 2 com os cartões de harness', () => {
  test('na r2 cada grupo recebe uma tela nova em branco e os três cartões', async ({ browser }) => {
    test.setTimeout(120_000);
    const controle = await abrirControle(browser);
    const { page, sala } = controle;
    const ana = await entrar(browser, sala, 'Ana'); // g1
    const beto = await entrar(browser, sala, 'Beto'); // g2
    const telao = await abrirTelao(browser, sala);
    try {
      await irAte(page, 'r1');
      await atualizarComoDono(`salas/${sala}/telas`, {
        'r1_g1/componentes': [{ id: 'a1', tipo: 'titulo', texto: 'Tela da R1' }],
      });
      await irAte(page, 'r2');

      // Telas novas da rodada 2, em branco, com autor = dono = o grupo; as da R1 ficam como estavam.
      await expect.poll(() => lerComoDono(`salas/${sala}/telas/r2_g1`)).toEqual({ rodada: 2, autor: 'g1', dono: 'g1' });
      expect(await lerComoDono(`salas/${sala}/telas/r2_g2`)).toEqual({ rodada: 2, autor: 'g2', dono: 'g2' });
      expect(listaDeComponentes(await lerComoDono(`salas/${sala}/telas/r1_g1/componentes`))[0].texto).toBe('Tela da R1');

      // Cada celular: editor com a tela vazia e os três cartões.
      for (const { page: p } of [ana, beto]) {
        await expect(p.locator('#tela-editor')).toBeVisible();
        await expect(p.locator('#editor-moldura')).toContainText('Tela vazia');
        await expect(p.locator('#cartoes-r2')).toBeVisible();
        await expect(p.locator('#cartoes-r2')).toContainText('AGENTS.md');
        await expect(p.locator('#texto-agents')).toHaveText(AGENTS);
        await expect(p.locator('#cartoes-r2')).toContainText('feature_list');
        await expect(p.locator('#features-r2 li')).toHaveCount(5);
        await expect(p.locator('#features-r2 li').first()).toContainText('Oferecer carona');
        await expect(p.locator('#features-r2 li').first()).toContainText('pronto?');
        await expect(p.locator('#cartoes-r2')).toContainText('progress.md');
        await expect(p.getByLabel('O que vocês fizeram e o que falta')).toBeEditable();
        await expect(p.locator('#progresso-contagem')).toHaveText('0/280');
        await expect(p.locator('#saida-sessao')).toBeHidden(); // sair só na r2_troca
        await expect(p.locator('#progresso-anterior')).toBeHidden();
        expect(await p.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
      }

      // Ana edita a tela nova do grupo dela; a do Beto continua vazia.
      await adicionar(ana.page, 'titulo');
      await escrever(ana.page, 'titulo', 'Caronas UnB');
      await expect.poll(async () => listaDeComponentes(await lerComoDono(`salas/${sala}/telas/r2_g1/componentes`))
        .map((c) => c.texto)).toEqual(['Caronas UnB']);
      await expect(beto.page.locator('#editor-moldura')).toContainText('Tela vazia');

      // feature_list e progress.md gravam na tela em mãos.
      await pronto(ana.page, 'c1').check();
      await expect.poll(() => lerComoDono(`salas/${sala}/telas/r2_g1/declarados`)).toEqual({ c1: true });
      await ana.page.getByLabel('O que vocês fizeram e o que falta').fill('Fiz o título.');
      await expect.poll(() => lerComoDono(`salas/${sala}/telas/r2_g1/progresso`)).toBe('Fiz o título.');
      await expect(ana.page.locator('#progresso-contagem')).toHaveText('13/280');

      // Telão: as telas da rodada 2.
      await expect(telao.page.locator('#telao-rodada-titulo')).toHaveText('Rodada 2');
      await expect(telao.page.locator('#telao-telas li')).toHaveCount(2);
      await expect(telao.page.locator('#telao-telas li[data-tid="r2_g1"]')).toContainText('Caronas UnB');
      await expect(telao.page.locator('#telao-prontos')).toBeHidden();

      // Regras: só a tela do próprio grupo, só a da rodada 2, progress.md até 280 e sair só na r2_troca.
      expect(await tentar(ana.page, sala, {
        propria: ['telas/r2_g1/componentes/1', { id: 'x1', tipo: 'botao', texto: 'Oferecer carona' }],
        outroGrupo: ['telas/r2_g2/componentes/0', { id: 'x2', tipo: 'botao', texto: 'b' }],
        telaDaR1: ['telas/r1_g2/componentes/0', { id: 'x3', tipo: 'botao', texto: 'b' }],
        progressoOutro: ['telas/r2_g2/progresso', 'meu'],
        progresso280: ['telas/r2_g1/progresso', 'x'.repeat(280)],
        progresso281: ['telas/r2_g1/progresso', 'x'.repeat(281)],
        declaradoOutro: ['telas/r2_g2/declarados/c1', true],
        sairNaR2: ['telas/r2_g1/saiu', { por: ana.uid, em: AGORA }],
      })).toEqual({
        propria: 'ok', outroGrupo: 'negado', telaDaR1: 'negado', progressoOutro: 'negado',
        progresso280: 'ok', progresso281: 'negado', declaradoOutro: 'negado', sairNaR2: 'negado',
      });

      // Voltar e avançar não apaga a tela da rodada 2.
      await page.getByRole('button', { name: '← Voltar fase' }).click();
      await expect(ana.page.locator('#tela-avaliacao')).toBeVisible();
      await page.getByRole('button', { name: 'Avançar fase →' }).click();
      await expect(ana.page.locator('#editor-moldura')).toContainText('Caronas UnB');
      const telas = await lerComoDono(`salas/${sala}/telas`);
      const grupos = await lerComoDono(`salas/${sala}/grupos`);
      const semG2 = { ...telas };
      delete semG2.r2_g2;
      expect(Object.keys(atualizacaoDeFase('r2', { grupos, telas: semG2 }, 1)).filter((k) => k.startsWith('telas/')))
        .toEqual(['telas/r2_g2']);

      for (const c of [ana, beto, telao]) {
        expect(await c.page.evaluate(() => window.semRecarregar)).toBe(true);
        expect(c.erros).toEqual([]);
      }
      expect(controle.erros).toEqual([]);
    } finally {
      for (const c of [controle, ana, beto, telao]) await c.contexto.close();
    }
  });

  test('na r2_troca o grupo só sai depois de preencher o progress.md; o controle conta e pode forçar; o herdeiro vê o progress.md', async ({ browser }) => {
    test.setTimeout(150_000);
    const controle = await abrirControle(browser);
    const { page, sala } = controle;
    const ana = await entrar(browser, sala, 'Ana'); // g1
    const beto = await entrar(browser, sala, 'Beto'); // g2
    const telao = await abrirTelao(browser, sala);
    const PROGRESSO_ANA = 'Fiz o título. Falta a lista com horário e ponto de saída.';
    const PROGRESSO_BETO = 'Comecei pelo botão Oferecer carona.';
    try {
      await irAte(page, 'r2');
      await atualizarComoDono(`salas/${sala}/telas`, {
        'r2_g1/componentes': [{ id: 'a1', tipo: 'titulo', texto: 'Tela da Ana' }],
        'r2_g2/componentes': [{ id: 'b1', tipo: 'titulo', texto: 'Tela do Beto' }],
      });
      await irAte(page, 'r2_troca');

      // Entrar na r2_troca não troca nada (Decisão 3).
      expect(await donos(sala)).toEqual({ r2_g1: 'g1', r2_g2: 'g2' });
      expect(await lerComoDono(`salas/${sala}/trocas/r2_troca`)).toBeNull();
      await expect(page.getByRole('button', { name: 'Trocar sessão' })).toBeHidden();
      await expect(page.locator('#controle-prontos')).toHaveText('0 de 2 grupos prontos');
      await expect(page.getByRole('button', { name: 'Forçar troca' })).toBeVisible();
      await expect(telao.page.locator('#telao-prontos')).toBeVisible();
      await expect(telao.page.locator('#telao-prontos')).toHaveText('0 de 2 grupos prontos');
      await expect(ana.page.locator('#aviso-sessao')).toBeHidden();

      // Sem progress.md não dá para sair, nem na interface nem pelas regras.
      const sair = ana.page.getByRole('button', { name: 'Sair da sessão' });
      await expect(sair).toBeVisible();
      await expect(sair).toBeDisabled();
      await expect(ana.page.locator('#dica-sair')).toHaveText('Preencham o progress.md antes de sair.');
      expect(await tentar(ana.page, sala, {
        semProgresso: ['telas/r2_g1/saiu', { por: ana.uid, em: AGORA }],
      })).toEqual({ semProgresso: 'negado' });
      expect(await tentar(ana.page, sala, {
        espacos: ['telas/r2_g1/progresso', ' \n\t '],
        soComEspacos: ['telas/r2_g1/saiu', { por: ana.uid, em: AGORA }],
        outroUid: ['telas/r2_g1/progresso', 'x'],
        porOutro: ['telas/r2_g1/saiu', { por: beto.uid, em: AGORA }],
        emInventado: ['telas/r2_g1/saiu', { por: ana.uid, em: 123 }],
        limpar: ['telas/r2_g1/progresso', null],
      })).toEqual({
        espacos: 'ok', soComEspacos: 'negado', outroUid: 'ok', porOutro: 'negado', emInventado: 'negado', limpar: 'ok',
      });
      await ana.page.getByLabel('O que vocês fizeram e o que falta').fill('   ');
      await expect(sair).toBeDisabled();

      // Com o progress.md preenchido, sai: grava saiu {por, em} e o editor some.
      await ana.page.getByLabel('O que vocês fizeram e o que falta').fill(PROGRESSO_ANA);
      await expect(sair).toBeEnabled();
      await sair.click();
      await expect.poll(() => lerComoDono(`salas/${sala}/telas/r2_g1/saiu`)).toEqual({ por: ana.uid, em: expect.any(Number) });
      expect(await lerComoDono(`salas/${sala}/telas/r2_g1/progresso`)).toBe(PROGRESSO_ANA);
      await expect(ana.page.locator('#sessao-encerrada')).toBeVisible();
      await expect(ana.page.locator('#editor-sessao')).toBeHidden();
      await expect(ana.page.locator('#saida-sessao')).toBeHidden();
      await expect(ana.page.getByLabel('O que vocês fizeram e o que falta')).not.toBeEditable();
      expect(await tentar(ana.page, sala, {
        mudarProgresso: ['telas/r2_g1/progresso', 'mudei'],
        sairDeNovo: ['telas/r2_g1/saiu', { por: ana.uid, em: AGORA }],
        sairPeloOutro: ['telas/r2_g2/saiu', { por: ana.uid, em: AGORA }],
      })).toEqual({ mudarProgresso: 'negado', sairDeNovo: 'negado', sairPeloOutro: 'negado' });

      // O controle e o telão contam os grupos prontos ao vivo.
      await expect(page.locator('#controle-prontos')).toHaveText('1 de 2 grupos prontos');
      await expect(page.getByRole('button', { name: 'Forçar troca' })).toBeVisible();
      await expect(telao.page.locator('#telao-prontos')).toHaveText('1 de 2 grupos prontos');
      await beto.page.getByLabel('O que vocês fizeram e o que falta').fill(PROGRESSO_BETO);
      await beto.page.getByRole('button', { name: 'Sair da sessão' }).click();
      await expect(page.locator('#controle-prontos')).toHaveText('2 de 2 grupos prontos');
      await expect(page.getByRole('button', { name: 'Trocar sessão' })).toBeVisible();
      await expect(telao.page.locator('#telao-prontos')).toHaveText('2 de 2 grupos prontos');

      // Voltar para a r2 apaga as saídas; de novo na r2_troca, só a Ana sai e o controle força a troca.
      await page.getByRole('button', { name: '← Voltar fase' }).click();
      await expect.poll(() => lerComoDono(`salas/${sala}/telas/r2_g1/saiu`)).toBeNull();
      expect(await lerComoDono(`salas/${sala}/telas/r2_g2/saiu`)).toBeNull();
      await expect(ana.page.locator('#editor-sessao')).toBeVisible();
      await page.getByRole('button', { name: 'Avançar fase →' }).click();
      await expect(page.locator('#controle-prontos')).toHaveText('0 de 2 grupos prontos');
      await ana.page.getByRole('button', { name: 'Sair da sessão' }).click();
      await expect(page.locator('#controle-prontos')).toHaveText('1 de 2 grupos prontos');
      await page.getByRole('button', { name: 'Forçar troca' }).click();

      await expect.poll(() => donos(sala)).toEqual({ r2_g1: 'g2', r2_g2: 'g1' });
      expect(await lerComoDono(`salas/${sala}/trocas/r2_troca`)).toEqual({ r2_g1: 'g1', r2_g2: 'g2' });
      expect(await lerComoDono(`salas/${sala}/estado/fase`)).toBe('r2_troca');
      await expect(page.locator('#botao-trocar-r2')).toBeHidden();
      await expect(page.locator('#dica-troca-r2')).toContainText('Troca feita.');

      // O herdeiro vê o aviso, o progress.md do anterior em destaque e passa a editar a tela herdada.
      await expect(beto.page.locator('#aviso-sessao')).toBeVisible();
      await expect(beto.page.locator('#aviso-sessao')).toContainText(AVISO);
      await expect(beto.page.locator('#progresso-anterior')).toBeVisible();
      await expect(beto.page.locator('#progresso-anterior')).toContainText('progress.md do agente anterior');
      await expect(beto.page.locator('#progresso-anterior-texto')).toHaveText(PROGRESSO_ANA);
      await expect(beto.page.locator('#cartao-progresso')).toBeHidden();
      await expect(beto.page.locator('#editor-moldura')).toContainText('Tela da Ana');
      const destaque = await beto.page.locator('#progresso-anterior').boundingBox();
      const moldura = await beto.page.locator('#editor-moldura').boundingBox();
      expect(destaque.y).toBeLessThan(moldura.y); // acima da tela, antes de tudo

      // Ana, que tinha saído, recebe a tela do Beto (que não saiu, mas tem progress.md).
      await expect(ana.page.locator('#sessao-encerrada')).toBeHidden();
      await expect(ana.page.locator('#editor-sessao')).toBeVisible();
      await expect(ana.page.locator('#progresso-anterior-texto')).toHaveText(PROGRESSO_BETO);
      await expect(ana.page.locator('#editor-moldura')).toContainText('Tela do Beto');

      await beto.page.getByRole('button', { name: 'Continuar' }).click();
      await adicionar(beto.page, 'lista');
      await escrever(beto.page, 'lista', '18h · ICC Norte');
      await expect.poll(async () => listaDeComponentes(await lerComoDono(`salas/${sala}/telas/r2_g1/componentes`))
        .map((c) => c.texto)).toEqual(['Tela da Ana', '18h · ICC Norte']);
      expect(await tentar(beto.page, sala, {
        telaHerdada: ['telas/r2_g1/componentes/2', { id: 'y1', tipo: 'aviso', texto: 'ok' }],
        telaAntiga: ['telas/r2_g2/componentes/1', { id: 'y2', tipo: 'aviso', texto: 'não' }],
        progressoDoAnterior: ['telas/r2_g1/progresso', 'apaguei'],
      })).toEqual({ telaHerdada: 'ok', telaAntiga: 'negado', progressoDoAnterior: 'negado' });
      expect(await lerComoDono(`salas/${sala}/telas/r2_g1/progresso`)).toBe(PROGRESSO_ANA);

      // Recarregar mantém o aviso e o destaque.
      await beto.page.reload();
      await expect(beto.page.locator('#aviso-sessao')).toBeVisible();
      await expect(beto.page.locator('#progresso-anterior-texto')).toHaveText(PROGRESSO_ANA);
      await expect(beto.page.locator('#editor-moldura')).toContainText('18h · ICC Norte');

      // Voltar para a r2 desfaz a troca e apaga as saídas.
      await page.getByRole('button', { name: '← Voltar fase' }).click();
      await expect.poll(() => donos(sala)).toEqual({ r2_g1: 'g1', r2_g2: 'g2' });
      expect(await lerComoDono(`salas/${sala}/trocas/r2_troca`)).toBeNull();
      expect(await lerComoDono(`salas/${sala}/trocas/r1_troca`)).toEqual({ r1_g1: 'g1', r1_g2: 'g2' });
      expect(await lerComoDono(`salas/${sala}/telas/r2_g1/saiu`)).toBeNull();
      await expect(ana.page.locator('#editor-moldura')).toContainText('18h · ICC Norte');
      await expect(ana.page.locator('#progresso-anterior')).toBeHidden();

      // A contagem é a mesma da função pura.
      expect(contarProntos({
        a: { rodada: 2, dono: 'g1', saiu: { por: 'u', em: 1 } }, b: { rodada: 2, dono: 'g2' }, c: { rodada: 1, dono: 'g1', saiu: {} },
      }, { g1: {}, g2: {} })).toEqual({ prontos: 1, total: 2 });

      for (const c of [ana, telao]) {
        expect(await c.page.evaluate(() => window.semRecarregar)).toBe(true);
        expect(c.erros).toEqual([]);
      }
      expect(beto.erros).toEqual([]);
      expect(controle.erros).toEqual([]);
    } finally {
      for (const c of [controle, ana, beto, telao]) await c.contexto.close();
    }
  });

  test('na r2_declaracao o grupo que tem a tela marca os critérios que considera prontos', async ({ browser }) => {
    test.setTimeout(120_000);
    const controle = await abrirControle(browser);
    const { page, sala } = controle;
    const ana = await entrar(browser, sala, 'Ana'); // g1
    const beto = await entrar(browser, sala, 'Beto'); // g2
    try {
      await irAte(page, 'r2');
      // Na r2 a Ana (autora) já marca o c5 como pronto na feature_list da tela dela.
      await pronto(ana.page, 'c5').check();
      await expect.poll(() => lerComoDono(`salas/${sala}/telas/r2_g1/declarados`)).toEqual({ c5: true });
      await atualizarComoDono(`salas/${sala}/telas`, {
        'r2_g1/componentes': [{ id: 'a1', tipo: 'botao', texto: 'Oferecer carona' }],
        'r2_g1/progresso': 'Fiz o botão. Falta a lista.',
        'r2_g2/componentes': [{ id: 'b1', tipo: 'titulo', texto: 'Tela do Beto' }],
      });
      await irAte(page, 'r2_troca');
      await page.getByRole('button', { name: 'Forçar troca' }).click();
      await expect.poll(() => donos(sala)).toEqual({ r2_g1: 'g2', r2_g2: 'g1' });
      await irAte(page, 'r2_declaracao');

      // O Beto (herdeiro) vê a feature_list da tela em mãos, com o que o anterior deixou marcado.
      await expect(beto.page.locator('#tela-declaracao')).toBeVisible();
      await expect(beto.page.locator('#tela-editor')).toBeHidden();
      await expect(beto.page.locator('#declaracao-features li')).toHaveCount(5);
      await expect(pronto(beto.page, 'c5', '#declaracao-features')).toBeChecked();
      await expect(beto.page.locator('#declaracao-total')).toHaveText('1 de 5 critérios prontos');
      await expect(beto.page.locator('#declaracao-moldura')).toContainText('Oferecer carona');
      await expect(beto.page.locator('#declaracao-anterior-texto')).toHaveText('Fiz o botão. Falta a lista.');

      await pronto(beto.page, 'c1', '#declaracao-features').check();
      await pronto(beto.page, 'c3', '#declaracao-features').check();
      await pronto(beto.page, 'c5', '#declaracao-features').uncheck();
      await expect.poll(() => lerComoDono(`salas/${sala}/telas/r2_g1/declarados`)).toEqual({ c1: true, c3: true, c5: false });
      await expect(beto.page.locator('#declaracao-total')).toHaveText('2 de 5 critérios prontos');

      await expect(ana.page.locator('#declaracao-moldura')).toContainText('Tela do Beto');
      await pronto(ana.page, 'c2', '#declaracao-features').check();
      await expect.poll(() => lerComoDono(`salas/${sala}/telas/r2_g2/declarados`)).toEqual({ c2: true });

      // Regras: só a tela em mãos, só c1..c5 booleanos, e a tela não é mais editada.
      expect(await tentar(ana.page, sala, {
        telaEmMaos: ['telas/r2_g2/declarados/c4', true],
        telaDoOutro: ['telas/r2_g1/declarados/c2', true],
        chaveInvalida: ['telas/r2_g2/declarados/c9', true],
        naoBooleano: ['telas/r2_g2/declarados/c1', 'sim'],
        editarTela: ['telas/r2_g2/componentes/1', { id: 'z1', tipo: 'aviso', texto: 'tarde' }],
      })).toEqual({
        telaEmMaos: 'ok', telaDoOutro: 'negado', chaveInvalida: 'negado', naoBooleano: 'negado', editarTela: 'negado',
      });

      // Depois da declaração, ninguém marca mais.
      await page.getByRole('button', { name: 'Avançar fase →' }).click();
      await expect.poll(() => lerComoDono(`salas/${sala}/estado/fase`)).toBe('r3');
      expect(await tentar(beto.page, sala, { depois: ['telas/r2_g1/declarados/c2', true] })).toEqual({ depois: 'negado' });

      for (const c of [ana, beto]) {
        expect(await c.page.evaluate(() => window.semRecarregar)).toBe(true);
        expect(c.erros).toEqual([]);
      }
      expect(controle.erros).toEqual([]);
    } finally {
      for (const c of [controle, ana, beto]) await c.contexto.close();
    }
  });
});
