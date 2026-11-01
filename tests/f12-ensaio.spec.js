import { test, expect } from '@playwright/test';
import { carregarRegras, criarAdmin, lerComoDono } from './emulador.js';
import { acaoDoBot, mudancaAleatoria, AGORA } from '../site/js/bots.js';
import { listaDeComponentes, infoDoTipo, adicionar } from '../site/js/tela.js';

const CONTROLE = { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false };
const TELAO = { viewport: { width: 1920, height: 1080 }, isMobile: false, hasTouch: false };
const CRITERIOS = ['c1', 'c2', 'c3', 'c4', 'c5'];

test.beforeAll(carregarRegras);

function registrarErros(page) {
  const erros = [];
  page.on('console', (msg) => { if (msg.type() === 'error') erros.push(msg.text()); });
  page.on('pageerror', (err) => erros.push(err.message));
  return erros;
}

async function abrirControle(browser) {
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
  return { contexto, page, erros, sala };
}

async function abrirTelao(browser, sala) {
  const contexto = await browser.newContext(TELAO);
  const page = await contexto.newPage();
  const erros = registrarErros(page);
  await page.goto(`/telao.html?sala=${sala}`);
  return { contexto, page, erros };
}

async function adicionarBots(page, sala) {
  await page.getByRole('button', { name: 'Adicionar 20 alunos falsos' }).click();
  await expect(page.locator('#status-bots')).toContainText('20 alunos falsos jogando', { timeout: 30_000 });
  await expect.poll(async () => Object.keys((await lerComoDono(`salas/${sala}/alunos`)) || {}).length,
    { timeout: 30_000 }).toBe(20);
}

async function avancar(page, fase) {
  await page.getByRole('button', { name: 'Avançar fase →' }).click();
  await expect(page.locator('#fase-atual')).toHaveAttribute('data-fase', fase);
}

// Espera até que `condicao(sala)` seja verdadeira para a sala lida do banco.
function esperarSala(sala, condicao, timeout = 60_000) {
  return expect.poll(async () => condicao(await lerComoDono(`salas/${sala}`)), { timeout, intervals: [500] }).toBe(true);
}

const telasDa = (s, rodada) => Object.entries(s.telas || {}).filter(([, t]) => t.rodada === rodada);
const editada = (t) => listaDeComponentes(t.componentes).some((c) => c.texto !== infoDoTipo(c.tipo).textoPadrao);

