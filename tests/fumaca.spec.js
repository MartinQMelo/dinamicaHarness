import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const PAGINAS = ['index.html', 'telao.html', 'controle.html'];

test.describe('F01 · esqueleto @fumaca', () => {
  test('emuladores de Auth e Realtime Database e o servidor estão no ar', async ({ request }) => {
    const banco = await request.get('http://127.0.0.1:9000/.json?ns=demo-dinamica-default-rtdb');
    expect(banco.status()).toBeLessThan(500);
    const auth = await request.get('http://127.0.0.1:9099/');
    expect(auth.ok()).toBe(true);
    const site = await request.get('http://localhost:5173/index.html');
    expect(site.ok()).toBe(true);
  });

  for (const pagina of PAGINAS) {
    test(`${pagina} abre sem erro no console e conecta no emulador`, async ({ page }) => {
      const erros = [];
      page.on('console', (msg) => { if (msg.type() === 'error') erros.push(msg.text()); });
      page.on('pageerror', (err) => erros.push(err.message));

      await page.goto(`/${pagina}`);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-firebase', 'emulador');
      await expect(page.locator('html')).toHaveAttribute('data-conectado', 'sim', { timeout: 15_000 });
      await expect(page.locator('.aviso-config')).toHaveCount(0);
      expect(erros).toEqual([]);
    });
  }

  test('firebase-config.js usa os emuladores em localhost', async ({ page }) => {
    const ws = [];
    page.on('websocket', (s) => ws.push(s.url()));
    await page.goto('/index.html');
    await expect(page.locator('html')).toHaveAttribute('data-conectado', 'sim', { timeout: 15_000 });

    // O emulador de Auth emite tokens sem assinatura (alg "none"); o Firebase real, nunca.
    const alg = await page.evaluate(async () => {
      const { auth } = await import(new URL('js/firebase-config.js', location.href).href);
      const { signInAnonymously } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js');
      const cred = await signInAnonymously(auth);
      const token = await cred.user.getIdToken();
      const cabecalho = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(cabecalho)).alg;
    });
    expect(alg).toBe('none');

    // A conexão do banco foi aberta com o emulador local.
    expect(ws.some((u) => u.includes('localhost:9000') || u.includes('127.0.0.1:9000'))).toBe(true);
    expect(ws.some((u) => u.includes('firebaseio.com'))).toBe(false);
  });

  test('workflow do Pages publica a pasta site/', () => {
    const yml = readFileSync('.github/workflows/pages.yml', 'utf8');
    expect(yml).toMatch(/branches:\s*\[main\]/);
    expect(yml).toContain('actions/upload-pages-artifact');
    expect(yml).toMatch(/path:\s*site\s*$/m);
    expect(yml).toContain('actions/deploy-pages');
  });
});
