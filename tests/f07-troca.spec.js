import { test, expect } from '@playwright/test';
import {
  atualizarComoDono, carregarRegras, criarAdmin, escutarComoDono, gravarComoDono, lerComoDono,
} from './emulador.js';
import { atualizacaoDeFase, proximoGrupo } from '../site/js/fases.js';
import { listaDeComponentes } from '../site/js/tela.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1';
const CONTROLE = { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false };
const TELAO = { viewport: { width: 1920, height: 1080 }, isMobile: false, hasTouch: false };
const AVISO = 'Sua sessão acabou. Você é um agente novo, sem memória.';

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
  return { contexto, page, erros };
}

async function adicionar(page, tipo) {
  await page.getByRole('button', { name: '+ componente' }).click();
  await page.locator(`#catalogo-grade button[data-tipo="${tipo}"]`).click();
}

// Toca no último componente do tipo e escreve o texto dele.
async function escrever(page, tipo, texto) {
  await page.locator(`#editor-moldura .comp[data-tipo="${tipo}"]`).last().click();
  await page.getByLabel('Texto do componente').fill(texto);
}

const textosNaTela = (page) => page.locator('#editor-moldura .comp').allTextContents();
const donos = async (sala) => Object.fromEntries(Object.entries(await lerComoDono(`salas/${sala}/telas`))
  .map(([tid, t]) => [tid, t.dono]));

// Tenta gravar como o aluno da página, com o SDK e as regras de verdade.
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

