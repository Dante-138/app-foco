// Resumo do dia para a aba Painel: rotina aberta, hábitos e tarefas de hoje.
// Lógica pura: recebe os dados, a data e a hora, devolve só números e listas curtas.

import { deIso } from './datas.js';
import { cumprido, valorDoDia } from './habito-calculo.js';
import { porPrazo } from './prazos.js';
import { horarioDaRotina } from './rotina-horario.js';
import { EM_RISCO_NO_PAINEL, sequenciasEmRisco } from './em-risco.js';

export const PROXIMOS_DA_ROTINA = 3;
export const TAREFAS_NO_PAINEL = 5;

// A rotina no Painel. Sem horários, os próximos são os itens que faltam, na ordem da rotina.
// Com horários, a lista começa no item do horário atual (o que ficou para trás vem depois) e
// o próximo item com horário aparece sempre, mesmo que fique além do limite da lista.
//   agora:     id do item do horário atual, se ainda falta marcar (ou null)
//   depois:    { id, faltam } do próximo item com horário que falta marcar; faltam em minutos (ou null)
//   atrasados: itens de horário anterior ao atual ainda sem marca
function resumoDaRotina(rotina, marcadas, hora) {
  const itens = rotina ? rotina.itens.filter((item) => item.tipo === 'item') : [];
  const { atual, atualFeito, proximo, faltam, atrasados } = horarioDaRotina(itens, marcadas, hora);

  const inicio = atual ? itens.indexOf(atual) : 0;
  const pendentes = [...itens.slice(inicio), ...itens.slice(0, inicio)].filter(
    (item) => !marcadas.has(item.id),
  );
  const proximos = pendentes.slice(0, PROXIMOS_DA_ROTINA);
  const depois = proximo && !marcadas.has(proximo.id) ? proximo : null;
  if (depois && !proximos.includes(depois)) proximos.push(depois);

  return {
    feitos: itens.filter((item) => marcadas.has(item.id)).length,
    total: itens.length,
    proximos,
    agora: atual && !atualFeito ? atual.id : null,
    depois: depois ? { id: depois.id, faltam } : null,
    atrasados,
  };
}

// rotina: a rotina aberta (ou null); marcadas: Set com os ids marcados hoje nela.
// dia: hoje, 'AAAA-MM-DD'; hora: agora, 'HH:MM'.
//   rotina:  itens feitos e total, os próximos itens e onde o relógio está (ver acima)
//   habitos: os não arquivados; pular o dia (ou ser dia de folga do hábito) tira da conta
//   emRisco: hábitos cuja sequência acaba hoje se ficarem em branco (ver em-risco.js)
//   tarefas: pendentes com prazo até hoje (as atrasadas primeiro), e quantas estão atrasadas
//   eixos:   os três eixos do dia, cada um { chave, nome, feitos, total } (total 0: nada pedido hoje)
//            Disciplina = hábitos cumpridos entre os que o dia pede;
//            Execução   = itens marcados da rotina aberta;
//            Entrega    = das tarefas com prazo até hoje, as concluídas hoje contra essas mais as pendentes
export function resumoDoDia({ rotina, marcadas, habitos, registros, tarefas, dia, hora }) {
  const contam = habitos.filter((x) => !x.arquivado && valorDoDia(x, registros[x.id], dia) !== 'pulado');
  const paraHoje = tarefas.filter((t) => !t.feita && t.prazo && t.prazo <= dia).sort(porPrazo);
  const emRisco = sequenciasEmRisco(habitos, registros, dia);

  const daRotina = resumoDaRotina(rotina, marcadas, hora);
  const dosHabitos = {
    feitos: contam.filter((x) => cumprido(x, registros[x.id]?.[dia])).length,
    total: contam.length,
  };
  // Concluída hoje: a marca de conclusão (em milissegundos) é de hoje, no fuso do aparelho.
  const inicioDoDia = deIso(dia).getTime();
  const entregues = tarefas.filter(
    (t) => t.feita && t.prazo && t.prazo <= dia && t.feitaEm >= inicioDoDia,
  ).length;

  return {
    rotina: daRotina,
    habitos: dosHabitos,
    eixos: [
      { chave: 'disciplina', nome: 'Disciplina', ...dosHabitos },
      { chave: 'execucao', nome: 'Execução', feitos: daRotina.feitos, total: daRotina.total },
      { chave: 'entrega', nome: 'Entrega', feitos: entregues, total: entregues + paraHoje.length },
    ],
    emRisco: { total: emRisco.length, primeiras: emRisco.slice(0, EM_RISCO_NO_PAINEL) },
    tarefas: {
      total: paraHoje.length,
      atrasadas: paraHoje.filter((t) => t.prazo < dia).length,
      primeiras: paraHoje.slice(0, TAREFAS_NO_PAINEL),
    },
  };
}
