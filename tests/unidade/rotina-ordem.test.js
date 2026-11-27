import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  desmarcarBloco,
  emAreas,
  emBlocos,
  marcarBloco,
  moverNaTela,
  moverSecao,
  semAsUltimas,
} from '../../www/js/nucleo/rotina-ordem.js';

const secao = (id) => ({ id, tipo: 'secao', texto: id });
const item = (id) => ({ id, tipo: 'item', texto: id });
const ids = (lista) => lista.map((i) => i.id);
// Bloco em forma curta: [idDaSecao ou null, [ids dos itens]]
const curto = (blocos) => blocos.map((b) => [b.secao?.id ?? null, ids(b.itens)]);

const ROTINA = [
  item('solto1'),
  item('solto2'),
  secao('MANHÃ'),
  item('a'),
  item('b'),
  item('c'),
  secao('VAZIA'),
  secao('NOITE'),
  item('d'),
];

test('blocos: cada seção com os itens dela; itens antes da primeira seção formam um bloco sem seção', () => {
  assert.deepEqual(curto(emBlocos(ROTINA)), [
    [null, ['solto1', 'solto2']],
    ['MANHÃ', ['a', 'b', 'c']],
    ['VAZIA', []],
    ['NOITE', ['d']],
  ]);
  assert.deepEqual(curto(emBlocos([secao('S'), item('x')])), [['S', ['x']]]);
  assert.deepEqual(emBlocos([]), []);
});

test('áreas, opção desligada: tudo em pendentes, na ordem escrita', () => {
  const { pendentes, marcados } = emAreas(ROTINA, new Set(['a']), false);
  assert.deepEqual(curto(pendentes), curto(emBlocos(ROTINA)));
  assert.deepEqual(marcados, []);
});

test('áreas, como no Keep: os marcados saem da seção e vão para a área de marcados, com a seção repetida', () => {
  const { pendentes, marcados } = emAreas(ROTINA, new Set(['a', 'c', 'solto1']), true);
  assert.deepEqual(curto(pendentes), [
    [null, ['solto2']],
    ['MANHÃ', ['b']],
    ['VAZIA', []],
    ['NOITE', ['d']],
  ]);
  assert.deepEqual(curto(marcados), [
    [null, ['solto1']],
    ['MANHÃ', ['a', 'c']],
  ]);
});

test('áreas: seção toda marcada some de pendentes; seção sem itens continua lá', () => {
  const { pendentes, marcados } = emAreas(ROTINA, new Set(['a', 'b', 'c', 'd', 'solto1', 'solto2']), true);
  assert.deepEqual(curto(pendentes), [['VAZIA', []]]);
  assert.deepEqual(curto(marcados), [
    [null, ['solto1', 'solto2']],
    ['MANHÃ', ['a', 'b', 'c']],
    ['NOITE', ['d']],
  ]);
});

test('áreas: nada marcado deixa a área de marcados vazia, e a rotina não é alterada', () => {
  const copia = structuredClone(ROTINA);
  const { pendentes, marcados } = emAreas(ROTINA, new Set(), true);
  assert.deepEqual(curto(pendentes), curto(emBlocos(ROTINA)));
  assert.deepEqual(marcados, []);
  assert.deepEqual(ROTINA, copia);
});

test('marcar a seção inteira põe no fim só os itens que faltavam, na ordem da rotina', () => {
  const [, manha] = emBlocos(ROTINA);
  const marcas = ['d', 'b'];
  assert.deepEqual(marcarBloco(marcas, manha), ['d', 'b', 'a', 'c']);
  assert.deepEqual(marcarBloco(['a', 'b', 'c'], manha), ['a', 'b', 'c']);
  assert.deepEqual(marcas, ['d', 'b']);
});

test('desmarcar a seção inteira tira só as marcas dela', () => {
  const [, manha] = emBlocos(ROTINA);
  const marcas = ['a', 'd', 'c', 'solto1'];
  assert.deepEqual(desmarcarBloco(marcas, manha), ['d', 'solto1']);
  assert.deepEqual(marcas, ['a', 'd', 'c', 'solto1']);
});

test('desfazer tira a última marca, ou o lote inteiro, sem passar do começo', () => {
  const marcas = ['a', 'c', 'b'];
  assert.deepEqual(semAsUltimas(marcas), ['a', 'c']);
  assert.deepEqual(semAsUltimas(marcas, 2), ['a']);
  assert.deepEqual(semAsUltimas(marcas, 9), []);
  assert.deepEqual(semAsUltimas([], 1), []);
  assert.deepEqual(marcas, ['a', 'c', 'b']);
});

test('mover seção leva o bloco inteiro e deixa no lugar os itens antes da primeira seção', () => {
  assert.deepEqual(ids(moverSecao(ROTINA, 0, 2)), [
    'solto1',
    'solto2',
    'VAZIA',
    'NOITE',
    'd',
    'MANHÃ',
    'a',
    'b',
    'c',
  ]);
  assert.deepEqual(ids(moverSecao(ROTINA, 2, 0)), [
    'solto1',
    'solto2',
    'NOITE',
    'd',
    'MANHÃ',
    'a',
    'b',
    'c',
    'VAZIA',
  ]);
  assert.deepEqual(ids(moverSecao([secao('A'), item('1'), secao('B'), item('2')], 1, 0)), [
    'B',
    '2',
    'A',
    '1',
  ]);
});

