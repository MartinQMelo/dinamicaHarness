import { test, expect } from '@playwright/test';
import { atualizarComoDono, carregarRegras, gravarComoDono, lerComoDono, semearSala } from './emulador.js';
import { CATALOGO, listaDeComponentes, telasIniciais } from '../site/js/tela.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1';
const FRASE = 'Monte a tela inicial de um app de caronas para alunos da UnB.';
const TELAO = { viewport: { width: 1920, height: 1080 }, isMobile: false, hasTouch: false };

test.beforeAll(carregarRegras);

function registrarErros(page) {
  const erros = [];
  page.on('console', (msg) => { if (msg.type() === 'error') erros.push(msg.text()); });
  page.on('pageerror', (err) => erros.push(err.message));
  return erros;
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

// O que o controle fará ao iniciar a R1 (F06): uma tela em branco por grupo e a fase r1, juntos.
async function iniciarR1(sala) {
  const grupos = await lerComoDono(`salas/${sala}/grupos`);
  await atualizarComoDono(`salas/${sala}`, { ...telasIniciais(grupos, 1), 'estado/fase': 'r1' });
}

const componentesNoBanco = async (sala, tid) => listaDeComponentes(await lerComoDono(`salas/${sala}/telas/${tid}/componentes`));
const tiposNaTela = (page) => page.locator('#editor-moldura .comp').evaluateAll((els) => els.map((e) => e.dataset.tipo));

async function adicionar(page, tipo) {
  await page.getByRole('button', { name: '+ componente' }).click();
  await page.locator(`#catalogo-grade button[data-tipo="${tipo}"]`).click();
}

// Moldura sem o que só o editor acrescenta (seleção e acessibilidade dos itens clicáveis).
const molduraLimpa = (locator) => locator.evaluate((m) => {
  const copia = m.cloneNode(true);
  for (const c of copia.querySelectorAll('.comp')) {
    c.classList.remove('selecionado');
    for (const a of ['tabindex', 'role', 'aria-label']) c.removeAttribute(a);
  }
  return copia.outerHTML;
});

test.describe('F05 · editor de tela da rodada 1', () => {
  test('na fase r1, o celular mostra a frase da tarefa e o editor com a moldura de celular', async ({ browser }) => {
    await semearSala('EDT1');
    const { contexto, page, erros } = await entrar(browser, 'EDT1', 'Ana');
    try {
      await expect(page.locator('#tela-editor')).toBeHidden(); // no lobby ainda não
      await page.evaluate(() => { window.semRecarregar = true; });

      await iniciarR1('EDT1');
      await expect(page.locator('#tela-editor')).toBeVisible();
      await expect(page.locator('#tela-grupo')).toBeHidden();
      await expect(page.locator('#frase-tarefa')).toHaveText(FRASE);
      await expect(page.locator('#editor-grupo')).toHaveText('Azul');
      await expect(page.locator('#editor-moldura .moldura .moldura-visor')).toBeVisible();
      await expect(page.locator('#editor-moldura .moldura-vazia')).toHaveText('Tela vazia');
      await expect(page.getByRole('button', { name: '+ componente' })).toBeVisible();

      // A moldura cabe no celular de 360 px, sem rolagem horizontal.
      const largura = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(largura).toBeLessThanOrEqual(360);
      expect(await page.evaluate(() => window.semRecarregar)).toBe(true);
      expect(erros).toEqual([]);
    } finally {
      await contexto.close();
    }
  });

  test('dá para adicionar, editar o texto, mover e remover componentes dos 10 tipos do catálogo', async ({ browser }) => {
    test.setTimeout(60_000);
    await semearSala('EDT2');
    const { contexto, page, erros } = await entrar(browser, 'EDT2', 'Bia');
    try {
      await iniciarR1('EDT2');
      await expect(page.locator('#tela-editor')).toBeVisible();

      // Adicionar: os 10 tipos, na ordem do catálogo.
      const tipos = CATALOGO.map((c) => c.tipo);
      expect(tipos).toEqual(['titulo', 'botao', 'lista', 'filtro', 'busca', 'mapa', 'perfil', 'chat', 'pagamento', 'aviso']);
      await page.getByRole('button', { name: '+ componente' }).click();
      await expect(page.locator('#catalogo-grade button')).toHaveText(CATALOGO.map((c) => c.nome));
      await page.getByRole('button', { name: 'Fechar' }).click();
      for (const tipo of tipos) await adicionar(page, tipo);
      await expect.poll(() => tiposNaTela(page)).toEqual(tipos);
      await expect.poll(async () => (await componentesNoBanco('EDT2', 'r1_g1')).map((c) => c.tipo)).toEqual(tipos);

      // Editar o texto de cada tipo e ver o resultado desenhado.
      const textos = {
        titulo: 'Caronas UnB', botao: 'Oferecer carona', lista: '18h · ICC Norte\n19h · Gama',
        filtro: 'Darcy Ribeiro, Gama, Ceilândia, Planaltina', busca: 'Para onde?', mapa: 'Campus Darcy',
        perfil: 'Bia', chat: 'Oi!\nTem vaga?', pagamento: 'Pix', aviso: 'Use cinto',
      };
      for (const tipo of tipos) {
        await page.locator(`#editor-moldura .comp[data-tipo="${tipo}"]`).click();
        await expect(page.locator('#painel-componente')).toBeVisible();
        await expect(page.locator('#painel-tipo')).toHaveText(CATALOGO.find((c) => c.tipo === tipo).nome);
        await page.getByLabel('Texto do componente').fill(textos[tipo]);
      }
      await expect.poll(async () => Object.fromEntries((await componentesNoBanco('EDT2', 'r1_g1')).map((c) => [c.tipo, c.texto])))
        .toEqual(textos);
      const tela = page.locator('#editor-moldura');
      await expect(tela.locator('.comp-titulo')).toContainText('Caronas UnB');
      await expect(tela.locator('.comp-botao')).toContainText('Oferecer carona');
      await expect(tela.locator('.comp-lista li')).toHaveText(['18h · ICC Norte', '19h · Gama']);
      await expect(tela.locator('.comp-filtro .comp-chip')).toHaveText(['Darcy Ribeiro', 'Gama', 'Ceilândia', 'Planaltina']);
      await expect(tela.locator('.comp-chat .comp-balao')).toHaveText(['Oi!', 'Tem vaga?']);
      for (const tipo of ['busca', 'mapa', 'perfil', 'pagamento', 'aviso']) {
        await expect(tela.locator(`.comp-${tipo}`)).toContainText(textos[tipo]);
      }

      // Mover: o botão sobe para o topo; o título desce uma posição.
      await tela.locator('.comp[data-tipo="botao"]').click();
      await page.getByRole('button', { name: '↑ Subir' }).click();
      await expect.poll(() => tiposNaTela(page)).toEqual(['botao', 'titulo', ...tipos.slice(2)]);
      await expect(page.getByRole('button', { name: '↑ Subir' })).toBeDisabled(); // já é o primeiro
      await tela.locator('.comp[data-tipo="titulo"]').click();
      await page.getByRole('button', { name: '↓ Descer' }).click();
      const movidos = ['botao', 'lista', 'titulo', ...tipos.slice(3)];
      await expect.poll(() => tiposNaTela(page)).toEqual(movidos);
      await expect.poll(async () => (await componentesNoBanco('EDT2', 'r1_g1')).map((c) => c.tipo)).toEqual(movidos);

      // Remover: chat e pagamento saem da tela e do banco.
      for (const tipo of ['chat', 'pagamento']) {
        await tela.locator(`.comp[data-tipo="${tipo}"]`).click();
        await page.getByRole('button', { name: 'Remover' }).click();
      }
      const restantes = movidos.filter((t) => t !== 'chat' && t !== 'pagamento');
      await expect.poll(() => tiposNaTela(page)).toEqual(restantes);
      await expect.poll(async () => (await componentesNoBanco('EDT2', 'r1_g1')).map((c) => c.tipo)).toEqual(restantes);
      await expect(page.locator('#painel-componente')).toBeHidden();
      expect(erros).toEqual([]);
    } finally {
      await contexto.close();
    }
  });

  test('dois alunos do mesmo grupo veem as edições um do outro em menos de 2 segundos', async ({ browser }) => {
    test.setTimeout(60_000);
    await semearSala('EDT3');
    const a = await entrar(browser, 'EDT3', 'Caio');
    const b = await entrar(browser, 'EDT3', 'Duda');
    const RAPIDO = { timeout: 2_000 };
    try {
      await iniciarR1('EDT3');
      await expect(a.page.locator('#tela-editor')).toBeVisible();
      await expect(b.page.locator('#tela-editor')).toBeVisible();
      await expect(b.page.locator('#editor-grupo')).toHaveText('Azul'); // mesmo grupo

      // A adiciona; B vê.
      await adicionar(a.page, 'botao');
      await expect(b.page.locator('#editor-moldura .comp-botao')).toHaveCount(1, RAPIDO);

      // B edita o texto; A vê. B aparece como "editando" no celular de A.
      await b.page.locator('#editor-moldura .comp-botao').click();
      await b.page.getByLabel('Texto do componente').fill('Oferecer carona');
      await expect(a.page.locator('#editor-moldura .comp-botao-rotulo')).toHaveText('Oferecer carona', RAPIDO);
      await expect(a.page.locator('#editor-moldura .comp-botao .comp-editando')).toHaveText('editando: Duda', RAPIDO);
      await b.page.locator('#frase-tarefa').click(); // sai do campo
      await expect(a.page.locator('#editor-moldura .comp-editando')).toHaveCount(0, RAPIDO);

      // B adiciona uma lista; A a move para cima; B vê a nova ordem.
      await adicionar(b.page, 'lista');
      await expect(a.page.locator('#editor-moldura .comp-lista')).toHaveCount(1, RAPIDO);
      await a.page.locator('#editor-moldura .comp-lista').click();
      await a.page.getByRole('button', { name: '↑ Subir' }).click();
      await expect.poll(() => tiposNaTela(b.page), RAPIDO).toEqual(['lista', 'botao']);

      // A remove o botão; B vê.
      await a.page.locator('#editor-moldura .comp-botao').click();
      await a.page.getByRole('button', { name: 'Remover' }).click();
      await expect.poll(() => tiposNaTela(b.page), RAPIDO).toEqual(['lista']);
      expect([...a.erros, ...b.erros]).toEqual([]);
    } finally {
      await Promise.all([a.contexto.close(), b.contexto.close()]);
    }
  });

  test('regras: aluno não consegue editar a tela de outro grupo', async ({ browser }) => {
    await semearSala('EDT4', { tamanhoGrupo: 1 });
    const a = await entrar(browser, 'EDT4', 'Eva');
    const b = await entrar(browser, 'EDT4', 'Fabi');
    try {
      expect(Object.keys(await lerComoDono('salas/EDT4/grupos')).sort()).toEqual(['g1', 'g2']);
      await iniciarR1('EDT4');
      await expect(a.page.locator('#tela-editor')).toBeVisible();

      const tentar = (page, casos) => page.evaluate(async ({ SDK, casos }) => {
        const { db } = await import(new URL('js/firebase-config.js', location.href).href);
        const { ref, set } = await import(`${SDK}/firebase-database.js`);
        const saida = {};
        for (const [nome, [caminho, valor]] of Object.entries(casos)) {
          try { await set(ref(db, `salas/EDT4/${caminho}`), valor); saida[nome] = 'ok'; } catch (e) {
            saida[nome] = /permission.denied/i.test(String(e.code || e.message)) ? 'negado' : String(e);
          }
        }
        return saida;
      }, { SDK, casos });

      const comp = [{ id: 'x1', tipo: 'botao', texto: 'Oferecer carona' }];
      // Eva é do g1 (Azul): pode editar a própria tela, não a do g2, nem mudar dono/rodada.
      expect(await tentar(a.page, {
        propria: ['telas/r1_g1/componentes', comp],
        outroGrupo: ['telas/r1_g2/componentes', comp],
        outroGrupoUmCampo: ['telas/r1_g2/componentes/0/texto', 'invadido'],
        mudarDono: ['telas/r1_g1/dono', 'g2'],
        mudarRodada: ['telas/r1_g1/rodada', 2],
        tomarTelaAlheia: ['telas/r1_g2/dono', 'g1'],
        criarTela: ['telas/r1_g9', { rodada: 1, autor: 'g1', dono: 'g1' }],
        tipoInvalido: ['telas/r1_g1/componentes', [{ id: 'x2', tipo: 'video', texto: 'x' }]],
        textoLongo: ['telas/r1_g1/componentes', [{ id: 'x3', tipo: 'aviso', texto: 'a'.repeat(301) }]],
      })).toEqual({
        propria: 'ok', outroGrupo: 'negado', outroGrupoUmCampo: 'negado', mudarDono: 'negado', mudarRodada: 'negado',
        tomarTelaAlheia: 'negado', criarTela: 'negado', tipoInvalido: 'negado', textoLongo: 'negado',
      });
      expect(await lerComoDono('salas/EDT4/telas/r1_g2')).toEqual({ rodada: 1, autor: 'g2', dono: 'g2' });
      await expect(b.page.locator('#editor-moldura .moldura-vazia')).toBeVisible(); // a tela de Fabi segue vazia
      await expect(a.page.locator('#editor-moldura .comp-botao')).toHaveCount(1);

      // Fora das fases de edição, nem a própria tela pode ser editada.
      await gravarComoDono('salas/EDT4/estado/fase', 'r1_avaliacao');
      expect(await tentar(a.page, { foraDaFase: ['telas/r1_g1/componentes', []] })).toEqual({ foraDaFase: 'negado' });
    } finally {
      await Promise.all([a.contexto.close(), b.contexto.close()]);
    }
  });

  test('site/js/tela.js renderiza a mesma tela no celular e no telão', async ({ browser }) => {
    test.setTimeout(60_000);
    await semearSala('EDT5');
    const aluno = await entrar(browser, 'EDT5', 'Gabi');
    const telaoCtx = await browser.newContext(TELAO);
    const telao = await telaoCtx.newPage();
    const errosTelao = registrarErros(telao);
    try {
      await iniciarR1('EDT5');
      await expect(aluno.page.locator('#tela-editor')).toBeVisible();
      for (const tipo of ['botao', 'lista', 'filtro', 'mapa']) await adicionar(aluno.page, tipo);
      await aluno.page.locator('#editor-moldura .comp-lista').click();
      await aluno.page.getByLabel('Texto do componente').fill('18h · ICC Norte\n19h · Gama');
      await aluno.page.locator('#frase-tarefa').click();
      await expect.poll(async () => (await componentesNoBanco('EDT5', 'r1_g1')).find((c) => c.tipo === 'lista')?.texto)
        .toBe('18h · ICC Norte\n19h · Gama');
      await expect.poll(async () => (await componentesNoBanco('EDT5', 'r1_g1')).some((c) => c.editandoPor)).toBe(false);

      await telao.goto('/telao.html?sala=EDT5');
      await expect(telao.locator('#telao-rodada')).toBeVisible({ timeout: 15_000 });
      await expect(telao.locator('#telao-rodada-titulo')).toHaveText('Rodada 1');
      await expect(telao.locator('#telao-frase')).toHaveText(FRASE);
      const item = telao.locator('#telao-telas li[data-tid="r1_g1"]');
      await expect(item.locator('.telao-tela-grupo')).toHaveText('Azul');
      await expect(item.locator('.moldura .comp')).toHaveCount(4);

      // Mesmo HTML gerado por desenharTela nos dois lugares.
      const doCelular = await molduraLimpa(aluno.page.locator('#editor-moldura .moldura'));
      const doTelao = await molduraLimpa(item.locator('.moldura'));
      expect(doTelao).toBe(doCelular);
      expect(doCelular).toContain('comp-lista');

      // E o telão acompanha ao vivo uma edição feita no celular.
      await adicionar(aluno.page, 'aviso');
      await expect(item.locator('.moldura .comp')).toHaveCount(5, { timeout: 2_000 });
      expect([...aluno.erros, ...errosTelao]).toEqual([]);
    } finally {
      await Promise.all([aluno.contexto.close(), telaoCtx.close()]);
    }
  });
});
