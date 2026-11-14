import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIAS_DA_SEMANA,
  abrirRotinaDoDia,
  definirDias,
  descreverDias,
  diasValidos,
  rotinaDoDia,
} from '../../www/js/nucleo/rotina-do-dia.js';

// 09/11/2026 é segunda; 14 é sábado e 15, domingo.
const SEGUNDA = '2026-11-09';
const SABADO = '2026-11-14';
const DOMINGO = '2026-11-15';

const rotinas = () => [
  { id: 'livre', nome: 'Livre', diasDaSemana: [], itens: [] },
  { id: 'trabalho', nome: 'Trabalho', diasDaSemana: [1, 2, 3, 4, 5], itens: [] },
  { id: 'sabado', nome: 'Sábado', diasDaSemana: [6], itens: [] },
];
const estado = (extra = {}) => ({ rotinas: rotinas(), rotinaAtiva: 'livre', rotinaDoDiaEm: null, ...extra });

test('diasValidos: só inteiros de 0 a 6, sem repetir, em ordem; o que não é lista vira vazio', () => {
  assert.deepEqual(diasValidos([6, 0, 3, 3, 7, -1, 1.5, '2', null]), [0, 3, 6]);
  assert.deepEqual(diasValidos([...DIAS_DA_SEMANA].reverse()), [0, 1, 2, 3, 4, 5, 6]);
  for (const errado of [undefined, null, 'seg', 3, { 0: 1 }]) assert.deepEqual(diasValidos(errado), []);
});

test('rotinaDoDia: a rotina que tem o dia da semana; sem nenhuma, null', () => {
  assert.equal(rotinaDoDia(rotinas(), SEGUNDA).id, 'trabalho');
  assert.equal(rotinaDoDia(rotinas(), SABADO).id, 'sabado');
  assert.equal(rotinaDoDia(rotinas(), DOMINGO), null);
  assert.equal(rotinaDoDia([], SEGUNDA), null);
});

test('rotinaDoDia: com o mesmo dia em duas rotinas, vale a primeira da faixa', () => {
  const duas = [
    { id: 'a', diasDaSemana: [6] },
    { id: 'b', diasDaSemana: [6] },
  ];
  assert.equal(rotinaDoDia(duas, SABADO).id, 'a');
});

test('abrirRotinaDoDia: ao virar o dia abre a rotina do dia e guarda que já escolheu', () => {
  const e = estado();
  assert.equal(abrirRotinaDoDia(e, SEGUNDA), true);
  assert.equal(e.rotinaAtiva, 'trabalho');
  assert.equal(e.rotinaDoDiaEm, SEGUNDA);
});

test('abrirRotinaDoDia: troca feita à mão no mesmo dia não é desfeita; no dia seguinte volta a escolher', () => {
  const e = estado();
  abrirRotinaDoDia(e, SEGUNDA);
  e.rotinaAtiva = 'livre'; // a pessoa trocou à mão
  assert.equal(abrirRotinaDoDia(e, SEGUNDA), false);
  assert.equal(e.rotinaAtiva, 'livre');
  assert.equal(abrirRotinaDoDia(e, '2026-11-10'), true);
  assert.equal(e.rotinaAtiva, 'trabalho');
});

test('abrirRotinaDoDia: dia sem rotina mantém a que estava aberta, mas registra o dia', () => {
  const e = estado({ rotinaAtiva: 'sabado', rotinaDoDiaEm: SABADO });
  assert.equal(abrirRotinaDoDia(e, DOMINGO), true);
  assert.equal(e.rotinaAtiva, 'sabado');
  assert.equal(e.rotinaDoDiaEm, DOMINGO);
});

test('abrirRotinaDoDia: sem rotinas não quebra', () => {
  const e = { rotinas: [], rotinaAtiva: null, rotinaDoDiaEm: null };
  assert.equal(abrirRotinaDoDia(e, SEGUNDA), true);
  assert.equal(e.rotinaAtiva, null);
});

test('definirDias: o dia escolhido sai das outras rotinas; cada dia fica com uma só', () => {
  const lista = rotinas();
  definirDias(lista, lista[0], [6, 5, 5, 9]);
  assert.deepEqual(
    lista.map((r) => r.diasDaSemana),
    [[5, 6], [1, 2, 3, 4], []],
  );
  definirDias(lista, lista[0], []);
  assert.deepEqual(
    lista.map((r) => r.diasDaSemana),
    [[], [1, 2, 3, 4], []],
  );
});

test('descreverDias: texto curto, com os conjuntos mais comuns pelo nome', () => {
  assert.equal(descreverDias([]), '');
  assert.equal(descreverDias([3]), 'qua');
  assert.equal(descreverDias([1, 3]), 'seg e qua');
  assert.equal(descreverDias([1, 3, 5]), 'seg, qua e sex');
  assert.equal(descreverDias([1, 2, 3, 4, 5]), 'seg a sex');
  assert.equal(descreverDias([0, 6]), 'sáb e dom');
  assert.equal(descreverDias([0, 1, 2, 3, 4, 5, 6]), 'todo dia');
});
