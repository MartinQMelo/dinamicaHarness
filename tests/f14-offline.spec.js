import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { carregarRegras, gravarComoDono } from './emulador.js';
import { aplicarAtualizacao } from '../site/js/estado-local.js';

const TELAO = {
  viewport: { width: 1920, height: 1080 }, isMobile: false, hasTouch: false, acceptDownloads: true,
};
const LOCAL = 'http://localhost:5173/';

test.beforeAll(carregarRegras);

function registrarErros(page) {
  const erros = [];
  page.on('console', (msg) => { if (msg.type() === 'error') erros.push(msg.text()); });
  page.on('pageerror', (err) => erros.push(err.message));
  return erros;
}

// Abre o telão offline num navegador novo. Qualquer pedido fora do servidor do site (Firebase, CDN,
// emuladores) é anotado e recusado.
async function abrirOffline(browser) {
  const contexto = await browser.newContext(TELAO);
  const externos = [];
  await contexto.route('**/*', (rota) => {
    const url = rota.request().url();
    if (url.startsWith(LOCAL)) return rota.continue();
    externos.push(url);
    return rota.abort();
  });
  const page = await contexto.newPage();
  const erros = registrarErros(page);
  await page.goto('/telao.html?offline=1');
  await expect(page.locator('#offline-controle')).toBeVisible();
  return { contexto, page, erros, externos };
}

