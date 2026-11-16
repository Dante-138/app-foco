import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devolver, retirar } from '../../www/js/nucleo/desfazer.js';

const ids = (lista) => lista.map((x) => x.id);
const lista = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));

test('retirar separa os elementos e guarda a posição de cada um', () => {
  const { restantes, removidos } = retirar(lista, (x) => x.id === 'b' || x.id === 'd');
  assert.deepEqual(ids(restantes), ['a', 'c', 'e']);
  assert.deepEqual(
    removidos.map(({ item, indice }) => [item.id, indice]),
    [
      ['b', 1],
      ['d', 3],
    ],
  );
});

test('devolver põe cada um no lugar de antes, em qualquer ordem guardada', () => {
  const { restantes, removidos } = retirar(lista, (x) => x.id !== 'c');
  assert.deepEqual(ids(devolver(restantes, removidos)), ids(lista));
  assert.deepEqual(ids(devolver(restantes, [...removidos].reverse())), ids(lista));
});

test('devolver não duplica e manda para o fim quando a lista encolheu', () => {
  const { restantes, removidos } = retirar(lista, (x) => x.id === 'e');
  const devolvida = devolver(restantes, removidos);
  assert.deepEqual(ids(devolver(devolvida, removidos)), ids(lista));
  assert.deepEqual(ids(devolver([{ id: 'a' }], removidos)), ['a', 'e']);
  assert.deepEqual(
    retirar([], () => true),
    { restantes: [], removidos: [] },
  );
});
