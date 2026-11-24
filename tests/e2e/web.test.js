// O app como sai no GitHub Pages: o build de tools/montar-web.mjs, servido por http://localhost
// (contexto seguro, como o https da página publicada). Instalável e, depois da primeira visita,
// abre sem rede.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { iniciarServidor } from '../../tools/serve.mjs';
import { montar } from '../../tools/montar-web.mjs';
import { ESPERA, visivel } from './apoio.js';

const pasta = mkdtempSync(join(tmpdir(), 'foco-pages-'));
let servidor;
let url;
let navegador;

before(async () => {
  montar(pasta);
  ({ servidor, url } = await iniciarServidor(0, pasta));
  navegador = await chromium.launch({ channel: 'chrome' });
});

after(async () => {
  await navegador?.close();
  if (servidor?.listening) servidor.close();
  rmSync(pasta, { recursive: true, force: true, maxRetries: 3 });
});

async function abrir(t) {
  const contexto = await navegador.newContext({ viewport: { width: 500, height: 1000 }, locale: 'pt-BR' });
  t.after(() => contexto.close());
  const pagina = await contexto.newPage();
  const erros = [];
  pagina.on('pageerror', (erro) => erros.push(`exceção: ${erro.message}`));
  await pagina.goto(url);
  return { pagina, erros };
}

test('app publicado: manifesto de app instalável, com os ícones servidos', async (t) => {
  const { pagina, erros } = await abrir(t);
  const endereco = await pagina.locator('link[rel="manifest"]').getAttribute('href');
  const resposta = await pagina.request.get(new URL(endereco, `${url}/`).href);
  assert.equal(resposta.status(), 200);
  const manifesto = await resposta.json();
  assert.equal(manifesto.name, 'Foco');
  assert.equal(manifesto.display, 'standalone');
  assert.equal(manifesto.start_url, './');
  for (const tamanho of ['192x192', '512x512']) {
    const icone = manifesto.icons.find((i) => i.sizes === tamanho);
    assert.ok(icone, `sem ícone ${tamanho}`);
    const imagem = await pagina.request.get(new URL(icone.src, `${url}/`).href);
    assert.equal(imagem.headers()['content-type'], 'image/png');
  }
  assert.deepEqual(erros, []);
});

// Por último: derruba o servidor.
test('app publicado: depois da primeira visita, abre sem rede', async (t) => {
  const { pagina, erros } = await abrir(t);
  await visivel(pagina.locator('#abas button').first());
  await pagina.waitForFunction(() => navigator.serviceWorker.controller !== null, null, ESPERA);

  servidor.closeAllConnections();
  await new Promise((pronto) => {
    servidor.close(pronto);
  });
  const semRede = await pagina.request.get(url).catch(() => null);
  assert.equal(semRede, null, 'o servidor ainda responde');

  await pagina.reload();
  await visivel(pagina.locator('#abas button').first());
  assert.equal(await pagina.locator('#abas button').count(), 4);
  assert.deepEqual(erros, []);
});
