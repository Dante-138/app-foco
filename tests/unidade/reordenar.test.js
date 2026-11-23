import assert from 'node:assert/strict';
import { test } from 'node:test';

import { reordenar } from '../../www/js/nucleo/reordenar.js';

const lista = (...ids) => ids.map((id) => ({ id }));
const ids = (itens) => itens.map((item) => item.id);

test('reordenar: a lista inteira segue a ordem recebida', () => {
  assert.deepEqual(ids(reordenar(lista('a', 'b', 'c'), ['c', 'a', 'b'])), ['c', 'a', 'b']);
});

test('reordenar: só os itens à vista trocam de lugar, nas posições que já ocupavam', () => {
  // b e d estavam à vista (posições 1 e 3); a, c e e ficam onde estavam.
  const resultado = reordenar(lista('a', 'b', 'c', 'd', 'e'), ['d', 'b']);
  assert.deepEqual(ids(resultado), ['a', 'd', 'c', 'b', 'e']);
});

test('reordenar: id que não existe ou repetido é ignorado', () => {
  const resultado = reordenar(lista('a', 'b', 'c'), ['x', 'c', 'c', 'a']);
  assert.deepEqual(ids(resultado), ['c', 'b', 'a']);
});

test('reordenar: sem ids, nada muda', () => {
  assert.deepEqual(ids(reordenar(lista('a', 'b'), [])), ['a', 'b']);
});

test('reordenar: devolve outra lista, com os mesmos objetos, e não mexe na recebida', () => {
  const original = lista('a', 'b');
  const resultado = reordenar(original, ['b', 'a']);
  assert.notEqual(resultado, original);
  assert.deepEqual(ids(original), ['a', 'b']);
  assert.equal(resultado[0], original[1]);
  assert.equal(resultado[1], original[0]);
});