test.describe('F12 · modo ensaio com alunos-bot', () => {
  test('acaoDoBot só propõe o que o grupo do bot pode fazer na fase', () => {
    const base = {
      estado: { fase: 'lobby' },
      alunos: { b1: { nome: 'Bot 1', grupo: 'g1' } },
      grupos: { g1: { ordem: 0, membros: { b1: true } }, g2: { ordem: 1, membros: {} } },
      config: { criterios: { c1: 'a', c2: 'b' } },
      telas: {},
    };
    expect(acaoDoBot(base, 'b1')).toBeNull();
    expect(acaoDoBot({ ...base, estado: { fase: 'r1' } }, 'ninguem')).toBeNull();
    // r1: transação na tela que o grupo tem em mãos (a herdada, depois da troca).
    const r1 = { ...base, estado: { fase: 'r1_troca' }, telas: { r1_g1: { rodada: 1, dono: 'g2' }, r1_g2: { rodada: 1, dono: 'g1' } } };
    expect(acaoDoBot(r1, 'b1')).toMatchObject({ tipo: 'componentes', tid: 'r1_g2' });
    // r2_troca: primeiro o progress.md, depois sair; já saiu, espera.
    const r2 = { ...base, estado: { fase: 'r2_troca' }, telas: { r2_g1: { rodada: 2, dono: 'g1' } } };
    expect(acaoDoBot(r2, 'b1')).toMatchObject({ caminho: 'telas/r2_g1/progresso' });
    r2.telas.r2_g1.progresso = 'Fiz o título';
    expect(acaoDoBot(r2, 'b1', () => 0.1)).toEqual({ tipo: 'set', caminho: 'telas/r2_g1/saiu', valor: { por: 'b1', em: AGORA } });
    r2.telas.r2_g1.saiu = { por: 'b1', em: 1 };
    expect(acaoDoBot(r2, 'b1')).toBeNull();
    // r3: aprova/reprova o que falta e envia quando todos os critérios revelados estão decididos.
    const r3 = { ...base, estado: { fase: 'r3' }, telas: { r2_g2: { rodada: 2, dono: 'g2', revisao: { revisor: 'g1', aprovados: { c1: true } } } } };
    expect(acaoDoBot(r3, 'b1')).toMatchObject({ caminho: 'telas/r2_g2/revisao/aprovados/c2' });
    r3.telas.r2_g2.revisao.aprovados.c2 = false;
    expect(acaoDoBot(r3, 'b1')).toEqual({ tipo: 'set', caminho: 'telas/r2_g2/revisao/enviadoEm', valor: AGORA });
    // votação: nunca no próprio grupo.
    const voto = { ...base, estado: { fase: 'votacao' }, oficina: { g1: { projeto: 'ru' }, g2: { projeto: 'ru' } } };
    for (let i = 0; i < 20; i++) expect(acaoDoBot(voto, 'b1').valor).toBe('g2');
    // As mudanças deixam a tela com 3 a 8 componentes.
    let lista = [];
    for (let i = 0; i < 300; i++) {
      lista = mudancaAleatoria(lista);
      if (i > 5) expect(lista.length).toBeGreaterThanOrEqual(3);
      expect(lista.length).toBeLessThanOrEqual(8);
    }
    expect(adicionar([], 'titulo')).toHaveLength(1);
  });

  test('"Adicionar 20 alunos falsos" cria 20 bots que entram na sala', async ({ browser }) => {
    const controle = await abrirControle(browser);
    const telao = await abrirTelao(browser, controle.sala);
    await adicionarBots(controle.page, controle.sala);

    const s = await lerComoDono(`salas/${controle.sala}`);
    const nomes = Object.values(s.alunos).map((a) => a.nome).sort((a, b) => a.localeCompare(b, 'pt', { numeric: true }));
    expect(nomes).toEqual(Array.from({ length: 20 }, (_, i) => `Bot ${i + 1}`));
    // Cada bot é um usuário diferente, membro do grupo que gravou; 4 grupos de 5.
    for (const [uid, aluno] of Object.entries(s.alunos)) expect(s.grupos[aluno.grupo].membros[uid]).toBe(true);
    expect(Object.values(s.grupos).map((g) => Object.keys(g.membros).length)).toEqual([5, 5, 5, 5]);
    await expect(controle.page.locator('#controle-grupos > li')).toHaveCount(4);
    await expect(controle.page.locator('#controle-grupos')).toContainText('Bot 20');
    await expect(telao.page.locator('body')).toContainText('20');

    // Mais 20: a numeração continua e quem entra no lobby forma grupos novos.
    await controle.page.getByRole('button', { name: 'Adicionar 20 alunos falsos' }).click();
    await expect(controle.page.locator('#status-bots')).toContainText('40 alunos falsos jogando', { timeout: 30_000 });
    await expect.poll(async () => Object.keys(await lerComoDono(`salas/${controle.sala}/alunos`)).length, { timeout: 30_000 }).toBe(40);
    expect(Object.values(await lerComoDono(`salas/${controle.sala}/alunos`)).map((a) => a.nome)).toContain('Bot 40');

    // Reiniciar a sala apaga os alunos e desliga os bots.
    controle.page.once('dialog', (d) => d.accept());
    await controle.page.getByRole('button', { name: 'Reiniciar sala' }).click();
    await expect(controle.page.locator('#status-bots')).toContainText('Alunos falsos são bots', { timeout: 10_000 });
    expect(await lerComoDono(`salas/${controle.sala}/alunos`)).toBeNull();

    expect(controle.erros).toEqual([]);
    expect(telao.erros).toEqual([]);
    await controle.contexto.close();
    await telao.contexto.close();
  });

  test('partida completa do lobby ao fim com 20 bots, sem erro no console', async ({ browser }) => {
    test.setTimeout(300_000);
    const controle = await abrirControle(browser);
    const { page, sala } = controle;
    const telao = await abrirTelao(browser, sala);
    await adicionarBots(page, sala);

    // R1: os bots montam e editam as telas.
    await avancar(page, 'r1');
    await esperarSala(sala, (s) => telasDa(s, 1).length === 4
      && telasDa(s, 1).every(([, t]) => listaDeComponentes(t.componentes).length >= 3 && editada(t)));

    // Troca: cada grupo continua a tela herdada.
    await page.getByRole('button', { name: 'Trocar sessão' }).click();
    await expect(page.locator('#fase-atual')).toHaveAttribute('data-fase', 'r1_troca');
    const antes = Object.fromEntries(telasDa(await lerComoDono(`salas/${sala}`), 1).map(([tid, t]) => [tid, JSON.stringify(t.componentes)]));
    await esperarSala(sala, (s) => telasDa(s, 1).every(([tid, t]) => JSON.stringify(t.componentes) !== antes[tid]));

    // Avaliação da R1.
    await avancar(page, 'r1_avaliacao');
    await esperarSala(sala, (s) => telasDa(s, 1).every(([, t]) => Object.keys(t.avaliacaoR1 || {}).length >= 2));
    await expect(telao.page.locator('#telao-avaliacao')).toBeVisible();

    // R2: tela nova, progress.md e feature_list.
    await avancar(page, 'r2');
    await esperarSala(sala, (s) => telasDa(s, 2).length === 4
      && telasDa(s, 2).every(([, t]) => listaDeComponentes(t.componentes).length >= 3 && /[a-z]/i.test(t.progresso || '')));

    // r2_troca: todos saem da sessão; o controle troca.
    await avancar(page, 'r2_troca');
    await expect(page.locator('#controle-prontos')).toHaveText('4 de 4 grupos prontos', { timeout: 60_000 });
    await page.getByRole('button', { name: 'Trocar sessão' }).click();
    await expect(page.locator('#dica-troca-r2')).toContainText('Troca feita');
    const s1 = await lerComoDono(`salas/${sala}`);
    for (const [tid, t] of telasDa(s1, 2)) {
      expect(t.saiu.por).toBeTruthy();
      expect(s1.alunos[t.saiu.por].grupo).toBe(s1.trocas.r2_troca[tid]);
    }

    // Declaração: o herdeiro marca a feature_list.
    await avancar(page, 'r2_declaracao');
    await esperarSala(sala, (s) => telasDa(s, 2).every(([, t]) => Object.keys(t.declarados || {}).length >= 2));

    // Revisão: cada revisor decide os 5 critérios e envia.
    await avancar(page, 'r3');
    await esperarSala(sala, (s) => telasDa(s, 2).every(([, t]) => t.revisao?.enviadoEm
      && CRITERIOS.every((c) => typeof t.revisao.aprovados?.[c] === 'boolean')));

    await avancar(page, 'resultado');
    await expect(telao.page.locator('#telao-resultado')).toBeVisible();

    // Oficina: cada grupo preenche o harness inteiro.
    await avancar(page, 'oficina');
    await esperarSala(sala, (s) => Object.keys(s.grupos).every((gid) => {
      const h = s.oficina?.[gid];
      return h?.projeto && h.agents && h.progresso && [0, 1, 2].every((i) => h.features?.[i]?.nome
        && h.features[i].aceite && h.features[i].evidencia);
    }), 90_000);

    // Votação: os 20 votam, nunca no próprio grupo.
    await avancar(page, 'votacao');
    await esperarSala(sala, (s) => Object.keys(s.votos || {}).length === 20);
    const s2 = await lerComoDono(`salas/${sala}`);
    for (const [uid, gid] of Object.entries(s2.votos)) expect(gid).not.toBe(s2.alunos[uid].grupo);

    // Fim: vencedor (ou empate decidido pelo controle) e o .zip disponível.
    await avancar(page, 'fim');
    await expect(telao.page.locator('#telao-oficina')).toContainText(/Vencedor:|Empate entre/);
    const empate = page.locator('#controle-empate button');
    if (await empate.count()) await empate.first().click();
    await expect(page.getByRole('button', { name: 'Baixar harness vencedor (.zip)' })).toBeEnabled();
    await expect(page.locator('#controle-vencedor')).toContainText('Vencedor:');
    await expect(page.locator('#botao-avancar')).toBeDisabled();

    expect(controle.erros).toEqual([]);
    expect(telao.erros).toEqual([]);
    await controle.contexto.close();
    await telao.contexto.close();
  });
});
