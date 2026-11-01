import { test, expect } from '@playwright/test';
import {
  carregarRegras, criarAdmin, gravarComoDono, lerComoDono,
} from './emulador.js';
import { listaDeComponentes } from '../site/js/tela.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1';
const CONTROLE = { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false };
const CELULAR = { viewport: { width: 360, height: 740 } };

test.beforeAll(carregarRegras);

function registrarErros(page) {
  const erros = [];
  page.on('console', (msg) => { if (msg.type() === 'error') erros.push(msg.text()); });
  page.on('pageerror', (err) => erros.push(err.message));
  return erros;
}

async function abrirControle(browser, tamanhoGrupo) {
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
  await gravarComoDono(`salas/${sala}/config/tamanhoGrupo`, tamanhoGrupo);
  return { contexto, page, erros, sala };
}

const uidDa = (page) => page.evaluate(async () => {
  const { auth } = await import(new URL('js/firebase-config.js', location.href).href);
  return auth.currentUser.uid;
});

// Abre o celular e entra com o nome; espera a tela que a fase atual mostra.
async function entrar(browser, sala, nome, secao = '#tela-grupo') {
  const contexto = await browser.newContext(CELULAR);
  const page = await contexto.newPage();
  const erros = registrarErros(page);
  await page.goto(`/index.html?sala=${sala}`);
  await page.getByLabel('Seu nome').fill(nome);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.locator(secao)).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => { window.semRecarregar = true; });
  return { contexto, page, erros, uid: await uidDa(page) };
}

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

const textos = async (sala, tid) => listaDeComponentes(await lerComoDono(`salas/${sala}/telas/${tid}/componentes`))
  .map((c) => c.texto);

// Corta a rede do celular de verdade: rede do navegador fora e a conexão do Firebase derrubada
// (o modo offline do navegador sozinho não fecha um WebSocket já aberto).
async function derrubar(aluno) {
  await aluno.contexto.setOffline(true);
  await aluno.page.evaluate(async (SDK) => {
    const { db } = await import(new URL('js/firebase-config.js', location.href).href);
    const { goOffline } = await import(`${SDK}/firebase-database.js`);
    goOffline(db);
  }, SDK);
  await expect(aluno.page.locator('html')).toHaveAttribute('data-conectado', 'nao');
}

async function religar(aluno) {
  await aluno.contexto.setOffline(false);
  await aluno.page.evaluate(async (SDK) => {
    const { db } = await import(new URL('js/firebase-config.js', location.href).href);
    const { goOnline } = await import(`${SDK}/firebase-database.js`);
    goOnline(db);
  }, SDK);
  await expect(aluno.page.locator('html')).toHaveAttribute('data-conectado', 'sim', { timeout: 20_000 });
}

