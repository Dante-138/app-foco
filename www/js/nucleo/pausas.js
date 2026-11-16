// Pausas: férias e feriados. Nos dias de uma pausa todo hábito fica de folga automática, como
// num dia fora da frequência dele: nada é gravado, a sequência não quebra e a pontuação não cai.
// pausa = { id, nome, de: 'AAAA-MM-DD', ate: 'AAAA-MM-DD' }, com as duas datas incluídas;
// feriado é uma pausa de um dia só. Lógica pura.

import { rotuloData } from './prazos.js';

export const LIMITE_DE_PAUSAS = 60;

// O dia cai em alguma pausa?
export const emPausa = (pausas, dia) => pausas.some((pausa) => pausa.de <= dia && dia <= pausa.ate);

// As duas datas em ordem, qualquer que seja a ordem em que vieram.
export const emOrdem = (a, b) => (a <= b ? [a, b] : [b, a]);

// Para a lista: da mais recente para a mais antiga.
export const porDataDaPausa = (a, b) => b.de.localeCompare(a.de) || b.ate.localeCompare(a.ate);

// "qua., 25 de dez." para um dia só; "seg., 23 de dez. a sex., 3 de jan. de 2027" para um período.
// "dia" é hoje: o ano só aparece quando não é o corrente.
export function periodoDaPausa(pausa, dia) {
  const de = rotuloData(pausa.de, dia);
  return pausa.de === pausa.ate ? de : `${de} a ${rotuloData(pausa.ate, dia)}`;
}
