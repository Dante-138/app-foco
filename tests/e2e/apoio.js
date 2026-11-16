// Apoio dos testes de ponta a ponta que ficam em arquivo próprio (um arquivo por assunto, para
// dois PRs não acrescentarem testes no mesmo trecho). Mesmo jeito de abrir do app.test.js: o app
// de verdade, servido pelo servidor do projeto, em um Chrome real, com contexto novo por teste.

import { after, before } from 'node:test';
import { chromium } from 'playwright-core';
import { iniciarServidor } from '../../tools/serve.mjs';

export const CHAVE = 'foco:v1';
export const ESPERA = { timeout: 5000 };

export const visivel = (alvo) => alvo.waitFor({ state: 'visible', ...ESPERA });
export const botao = (pagina, nome) => pagina.getByRole('button', { name: nome, exact: true });
export const lerSalvo = (pagina, chave) => pagina.evaluate((k) => localStorage.getItem(k), chave);

// Sobe o servidor e o navegador para o arquivo de teste que chamar, e devolve "abrir".
// salvo: texto gravado no armazenamento antes de o app carregar (undefined = nada salvo).
// celular: tela do Galaxy A36, com toque e a regra de janela do Chrome do Android.
export function prepararNavegador() {
  let servidor;
  let url;
  let navegador;

  before(async () => {
    const iniciado = await iniciarServidor(0);
    servidor = iniciado.servidor;
    url = iniciado.url;
    navegador = await chromium.launch({ channel: 'chrome' });
  });

  after(async () => {
    await navegador?.close();
    servidor?.close();
  });

  return async function abrir(t, { salvo, celular = false } = {}) {
    const contexto = await navegador.newContext({
      viewport: { width: 500, height: 1000 },
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      colorScheme: 'dark',
      hasTouch: celular,
      ...(celular
        ? { isMobile: true, viewport: { width: 501, height: 1085 }, deviceScaleFactor: 2.15625 }
        : {}),
    });
    t.after(() => contexto.close());

    const erros = [];
    const pagina = await contexto.newPage();
    pagina.on('pageerror', (erro) => erros.push(`exceção: ${erro.message}`));
    pagina.on('console', (mensagem) => {
      if (mensagem.type() === 'error') erros.push(`console: ${mensagem.text()}`);
    });

    if (salvo !== undefined) {
      // Só na primeira abertura da aba: recarregar a página não repõe o valor original.
      await contexto.addInitScript(
        ([chave, valor]) => {
          if (sessionStorage.getItem('teste:semeado')) return;
          sessionStorage.setItem('teste:semeado', '1');
          localStorage.setItem(chave, valor);
        },
        [CHAVE, salvo],
      );
    }

    await pagina.goto(url);
    return { pagina, erros };
  };
}