test.describe('F13 · resiliência: reconexão e entrada atrasada', () => {
  test('aluno que perde a conexão e volta continua no grupo e na fase atual', async ({ browser }) => {
    test.setTimeout(120_000);
    const controle = await abrirControle(browser, 1); // um aluno por grupo
    const { page, sala } = controle;
    const ana = await entrar(browser, sala, 'Ana'); // g1 (Azul)
    const beto = await entrar(browser, sala, 'Beto'); // g2 (Verde)
    try {
      await irAte(page, 'r1');
      await expect(ana.page.locator('#tela-editor')).toBeVisible();
      await adicionar(ana.page, 'titulo');
      await escrever(ana.page, 'titulo', 'Tela da Ana');
      await expect.poll(() => textos(sala, 'r1_g1')).toEqual(['Tela da Ana']);

      // Ana cai. Enquanto está fora, o Beto edita e o apresentador troca a sessão.
      await derrubar(ana);
      await adicionar(beto.page, 'titulo');
      await escrever(beto.page, 'titulo', 'Tela do Beto');
      await expect.poll(() => textos(sala, 'r1_g2')).toEqual(['Tela do Beto']);
      await irAte(page, 'r1_troca');
      await expect(beto.page.locator('#editor-moldura')).toContainText('Tela da Ana');
      await expect(ana.page.locator('#fase-aluno')).not.toHaveText(/troca/i); // fora do ar, não soube

      // Volta sem recarregar: mesmo grupo, a fase atual e a tela que o grupo tem agora (a herdada).
      await religar(ana);
      await expect(ana.page.locator('#barra-fase')).toHaveAttribute('data-fase', 'r1_troca');
      await expect(ana.page.locator('#tela-editor')).toBeVisible();
      await expect(ana.page.locator('#editor-grupo')).toHaveText('Azul');
      await expect(ana.page.locator('#editor-moldura')).toContainText('Tela do Beto');
      await expect(ana.page.locator('#aviso-sessao')).toBeVisible();
      expect(await uidDa(ana.page)).toBe(ana.uid);
      expect(await ana.page.evaluate(() => window.semRecarregar)).toBe(true);
      expect((await lerComoDono(`salas/${sala}/alunos/${ana.uid}`)).grupo).toBe('g1');
      expect(await lerComoDono(`salas/${sala}/grupos/g1/membros`)).toEqual({ [ana.uid]: true });

      // E continua editando a tela em mãos.
      await escrever(ana.page, 'titulo', 'Tela do Beto, revisada');
      await expect.poll(() => textos(sala, 'r1_g2')).toEqual(['Tela do Beto, revisada']);

      // Celular que fecha a página (bateria, aba descartada) e volta pelo mesmo link: o uid
      // anônimo persistido traz o aluno de volta sem pedir o nome, no grupo e na fase de agora.
      await ana.page.close();
      await irAte(page, 'r1_avaliacao');
      const pagina = await ana.contexto.newPage();
      const erros = registrarErros(pagina);
      await pagina.goto(`/index.html?sala=${sala}`);
      await expect(pagina.locator('#tela-avaliacao')).toBeVisible({ timeout: 20_000 });
      await expect(pagina.locator('#tela-entrada')).toBeHidden();
      await expect(pagina.locator('#avaliacao-grupo')).toHaveText('Azul');
      await expect(pagina.locator('#barra-fase')).toHaveAttribute('data-fase', 'r1_avaliacao');
      expect(await uidDa(pagina)).toBe(ana.uid);
      expect(Object.keys(await lerComoDono(`salas/${sala}/alunos`)).sort()).toEqual([ana.uid, beto.uid].sort());
      expect(await lerComoDono(`salas/${sala}/grupos/g1/membros`)).toEqual({ [ana.uid]: true });

      expect(erros).toEqual([]);
      expect(beto.erros).toEqual([]);
      expect(controle.erros).toEqual([]);
    } finally {
      for (const c of [controle, ana, beto]) await c.contexto.close();
    }
  });

  test('aluno que entra durante a r2 cai num grupo existente e vê a tela que o grupo tem agora', async ({ browser }) => {
    test.setTimeout(150_000);
    const controle = await abrirControle(browser, 2);
    const { page, sala } = controle;
    const ana = await entrar(browser, sala, 'Ana'); // g1 (Azul)
    const beto = await entrar(browser, sala, 'Beto'); // g1 (Azul)
    const dani = await entrar(browser, sala, 'Dani'); // g2 (Verde)
    const atrasados = [];
    try {
      await irAte(page, 'r2');
      await expect(dani.page.locator('#tela-editor')).toBeVisible();
      await adicionar(dani.page, 'titulo');
      await escrever(dani.page, 'titulo', 'Caronas do Verde');
      await adicionar(dani.page, 'botao');
      await escrever(dani.page, 'botao', 'Oferecer carona');
      await dani.page.getByLabel('O que vocês fizeram e o que falta').fill('Fiz título e botão.');
      await expect.poll(() => textos(sala, 'r2_g2')).toEqual(['Caronas do Verde', 'Oferecer carona']);
      await expect.poll(() => lerComoDono(`salas/${sala}/telas/r2_g2/progresso`)).toBe('Fiz título e botão.');
      await adicionar(ana.page, 'titulo');
      await escrever(ana.page, 'titulo', 'Caronas do Azul');
      await expect.poll(() => textos(sala, 'r2_g1')).toEqual(['Caronas do Azul']);

      // Caio chega atrasado: vai para o grupo com menos membros (Verde), sem criar grupo novo,
      // e cai direto no editor com a tela da rodada 2 do grupo, os cartões e o progress.md.
      const caio = await entrar(browser, sala, 'Caio', '#tela-editor');
      atrasados.push(caio);
      await expect(caio.page.locator('#editor-grupo')).toHaveText('Verde');
      await expect(caio.page.locator('#editor-moldura')).toContainText('Caronas do Verde');
      await expect(caio.page.locator('#editor-moldura')).toContainText('Oferecer carona');
      await expect(caio.page.locator('#editor-moldura')).not.toContainText('Caronas do Azul');
      await expect(caio.page.locator('#cartoes-r2')).toBeVisible();
      await expect(caio.page.getByLabel('O que vocês fizeram e o que falta')).toHaveValue('Fiz título e botão.');
      expect(await caio.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
      expect((await lerComoDono(`salas/${sala}/alunos/${caio.uid}`)).grupo).toBe('g2');
      const grupos = await lerComoDono(`salas/${sala}/grupos`);
      expect(Object.keys(grupos).sort()).toEqual(['g1', 'g2']);
      expect(grupos.g2.membros).toEqual({ [dani.uid]: true, [caio.uid]: true });
      await expect(controle.page.locator('body')).toContainText('Caio');

      // Edita junto com o grupo: a mudança do Caio aparece na Dani.
      await escrever(caio.page, 'botao', 'Pedir carona');
      await expect.poll(() => textos(sala, 'r2_g2')).toEqual(['Caronas do Verde', 'Pedir carona']);
      await expect(dani.page.locator('#editor-moldura')).toContainText('Pedir carona');

      // Depois da troca da r2, quem chega vê a tela que o grupo herdou, não a que escreveu.
      await irAte(page, 'r2_troca');
      await page.getByRole('button', { name: /Forçar troca|Trocar sessão/ }).click();
      await expect.poll(() => lerComoDono(`salas/${sala}/telas/r2_g2/dono`)).toBe('g1');
      // Azul e Verde têm 2 cada: o empate vai para o Azul, que agora tem a tela escrita pelo Verde.
      const eva = await entrar(browser, sala, 'Eva', '#tela-editor');
      atrasados.push(eva);
      expect((await lerComoDono(`salas/${sala}/alunos/${eva.uid}`)).grupo).toBe('g1');
      await expect(eva.page.locator('#editor-grupo')).toHaveText('Azul');
      await expect(eva.page.locator('#editor-moldura')).toContainText('Pedir carona');
      await expect(eva.page.locator('#editor-moldura')).not.toContainText('Caronas do Azul');
      await expect(eva.page.locator('#aviso-sessao')).toBeVisible();
      expect(Object.keys(await lerComoDono(`salas/${sala}/grupos`)).sort()).toEqual(['g1', 'g2']);

      for (const c of [ana, beto, dani, ...atrasados]) {
        expect(await c.page.evaluate(() => window.semRecarregar)).toBe(true);
        expect(c.erros).toEqual([]);
      }
      expect(controle.erros).toEqual([]);
    } finally {
      for (const c of [controle, ana, beto, dani, ...atrasados]) await c.contexto.close();
    }
  });
});
