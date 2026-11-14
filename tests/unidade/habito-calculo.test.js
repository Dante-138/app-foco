import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TODOS_OS_DIAS,
  cumprido,
  formatar,
  lerNumero,
  metaDe,
  pontuacao,
  proximaMarca,
  resolvido,
  sequencias,
  valeNoDia,
  valorDoDia,
  visiveis,
} from '../../www/js/nucleo/habito-calculo.js';

const simNao = { tipo: 'simnao' };
const copos = { tipo: 'numero', meta: 2, unidade: 'copos' };
const HOJE = '2026-11-12';

test('lerNumero aceita vírgula ou ponto como decimal', () => {
  assert.equal(lerNumero('1,5'), 1.5);
  assert.equal(lerNumero('1.5'), 1.5);
  assert.equal(lerNumero('1.50'), 1.5);
  assert.equal(lerNumero('0.500'), 0.5);
  assert.equal(lerNumero('0,25'), 0.25);
  assert.equal(lerNumero(' 2 '), 2);
  assert.equal(lerNumero('0'), 0);
  assert.equal(lerNumero('1500'), 1500);
  assert.equal(lerNumero(3), 3);
});

test('lerNumero trata ponto seguido de três dígitos como milhar', () => {
  assert.equal(lerNumero('1.500'), 1500);
  assert.equal(lerNumero('10.000'), 10000);
  assert.equal(lerNumero('1.234.567'), 1234567);
  assert.equal(lerNumero('1.500,5'), 1500.5);
  assert.equal(lerNumero('10.000,25'), 10000.25);
});

test('lerNumero recusa o que não é número puro', () => {
  const ruins = [
    'abc',
    '',
    '   ',
    '-1',
    '2abc',
    '3 copos',
    '1e3',
    '1,5,3',
    '1.5.3',
    '1,',
    ',5',
    '.5',
    '1.500.25',
  ];
  for (const ruim of ruins) assert.equal(lerNumero(ruim), null, ruim);
  assert.equal(lerNumero('Infinity'), null);
  assert.equal(lerNumero(null), null);
  assert.equal(lerNumero(undefined), null);
});

test('lerNumero recusa número grande demais para ser representado', () => {
  assert.equal(lerNumero('9'.repeat(400)), null);
});

test('formatar usa vírgula decimal', () => {
  assert.equal(formatar(1.5), '1,5');
  assert.equal(formatar(2), '2');
});

test('meta padrão de hábito numérico é 1', () => {
  assert.equal(metaDe({ tipo: 'numero', meta: null }), 1);
  assert.equal(metaDe(copos), 2);
});

test('cumprido em hábito de sim ou não só vale para "feito"', () => {
  assert.equal(cumprido(simNao, 'feito'), true);
  assert.equal(cumprido(simNao, 'pulado'), false);
  assert.equal(cumprido(simNao, undefined), false);
  assert.equal(cumprido(simNao, 3), false);
});

test('cumprido em hábito numérico exige atingir a meta', () => {
  assert.equal(cumprido(copos, 2), true);
  assert.equal(cumprido(copos, 2.5), true);
  assert.equal(cumprido(copos, 1.5), false);
  assert.equal(cumprido(copos, 'feito'), false);
  assert.equal(cumprido(copos, undefined), false);
});

test('proximaMarca alterna vazio -> feito -> pulado -> vazio', () => {
  assert.equal(proximaMarca(undefined), 'feito');
  assert.equal(proximaMarca('feito'), 'pulado');
  assert.equal(proximaMarca('pulado'), null);
});

test('resolvido: cumprido ou pulado; vazio e numérico abaixo da meta ainda pedem ação', () => {
  assert.equal(resolvido(simNao, 'feito'), true);
  assert.equal(resolvido(simNao, 'pulado'), true);
  assert.equal(resolvido(simNao, undefined), false);
  assert.equal(resolvido(copos, 2), true);
  assert.equal(resolvido(copos, 1), false);
  assert.equal(resolvido(copos, 'pulado'), true);
});

test('visiveis: sem filtro mostra todos, na ordem em que estão', () => {
  const habitos = [
    { id: 'a', tipo: 'simnao', arquivado: false },
    { id: 'b', tipo: 'simnao', arquivado: true },
  ];
  const vistos = visiveis(habitos, { a: { [HOJE]: 'feito' } }, HOJE, {
    ocultarConcluidos: false,
    ocultarArquivados: false,
  });
  assert.deepEqual(vistos, habitos);
});

test('visiveis: ocultar arquivados tira só os arquivados', () => {
  const habitos = [
    { id: 'a', tipo: 'simnao', arquivado: false },
    { id: 'b', tipo: 'simnao', arquivado: true },
  ];
  const vistos = visiveis(habitos, {}, HOJE, { ocultarConcluidos: false, ocultarArquivados: true });
  assert.deepEqual(
    vistos.map((h) => h.id),
    ['a'],
  );
});

