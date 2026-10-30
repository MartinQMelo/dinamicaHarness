import { test, expect } from '@playwright/test';
import { carregarRegras, criarAdmin, criarUsuario, gravarComoDono, lerComoDono } from './emulador.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1';

test.beforeAll(carregarRegras);

function registrarErros(page) {
  const erros = [];
  page.on('console', (msg) => { if (msg.type() === 'error') erros.push(msg.text()); });
  page.on('pageerror', (err) => erros.push(err.message));
  return erros;
}

async function entrarNoControle(page, { email, senha }) {
  await page.goto('/controle.html');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

// Roda, no navegador, uma operação no banco como usuário anônimo e devolve "ok" ou o código do erro.
async function comoAnonimo(page, operacao, caminho, valor) {
  return page.evaluate(async ({ SDK, operacao, caminho, valor }) => {
    const { auth, db } = await import(new URL('js/firebase-config.js', location.href).href);
    const { signInAnonymously } = await import(`${SDK}/firebase-auth.js`);
    const { ref, get, set, update } = await import(`${SDK}/firebase-database.js`);
    await signInAnonymously(auth);
    try {
      if (operacao === 'ler') await get(ref(db, caminho));
      else if (operacao === 'gravar') await set(ref(db, caminho), valor);
      else await update(ref(db, caminho), valor);
      return 'ok';
    } catch (e) {
      const msg = String(e.code || e.message);
      return /permission.denied/i.test(msg) ? 'PERMISSION_DENIED' : msg;
    }
  }, { SDK, operacao, caminho, valor });
}

async function semearSala(codigo) {
  await gravarComoDono(`salas/${codigo}`, {
    estado: { fase: 'lobby', timerFim: 0, atualizadoEm: 1 },
    config: { tamanhoGrupo: 5, frase: 'x' },
    segredo: { criterios: { 1: 'critério secreto' } },
  });
}

test.describe('F02 · login do apresentador e criação de sala', () => {
  test('apresentador faz login com e-mail e senha no controle.html', async ({ page }) => {
    const erros = registrarErros(page);
    const admin = await criarAdmin();
    await entrarNoControle(page, admin);
    await expect(page.locator('#tela-painel')).toBeVisible();
    await expect(page.locator('#usuario-email')).toHaveText(admin.email);
    await expect(page.getByRole('button', { name: 'Criar sala' })).toBeEnabled();
    await expect(page.locator('#aviso-nao-admin')).toBeHidden();

    // Sair volta para o login.
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page.locator('#tela-login')).toBeVisible();
    expect(erros).toEqual([]);
  });

  test('senha errada mostra erro e não entra', async ({ page }) => {
    const admin = await criarAdmin();
    await entrarNoControle(page, { email: admin.email, senha: 'errada-123' });
    await expect(page.locator('#erro-login')).toHaveText('E-mail ou senha incorretos.');
    await expect(page.locator('#tela-painel')).toBeHidden();
  });

  test('usuário com login mas fora de admins não consegue criar sala', async ({ page }) => {
    const email = `intruso.${Date.now()}@unb.br`;
    await criarUsuario(email, 'senha-123456');
    await entrarNoControle(page, { email, senha: 'senha-123456' });
    await expect(page.locator('#aviso-nao-admin')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Criar sala' })).toBeDisabled();
  });

  test("botão 'Criar sala' gera um código de 4 letras e grava estado com fase lobby", async ({ page }) => {
    const erros = registrarErros(page);
    await entrarNoControle(page, await criarAdmin());
    await page.getByRole('button', { name: 'Criar sala' }).click();

    const codigo = page.locator('#sala-codigo');
    await expect(codigo).toHaveText(/^[A-Z]{4}$/);
    const sala = await codigo.textContent();
    await expect(page.locator('#link-aluno')).toContainText(`index.html?sala=${sala}`);
    await expect(page.locator('#link-telao')).toHaveAttribute('href', new RegExp(`telao\\.html\\?sala=${sala}$`));

    const gravada = await lerComoDono(`salas/${sala}`);
    expect(gravada.estado.fase).toBe('lobby');
    expect(typeof gravada.estado.atualizadoEm).toBe('number');
    expect(gravada.config.tamanhoGrupo).toBe(5);
    expect(gravada.config.criterios).toBeUndefined();
    // O banco guarda chaves 1..5 como array com null na posição 0.
    expect(Object.values(gravada.segredo.criterios).filter(Boolean)).toHaveLength(5);
    expect(gravada.segredo.criterios[1]).toContain('Oferecer carona');
    expect(erros).toEqual([]);
  });

  test('regras: anônimo não escreve em salas/{sala}/estado nem em segredo', async ({ page }) => {
    await semearSala('RGRA');
    await page.goto('/index.html');
    expect(await comoAnonimo(page, 'gravar', 'salas/RGRA/estado/fase', 'r1')).toBe('PERMISSION_DENIED');
    expect(await comoAnonimo(page, 'gravar', 'salas/RGRA/estado', { fase: 'r1' })).toBe('PERMISSION_DENIED');
    expect(await comoAnonimo(page, 'atualizar', 'salas/RGRA', { 'estado/fase': 'r1' })).toBe('PERMISSION_DENIED');
    expect(await comoAnonimo(page, 'gravar', 'salas/RGRA/segredo/criterios', { 1: 'hack' })).toBe('PERMISSION_DENIED');
    expect(await comoAnonimo(page, 'gravar', 'salas/NOVA/estado', { fase: 'lobby' })).toBe('PERMISSION_DENIED');

    const sala = await lerComoDono('salas/RGRA');
    expect(sala.estado.fase).toBe('lobby');
    expect(sala.segredo.criterios[1]).toBe('critério secreto');
    expect(await lerComoDono('salas/NOVA')).toBeNull();
  });

  test('regras: anônimo não lê salas/{sala}/segredo, mas lê estado', async ({ page }) => {
    await semearSala('RGRB');
    await page.goto('/index.html');
    expect(await comoAnonimo(page, 'ler', 'salas/RGRB/segredo')).toBe('PERMISSION_DENIED');
    expect(await comoAnonimo(page, 'ler', 'salas/RGRB/segredo/criterios')).toBe('PERMISSION_DENIED');
    expect(await comoAnonimo(page, 'ler', 'salas/RGRB')).toBe('PERMISSION_DENIED');
    expect(await comoAnonimo(page, 'ler', 'salas/RGRB/estado')).toBe('ok');
  });

  test('regras: o apresentador lê e escreve o segredo', async ({ page }) => {
    await semearSala('RGRC');
    await entrarNoControle(page, await criarAdmin());
    await expect(page.locator('#tela-painel')).toBeVisible();
    const resultado = await page.evaluate(async (SDK) => {
      const { db } = await import(new URL('js/firebase-config.js', location.href).href);
      const { ref, get, set } = await import(`${SDK}/firebase-database.js`);
      await set(ref(db, 'salas/RGRC/segredo/criterios/1'), 'novo');
      return (await get(ref(db, 'salas/RGRC/segredo/criterios/1'))).val();
    }, SDK);
    expect(resultado).toBe('novo');
  });
});
