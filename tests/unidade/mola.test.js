// As curvas de mola do app.css saem de tools/mola.mjs. Este teste reprova se alguém mudar a
// curva à mão no CSS (ou o script) sem gerar de novo: rode `node tools/mola.mjs` e cole a saída.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gerarMolas } from '../../tools/mola.mjs';

const css = await readFile(new URL('../../www/css/app.css', import.meta.url), 'utf8');
const semEspacos = (texto) => texto.replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/,? \)/g, ')');

// Valor da variável no :root, com as quebras de linha que o Prettier põe.
function variavel(nome) {
  const achado = css.match(new RegExp(`--${nome}:\\s*([^;]+);`));
  assert.ok(achado, `--${nome} não está no app.css`);
  return semEspacos(achado[1]);
}

test('as molas do app.css são exatamente as que tools/mola.mjs gera', () => {
  const molas = gerarMolas();
  assert.ok(molas.length >= 2);
  for (const mola of molas) {
    assert.equal(variavel(`${mola.nome}-ms`), `${mola.ms}ms`, `duração de --${mola.nome}`);
    assert.equal(variavel(mola.nome), mola.curva, `curva de --${mola.nome}`);
  }
});
