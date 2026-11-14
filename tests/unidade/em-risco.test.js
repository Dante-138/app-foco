import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EM_RISCO_NO_PAINEL, MINIMO_EM_RISCO, sequenciasEmRisco } from '../../www/js/nucleo/em-risco.js';
import { somaDias } from '../../www/js/nucleo/datas.js';

const HOJE = '2026-11-13';
const simNao = (id, extra = {}) => ({ id, tipo: 'simnao', arquivado: false, ...extra });
const numero = (id, meta) => ({ id, tipo: 'numero', meta, arquivado: false });
// n dias seguidos com "valor", terminando em "ate".
const seguidos = (n, ate, valor = 'feito') =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [somaDias(ate, -i), valor]));
const ONTEM = somaDias(HOJE, -1);
const resumo = (lista) => lista.map(({ habito, dias }) => [habito.id, dias]);

test('os limites do Painel', () => {
  assert.equal(MINIMO_EM_RISCO, 2);
  assert.equal(EM_RISCO_NO_PAINEL, 5);
});

test('em risco: sequência viva até ontem e hoje ainda em branco, da mais longa para a mais curta', () => {
  const habitos = [
    simNao('curta'),
    simNao('longa'),
    simNao('um-dia'),
    simNao('quebrada'),
    simNao('sem-registro'),
  ];
  const registros = {
    curta: seguidos(2, ONTEM),
    longa: seguidos(30, ONTEM),
    'um-dia': seguidos(1, ONTEM),
    quebrada: seguidos(10, somaDias(HOJE, -2)), // ontem ficou em branco: já quebrou
  };
  assert.deepEqual(resumo(sequenciasEmRisco(habitos, registros, HOJE)), [
    ['longa', 30],
    ['curta', 2],
  ]);
});

test('feito hoje, pulado hoje ou arquivado: fora da lista', () => {
  const habitos = [simNao('feito'), simNao('pulado'), simNao('arquivado', { arquivado: true })];
  const registros = {
    feito: seguidos(5, HOJE),
    pulado: { ...seguidos(5, ONTEM), [HOJE]: 'pulado' },
    arquivado: seguidos(5, ONTEM),
  };
  assert.deepEqual(sequenciasEmRisco(habitos, registros, HOJE), []);
});

test('dia pulado no meio não quebra a sequência nem entra na contagem', () => {
  const registros = {
    h: { ...seguidos(3, ONTEM), [somaDias(HOJE, -4)]: 'pulado', ...seguidos(2, somaDias(HOJE, -5)) },
  };
  assert.deepEqual(resumo(sequenciasEmRisco([simNao('h')], registros, HOJE)), [['h', 5]]);
});

test('numérico abaixo da meta hoje continua em risco, com a sequência até ontem; na meta, sai', () => {
  const habitos = [numero('agua', 8)];
  const base = seguidos(4, ONTEM, 8);
  assert.deepEqual(resumo(sequenciasEmRisco(habitos, { agua: { ...base, [HOJE]: 3 } }, HOJE)), [['agua', 4]]);
  assert.deepEqual(sequenciasEmRisco(habitos, { agua: { ...base, [HOJE]: 8 } }, HOJE), []);
  // O registro do estado não é alterado pela conta.
  const registros = { agua: { ...base, [HOJE]: 3 } };
  sequenciasEmRisco(habitos, registros, HOJE);
  assert.equal(registros.agua[HOJE], 3);
});
