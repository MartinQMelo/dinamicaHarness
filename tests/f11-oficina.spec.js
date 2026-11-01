import { crc32 } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import {
  carregarRegras, criarAdmin, gravarComoDono, lerComoDono,
} from './emulador.js';
import {
  contarVotos, vencedorDe, limitarLinhas, arquivosDoHarness,
} from '../site/js/harness.js';
import { dadosDoGrupo, gidDaOrdem } from '../site/js/grupos.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1';
const CONTROLE = { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false };
const TELAO = { viewport: { width: 1920, height: 1080 }, isMobile: false, hasTouch: false };

test.beforeAll(carregarRegras);

function registrarErros(page) {
  const erros = [];
  page.on('console', (msg) => { if (msg.type() === 'error') erros.push(msg.text()); });
  page.on('pageerror', (err) => erros.push(err.message));
  return erros;
}

async function abrirControle(browser, tamanhoGrupo = 1) {
  const contexto = await browser.newContext({ ...CONTROLE, acceptDownloads: true });
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

async function semRolagemLateral(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
}

function harnessDe(n) {
  return {
    projeto: ['ru', 'caronas', 'provas', 'atletica'][n % 4],
    agents: `Regra do grupo ${n}\nSó o que está na lista.`,
    features: [0, 1, 2].map((i) => ({ nome: `Função ${n}.${i}`, aceite: `Aceite ${n}.${i}`, evidencia: `Teste ${n}.${i}` })),
    progresso: `Primeiro passo do grupo ${n}`,
  };
}

function gruposFalsos(n) {
  return Object.fromEntries(Array.from({ length: n }, (_, i) => [gidDaOrdem(i), { ...dadosDoGrupo(i), membros: {} }]));
}

// Lê um .zip (Buffer) pelo diretório central e confere o CRC de cada arquivo.
function lerZip(buf) {
  const fim = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(fim).toBeGreaterThan(0);
  const n = buf.readUInt16LE(fim + 10);
  let p = buf.readUInt32LE(fim + 16);
  const arquivos = {};
  for (let i = 0; i < n; i++) {
    expect(buf.readUInt32LE(p)).toBe(0x02014b50);
    const crc = buf.readUInt32LE(p + 16);
    const tamanho = buf.readUInt32LE(p + 24);
    const nl = buf.readUInt16LE(p + 28);
    const el = buf.readUInt16LE(p + 30);
    const cl = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nome = buf.toString('utf8', p + 46, p + 46 + nl);
    expect(buf.readUInt32LE(local)).toBe(0x04034b50);
    const inicio = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const dados = buf.subarray(inicio, inicio + tamanho);
    expect(crc32(dados)).toBe(crc);
    arquivos[nome] = dados.toString('utf8');
    p += 46 + nl + el + cl;
  }
  return arquivos;
}

async function baixar(page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Baixar harness vencedor (.zip)' }).click(),
  ]);
  return { nome: download.suggestedFilename(), arquivos: lerZip(readFileSync(await download.path())) };
}

