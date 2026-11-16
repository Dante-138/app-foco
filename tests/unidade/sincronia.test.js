import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mudancas } from '../../www/js/nucleo/sincronia.js';

const aviso = (id, corpo = 'x') => ({ id, titulo: `Aviso ${id}`, corpo, quando: '2026-11-14T09:00' });
const ids = (lista) => lista.map((x) => x.id);

test('primeira vez: agenda o plano inteiro e não cancela nada', () => {
  const plano = [aviso(1), aviso(2)];
  const { cancelar, agendar, aplicado } = mudancas(new Map(), plano, new Set([1, 2]));
  assert.deepEqual(cancelar, []);
  assert.deepEqual(ids(agendar), [1, 2]);
  assert.deepEqual([...aplicado.keys()], [1, 2]);
});

test('plano igual ao aplicado: nada a fazer', () => {
  const plano = [aviso(1), aviso(2)];
  const primeira = mudancas(new Map(), plano, new Set([1, 2]));
  const segunda = mudancas(primeira.aplicado, plano, new Set([1, 2]));
  assert.deepEqual([segunda.cancelar, segunda.agendar], [[], []]);
  assert.deepEqual(segunda.aplicado, primeira.aplicado);
});

test('aviso novo é agendado; aviso que mudou é cancelado e agendado de novo', () => {
  const antes = mudancas(new Map(), [aviso(1), aviso(2, 'Faltam: 3 hábitos.')], new Set([1, 2])).aplicado;
  const plano = [aviso(1), aviso(2, 'Faltam: 2 hábitos.'), aviso(3)];
  const { cancelar, agendar, aplicado } = mudancas(antes, plano, new Set([1, 2, 3]));
  assert.deepEqual(cancelar, [2]);
  assert.deepEqual(ids(agendar), [2, 3]);
  assert.equal(aplicado.get(2), JSON.stringify(plano[1]));
});

test('aviso resolvido (fora do plano e não vivo) é cancelado e esquecido', () => {
  const antes = mudancas(new Map(), [aviso(1), aviso(2)], new Set([1, 2])).aplicado;
  const { cancelar, agendar, aplicado } = mudancas(antes, [aviso(1)], new Set([1]));
  assert.deepEqual([cancelar, agendar], [[2], []]);
  assert.deepEqual([...aplicado.keys()], [1]);
});

test('aviso que só passou da hora (fora do plano, mas vivo) não é cancelado e continua conhecido', () => {
  const antes = mudancas(new Map(), [aviso(1), aviso(2)], new Set([1, 2])).aplicado;
  // O aviso 2 já foi entregue: saiu do plano, mas o que ele avisa continua valendo.
  const entregue = mudancas(antes, [aviso(1)], new Set([1, 2]));
  assert.deepEqual([entregue.cancelar, entregue.agendar], [[], []]);
  assert.deepEqual([...entregue.aplicado.keys()], [1, 2]);
  // Depois a tarefa dele é concluída: aí sim é cancelado, e some da tela do celular.
  const resolvido = mudancas(entregue.aplicado, [aviso(1)], new Set([1]));
  assert.deepEqual(resolvido.cancelar, [2]);
  assert.deepEqual([...resolvido.aplicado.keys()], [1]);
});