test('visiveis: ocultar concluídos olha só o dia de hoje e poupa o hábito recém-marcado', () => {
  const habitos = [
    { id: 'feito', tipo: 'simnao', arquivado: false },
    { id: 'pulado', tipo: 'simnao', arquivado: false },
    { id: 'ontem', tipo: 'simnao', arquivado: false },
    { id: 'parcial', tipo: 'numero', meta: 2, arquivado: false },
    { id: 'vazio', tipo: 'simnao', arquivado: false },
  ];
  const registros = {
    feito: { [HOJE]: 'feito' },
    pulado: { [HOJE]: 'pulado' },
    ontem: { '2026-11-11': 'feito' },
    parcial: { [HOJE]: 1 },
  };
  const filtros = { ocultarConcluidos: true, ocultarArquivados: true };

  assert.deepEqual(
    visiveis(habitos, registros, HOJE, filtros).map((h) => h.id),
    ['ontem', 'parcial', 'vazio'],
  );
  assert.deepEqual(
    visiveis(habitos, registros, HOJE, { ...filtros, manter: 'feito' }).map((h) => h.id),
    ['feito', 'ontem', 'parcial', 'vazio'],
  );
});

// ------------------------------------------------- pontuação e sequências

const PESO = 0.5 ** (1 / 13);
const perto = (obtido, esperado) => assert.ok(Math.abs(obtido - esperado) < 1e-9, `${obtido} != ${esperado}`);

test('pontuação sem registro é zero', () => {
  assert.equal(pontuacao(simNao, {}, HOJE), 0);
});

test('pontuação de hábito feito todo dia sobe como no Loop: perto de 80% em um mês', () => {
  const registro = {};
  for (let dia = 1; dia <= 30; dia += 1) registro[`2026-10-${String(dia).padStart(2, '0')}`] = 'feito';
  perto(pontuacao(simNao, registro, '2026-10-30'), 1 - PESO ** 30);
  assert.ok(pontuacao(simNao, registro, '2026-10-30') > 0.79);
});

test('pontuação: dia em branco conta como não feito, no meio e depois do último registro', () => {
  // feito no dia 9, em branco em 10 e 11, feito em 12
  const comBuraco = { '2026-11-09': 'feito', '2026-11-12': 'feito' };
  const depoisDoPrimeiro = 1 - PESO;
  perto(pontuacao(simNao, comBuraco, HOJE), depoisDoPrimeiro * PESO ** 2 * PESO + (1 - PESO));

  // só o dia 9 registrado; 10 e 11 em branco contam, hoje (12) ainda não
  perto(pontuacao(simNao, { '2026-11-09': 'feito' }, HOJE), depoisDoPrimeiro * PESO ** 2);
  // registrado ontem: nenhum dia em branco a descontar
  perto(pontuacao(simNao, { '2026-11-11': 'feito' }, HOJE), depoisDoPrimeiro);
});

test('pontuação: dia pulado não mexe e registro futuro não entra', () => {
  const comPulado = { '2026-11-10': 'feito', '2026-11-11': 'pulado', '2026-11-12': 'feito' };
  perto(pontuacao(simNao, comPulado, HOJE), (1 - PESO) * PESO + (1 - PESO));
  perto(pontuacao(simNao, { '2026-11-12': 'feito', '2026-11-20': 'feito' }, HOJE), 1 - PESO);
});

test('pontuação do numérico conta a parte da meta feita, sem passar de 100% no dia', () => {
  perto(pontuacao(copos, { '2026-11-12': 1 }, HOJE), 0.5 * (1 - PESO));
  perto(pontuacao(copos, { '2026-11-12': 9 }, HOJE), 1 - PESO);
  assert.equal(pontuacao(copos, { '2026-11-12': 'feito' }, HOJE), 0); // marca que não é número
});

test('sequências: conta dias seguidos, guarda a melhor e zera com um dia em branco', () => {
  const registro = {
    '2026-11-01': 'feito',
    '2026-11-02': 'feito',
    '2026-11-03': 'feito',
    // dia 4 em branco
    '2026-11-11': 'feito',
    '2026-11-12': 'feito',
  };
  assert.deepEqual(sequencias(simNao, registro, HOJE), { atual: 2, melhor: 3 });
  assert.deepEqual(sequencias(simNao, {}, HOJE), { atual: 0, melhor: 0 });
});