test('mover seção com posição inválida, ou para o mesmo lugar, devolve a lista como veio', () => {
  for (const [de, para] of [
    [0, 0],
    [-1, 1],
    [0, 3],
    [3, 0],
    [0.5, 1],
    [undefined, 1],
  ]) {
    assert.equal(moverSecao(ROTINA, de, para), ROTINA);
  }
  const semSecao = [item('x'), item('y')];
  assert.equal(moverSecao(semSecao, 0, 1), semSecao);
});

// Tela de marcar com "b" e "d" marcados (na área de baixo): NOITE, toda marcada, some da vista.
const VISTA = ['solto1', 'solto2', 'MANHÃ', 'a', 'c', 'VAZIA'];
const naVista = (lista) => ids(lista).filter((id) => !['b', 'd', 'NOITE'].includes(id));

test('arrastar item na tela: fica logo depois da linha acima, e os marcados não saem da seção', () => {
  const copia = structuredClone(ROTINA);
  // solto2 para depois de "a", em MANHÃ: "b" (marcado) continua em MANHÃ, logo depois.
  let vista = ['solto1', 'MANHÃ', 'a', 'solto2', 'c', 'VAZIA'];
  let nova = moverNaTela(ROTINA, vista, 'solto2');
  assert.deepEqual(ids(nova), ['solto1', 'MANHÃ', 'a', 'solto2', 'b', 'c', 'VAZIA', 'NOITE', 'd']);
  assert.deepEqual(naVista(nova), vista);

  // "c" logo abaixo do nome VAZIA: vira o primeiro item dela.
  vista = ['solto1', 'solto2', 'MANHÃ', 'a', 'VAZIA', 'c'];
  nova = moverNaTela(ROTINA, vista, 'c');
  assert.deepEqual(ids(nova), ['solto1', 'solto2', 'MANHÃ', 'a', 'b', 'VAZIA', 'c', 'NOITE', 'd']);

  // "a" no alto, sem linha acima: começo da rotina, fora das seções.
  nova = moverNaTela(ROTINA, ['a', 'solto1', 'solto2', 'MANHÃ', 'c', 'VAZIA'], 'a');
  assert.deepEqual(ids(nova), ['a', 'solto1', 'solto2', 'MANHÃ', 'b', 'c', 'VAZIA', 'NOITE', 'd']);
  assert.deepEqual(ROTINA, copia); // a lista recebida não muda
});

test('arrastar seção na tela: leva o bloco inteiro, marcados junto, para depois do bloco acima', () => {
  // Os itens da seção arrastada saem da vista durante o arraste.
  let nova = moverNaTela(ROTINA, ['solto1', 'solto2', 'VAZIA', 'MANHÃ'], 'MANHÃ');
  assert.deepEqual(ids(nova), ['solto1', 'solto2', 'VAZIA', 'MANHÃ', 'a', 'b', 'c', 'NOITE', 'd']);

  // Linha acima é um item de outra seção: vai para depois do bloco dele.
  nova = moverNaTela(ROTINA, ['solto1', 'solto2', 'VAZIA', 'NOITE', 'd', 'MANHÃ'], 'MANHÃ');
  assert.deepEqual(ids(nova), ['solto1', 'solto2', 'VAZIA', 'NOITE', 'd', 'MANHÃ', 'a', 'b', 'c']);

  // Item solto acima: antes das outras seções, e os soltos ficam onde estão.
  nova = moverNaTela(ROTINA, ['solto1', 'solto2', 'VAZIA', 'MANHÃ', 'a', 'c'], 'VAZIA');
  assert.deepEqual(ids(nova), ['solto1', 'solto2', 'VAZIA', 'MANHÃ', 'a', 'b', 'c', 'NOITE', 'd']);

  // Sem linha acima, numa rotina sem itens soltos.
  const sem = [secao('A'), item('1'), secao('B'), item('2')];
  assert.deepEqual(ids(moverNaTela(sem, ['B', 'A', '1'], 'B')), ['B', '2', 'A', '1']);
});

test('arrastar na tela ignora ids que a rotina não tem; id fora da vista devolve a lista como veio', () => {
  assert.deepEqual(ids(moverNaTela(ROTINA, ['fantasma', 'c', 'solto1'], 'c')), [
    'c',
    'solto1',
    'solto2',
    'MANHÃ',
    'a',
    'b',
    'VAZIA',
    'NOITE',
    'd',
  ]);
  assert.deepEqual(ids(moverNaTela(ROTINA, ['solto1', 'fantasma', 'd'], 'd')), [
    'solto1',
    'd',
    'solto2',
    'MANHÃ',
    'a',
    'b',
    'c',
    'VAZIA',
    'NOITE',
  ]);
  assert.equal(moverNaTela(ROTINA, VISTA, 'd'), ROTINA);
  assert.equal(moverNaTela(ROTINA, [...VISTA, 'fantasma'], 'fantasma'), ROTINA);
});
