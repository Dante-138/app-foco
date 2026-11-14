// Sequências em risco: hábitos com uma sequência viva que acaba se o dia terminar sem eles.
// Lógica pura, para o Painel.

import { resolvido, sequencias, valorDoDia } from './habito-calculo.js';

// Sequência de um dia só não é sequência: só entra a partir de dois dias seguidos.
export const MINIMO_EM_RISCO = 2;
export const EM_RISCO_NO_PAINEL = 5;

// A sequência até ontem. O valor de hoje fica fora da conta: um numérico ainda abaixo da
// meta zeraria a sequência antes de o dia acabar.
function sequenciaAteOntem(habito, registro, dia) {
  if (registro[dia] === undefined) return sequencias(habito, registro, dia).atual;
  const semHoje = { ...registro };
  delete semHoje[dia];
  return sequencias(habito, semHoje, dia).atual;
}

// habitos e registros: do estado. dia: hoje, 'AAAA-MM-DD'.
// Devolve [{ habito, dias }], da sequência mais longa para a mais curta: os hábitos não
// arquivados que ainda pedem algo hoje (dia de folga do hábito não pede) e vêm de pelo
// menos MINIMO_EM_RISCO dias seguidos.
export function sequenciasEmRisco(habitos, registros, dia) {
  return habitos
    .filter(
      (habito) => !habito.arquivado && !resolvido(habito, valorDoDia(habito, registros[habito.id], dia)),
    )
    .map((habito) => ({ habito, dias: sequenciaAteOntem(habito, registros[habito.id] ?? {}, dia) }))
    .filter(({ dias }) => dias >= MINIMO_EM_RISCO)
    .sort((a, b) => b.dias - a.dias);
}