test('sequência atual vale até ontem, mas morre se ontem ficou em branco', () => {
  assert.deepEqual(sequencias(simNao, { '2026-11-10': 'feito', '2026-11-11': 'feito' }, HOJE), {
    atual: 2,
    melhor: 2,
  });
  assert.deepEqual(sequencias(simNao, { '2026-11-09': 'feito', '2026-11-10': 'feito' }, HOJE), {
    atual: 0,
    melhor: 2,
  });
});

test('sequências: dia pulado não quebra nem conta; pulado solto não começa sequência', () => {
  const comPulado = {
    '2026-11-09': 'feito',
    '2026-11-10': 'pulado',
    '2026-11-11': 'feito',
    '2026-11-12': 'feito',
  };
  assert.deepEqual(sequencias(simNao, comPulado, HOJE), { atual: 3, melhor: 3 });
  assert.deepEqual(sequencias(simNao, { '2026-11-12': 'pulado' }, HOJE), { atual: 0, melhor: 0 });
});

test('sequências do numérico: dia abaixo da meta quebra', () => {
  const registro = { '2026-11-09': 2, '2026-11-10': 3, '2026-11-11': 1, '2026-11-12': 2 };
  assert.deepEqual(sequencias(copos, registro, HOJE), { atual: 1, melhor: 2 });
});

test('pontuação de sim ou não: marca que não é "feito" nem "pulado" conta como não feito', () => {
  assert.equal(pontuacao(simNao, { '2026-11-12': 3 }, HOJE), 0);
});

// ------------------------------------------------- frequência por dia da semana

// 09/11/2026 é segunda; 14 é sábado e 15, domingo.
const UTEIS = { id: 'u', tipo: 'simnao', diasDaSemana: [1, 2, 3, 4, 5] };
const TODO_DIA = { id: 't', tipo: 'simnao', diasDaSemana: [...TODOS_OS_DIAS] };
const SEMANA = Object.fromEntries(
  ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'].map((d) => [d, 'feito']),
);

test('valeNoDia e valorDoDia: fora dos dias do hábito, o branco vira folga sem gravar nada', () => {
  assert.equal(valeNoDia(UTEIS, '2026-11-13'), true);
  assert.equal(valeNoDia(UTEIS, '2026-11-14'), false);
  assert.equal(valeNoDia({ id: 'sem-campo' }, '2026-11-14'), true);
  assert.equal(valorDoDia(UTEIS, SEMANA, '2026-11-14'), 'pulado');
  assert.equal(valorDoDia(UTEIS, SEMANA, '2026-11-13'), 'feito');
  assert.equal(valorDoDia(UTEIS, SEMANA, '2026-11-16'), undefined);
  assert.equal(valorDoDia(UTEIS, { '2026-11-14': 'feito' }, '2026-11-14'), 'feito');
  assert.equal(valorDoDia(UTEIS, undefined, '2026-11-15'), 'pulado');
  assert.equal(Object.hasOwn(SEMANA, '2026-11-14'), false); // a folga não foi gravada
});

test('sequência: o fim de semana de folga não quebra; a segunda em branco quebra', () => {
  assert.deepEqual(sequencias(UTEIS, SEMANA, '2026-11-16'), { atual: 5, melhor: 5 });
  assert.deepEqual(sequencias(TODO_DIA, SEMANA, '2026-11-16'), { atual: 0, melhor: 5 });
  assert.deepEqual(sequencias(UTEIS, SEMANA, '2026-11-17'), { atual: 0, melhor: 5 });
  const comSegunda = { ...SEMANA, '2026-11-16': 'feito' };
  assert.deepEqual(sequencias(UTEIS, comSegunda, '2026-11-16'), { atual: 6, melhor: 6 });
});

test('pontuação: dia de folga não pesa; dia pedido em branco pesa', () => {
  assert.equal(pontuacao(UTEIS, SEMANA, '2026-11-16'), pontuacao(TODO_DIA, SEMANA, '2026-11-14'));
  assert.ok(pontuacao(UTEIS, SEMANA, '2026-11-17') < pontuacao(UTEIS, SEMANA, '2026-11-16'));
  const comFolgaNoMeio = { '2026-11-12': 'feito', '2026-11-16': 'feito' };
  const seguidos = { '2026-11-12': 'feito', '2026-11-13': 'feito' };
  assert.ok(pontuacao(UTEIS, comFolgaNoMeio, '2026-11-16') < pontuacao(UTEIS, seguidos, '2026-11-13'));
  assert.equal(
    pontuacao(
      { ...UTEIS, diasDaSemana: [4] },
      { '2026-11-12': 'feito', '2026-11-19': 'feito' },
      '2026-11-19',
    ),
    pontuacao(TODO_DIA, { '2026-11-12': 'feito', '2026-11-13': 'feito' }, '2026-11-13'),
  );
});

