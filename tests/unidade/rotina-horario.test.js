import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emQuanto, horarioDaRotina } from '../../www/js/nucleo/rotina-horario.js';

const item = (id, hora = null) => ({ id, tipo: 'item', texto: id, hora });
const secao = (id) => ({ id, tipo: 'secao', texto: id, hora: null });
const ROTINA = [
  secao('MANHÃ'),
  item('acordar', '06:30'),
  item('cama'),
  item('cafe', '07:00'),
  secao('TRABALHO'),
  item('ponto', '09:00'),
  item('almoco', '12:00'),
];
const ids = ({ atual, proximo }) => [atual?.id ?? null, proximo?.id ?? null];

test('antes do primeiro horário não há item atual; o próximo é o primeiro do dia', () => {
  const r = horarioDaRotina(ROTINA, new Set(), '05:10');
  assert.deepEqual(ids(r), [null, 'acordar']);
  assert.deepEqual([r.atualFeito, r.faltam, r.atrasados], [false, 80, 0]);
});

test('no meio do dia: o atual é o último horário que já chegou; o próximo, o seguinte', () => {
  const r = horarioDaRotina(ROTINA, new Set(['acordar']), '09:00');
  assert.deepEqual(ids(r), ['ponto', 'almoco']);
  assert.deepEqual([r.atualFeito, r.faltam], [false, 180]);
  assert.equal(r.atrasados, 1); // o café das 07:00 ficou sem marca; item sem horário não conta
});

test('item atual já marcado: atualFeito avisa, e os atrasados contam só os de horário anterior', () => {
  const r = horarioDaRotina(ROTINA, new Set(['ponto', 'acordar', 'cafe']), '11:59');
  assert.deepEqual(ids(r), ['ponto', 'almoco']);
  assert.deepEqual([r.atualFeito, r.faltam, r.atrasados], [true, 1, 0]);
});

test('depois do último horário não há próximo', () => {
  const r = horarioDaRotina(ROTINA, new Set(), '23:59');
  assert.deepEqual(ids(r), ['almoco', null]);
  assert.deepEqual([r.faltam, r.atrasados], [null, 3]);
});

test('rotina sem horário, vazia ou só com seções: tudo vazio', () => {
  for (const itens of [[], [secao('A')], [item('a'), item('b')]]) {
    assert.deepEqual(horarioDaRotina(itens, new Set(), '10:00'), {
      atual: null,
      atualFeito: false,
      proximo: null,
      faltam: null,
      atrasados: 0,
    });
  }
});

test('horários fora de ordem na rotina: vale o relógio, não a posição', () => {
  const baguncada = [
    item('tarde', '15:00'),
    item('cedo', '08:00'),
    item('noite', '21:00'),
    item('meio', '12:00'),
  ];
  assert.deepEqual(ids(horarioDaRotina(baguncada, new Set(), '13:00')), ['meio', 'tarde']);
});

test('horários iguais: o atual é o último deles na rotina; o próximo, o primeiro', () => {
  const iguais = [item('a', '08:00'), item('b', '08:00'), item('c', '10:00'), item('d', '10:00')];
  const r = horarioDaRotina(iguais, new Set(), '08:00');
  assert.deepEqual(ids(r), ['b', 'c']);
  assert.equal(r.atrasados, 0); // o outro das 08:00 é do mesmo horário, não está atrasado
});

test('emQuanto: minutos até uma hora, depois horas e minutos', () => {
  assert.equal(emQuanto(0), 'em 0 min');
  assert.equal(emQuanto(40), 'em 40 min');
  assert.equal(emQuanto(60), 'em 1 h');
  assert.equal(emQuanto(125), 'em 2 h 05');
  assert.equal(emQuanto(1439), 'em 23 h 59');
});