async function avancar(page, fase) {
  await page.getByRole('button', { name: 'Avançar fase ▶' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-fase', fase);
}

// O cartão da tela tid no telão (rodadas 1 e 2).
const cartao = (page, tid) => page.locator(`#telao-telas li[data-tid="${tid}"]`);

async function marcar(page, tid, chaves) {
  for (const c of chaves) await page.locator(`#offline-marcacao-telas li[data-tid="${tid}"] input[data-criterio="${c}"]`).check();
}

test.describe('F14 · modo offline do telão (plano B)', () => {
  test('telao.html?offline=1 roda a dinâmica inteira sem Firebase; o apresentador faz tudo pela tela', async ({ browser }) => {
    test.setTimeout(120_000);
    const { contexto, page, erros, externos } = await abrirOffline(browser);
    try {
      let estadoNoResultado = null;
      let textoDoResultado = null;

      await test.step('abre sem Firebase e sem internet, com estado local', async () => {
        // Nada fora do próprio site foi pedido: nem o SDK do Firebase, nem o QR da CDN, nem os emuladores.
        expect(externos).toEqual([]);
        await expect(page.locator('body')).toHaveAttribute('data-fase', 'lobby');
        await expect(page.locator('#offline-fase')).toHaveText('Entrada (lobby)');
        await expect(page.locator('#telao-lobby')).toBeVisible();
        await expect(page.locator('#qr-aluno')).toBeHidden();
        await expect(page.getByRole('button', { name: '◀ Voltar fase' })).toBeDisabled();
        // Daqui em diante o navegador fica sem rede, como no Wi-Fi caído.
        await contexto.setOffline(true);
      });

      await test.step('lobby: o apresentador cria os grupos', async () => {
        for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Adicionar grupo' }).click();
        await expect(page.locator('#lista-grupos li')).toHaveCount(4);
        await page.getByRole('button', { name: 'Remover último grupo' }).click();
        await expect(page.locator('#lista-grupos .telao-grupo-nome')).toHaveText(['Azul', 'Verde', 'Laranja']);
        await expect(page.locator('#contagem-grupos')).toHaveText('3');
      });

      await test.step('rodada 1: monta as telas pela própria tela', async () => {
        await avancar(page, 'r1');
        await expect(page.locator('#telao-rodada-titulo')).toHaveText('Rodada 1');
        await expect(page.locator('#telao-frase')).toHaveText('Monte a tela inicial de um app de caronas para alunos da UnB.');
        await expect(page.locator('#telao-telas > li')).toHaveCount(3);
        const azul = cartao(page, 'r1_g1');
        await expect(azul.locator('.telao-tela-grupo')).toHaveText('Azul');
        await expect(azul.locator('.moldura')).toContainText('Tela vazia');

        await page.getByLabel('Componente para a tela do Azul').selectOption({ label: 'Lista de caronas' });
        await page.getByRole('button', { name: 'Adicionar à tela do Azul' }).click();
        await page.getByLabel('Componente para a tela do Azul').selectOption({ label: 'Botão' });
        await page.getByRole('button', { name: 'Adicionar à tela do Azul' }).click();
        await page.getByLabel('Componente para a tela do Azul').selectOption({ label: 'Chat' });
        await page.getByRole('button', { name: 'Adicionar à tela do Azul' }).click();
        await expect(azul.locator('.moldura .comp')).toHaveCount(3);
        // Texto: a tela muda enquanto digita, e o campo não perde o foco.
        const texto = page.getByLabel('Texto do componente 2 (Botão) da tela do Azul');
        await texto.fill('Oferecer carona');
        await expect(texto).toBeFocused();
        await expect(azul.locator('.comp-botao')).toHaveText('Oferecer carona');
        // Mover e remover.
        await page.getByRole('button', { name: 'Subir componente 2 da tela do Azul' }).click();
        await expect(azul.locator('.moldura .comp').first()).toHaveAttribute('data-tipo', 'botao');
        await page.getByRole('button', { name: 'Remover componente 3 da tela do Azul' }).click();
        await expect(azul.locator('.moldura .comp')).toHaveCount(2);
        await expect(azul.locator('.comp-chat')).toHaveCount(0);

        await page.getByLabel('Componente para a tela do Verde').selectOption({ label: 'Título' });
        await page.getByRole('button', { name: 'Adicionar à tela do Verde' }).click();
        await page.getByLabel('Texto do componente 1 (Título) da tela do Verde').fill('Caronas UnB');
        await expect(cartao(page, 'r1_g2').locator('.comp-titulo')).toHaveText('Caronas UnB');
      });

      await test.step('troca da R1: cada tela passa para o próximo grupo', async () => {
        await avancar(page, 'r1_troca');
        await expect(cartao(page, 'r1_g1').locator('.telao-tela-grupo')).toHaveText('Verde');
        await expect(cartao(page, 'r1_g2').locator('.telao-tela-grupo')).toHaveText('Laranja');
        await expect(cartao(page, 'r1_g3').locator('.telao-tela-grupo')).toHaveText('Azul');
        // O Verde continua a tela que era do Azul.
        await page.getByLabel('Componente para a tela do Verde').selectOption({ label: 'Filtro' });
        await page.getByRole('button', { name: 'Adicionar à tela do Verde' }).click();
        await expect(cartao(page, 'r1_g1').locator('.moldura .comp')).toHaveCount(3);
      });

      await test.step('avaliação da R1: o apresentador marca os critérios e o placar aparece', async () => {
        await avancar(page, 'r1_avaliacao');
        await expect(page.locator('#telao-avaliacao')).toBeVisible();
        await expect(page.locator('#telao-criterios li')).toHaveCount(5);
        await expect(page.locator('#offline-marcacao')).toBeVisible();
        await expect(page.locator('#offline-marcacao-telas > li')).toHaveCount(3);
        await expect(page.locator('#offline-marcacao-telas li[data-tid="r1_g1"] .moldura .comp')).toHaveCount(3);
        await marcar(page, 'r1_g1', ['c1']);
        await marcar(page, 'r1_g2', ['c2', 'c3']);
        await expect(page.locator('#placar-r1-media')).toHaveText('1'); // (1 + 2 + 0) / 3
        await expect(page.locator('#placar-r1-telas li[data-tid="r1_g2"]')).toContainText('2/5');
        await page.locator('#offline-marcacao-telas li[data-tid="r1_g2"] input[data-criterio="c3"]').uncheck();
        await expect(page.locator('#placar-r1-media')).toHaveText('0,7');
        await marcar(page, 'r1_g2', ['c3']);
        await expect(page.locator('#placar-r1-media')).toHaveText('1');
      });

      await test.step('rodada 2 e troca pelo botão', async () => {
        await avancar(page, 'r2');
        await expect(page.locator('#telao-rodada-titulo')).toHaveText('Rodada 2');
        await expect(page.locator('#telao-telas > li')).toHaveCount(3);
        await expect(cartao(page, 'r2_g1').locator('.moldura')).toContainText('Tela vazia');
        await page.getByLabel('Componente para a tela do Azul').selectOption({ label: 'Botão' });
        await page.getByRole('button', { name: 'Adicionar à tela do Azul' }).click();
        await avancar(page, 'r2_troca');
        await expect(page.locator('#telao-prontos')).toBeHidden();
        await expect(cartao(page, 'r2_g1').locator('.telao-tela-grupo')).toHaveText('Azul');
        await page.getByRole('button', { name: 'Trocar sessão' }).click();
        await expect(page.locator('#offline-troca-feita')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Trocar sessão' })).toBeHidden();
        await expect(cartao(page, 'r2_g1').locator('.telao-tela-grupo')).toHaveText('Verde');
        await page.getByLabel('Componente para a tela do Verde').selectOption({ label: 'Mapa' });
        await page.getByRole('button', { name: 'Adicionar à tela do Verde' }).click();
        await expect(cartao(page, 'r2_g1').locator('.moldura .comp')).toHaveCount(2);
      });

      await test.step('declaração e revisão marcadas pela tela', async () => {
        await avancar(page, 'r2_declaracao');
        await expect(page.locator('#offline-marcacao-titulo')).toContainText('Declaração');
        await marcar(page, 'r2_g1', ['c1', 'c2', 'c3', 'c4', 'c5']);
        await marcar(page, 'r2_g2', ['c1', 'c2']);
        await avancar(page, 'r3');
        await expect(page.locator('#offline-marcacao-titulo')).toContainText('Revisão');
        // As caixas da revisão começam vazias (não são as da declaração) e cada tela tem um revisor.
        await expect(page.locator('#offline-marcacao-telas li[data-tid="r2_g1"] input:checked')).toHaveCount(0);
        await expect(page.locator('#offline-marcacao-telas li[data-tid="r2_g1"]')).toContainText('Tela de Azul · com Verde · revisor: Laranja');
        await marcar(page, 'r2_g1', ['c1', 'c3', 'c5']);
        await marcar(page, 'r2_g2', ['c1', 'c2', 'c3']);
      });

      await test.step('resultado R1 vs R2 com a vitória falsa', async () => {
        await avancar(page, 'resultado');
        await expect(page.locator('#telao-resultado')).toBeVisible();
        await expect(page.locator('#offline-marcacao')).toBeHidden();
        await expect(page.locator('#resultado-r1')).toHaveText('1');
        await expect(page.locator('#resultado-r2-declarados')).toHaveText('2,3'); // (5 + 2 + 0) / 3
        await expect(page.locator('#resultado-r2-aprovados')).toHaveText('2'); // (3 + 3 + 0) / 3
        await expect(page.locator('#resultado-falsas-n')).toHaveText('2'); // c2 e c4 da tela do Azul
        await expect(page.locator('#resultado-falsas')).toContainText('critérios declarados prontos e reprovados pelo revisor');
        await expect(page.locator('#resultado-telas li[data-tid="r2_g1"] .telao-falsa')).toHaveText(' · 2 vitórias falsas');
        estadoNoResultado = await page.evaluate(() => JSON.parse(localStorage.getItem('dinamica-offline')));
        textoDoResultado = await page.locator('#telao-resultado').innerText();
        expect(erros).toEqual([]);
      });

      await test.step('o estado sobrevive a recarregar a página', async () => {
        await contexto.setOffline(false);
        await page.reload();
        await expect(page.locator('body')).toHaveAttribute('data-fase', 'resultado');
        await expect(page.locator('#resultado-falsas-n')).toHaveText('2');
        await contexto.setOffline(true);
      });

      await test.step('o resultado offline é o mesmo que o telão online mostra com os mesmos dados', async () => {
        await gravarComoDono('salas/OFL1', estadoNoResultado);
        const online = await browser.newContext(TELAO);
        try {
          const t = await online.newPage();
          const errosOnline = registrarErros(t);
          await t.goto('/telao.html?sala=OFL1');
          await expect(t.locator('#telao-resultado')).toBeVisible({ timeout: 15_000 });
          await expect(t.locator('#resultado-falsas-n')).toHaveText('2');
          expect(await t.locator('#telao-resultado').innerText()).toBe(textoDoResultado);
          expect(errosOnline).toEqual([]);
        } finally {
          await online.close();
        }
      });

      await test.step('oficina: o apresentador escreve o harness de cada grupo', async () => {
        await avancar(page, 'oficina');
        await expect(page.locator('#telao-oficina-titulo')).toHaveText('Oficina · monte seu harness');
        await expect(page.locator('#telao-oficina-vazia')).toBeVisible();
        await page.getByLabel('Projeto do Azul').selectOption({ label: 'Mural de caronas' });
        const agents = page.getByLabel('AGENTS.md do Azul');
        await agents.fill(Array.from({ length: 10 }, (_, i) => `regra ${i + 1}`).join('\n'));
        await expect(agents).toHaveValue(Array.from({ length: 8 }, (_, i) => `regra ${i + 1}`).join('\n'));
        await page.getByLabel('Funcionalidade 1 do Azul').fill('Oferecer carona');
        await expect(page.getByLabel('Funcionalidade 1 do Azul')).toBeFocused();
        await page.getByLabel('Aceite 1 do Azul').fill('Botão é o primeiro componente');
        await page.getByLabel('Primeiro passo do Azul').fill('Ler o progresso');
        await page.getByLabel('Projeto do Verde').selectOption({ label: 'Cardápio do RU' });
        const azul = page.locator('#telao-harnesses li[data-gid="g1"]');
        await expect(page.locator('#telao-harnesses > li')).toHaveCount(2);
        await expect(azul).toContainText('Mural de caronas');
        await expect(azul).toContainText('regra 8');
        await expect(azul).not.toContainText('regra 9');
        await expect(azul).toContainText('Oferecer carona');
        await expect(azul).toContainText('Aceite: Botão é o primeiro componente');
        await expect(azul).toContainText('Ler o progresso');
      });

      await test.step('votação contada pelo apresentador e fim com empate, escolha e .zip', async () => {
        await avancar(page, 'votacao');
        await expect(page.locator('#offline-votos > li')).toHaveCount(2);
        await page.getByRole('button', { name: 'Um voto para o Azul' }).click();
        await page.getByRole('button', { name: 'Um voto para o Azul' }).click();
        await page.getByRole('button', { name: 'Um voto para o Verde' }).click();
        await expect(page.locator('#telao-harnesses li[data-gid="g1"] .telao-votos')).toHaveText('2 votos');
        await expect(page.locator('#telao-harnesses li[data-gid="g2"] .telao-votos')).toHaveText('1 voto');
        await page.getByRole('button', { name: 'Tirar um voto do Azul' }).click();
        await expect(page.locator('#telao-harnesses li[data-gid="g1"] .telao-votos')).toHaveText('1 voto');

        await avancar(page, 'fim');
        await expect(page.getByRole('button', { name: 'Avançar fase ▶' })).toBeDisabled();
        await expect(page.locator('#telao-vencedor')).toHaveText('Empate entre Azul e Verde. O apresentador escolhe o vencedor.');
        await expect(page.getByRole('button', { name: 'Baixar harness vencedor (.zip)' })).toBeDisabled();
        await page.getByRole('button', { name: 'Escolher Azul' }).click();
        await expect(page.locator('#telao-vencedor')).toHaveText('Vencedor: Azul');
        await expect(page.locator('#telao-harnesses > li.lider')).toHaveCount(1);
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          page.getByRole('button', { name: 'Baixar harness vencedor (.zip)' }).click(),
        ]);
        expect(download.suggestedFilename()).toBe('harness-azul.zip');
        const zip = readFileSync(await download.path()).toString('utf8');
        expect(zip.startsWith('PK')).toBe(true);
        expect(zip).toContain('# AGENTS.md — Mural de caronas');
        expect(zip).toContain('regra 8');
        expect(zip).toContain('"description": "Oferecer carona"');
        expect(erros).toEqual([]);
      });

      await test.step('reiniciar volta ao lobby e apaga tudo', async () => {
        page.once('dialog', (d) => d.accept());
        await page.getByRole('button', { name: 'Reiniciar' }).click();
        await expect(page.locator('body')).toHaveAttribute('data-fase', 'lobby');
        await expect(page.locator('#lista-grupos li')).toHaveCount(0);
        const sala = await page.evaluate(() => JSON.parse(localStorage.getItem('dinamica-offline')));
        expect(Object.keys(sala).sort()).toEqual(['config', 'estado', 'segredo']);
      });
      expect(externos).toEqual([]);
      expect(erros).toEqual([]);
    } finally {
      await contexto.close();
    }
  });

  test('aplicarAtualizacao segue o update() do Firebase: caminhos, null apaga e objeto vazio some', () => {
    const sala = { estado: { fase: 'lobby' }, telas: { a: { x: 1 } } };
    const nova = aplicarAtualizacao(sala, {
      'estado/fase': 'r1', 'telas/a/x': null, 'telas/b/componentes': [{ id: '1' }], votos: { g1: 2 },
    });
    expect(nova).toEqual({ estado: { fase: 'r1' }, telas: { b: { componentes: [{ id: '1' }] } }, votos: { g1: 2 } });
    expect(sala).toEqual({ estado: { fase: 'lobby' }, telas: { a: { x: 1 } } }); // a original não muda
  });
});
