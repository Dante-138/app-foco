// Plano de lembretes: quais notificações devem estar agendadas para as tarefas pendentes.
// Lógica pura. Quem fala com o sistema de notificações é js/lembretes.js.
//
// Cada tarefa pendente com prazo avisa no próprio prazo. A que tem aviso antecipado
// (tarefa.avisos, em dias antes do prazo) avisa também em cada um desses dias e, se
// continuar pendente, na manhã seguinte ao vencimento. Serve para conta, prova e entrega.

import { somaDias } from './datas.js';
import { rotuloData } from './prazos.js';

// Tarefa com data e sem horário avisa de manhã, como no Google Tasks. Os avisos antecipados
// e o de atraso também saem nessa hora.
export const HORA_PADRAO = '09:00';

// O Android limita os alarmes por app; o plano fica com os lembretes mais próximos.
export const MAXIMO_DE_LEMBRETES = 60;

// Antecedências que a interface oferece, as de uma conta e a maior que o formato aceita.
export const OPCOES_DE_AVISO = Object.freeze([1, 3, 7]);
export const AVISOS_DE_CONTA = Object.freeze([1, 3]);
export const MAXIMO_DE_ANTECEDENCIA = 30;

const TAMANHO_DA_NOTA = 120;

// Avisos no formato guardado: dias inteiros de 1 a MAXIMO_DE_ANTECEDENCIA, sem repetir,
// em ordem crescente. Qualquer outra coisa (campo ausente, texto, número solto) vira lista vazia.
export function avisosValidos(valor) {
  if (!Array.isArray(valor)) return [];
  const dias = valor.filter((n) => Number.isInteger(n) && n >= 1 && n <= MAXIMO_DE_ANTECEDENCIA);
  return [...new Set(dias)].sort((a, b) => a - b);
}

// Número estável, de 1 a 2^30, tirado de um texto (FNV-1a): é o id da notificação no sistema,
// que só aceita inteiro positivo de 32 bits com sinal. O lembrete do prazo usa o id da
// tarefa; os outros, o id da tarefa mais o tipo do aviso. O mesmo texto dá sempre o mesmo número.
export function idDaNotificacao(texto) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 2) + 1; // 30 bits mais um: nunca zero, nunca passa do limite
}

// Momento do lembrete, em texto local "AAAA-MM-DDTHH:MM". Nesse formato a ordem
// alfabética é a ordem do relógio, então dá para comparar como texto.
const momento = (tarefa) => `${tarefa.prazo}T${tarefa.hora ?? HORA_PADRAO}`;

function resumoDaNota(tarefa) {
  const nota = tarefa.notas.split('\n')[0].trim();
  return nota.length > TAMANHO_DA_NOTA ? `${nota.slice(0, TAMANHO_DA_NOTA - 1).trimEnd()}…` : nota;
}

const juntar = (...partes) => partes.filter(Boolean).join(' · ');

// Todos os lembretes de uma tarefa pendente com prazo, passados ou não.
function lembretesDaTarefa(tarefa, nomeDaLista, dia) {
  const base = { tarefaId: tarefa.id, titulo: tarefa.titulo, criadaEm: tarefa.criadaEm };
  const lembretes = [
    {
      ...base,
      id: idDaNotificacao(tarefa.id),
      corpo: juntar(nomeDaLista, resumoDaNota(tarefa)),
      quando: momento(tarefa),
    },
  ];
  for (const dias of tarefa.avisos) {
    const falta = dias === 1 ? 'Vence amanhã' : `Vence em ${dias} dias`;
    lembretes.push({
      ...base,
      id: idDaNotificacao(`${tarefa.id}:antes:${dias}`),
      corpo: juntar(`${falta}, ${rotuloData(tarefa.prazo, dia)}`, nomeDaLista),
      quando: `${somaDias(tarefa.prazo, -dias)}T${HORA_PADRAO}`,
    });
  }
  if (tarefa.avisos.length) {
    lembretes.push({
      ...base,
      id: idDaNotificacao(`${tarefa.id}:atraso`),
      corpo: juntar('Venceu ontem e continua pendente', nomeDaLista),
      quando: `${somaDias(tarefa.prazo, 1)}T${HORA_PADRAO}`,
    });
  }
  return lembretes;
}

// tarefas e listas: do estado do app. agora: momento atual, "AAAA-MM-DDTHH:MM" local.
// Devolve os lembretes das tarefas pendentes com prazo cujo momento ainda não passou,
// do mais próximo para o mais distante, no máximo MAXIMO_DE_LEMBRETES:
//   [{ id, tarefaId, titulo, corpo, quando }]
export function planejar(tarefas, listas, agora) {
  const nomes = new Map(listas.map((lista) => [lista.id, lista.nome]));
  const dia = agora.slice(0, 10);
  const futuros = tarefas
    .filter((t) => !t.feita && t.prazo)
    .flatMap((t) => lembretesDaTarefa(t, nomes.get(t.listaId), dia))
    .filter((lembrete) => lembrete.quando > agora)
    .sort((a, b) => a.quando.localeCompare(b.quando) || a.criadaEm - b.criadaEm);

  const usados = new Set();
  const plano = [];
  for (const { id, tarefaId, titulo, corpo, quando } of futuros) {
    if (plano.length === MAXIMO_DE_LEMBRETES) break;
    if (usados.has(id)) continue; // dois textos com o mesmo número: fica o lembrete mais próximo
    usados.add(id);
    plano.push({ id, tarefaId, titulo, corpo, quando });
  }
  return plano;
}