test.describe('F11 · oficina "Monte seu harness" e votação', () => {
  test('na oficina cada grupo escolhe o projeto e preenche AGENTS.md (até 8 linhas), 3 funcionalidades e o primeiro passo', async ({ browser }) => {
    test.setTimeout(120_000);
    const controle = await abrirControle(browser, 2);
    const { sala } = controle;
    const ana = await entrar(browser, sala, 'Ana');
    const bia = await entrar(browser, sala, 'Bia');
    const caio = await entrar(browser, sala, 'Caio');
    const telao = await abrirTelao(browser, sala);
    const todos = [controle, ana, bia, caio, telao];
    try {
      expect(await lerComoDono(`salas/${sala}/alunos/${ana.uid}/grupo`)).toBe('g1');
      expect(await lerComoDono(`salas/${sala}/alunos/${bia.uid}/grupo`)).toBe('g1');
      expect(await lerComoDono(`salas/${sala}/alunos/${caio.uid}/grupo`)).toBe('g2');
      // Antes da oficina, ninguém escreve nela.
      expect(await tentar(ana.page, sala, { cedo: ['oficina/g1/projeto', 'ru'] })).toEqual({ cedo: 'negado' });

      await irAte(controle.page, 'oficina');
      for (const { page } of [ana, bia, caio]) {
        await expect(page.locator('#tela-oficina')).toBeVisible();
        await expect(page.locator('#barra-fase')).toContainText('Oficina');
        await semRolagemLateral(page);
      }
      await expect(ana.page.locator('#oficina-grupo')).toHaveText('Azul');
      await expect(ana.page.locator('#oficina-projeto option:not([disabled])'))
        .toHaveText(['Cardápio do RU', 'Mural de caronas', 'Agenda de provas', 'Presença da atlética']);
      await expect(telao.page.locator('#telao-oficina')).toBeVisible();
      await expect(telao.page.locator('#telao-oficina-titulo')).toHaveText('Oficina · monte seu harness');

      // Projeto: Ana escolhe, Bia (mesmo grupo) vê.
      await ana.page.getByLabel('Projeto').selectOption({ label: 'Mural de caronas' });
      await expect(bia.page.getByLabel('Projeto')).toHaveValue('caronas');
      await expect.poll(() => lerComoDono(`salas/${sala}/oficina/g1/projeto`)).toBe('caronas');

      // AGENTS.md: 10 linhas digitadas viram 8.
      const dez = Array.from({ length: 10 }, (_, i) => `Linha ${i + 1}`).join('\n');
      const oito = dez.split('\n').slice(0, 8).join('\n');
      const agents = ana.page.getByLabel('Regras para o agente (até 8 linhas)');
      await agents.fill(dez);
      await expect(agents).toHaveValue(oito);
      await expect(ana.page.locator('#oficina-agents-linhas')).toHaveText('8 de 8 linhas');
      await agents.blur();
      await expect.poll(() => lerComoDono(`salas/${sala}/oficina/g1/agents`)).toBe(oito);
      await expect(bia.page.locator('#oficina-agents')).toHaveValue(oito);

      // 3 funcionalidades com aceite e evidência (Ana) e o primeiro passo (Bia).
      for (let i = 0; i < 3; i++) {
        await ana.page.locator(`#oficina-f${i}-nome`).fill(`Função ${i + 1}`);
        await ana.page.locator(`#oficina-f${i}-aceite`).fill(`Aceite ${i + 1}`);
        await ana.page.locator(`#oficina-f${i}-evidencia`).fill(`Evidência ${i + 1}`);
      }
      await ana.page.locator('#oficina-f2-evidencia').blur();
      await bia.page.getByLabel('O primeiro passo').fill('Criar o esqueleto e o init.sh');
      await bia.page.getByLabel('O primeiro passo').blur();
      await expect.poll(() => lerComoDono(`salas/${sala}/oficina/g1`)).toEqual({
        projeto: 'caronas',
        agents: oito,
        features: [1, 2, 3].map((n) => ({ nome: `Função ${n}`, aceite: `Aceite ${n}`, evidencia: `Evidência ${n}` })),
        progresso: 'Criar o esqueleto e o init.sh',
      });
      await expect(bia.page.locator('#oficina-f1-aceite')).toHaveValue('Aceite 2');
      await expect(ana.page.locator('#oficina-progresso')).toHaveValue('Criar o esqueleto e o init.sh');

      // O grupo Verde monta o seu; cada grupo só vê os próprios campos.
      await caio.page.getByLabel('Projeto').selectOption({ label: 'Cardápio do RU' });
      await caio.page.locator('#oficina-f0-nome').fill('Cardápio do dia');
      await caio.page.locator('#oficina-f0-nome').blur();
      await expect.poll(() => lerComoDono(`salas/${sala}/oficina/g2`)).toEqual({ projeto: 'ru', features: [{ nome: 'Cardápio do dia' }] });
      await expect(caio.page.locator('#oficina-agents')).toHaveValue('');

      // O telão mostra os harnesses ao vivo, sem votos ainda.
      const cartaoAzul = telao.page.locator('#telao-harnesses li[data-gid="g1"]');
      await expect(cartaoAzul).toContainText('Mural de caronas');
      await expect(cartaoAzul).toContainText('Linha 8');
      await expect(cartaoAzul).toContainText('Aceite: Aceite 3');
      await expect(telao.page.locator('#telao-harnesses li[data-gid="g2"]')).toContainText('Cardápio do dia');
      await expect(telao.page.locator('.telao-votos')).toHaveCount(0);

      // Regras: outro grupo, 9 linhas, projeto fora da lista, 4ª funcionalidade, campo extra, texto longo.
      expect(await tentar(caio.page, sala, {
        outroGrupo: ['oficina/g1/progresso', 'invasão'],
        noveLinhas: ['oficina/g2/agents', Array(9).fill('x').join('\n')],
        oitoLinhas: ['oficina/g2/agents', Array(8).fill('x').join('\n')],
        projeto: ['oficina/g2/projeto', 'xyz'],
        quarta: ['oficina/g2/features/3/nome', 'mais uma'],
        extra: ['oficina/g2/nota', 'oi'],
        extraFeature: ['oficina/g2/features/0/prazo', 'amanhã'],
        longo: ['oficina/g2/progresso', 'x'.repeat(281)],
        votoCedo: [`votos/${caio.uid}`, 'g1'],
      })).toEqual({
        outroGrupo: 'negado', noveLinhas: 'negado', oitoLinhas: 'ok', projeto: 'negado', quarta: 'negado',
        extra: 'negado', extraFeature: 'negado', longo: 'negado', votoCedo: 'negado',
      });

      // Fora da oficina, ninguém edita mais.
      await irAte(controle.page, 'votacao');
      await expect(ana.page.locator('#tela-votacao')).toBeVisible();
      expect(await tentar(ana.page, sala, { depois: ['oficina/g1/progresso', 'mudei'] })).toEqual({ depois: 'negado' });
      expect(await lerComoDono(`salas/${sala}/oficina/g1/progresso`)).toBe('Criar o esqueleto e o init.sh');

      for (const { page } of [ana, bia, caio, telao]) expect(await page.evaluate(() => window.semRecarregar)).toBe(true);
      for (const { erros } of todos) expect(erros.filter((e) => !/permission.denied/i.test(e))).toEqual([]);
    } finally {
      for (const { contexto } of todos) await contexto.close();
    }
  });

  test('na votação cada aluno vota uma vez, não no próprio grupo, pode trocar o voto, e o telão conta ao vivo; no fim baixa o .zip do vencedor', async ({ browser }) => {
    // Contagem: só aluno que está na sala, harness que existe e outro grupo.
    const oficinaFalsa = { g1: harnessDe(1), g2: harnessDe(2) };
    const alunosFalsos = { a: { grupo: 'g1' }, b: { grupo: 'g2' }, c: { grupo: 'g1' } };
    expect(contarVotos({ a: 'g2', b: 'g1', c: 'g2', saiu: 'g2', d: 'g9', e: 'g1' }, { ...alunosFalsos, e: { grupo: 'g1' } },
      oficinaFalsa, gruposFalsos(2))).toEqual({ g1: 1, g2: 2 });
    expect(vencedorDe({ g1: 2, g2: 2 }, null)).toBeNull();
    expect(vencedorDe({ g1: 2, g2: 2 }, 'g2')).toBe('g2');
    expect(vencedorDe({ g1: 3, g2: 2 }, 'g2')).toBe('g1');
    expect(limitarLinhas('1\n2\n3\n4\n5\n6\n7\n8\n9')).toBe('1\n2\n3\n4\n5\n6\n7\n8');

    test.setTimeout(120_000);
    const controle = await abrirControle(browser, 1);
    const { sala } = controle;
    const ana = await entrar(browser, sala, 'Ana');
    const bia = await entrar(browser, sala, 'Bia');
    const caio = await entrar(browser, sala, 'Caio');
    const telao = await abrirTelao(browser, sala);
    const todos = [controle, ana, bia, caio, telao];
    try {
      await gravarComoDono(`salas/${sala}/oficina`, { g1: harnessDe(1), g2: harnessDe(2), g3: harnessDe(3) });
      await irAte(controle.page, 'votacao');

      // Ana (Azul) vê os harnesses do Verde e do Laranja para votar; o dela aparece à parte, sem voto.
      await expect(ana.page.locator('#tela-votacao')).toBeVisible();
      await semRolagemLateral(ana.page);
      await expect(ana.page.locator('#votacao-harnesses > li')).toHaveCount(2);
      await expect(ana.page.locator('#votacao-harnesses > li[data-gid="g1"]')).toHaveCount(0);
      await expect(ana.page.getByRole('button', { name: 'Votar em Azul' })).toHaveCount(0);
      await expect(ana.page.locator('#votacao-proprio')).toContainText('Regra do grupo 1');
      await expect(ana.page.locator('#votacao-harnesses > li[data-gid="g2"]')).toContainText('Agenda de provas');
      await expect(ana.page.locator('#votacao-meu-voto')).toHaveText('Você ainda não votou.');
      await expect(telao.page.locator('#telao-oficina-titulo')).toHaveText('Votação');
      const votosNoTelao = (gid) => telao.page.locator(`#telao-harnesses li[data-gid="${gid}"] .telao-votos`);
      for (const g of ['g1', 'g2', 'g3']) await expect(votosNoTelao(g)).toHaveText('0 votos');

      // Vota no Verde, o telão e o controle contam; troca para o Laranja, e o voto muda de lugar.
      await ana.page.getByRole('button', { name: 'Votar em Verde' }).click();
      await expect(ana.page.locator('#votacao-meu-voto')).toHaveText('Seu voto: Verde');
      await expect(ana.page.getByRole('button', { name: 'Seu voto ✓ Verde' })).toBeDisabled();
      await expect(votosNoTelao('g2')).toHaveText('1 voto');
      await expect(controle.page.locator('#controle-votos li[data-gid="g2"]')).toHaveText('Verde · 1 voto');
      expect(await lerComoDono(`salas/${sala}/votos`)).toEqual({ [ana.uid]: 'g2' });
      await ana.page.getByRole('button', { name: 'Votar em Laranja' }).click();
      await expect(ana.page.locator('#votacao-meu-voto')).toHaveText('Seu voto: Laranja');
      await expect(votosNoTelao('g2')).toHaveText('0 votos');
      await expect(votosNoTelao('g3')).toHaveText('1 voto');
      expect(await lerComoDono(`salas/${sala}/votos`)).toEqual({ [ana.uid]: 'g3' }); // um voto só

      await bia.page.getByRole('button', { name: 'Votar em Laranja' }).click();
      await caio.page.getByRole('button', { name: 'Votar em Verde' }).click();
      await expect(votosNoTelao('g3')).toHaveText('2 votos');
      await expect(votosNoTelao('g2')).toHaveText('1 voto');
      await expect(votosNoTelao('g1')).toHaveText('0 votos');
      const tamanho = await votosNoTelao('g3').locator('.telao-numero').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
      expect(tamanho).toBeGreaterThanOrEqual(32);

      // Regras: próprio grupo, voto de outro aluno, grupo que não existe, valor que não é texto.
      expect(await tentar(ana.page, sala, {
        proprio: [`votos/${ana.uid}`, 'g1'],
        outroAluno: [`votos/${bia.uid}`, 'g2'],
        inexistente: [`votos/${ana.uid}`, 'g9'],
        numero: [`votos/${ana.uid}`, 2],
      })).toEqual({
        proprio: 'negado', outroAluno: 'negado', inexistente: 'negado', numero: 'negado',
      });
      expect(await lerComoDono(`salas/${sala}/votos`)).toEqual({ [ana.uid]: 'g3', [bia.uid]: 'g3', [caio.uid]: 'g2' });

      // Fim: o telão mostra o vencedor, ninguém vota mais, o controle baixa o .zip do Laranja.
      await irAte(controle.page, 'fim');
      await expect(telao.page.locator('#telao-vencedor')).toHaveText('Vencedor: Laranja');
      await expect(telao.page.locator('#telao-harnesses li.lider')).toHaveAttribute('data-gid', 'g3');
      await expect(ana.page.locator('#votacao-encerrada')).toBeVisible();
      await expect(ana.page.locator('.botao-voto')).toHaveCount(0);
      expect(await tentar(ana.page, sala, { tarde: [`votos/${ana.uid}`, 'g2'] })).toEqual({ tarde: 'negado' });
      await expect(controle.page.locator('#controle-vencedor')).toHaveText('Vencedor: Laranja');
      await expect(controle.page.locator('#controle-empate button')).toHaveCount(0);
      const { nome, arquivos } = await baixar(controle.page);
      expect(nome).toBe('harness-laranja.zip');
      expect(Object.keys(arquivos)).toEqual(['AGENTS.md', 'feature_list.json', 'claude-progress.md']);
      expect(arquivos).toEqual(arquivosDoHarness(harnessDe(3), dadosDoGrupo(2)));
      expect(arquivos['AGENTS.md']).toContain('# AGENTS.md — Presença da atlética');
      expect(arquivos['AGENTS.md']).toContain('Regra do grupo 3\nSó o que está na lista.');
      expect(JSON.parse(arquivos['feature_list.json'])).toEqual([0, 1, 2].map((i) => ({
        id: `F0${i + 1}`, description: `Função 3.${i}`, steps: [`Aceite 3.${i}`], evidencia: `Teste 3.${i}`, passes: false,
      })));
      expect(arquivos['claude-progress.md']).toContain('## Primeiro passo\nPrimeiro passo do grupo 3');

      for (const { page } of [ana, bia, caio, telao]) expect(await page.evaluate(() => window.semRecarregar)).toBe(true);
      for (const { erros } of todos) expect(erros.filter((e) => !/permission.denied/i.test(e))).toEqual([]);
    } finally {
      for (const { contexto } of todos) await contexto.close();
    }
  });

  test('empate no fim: o telão mostra os empatados, o controle escolhe o vencedor e baixa o .zip do escolhido', async ({ browser }) => {
    const controle = await abrirControle(browser);
    const { page, sala } = controle;
    const telao = await abrirTelao(browser, sala);
    try {
      await gravarComoDono(`salas/${sala}/grupos`, gruposFalsos(3));
      await gravarComoDono(`salas/${sala}/alunos`, {
        u1: { nome: 'A', grupo: 'g1' }, u2: { nome: 'B', grupo: 'g2' }, u3: { nome: 'C', grupo: 'g3' }, u4: { nome: 'D', grupo: 'g3' },
      });
      await gravarComoDono(`salas/${sala}/oficina`, { g1: harnessDe(1), g2: harnessDe(2), g3: harnessDe(3) });
      await gravarComoDono(`salas/${sala}/votos`, { u1: 'g2', u2: 'g1', u3: 'g2', u9: 'g1' }); // u9 saiu da sala
      await gravarComoDono(`salas/${sala}/estado/fase`, 'votacao');
      await expect(page.locator('#controle-votos li')).toHaveText(['Azul · 1 voto', 'Verde · 2 votos', 'Laranja · 0 votos']);
      await gravarComoDono(`salas/${sala}/votos/u4`, 'g1'); // empate Azul × Verde
      await expect(page.locator('#controle-votos li[data-gid="g1"]')).toHaveText('Azul · 2 votos');

      await page.getByRole('button', { name: 'Avançar fase →' }).click();
      await expect(page.locator('#fase-atual')).toHaveAttribute('data-fase', 'fim');
      await expect(telao.page.locator('#telao-vencedor')).toHaveText('Empate entre Azul e Verde. O apresentador escolhe o vencedor.');
      await expect(telao.page.locator('#telao-harnesses li.lider')).toHaveCount(2);
      await expect(page.locator('#controle-vencedor')).toHaveText('Empate. Escolha o vencedor:');
      await expect(page.locator('#controle-empate button')).toHaveText(['Escolher Azul', 'Escolher Verde']);
      await expect(page.getByRole('button', { name: 'Baixar harness vencedor (.zip)' })).toBeDisabled();

      await page.getByRole('button', { name: 'Escolher Verde' }).click();
      await expect.poll(() => lerComoDono(`salas/${sala}/estado/vencedor`)).toBe('g2');
      await expect(page.locator('#controle-vencedor')).toHaveText('Vencedor: Verde');
      await expect(telao.page.locator('#telao-vencedor')).toHaveText('Vencedor: Verde');
      await expect(telao.page.locator('#telao-harnesses li.lider')).toHaveAttribute('data-gid', 'g2');
      const { nome, arquivos } = await baixar(page);
      expect(nome).toBe('harness-verde.zip');
      expect(arquivos['AGENTS.md']).toContain('Regra do grupo 2');
      expect(arquivos['claude-progress.md']).toContain('Primeiro passo do grupo 2');

      // Muda de ideia: escolhe o Azul.
      await page.getByRole('button', { name: 'Escolher Azul' }).click();
      await expect(telao.page.locator('#telao-vencedor')).toHaveText('Vencedor: Azul');
      expect((await baixar(page)).nome).toBe('harness-azul.zip');

      // Só o apresentador escolhe; voltar fase apaga a escolha.
      expect(await tentar(telao.page, sala, { aluno: ['estado/vencedor', 'g3'] })).toEqual({ aluno: 'negado' });
      await page.getByRole('button', { name: '← Voltar fase' }).click();
      await expect(page.locator('#fase-atual')).toHaveAttribute('data-fase', 'votacao');
      await expect.poll(() => lerComoDono(`salas/${sala}/estado/vencedor`)).toBeNull();
      await expect(page.locator('#controle-fim')).toBeHidden();
      await page.getByRole('button', { name: 'Avançar fase →' }).click();
      await expect(page.locator('#controle-vencedor')).toHaveText('Empate. Escolha o vencedor:');
      expect(controle.erros).toEqual([]);
      expect(telao.erros.filter((e) => !/permission.denied/i.test(e))).toEqual([]);
    } finally {
      await controle.contexto.close();
      await telao.contexto.close();
    }
  });
});
