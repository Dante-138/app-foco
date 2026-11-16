import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CIDADE,
  DIAS_DE_PREVISAO,
  lerClima,
  linhaDoClima,
  sanearClima,
  urlDoClima,
} from '../../www/js/nucleo/clima.js';
import { destinoPermitido } from '../../www/js/nucleo/rede.js';

// Resposta do Open-Meteo para a consulta do app, com os campos que ele manda de verdade.
const resposta = () => ({
  latitude: -23.5,
  longitude: -46.6,
  timezone: 'America/Sao_Paulo',
  current: { time: '2026-11-16T11:45', interval: 900, temperature_2m: 24.3 },
  daily: {
    time: ['2026-11-16', '2026-11-17'],
    temperature_2m_max: [27.4, 25.1],
    temperature_2m_min: [18.4, 17.6],
    precipitation_probability_max: [60, 14],
  },
});

const guardado = () => ({
  atual: 24.3,
  dias: [
    { dia: '2026-11-16', minima: 18.4, maxima: 27.4, chuva: 60 },
    { dia: '2026-11-17', minima: 17.6, maxima: 25.1, chuva: 14 },
  ],
});

test('a consulta vai para o Open-Meteo, com São Paulo fixo, hoje e amanhã', () => {
  const url = new URL(urlDoClima());
  assert.equal(url.origin, 'https://api.open-meteo.com');
  assert.equal(url.pathname, '/v1/forecast');
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    latitude: '-23.55',
    longitude: '-46.63',
    current: 'temperature_2m',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'America/Sao_Paulo',
    forecast_days: '2',
  });
  assert.equal(CIDADE.nome, 'São Paulo');
  assert.equal(DIAS_DE_PREVISAO, 2);
  // A própria consulta passa pela lista de destinos.
  assert.equal(destinoPermitido(urlDoClima()), true);
});

test('lê a resposta como objeto ou como texto', () => {
  assert.deepEqual(lerClima(resposta()), guardado());
  assert.deepEqual(lerClima(JSON.stringify(resposta())), guardado());
});

test('probabilidade de chuva ausente ou nula fica nula; dias a mais são ignorados', () => {
  const semChuva = resposta();
  delete semChuva.daily.precipitation_probability_max;
  assert.deepEqual(
    lerClima(semChuva).dias.map((d) => d.chuva),
    [null, null],
  );

  const comNulo = resposta();
  comNulo.daily.precipitation_probability_max = [null, 30];
  assert.deepEqual(
    lerClima(comNulo).dias.map((d) => d.chuva),
    [null, 30],
  );

  const tresDias = resposta();
  tresDias.daily.time.push('2026-11-18');
  assert.deepEqual(lerClima(tresDias), guardado());
});

test('resposta estranha devolve null', () => {
  const comAtual = (valor) => ({ ...resposta(), current: { temperature_2m: valor } });
  const comDiario = (campo, valor) => ({ ...resposta(), daily: { ...resposta().daily, [campo]: valor } });
  const estranhas = [
    null,
    undefined,
    42,
    'não é JSON',
    '"um texto em JSON"',
    '[]',
    {},
    { daily: 7 },
    { daily: { time: 'hoje' } },
    { ...resposta(), current: undefined },
    comAtual('24'),
    comAtual(Number.NaN),
    comAtual(99),
    comAtual(-120),
    comDiario('time', []),
    comDiario('time', ['2026-02-30', '2026-11-17']),
    comDiario('time', [null, '2026-11-17']),
    comDiario('temperature_2m_min', undefined),
    comDiario('temperature_2m_min', 18),
    comDiario('temperature_2m_max', ['quente', 25]),
    comDiario('temperature_2m_max', [27.4]),
    comDiario('precipitation_probability_max', [140, 10]),
    comDiario('precipitation_probability_max', [-1, 10]),
    comDiario('precipitation_probability_max', ['60', 10]),
  ];
  for (const estranha of estranhas) assert.equal(lerClima(estranha), null, JSON.stringify(estranha));
});

test('sanearClima: confere o formato guardado e devolve só os campos conhecidos', () => {
  assert.deepEqual(sanearClima(guardado()), guardado());
  const comSobra = { ...guardado(), extra: 1 };
  comSobra.dias[0].extra = 2;
  assert.deepEqual(sanearClima(comSobra), guardado());

  const invalidos = [
    null,
    'texto',
    [],
    {},
    { atual: 20 },
    { atual: 20, dias: [] },
    { atual: 20, dias: 'hoje' },
    { atual: '20', dias: guardado().dias },
    { atual: 20, dias: [null] },
    { atual: 20, dias: [{ dia: 'hoje', minima: 1, maxima: 2, chuva: null }] },
    { atual: 20, dias: [{ dia: '2026-11-16', minima: 1, maxima: 2 }] },
  ];
  for (const invalido of invalidos) assert.equal(sanearClima(invalido), null, JSON.stringify(invalido));
});

test('linha do Painel: cidade, temperatura de agora, mínima e máxima e chuva do dia', () => {
  assert.equal(linhaDoClima(guardado(), '2026-11-16', true), 'São Paulo · 24° agora · 18° a 27° · chuva 60%');
  // Leitura antiga: a temperatura "agora" já não vale, a previsão do dia sim.
  assert.equal(linhaDoClima(guardado(), '2026-11-17', false), 'São Paulo · 18° a 25° · chuva 14%');
});

test('linha do Painel: sem chuva prevista, com frio abaixo de zero e sem previsão para o dia', () => {
  const frio = { atual: -0.4, dias: [{ dia: '2026-11-16', minima: -3.6, maxima: 0.2, chuva: null }] };
  assert.equal(linhaDoClima(frio, '2026-11-16', true), 'São Paulo · 0° agora · -4° a 0°');
  assert.equal(linhaDoClima(guardado(), '2026-11-18', true), null);
  assert.equal(linhaDoClima(null, '2026-11-16', true), null);
});
