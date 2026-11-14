// Resumo do dia para a aba Painel: rotina aberta, hábitos e tarefas de hoje.
// Lógica pura: recebe os dados e a data, devolve só números e listas curtas.

import { cumprido, resolvido, sequencias } from './habito-calculo.js';
import { porPrazo } from './prazos.js';

export const PROXIMOS_DA_ROTINA = 3;
export const TAREFAS_NO_PAINEL = 5;
export const SEQUENCIA_EM_RISCO = 2; // dias seguidos a partir dos quais o Painel avisa
export const RISCOS_NO_PAINEL = 3;

// Itens da rotina com horário, pela hora 'HH:MM': "agora" é o de horário mais recente que já
// chegou e ainda não foi marcado; "depois", o primeiro que ainda não chegou e não foi marcado.
export function agoraEDepois(itens, marcadas, hora) {
  const pendentes = itens
    .filter((i) => i.tipo === 'item' && i.hora && !marcadas.has(i.id))
    .sort((a, b) => (a.hora < b.hora ? -1 : a.hora > b.hora ? 1 : 0));
  return {
    agora: pendentes.filter((i) => i.hora <= hora).at(-1) ?? null,
    depois: pendentes.find((i) => i.hora > hora) ?? null,
  };
}

// Hábitos com sequência viva de pelo menos SEQUENCIA_EM_RISCO dias e nada resolvido hoje:
// se o dia acabar assim, a sequência quebra. Maiores primeiro, até RISCOS_NO_PAINEL.
export function sequenciasEmRisco(habitos, registros, dia) {
  return habitos
    .filter((x) => !x.arquivado && !resolvido(x, registros[x.id]?.[dia]))
    .map((habito) => ({ habito, dias: sequencias(habito, registros[habito.id] ?? {}, dia).atual }))
    .filter((r) => r.dias >= SEQUENCIA_EM_RISCO)
    .sort((a, b) => b.dias - a.dias)
    .slice(0, RISCOS_NO_PAINEL);
}

// rotina: a rotina aberta (ou null); marcadas: Set com os ids marcados hoje nela.
// dia: hoje, 'AAAA-MM-DD'; hora: agora, 'HH:MM' (sem ela, não há "agora e depois").
//   rotina:  itens feitos e total, os próximos itens que faltam, na ordem da rotina, e o
//            item de agora e o de depois, pelo horário
//   habitos: os não arquivados; pular o dia tira o hábito da conta
//   tarefas: pendentes com prazo até hoje (as atrasadas primeiro), e quantas estão atrasadas
export function resumoDoDia({ rotina, marcadas, habitos, registros, tarefas, dia, hora }) {
  const itens = rotina ? rotina.itens.filter((item) => item.tipo === 'item') : [];
  const contam = habitos.filter((x) => !x.arquivado && registros[x.id]?.[dia] !== 'pulado');
  const paraHoje = tarefas.filter((t) => !t.feita && t.prazo && t.prazo <= dia).sort(porPrazo);

  return {
    rotina: {
      feitos: itens.filter((item) => marcadas.has(item.id)).length,
      total: itens.length,
      proximos: itens.filter((item) => !marcadas.has(item.id)).slice(0, PROXIMOS_DA_ROTINA),
      ...(hora ? agoraEDepois(itens, marcadas, hora) : { agora: null, depois: null }),
    },
    habitos: {
      feitos: contam.filter((x) => cumprido(x, registros[x.id]?.[dia])).length,
      total: contam.length,
      emRisco: sequenciasEmRisco(habitos, registros, dia),
    },
    tarefas: {
      total: paraHoje.length,
      atrasadas: paraHoje.filter((t) => t.prazo < dia).length,
      primeiras: paraHoje.slice(0, TAREFAS_NO_PAINEL),
    },
  };
}
