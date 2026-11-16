// Clima do Painel, pelo Open-Meteo (https://open-meteo.com), com a cidade fixa. Lógica pura:
// monta o endereço da consulta, confere a resposta campo a campo e escreve a linha do Painel.
// Quem faz a chamada é js/agenda.js.
//
// Formato guardado no cache:
//   { atual: número (°C), dias: [{ dia: 'AAAA-MM-DD', minima, maxima, chuva: 0 a 100 | null }] }
// com hoje e amanhã, nessa ordem.

import { dataValida } from './datas.js';
import { ehObjeto } from './esquema.js';

export const CIDADE = Object.freeze({ nome: 'São Paulo', latitude: -23.55, longitude: -46.63 });
export const DIAS_DE_PREVISAO = 2; // hoje e amanhã

export function urlDoClima() {
  const consulta = [
    `latitude=${CIDADE.latitude}`,
    `longitude=${CIDADE.longitude}`,
    'current=temperature_2m',
    'daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    'timezone=America%2FSao_Paulo',
    `forecast_days=${DIAS_DE_PREVISAO}`,
  ];
  return `https://api.open-meteo.com/v1/forecast?${consulta.join('&')}`;
}

const entre = (valor, minimo, maximo) =>
  typeof valor === 'number' && Number.isFinite(valor) && valor >= minimo && valor <= maximo;
// Fora dessa faixa não é temperatura do ar na Terra: é resposta estranha.
const ehTemperatura = (valor) => entre(valor, -90, 60);

const diaValido = (entrada) =>
  ehObjeto(entrada) &&
  dataValida(entrada.dia) &&
  ehTemperatura(entrada.minima) &&
  ehTemperatura(entrada.maxima) &&
  (entrada.chuva === null || entre(entrada.chuva, 0, 100));

// Confere o formato guardado. Qualquer campo fora do esperado invalida tudo: devolve null.
export function sanearClima(valor) {
  if (!ehObjeto(valor) || !ehTemperatura(valor.atual) || !Array.isArray(valor.dias)) return null;
  const dias = valor.dias.slice(0, DIAS_DE_PREVISAO);
  if (!dias.length || !dias.every(diaValido)) return null;
  return {
    atual: valor.atual,
    dias: dias.map(({ dia, minima, maxima, chuva }) => ({ dia, minima, maxima, chuva })),
  };
}

function analisar(texto) {
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

// resposta: o corpo que o Open-Meteo devolveu, já como objeto ou ainda em texto.
// Devolve o clima no formato guardado, ou null quando a resposta não é a esperada.
export function lerClima(resposta) {
  const dados = typeof resposta === 'string' ? analisar(resposta) : resposta;
  const diario = dados?.daily;
  if (!Array.isArray(diario?.time)) return null;
  return sanearClima({
    atual: dados.current?.temperature_2m,
    dias: diario.time.map((dia, i) => ({
      dia,
      minima: diario.temperature_2m_min?.[i],
      maxima: diario.temperature_2m_max?.[i],
      chuva: diario.precipitation_probability_max?.[i] ?? null,
    })),
  });
}

const graus = (valor) => `${Math.round(valor)}°`;

// Linha do Painel: "São Paulo · 24° agora · 18° a 27° · chuva 60%".
// clima: o formato guardado (ou null); dia: hoje. comAtual: a temperatura "agora" só entra
// enquanto a leitura é recente. Sem previsão para o dia, devolve null.
export function linhaDoClima(clima, dia, comAtual) {
  const doDia = clima?.dias.find((entrada) => entrada.dia === dia);
  if (!doDia) return null;
  return [
    CIDADE.nome,
    comAtual ? `${graus(clima.atual)} agora` : null,
    `${graus(doDia.minima)} a ${graus(doDia.maxima)}`,
    doDia.chuva === null ? null : `chuva ${Math.round(doDia.chuva)}%`,
  ]
    .filter(Boolean)
    .join(' · ');
}
