// Agenda do Painel: do iCal de um calendário para os eventos guardados (formato em
// nucleo/rede.js), e deles para o que o Painel mostra hoje e amanhã. Lógica pura.

import { somaDias } from './datas.js';
import { lerIcal, pareceIcal } from './ical.js';
import { EVENTOS_POR_CALENDARIO } from './rede.js';

// O cache guarda uma semana: sem rede, a agenda ainda vale por alguns dias.
export const DIAS_DA_AGENDA = 7;

// texto: o corpo que o calendário respondeu; dia: hoje, 'AAAA-MM-DD'.
// Devolve os eventos da semana no formato guardado, ou null quando a resposta não é um
// calendário (página de erro, por exemplo): aí quem chama mantém o que já tinha.
export function eventosDoCalendario(texto, calendarioId, dia) {
  if (!pareceIcal(texto)) return null;
  return lerIcal(texto, { de: dia, dias: DIAS_DA_AGENDA, teto: EVENTOS_POR_CALENDARIO }).map(
    (ocorrencia) => ({
      calendarioId,
      titulo: ocorrencia.titulo,
      dia: ocorrencia.dia,
      hora: ocorrencia.hora,
    }),
  );
}

// Troca os eventos de um calendário pelos que acabaram de ser lidos; os dos outros ficam.
export function trocarEventos(eventos, calendarioId, novos) {
  return [...eventos.filter((evento) => evento.calendarioId !== calendarioId), ...novos];
}

// Dia inteiro primeiro, depois pelo relógio; no empate, pelo título.
const porHora = (a, b) => (a.hora ?? '').localeCompare(b.hora ?? '') || a.titulo.localeCompare(b.titulo);

// eventos e calendarios: do formato guardado; dia: hoje.
// Devolve { hoje, amanha }, cada um com [{ hora: 'HH:MM' | null, titulo, calendario: nome }].
export function agendaDoDia(eventos, calendarios, dia) {
  const nomes = new Map(calendarios.map((calendario) => [calendario.id, calendario.nome]));
  const doDia = (quando) =>
    eventos
      .filter((evento) => evento.dia === quando && nomes.has(evento.calendarioId))
      .sort(porHora)
      .map((evento) => ({
        hora: evento.hora,
        titulo: evento.titulo,
        calendario: nomes.get(evento.calendarioId),
      }));
  return { hoje: doDia(dia), amanha: doDia(somaDias(dia, 1)) };
}
