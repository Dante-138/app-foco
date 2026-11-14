// Regras dos hábitos, sem interface: valores, metas, pontuação e sequências.
// O registro de um hábito é { 'AAAA-MM-DD': 'feito' | 'pulado' | número }.

import { deIso, diasEntre, somaDias } from './datas.js';

// Dias da semana em que o hábito vale (0 = domingo, como Date.getDay). Sem a lista, todos.
export const TODOS_OS_DIAS = Object.freeze([0, 1, 2, 3, 4, 5, 6]);

const diasDe = (habito) => habito.diasDaSemana ?? TODOS_OS_DIAS;
const todoDia = (habito) => diasDe(habito).length === 7;

// O hábito pede alguma coisa neste dia? Fora dos dias dele, o dia é folga automática.
export const valeNoDia = (habito, dia) => todoDia(habito) || diasDe(habito).includes(deIso(dia).getDay());

// Valor do dia como as contas enxergam: o registrado ou, em dia fora da frequência e sem
// registro, a folga ('pulado'). Nada é gravado: a folga automática só existe na conta.
export function valorDoDia(habito, registro, dia) {
  const valor = registro?.[dia];
  if (valor !== undefined || valeNoDia(habito, dia)) return valor;
  return 'pulado';
}

// Quantos dias, entre duas datas e sem contar as pontas, o hábito pedia.
function devidosEntre(habito, de, ate) {
  const entre = diasEntre(de, ate) - 1;
  if (todoDia(habito) || entre <= 0) return Math.max(entre, 0);
  let n = 0;
  for (let d = somaDias(de, 1); d < ate; d = somaDias(d, 1)) if (valeNoDia(habito, d)) n += 1;
  return n;
}

export const formatar = (n) => String(n).replace('.', ',');

const COM_MILHAR = /^[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/; // 1.500 ou 10.000,5
const SIMPLES = /^\d+([.,]\d+)?$/; // 1500, 1,5 ou 1.5

// Lê um número digitado, no costume brasileiro:
// - vírgula é sempre decimal ("1,5");
// - ponto seguido de exatamente três dígitos é milhar ("1.500" = 1500, "10.000,5" = 10000,5);
// - qualquer outro ponto é decimal ("1.5" = 1,5; "0.500" = 0,5).
// Devolve null para o que não for número puro: vazio, negativo, "2abc", "1e3".
export function lerNumero(texto) {
  const t = String(texto).trim();
  let n;
  if (COM_MILHAR.test(t)) n = Number(t.replaceAll('.', '').replace(',', '.'));
  else if (SIMPLES.test(t)) n = Number(t.replace(',', '.'));
  else return null;
  return Number.isFinite(n) ? n : null;
}

export const metaDe = (habito) => habito.meta ?? 1;

export function cumprido(habito, valor) {
  if (habito.tipo === 'numero') return typeof valor === 'number' && valor >= metaDe(habito);
  return valor === 'feito';
}

// O hábito não pede mais nada no dia: foi cumprido ou o dia foi pulado.
export const resolvido = (habito, valor) => valor === 'pulado' || cumprido(habito, valor);

// Quais hábitos aparecem na grade, conforme os filtros. "manter" é o id de um hábito
// que continua na tela mesmo resolvido: o que acabou de ser marcado, enquanto a
// resposta ao toque ainda está sendo mostrada.
export function visiveis(habitos, registros, dia, { ocultarConcluidos, ocultarArquivados, manter = null }) {
  return habitos.filter((habito) => {
    if (ocultarArquivados && habito.arquivado) return false;
    if (!ocultarConcluidos || habito.id === manter) return true;
    return !resolvido(habito, valorDoDia(habito, registros[habito.id], dia));
  });
}

// Toque em hábito de sim ou não: vazio -> feito -> pulado -> vazio (null).
export function proximaMarca(atual) {
  if (atual === 'feito') return 'pulado';
  if (atual === 'pulado') return null;
  return 'feito';
}

// Parte do dia que foi cumprida, de 0 a 1. O numérico conta a fração da meta já feita.
function parteCumprida(habito, valor) {
  if (habito.tipo !== 'numero') return valor === 'feito' ? 1 : 0;
  return typeof valor === 'number' ? Math.min(1, valor / metaDe(habito)) : 0;
}

// Peso do dia anterior na pontuação: o do Loop para hábito diário. Com ele, um hábito
// feito todo dia chega perto de 80% em um mês e de 96% em dois.
const PESO = 0.5 ** (1 / 13);

// Dias com registro até "dia", em ordem.
const diasRegistrados = (registro, dia) =>
  Object.keys(registro)
    .filter((d) => d <= dia)
    .sort();

// Pontuação do hábito, de 0 a 1, como a do Loop: uma média em que os dias recentes pesam mais.
//   a cada dia: nova = anterior * PESO + parteCumprida * (1 - PESO)
// Dia em branco conta como não feito; dia pulado e dia fora da frequência não mexem na
// pontuação. Hoje só entra
// na conta depois de registrado, para a pontuação não cair antes de o dia acabar.
export function pontuacao(habito, registro, dia) {
  let pontos = 0;
  let anterior = null;
  for (const d of diasRegistrados(registro, dia)) {
    if (anterior) pontos *= PESO ** devidosEntre(habito, anterior, d); // dias em branco no meio
    if (registro[d] !== 'pulado') {
      pontos = pontos * PESO + parteCumprida(habito, registro[d]) * (1 - PESO);
    }
    anterior = d;
  }
  // dias em branco depois do último registro, até ontem
  if (anterior && anterior < dia) pontos *= PESO ** devidosEntre(habito, anterior, dia);
  return pontos;
}

// Sequências de dias seguidos cumprindo o hábito: { atual, melhor }.
// Dia pulado e dia fora da frequência não quebram a sequência nem entram na contagem;
// dia em branco que o hábito pedia quebra.
// A atual vale até ontem: hoje ainda em branco não a interrompe.
export function sequencias(habito, registro, dia) {
  let corrida = 0;
  let melhor = 0;
  let anterior = null;
  for (const d of diasRegistrados(registro, dia)) {
    if (anterior === null || devidosEntre(habito, anterior, d) > 0) corrida = 0;
    if (cumprido(habito, registro[d])) corrida += 1;
    else if (registro[d] !== 'pulado') corrida = 0; // numérico abaixo da meta
    melhor = Math.max(melhor, corrida);
    anterior = d;
  }
  const viva = anterior !== null && devidosEntre(habito, anterior, dia) === 0;
  return { atual: viva ? corrida : 0, melhor };
}