test.describe('F07 · troca de sessão da rodada 1', () => {
  test("'Trocar sessão' muda o dono de cada tela para o próximo grupo numa única atualização", async ({ browser }) => {
    test.setTimeout(90_000);
    const controle = await abrirControle(browser, { tamanhoGrupo: 1 });
    const { page, sala } = controle;
    const alunos = [];
    for (const nome of ['Ana', 'Beto', 'Caio']) alunos.push(await entrar(browser, sala, nome));
    const escuta = escutarComoDono(`salas/${sala}`);
    try {
      const trocar = page.getByRole('button', { name: 'Trocar sessão' });
      await expect(trocar).toBeHidden(); // no lobby não há troca
      await page.getByRole('button', { name: 'Avançar fase →' }).click();
      await expect(page.locator('#fase-atual')).toHaveText('Rodada 1');
      await expect(trocar).toBeVisible();
      await expect.poll(() => donos(sala)).toEqual({ r1_g1: 'g1', r1_g2: 'g2', r1_g3: 'g3' });

      // Cada grupo deixa uma marca na sua tela; o Caio fica "editando" o título dele.
      await atualizarComoDono(`salas/${sala}/telas`, {
        'r1_g1/componentes': [{ id: 'a1', tipo: 'titulo', texto: 'Tela da Ana' }],
        'r1_g2/componentes': [{ id: 'b1', tipo: 'titulo', texto: 'Tela do Beto' }],
        'r1_g3/componentes': [{ id: 'c1', tipo: 'titulo', texto: 'Tela do Caio', editandoPor: 'uid-do-caio' }],
      });
      await expect(alunos[0].page.locator('#editor-moldura')).toContainText('Tela da Ana');

      await escuta.pronto;
      await expect.poll(() => escuta.eventos.length).toBeGreaterThan(0);
      const antes = escuta.eventos.length;
      await trocar.click();
      await expect(page.locator('#fase-atual')).toHaveText('Rodada 1 · troca de sessão');
      await expect(trocar).toBeHidden();

      // Rotação circular pela ordem dos grupos; autor e componentes ficam onde estavam.
      await expect.poll(() => donos(sala)).toEqual({ r1_g1: 'g2', r1_g2: 'g3', r1_g3: 'g1' });
      const depois = await lerComoDono(`salas/${sala}`);
      expect(depois.estado.fase).toBe('r1_troca');
      expect(depois.trocas).toEqual({ r1_troca: { r1_g1: 'g1', r1_g2: 'g2', r1_g3: 'g3' } });
      expect(depois.telas.r1_g1.autor).toBe('g1');
      expect(listaDeComponentes(depois.telas.r1_g1.componentes)).toEqual([{ id: 'a1', tipo: 'titulo', texto: 'Tela da Ana' }]);
      // O "editando" de quem perdeu a tela some na troca.
      expect(listaDeComponentes(depois.telas.r1_g3.componentes)).toEqual([{ id: 'c1', tipo: 'titulo', texto: 'Tela do Caio' }]);

      // Tudo chegou ao banco num único evento: fase, donos e trocas na mesma atualização.
      const novos = escuta.eventos.slice(antes);
      expect(novos).toHaveLength(1);
      expect(novos[0].evento).toBe('patch');
      expect(novos[0].data).toMatchObject({
        'estado/fase': 'r1_troca',
        'telas/r1_g1/dono': 'g2',
        'telas/r1_g2/dono': 'g3',
        'telas/r1_g3/dono': 'g1',
        'trocas/r1_troca': { r1_g1: 'g1', r1_g2: 'g2', r1_g3: 'g3' },
        'telas/r1_g3/componentes/0/editandoPor': null,
      });

      // Voltar da avaliação para a troca não troca de novo.
      await page.getByRole('button', { name: 'Avançar fase →' }).click();
      await expect(page.locator('#fase-atual')).toHaveText('Rodada 1 · avaliação');
      await page.getByRole('button', { name: '← Voltar fase' }).click();
      await expect(page.locator('#fase-atual')).toHaveText('Rodada 1 · troca de sessão');
      await expect.poll(() => lerComoDono(`salas/${sala}/estado/fase`)).toBe('r1_troca');
      expect(await donos(sala)).toEqual({ r1_g1: 'g2', r1_g2: 'g3', r1_g3: 'g1' });

      // Voltar para a r1 desfaz a troca (Decisão 2), também numa atualização só.
      const antesDeVoltar = escuta.eventos.length;
      await page.getByRole('button', { name: '← Voltar fase' }).click();
      await expect(page.locator('#fase-atual')).toHaveText('Rodada 1');
      await expect.poll(() => donos(sala)).toEqual({ r1_g1: 'g1', r1_g2: 'g2', r1_g3: 'g3' });
      expect(await lerComoDono(`salas/${sala}/trocas`)).toBeNull();
      expect(escuta.eventos.slice(antesDeVoltar)).toHaveLength(1);
      await expect(alunos[0].page.locator('#editor-moldura')).toContainText('Tela da Ana');

      // E avançar pelo botão normal também troca.
      await page.getByRole('button', { name: 'Avançar fase →' }).click();
      await expect.poll(() => donos(sala)).toEqual({ r1_g1: 'g2', r1_g2: 'g3', r1_g3: 'g1' });

      expect(controle.erros).toEqual([]);
      for (const { erros } of alunos) expect(erros).toEqual([]);

      // A rotação segue a ordem dos grupos, não a das chaves.
      expect(proximoGrupo({ g2: { ordem: 1 }, g10: { ordem: 2 }, g1: { ordem: 0 } })).toEqual({ g1: 'g2', g2: 'g10', g10: 'g1' });
      // A função é uma atualização só, com a fase junto.
      const telas = { r1_g1: { rodada: 1, dono: 'g1' }, r1_g2: { rodada: 1, dono: 'g2' }, r2_g1: { rodada: 2, dono: 'g1' } };
      expect(atualizacaoDeFase('r1_troca', { grupos: { g1: { ordem: 0 }, g2: { ordem: 1 } }, telas }, 7)).toEqual({
        'estado/fase': 'r1_troca', 'estado/timerFim': 0, 'estado/atualizadoEm': 7,
        'telas/r1_g1/dono': 'g2', 'telas/r1_g2/dono': 'g1', 'trocas/r1_troca': { r1_g1: 'g1', r1_g2: 'g2' },
      });
    } finally {
      escuta.parar();
      for (const { contexto } of alunos) await contexto.close();
      await controle.contexto.close();
    }
  });

  test("cada celular mostra o aviso 'Sua sessão acabou…' e passa a editar a tela herdada", async ({ browser }) => {
    test.setTimeout(90_000);
    const controle = await abrirControle(browser, { tamanhoGrupo: 2 });
    const { page, sala } = controle;
    // Ana e Beto no Azul (g1), Caio no Verde (g2).
    const ana = await entrar(browser, sala, 'Ana');
    const beto = await entrar(browser, sala, 'Beto');
    const caio = await entrar(browser, sala, 'Caio');
    const celulares = [ana, beto, caio];
    const telaoContexto = await browser.newContext(TELAO);
    const telao = await telaoContexto.newPage();
    const errosTelao = registrarErros(telao);
    await telao.goto(`/telao.html?sala=${sala}`);
    try {
      await expect(page.locator('#controle-grupos > li[data-gid="g1"] .controle-grupo-nome')).toHaveText('Azul · 2 alunos');
      await page.getByRole('button', { name: 'Avançar fase →' }).click();

      // Na r1 cada grupo monta a sua tela pelo celular; o aviso não aparece.
      for (const { page: p } of celulares) await expect(p.locator('#editor-area')).toBeVisible();
      await adicionar(ana.page, 'titulo');
      await escrever(ana.page, 'titulo', 'Caronas Azul');
      await adicionar(caio.page, 'botao');
      await escrever(caio.page, 'botao', 'Oferecer carona');
      await expect(beto.page.locator('#editor-moldura')).toContainText('Caronas Azul');
      await expect(caio.page.locator('#editor-moldura')).toContainText('Oferecer carona');
      await expect.poll(async () => listaDeComponentes(await lerComoDono(`salas/${sala}/telas/r1_g2/componentes`))
        .map((c) => c.texto)).toEqual(['Oferecer carona']);
      for (const { page: p } of celulares) {
        await expect(p.locator('#aviso-sessao')).toBeHidden();
        await p.evaluate(() => { window.semRecarregar = true; });
      }
      // Ana está com o campo em foco quando a sessão acaba.
      await ana.page.locator('#editor-moldura .comp-titulo').click();
      await ana.page.getByLabel('Texto do componente').focus();

      await page.getByRole('button', { name: 'Trocar sessão' }).click();

      // Todos veem o aviso grande e passam a ver a tela do outro grupo, sem recarregar.
      for (const { page: p } of celulares) {
        await expect(p.locator('#aviso-sessao')).toBeVisible();
        await expect(p.locator('#aviso-sessao')).toContainText(AVISO);
        await expect(p.locator('#aviso-sessao')).toContainText('Continue a tela que recebeu.');
        await expect(p.locator('#tela-editor')).toBeVisible();
      }
      await expect.poll(() => textosNaTela(ana.page)).toEqual(['Oferecer carona']);
      await expect.poll(() => textosNaTela(beto.page)).toEqual(['Oferecer carona']);
      await expect.poll(() => textosNaTela(caio.page)).toEqual(['Caronas Azul']);
      await expect(ana.page.locator('#painel-componente')).toBeHidden(); // a seleção da tela antiga some
      // O telão mostra cada tela na cor de quem a tem agora.
      await expect(telao.locator('#telao-telas > li')).toHaveCount(2);
      await expect(telao.locator('#telao-telas > li').first()).toContainText('Azul');
      await expect(telao.locator('#telao-telas > li').first()).toContainText('Oferecer carona');

      // "Continuar" fecha o aviso e o grupo edita a tela herdada.
      await ana.page.getByRole('button', { name: 'Continuar' }).click();
      await expect(ana.page.locator('#aviso-sessao')).toBeHidden();
      await adicionar(ana.page, 'filtro');
      await escrever(ana.page, 'filtro', 'Darcy, Gama');
      await expect.poll(async () => listaDeComponentes(await lerComoDono(`salas/${sala}/telas/r1_g2/componentes`))
        .map((c) => c.texto)).toEqual(['Oferecer carona', 'Darcy, Gama']);
      await expect(beto.page.locator('#editor-moldura')).toContainText('Darcy');
      await caio.page.getByRole('button', { name: 'Continuar' }).click();
      await escrever(caio.page, 'titulo', 'Caronas UnB');
      await expect.poll(async () => listaDeComponentes(await lerComoDono(`salas/${sala}/telas/r1_g1/componentes`))
        .map((c) => c.texto)).toEqual(['Caronas UnB']);
      await expect(ana.page.locator('#editor-moldura')).not.toContainText('Caronas'); // a Ana não vê mais a antiga

      // As regras acompanham: a tela antiga não é mais do grupo, a herdada é.
      expect(await tentar(ana.page, sala, {
        antiga: ['telas/r1_g1/componentes', [{ id: 'z1', tipo: 'aviso', texto: 'volta' }]],
        herdada: ['telas/r1_g2/componentes/0/texto', 'Oferecer carona agora'],
      })).toEqual({ antiga: 'negado', herdada: 'ok' });

      // Recarregar na r1_troca mostra o aviso de novo e a mesma tela herdada.
      await caio.page.reload();
      await expect(caio.page.locator('#aviso-sessao')).toContainText(AVISO);
      await expect.poll(() => textosNaTela(caio.page)).toEqual(['Caronas UnB']);

      // Sair da fase de troca esconde o aviso.
      await page.getByRole('button', { name: 'Avançar fase →' }).click();
      await expect(beto.page.locator('#tela-avaliacao')).toBeVisible();
      await expect(beto.page.locator('#aviso-sessao')).toBeHidden();

      for (const p of [ana.page, beto.page]) expect(await p.evaluate(() => window.semRecarregar)).toBe(true);
      // Sem rolagem horizontal no celular com o aviso.
      expect(await caio.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
      for (const { erros } of celulares) expect(erros).toEqual([]);
      expect(errosTelao).toEqual([]);
      expect(controle.erros).toEqual([]);
    } finally {
      await telaoContexto.close();
      for (const { contexto } of celulares) await contexto.close();
      await controle.contexto.close();
    }
  });

  test('com 1 grupo só, a troca não quebra (a tela continua com o mesmo grupo)', async ({ browser }) => {
    test.setTimeout(60_000);
    const controle = await abrirControle(browser);
    const { page, sala } = controle;
    const ana = await entrar(browser, sala, 'Ana');
    try {
      await page.getByRole('button', { name: 'Avançar fase →' }).click();
      await expect(ana.page.locator('#editor-area')).toBeVisible();
      await adicionar(ana.page, 'titulo');
      await escrever(ana.page, 'titulo', 'Só o Azul');
      await expect.poll(async () => listaDeComponentes(await lerComoDono(`salas/${sala}/telas/r1_g1/componentes`))
        .map((c) => c.texto)).toEqual(['Só o Azul']);

      await page.getByRole('button', { name: 'Trocar sessão' }).click();
      await expect(page.locator('#fase-atual')).toHaveText('Rodada 1 · troca de sessão');
      await expect(ana.page.locator('#aviso-sessao')).toContainText(AVISO);
      const depois = await lerComoDono(`salas/${sala}`);
      expect(depois.estado.fase).toBe('r1_troca');
      expect(depois.telas.r1_g1.dono).toBe('g1');
      expect(depois.trocas).toEqual({ r1_troca: { r1_g1: 'g1' } });

      // A Ana continua editando a mesma tela.
      await ana.page.getByRole('button', { name: 'Continuar' }).click();
      await expect.poll(() => textosNaTela(ana.page)).toEqual(['Só o Azul']);
      await adicionar(ana.page, 'botao');
      await expect.poll(async () => listaDeComponentes(await lerComoDono(`salas/${sala}/telas/r1_g1/componentes`))
        .map((c) => c.tipo)).toEqual(['titulo', 'botao']);

      // Voltar e avançar de novo também funcionam com 1 grupo.
      await page.getByRole('button', { name: '← Voltar fase' }).click();
      await expect.poll(() => lerComoDono(`salas/${sala}/trocas`)).toBeNull();
      expect(await lerComoDono(`salas/${sala}/telas/r1_g1/dono`)).toBe('g1');
      await page.getByRole('button', { name: 'Avançar fase →' }).click();
      await expect.poll(() => lerComoDono(`salas/${sala}/estado/fase`)).toBe('r1_troca');
      expect(await lerComoDono(`salas/${sala}/telas/r1_g1/dono`)).toBe('g1');

      // Sem grupo nenhum, a troca só muda a fase.
      expect(atualizacaoDeFase('r1_troca', {}, 1)).toEqual({
        'estado/fase': 'r1_troca', 'estado/timerFim': 0, 'estado/atualizadoEm': 1, 'trocas/r1_troca': null,
      });
      expect(controle.erros).toEqual([]);
      expect(ana.erros).toEqual([]);
    } finally {
      await ana.contexto.close();
      await controle.contexto.close();
    }
  });
});