test('visiveis: com "ocultar concluídos", o hábito de folga hoje sai da grade', () => {
  const filtro = { ocultarConcluidos: true, ocultarArquivados: false };
  assert.deepEqual(
    visiveis([UTEIS, TODO_DIA], { u: {}, t: {} }, '2026-11-14', filtro).map((x) => x.id),
    ['t'],
  );
});

// ------------------------------------------------------------ férias e feriados

// 09/11/2026 é segunda. Feitos de segunda a quinta (09 a 12); sexta 13 em branco.
const DIARIO = { id: 'd', tipo: 'simnao', diasDaSemana: [0, 1, 2, 3, 4, 5, 6] };
const ATE_QUINTA = Object.fromEntries(
  ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'].map((d) => [d, 'feito']),
);
const SEXTA_DE_PAUSA = [{ id: 'p', nome: 'Feriado', de: '2026-11-13', ate: '2026-11-13' }];

test('pausa: no dia de pausa o hábito não vale, e o branco vira folga sem gravar nada', () => {
  assert.equal(valeNoDia(DIARIO, '2026-11-13', SEXTA_DE_PAUSA), false);
  assert.equal(valeNoDia(DIARIO, '2026-11-12', SEXTA_DE_PAUSA), true);
  assert.equal(valeNoDia(DIARIO, '2026-11-13', []), true);
  assert.equal(valorDoDia(DIARIO, ATE_QUINTA, '2026-11-13', SEXTA_DE_PAUSA), 'pulado');
  assert.equal(valorDoDia(DIARIO, ATE_QUINTA, '2026-11-13'), undefined);
  // Marcar num dia de pausa continua valendo.
  assert.equal(valorDoDia(DIARIO, { '2026-11-13': 'feito' }, '2026-11-13', SEXTA_DE_PAUSA), 'feito');
  assert.equal(Object.hasOwn(ATE_QUINTA, '2026-11-13'), false);
});

test('pausa: o dia em branco dentro dela não quebra a sequência; fora dela, quebra', () => {
  // No sábado 14: sem a pausa, a sexta em branco quebrou a sequência; com ela, continua viva.
  assert.deepEqual(sequencias(DIARIO, ATE_QUINTA, '2026-11-14'), { atual: 0, melhor: 4 });
  assert.deepEqual(sequencias(DIARIO, ATE_QUINTA, '2026-11-14', SEXTA_DE_PAUSA), { atual: 4, melhor: 4 });
  // No domingo 15, o sábado em branco já está fora da pausa: quebra.
  assert.deepEqual(sequencias(DIARIO, ATE_QUINTA, '2026-11-15', SEXTA_DE_PAUSA), { atual: 0, melhor: 4 });
  // Pausa no meio do histórico junta os dois trechos numa sequência só.
  const comSabado = { ...ATE_QUINTA, '2026-11-14': 'feito' };
  assert.deepEqual(sequencias(DIARIO, comSabado, '2026-11-14'), { atual: 1, melhor: 4 });
  assert.deepEqual(sequencias(DIARIO, comSabado, '2026-11-14', SEXTA_DE_PAUSA), { atual: 5, melhor: 5 });
});

test('pausa: o dia em branco dentro dela não pesa na pontuação', () => {
  const semFuro = pontuacao(DIARIO, ATE_QUINTA, '2026-11-13');
  assert.equal(pontuacao(DIARIO, ATE_QUINTA, '2026-11-14', SEXTA_DE_PAUSA), semFuro);
  assert.ok(pontuacao(DIARIO, ATE_QUINTA, '2026-11-14') < semFuro);
  // Pausa soma com a frequência: hábito de dias úteis, com a sexta de pausa, só deve a segunda.
  const uteis = { ...DIARIO, diasDaSemana: [1, 2, 3, 4, 5] };
  assert.deepEqual(sequencias(uteis, ATE_QUINTA, '2026-11-16', SEXTA_DE_PAUSA), { atual: 4, melhor: 4 });
  assert.deepEqual(sequencias(uteis, ATE_QUINTA, '2026-11-17', SEXTA_DE_PAUSA), { atual: 0, melhor: 4 });
});

test('pausa: com "ocultar concluídos", o hábito em dia de pausa sai da grade', () => {
  const filtro = { ocultarConcluidos: true, ocultarArquivados: false };
  const ids = (extra) =>
    visiveis([DIARIO], { d: {} }, '2026-11-13', { ...filtro, ...extra }).map((x) => x.id);
  assert.deepEqual(ids({}), ['d']);
  assert.deepEqual(ids({ pausas: SEXTA_DE_PAUSA }), []);
  assert.deepEqual(ids({ pausas: SEXTA_DE_PAUSA, manter: 'd' }), ['d']);
});
