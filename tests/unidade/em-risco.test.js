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

test('folga automática: fora dos dias da semana do hábito ele não está em risco, e a folga não quebra a sequência', () => {
  // 13/11/2026 é sexta. O hábito vale de segunda a quinta: hoje é folga.
  const segAQui = simNao('h', { diasDaSemana: [1, 2, 3, 4] });
  const registros = { h: seguidos(4, ONTEM) }; // segunda a quinta feitos
  assert.deepEqual(sequenciasEmRisco([segAQui], registros, HOJE), []);
  // Na segunda seguinte, com sexta, sábado e domingo de folga, a sequência continua viva e em risco.
  assert.deepEqual(resumo(sequenciasEmRisco([segAQui], registros, '2026-11-16')), [['h', 4]]);
  // Marcar num dia de folga vale: quem fez hoje não está em risco.
  assert.deepEqual(sequenciasEmRisco([segAQui], { h: { ...registros.h, [HOJE]: 'feito' } }, HOJE), []);
});

test('pausa: dia de pausa hoje tira o hábito da lista e pausa ontem não quebra a sequência', () => {
  const habitos = [simNao('leitura')];
  const registros = { leitura: seguidos(3, somaDias(HOJE, -2)) }; // ontem em branco
  assert.deepEqual(sequenciasEmRisco(habitos, registros, HOJE), []);

  const ontem = [{ id: 'p', nome: 'Feriado', de: ONTEM, ate: ONTEM }];
  assert.deepEqual(resumo(sequenciasEmRisco(habitos, registros, HOJE, ontem)), [['leitura', 3]]);

  const hoje = [{ id: 'p', nome: 'Férias', de: ONTEM, ate: HOJE }];
  assert.deepEqual(sequenciasEmRisco(habitos, registros, HOJE, hoje), []);
});
