import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITE_DE_PAUSAS,
  emOrdem,
  emPausa,
  periodoDaPausa,
  porDataDaPausa,
} from '../../www/js/nucleo/pausas.js';

const HOJE = '2026-11-14';
const FERIAS = { id: 'f', nome: 'Férias', de: '2026-12-21', ate: '2027-01-03' };
const FERIADO = { id: 'x', nome: 'Feriado', de: '2026-11-20', ate: '2026-11-20' };

test('emPausa: as duas datas contam; fora do período, não', () => {
  const pausas = [FERIAS, FERIADO];
  assert.equal(LIMITE_DE_PAUSAS, 60);
  assert.deepEqual(
    ['2026-12-20', '2026-12-21', '2026-12-31', '2027-01-03', '2027-01-04', '2026-11-20', '2026-11-19'].map(
      (dia) => emPausa(pausas, dia),
    ),
    [false, true, true, true, false, true, false],
  );
  assert.equal(emPausa([], HOJE), false);
});

test('emOrdem: devolve as duas datas em ordem, venham como vierem', () => {
  assert.deepEqual(emOrdem('2026-11-18', '2026-11-20'), ['2026-11-18', '2026-11-20']);
  assert.deepEqual(emOrdem('2026-11-20', '2026-11-18'), ['2026-11-18', '2026-11-20']);
  assert.deepEqual(emOrdem('2026-11-20', '2026-11-20'), ['2026-11-20', '2026-11-20']);
});

test('porDataDaPausa: da mais recente para a mais antiga; no mesmo começo, a que termina depois primeiro', () => {
  const curta = { ...FERIAS, id: 'c', ate: '2026-12-25' };
  assert.deepEqual(
    [FERIADO, curta, FERIAS].sort(porDataDaPausa).map((p) => p.id),
    ['f', 'c', 'x'],
  );
});

test('periodoDaPausa: um dia só, ou "de a até", com o ano quando não é o corrente', () => {
  assert.match(periodoDaPausa(FERIADO, HOJE), /^sex\., 20 de nov\.$/);
  assert.match(periodoDaPausa(FERIAS, HOJE), /^seg\., 21 de dez\. a 3 de jan\. de 2027$/);
});
