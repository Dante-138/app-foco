import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIAS_DA_AGENDA,
  agendaDoDia,
  eventosDoCalendario,
  trocarEventos,
} from '../../www/js/nucleo/agenda.js';
import { EVENTOS_POR_CALENDARIO, sanearRede } from '../../www/js/nucleo/rede.js';

const HOJE = '2026-11-16';
const GOOGLE = 'https://calendar.google.com/calendar/ical/exemplo/basic.ics';

const ical = (...linhas) => ['BEGIN:VCALENDAR', ...linhas, 'END:VCALENDAR'].join('\r\n');
const evento = (...linhas) => ['BEGIN:VEVENT', ...linhas, 'END:VEVENT'].join('\r\n');

test('do iCal para os eventos guardados: a semana a partir de hoje, com o id do calendário', () => {
  const texto = ical(
    evento('SUMMARY:Aula', 'DTSTART:20261102T193000', 'RRULE:FREQ=WEEKLY'),
    evento('SUMMARY:Entrega', 'DTSTART;VALUE=DATE:20261117'),
    evento('SUMMARY:Semana que vem', 'DTSTART:20261123T193000'),
    evento('SUMMARY:Ontem', 'DTSTART:20261115'),
  );
  assert.equal(DIAS_DA_AGENDA, 7);
  assert.deepEqual(eventosDoCalendario(texto, 'c1', HOJE), [
    { calendarioId: 'c1', titulo: 'Aula', dia: '2026-11-16', hora: '19:30' },
    { calendarioId: 'c1', titulo: 'Entrega', dia: '2026-11-17', hora: null },
  ]);
});

test('o que foi lido do iCal passa pelo saneador do armazenamento sem mudar', () => {
  const texto = ical(evento('SUMMARY:Aula', 'DTSTART:20261116T193000'), evento('DTSTART:20261117'));
  const eventos = eventosDoCalendario(texto, 'c1', HOJE);
  const rede = {
    calendarios: [{ id: 'c1', nome: 'Pessoal', url: GOOGLE }],
    cache: { agenda: { em: 1, eventos } },
  };
  assert.deepEqual(sanearRede(rede).cache.agenda.eventos, eventos);
});

test('calendário vazio devolve lista vazia; resposta que não é calendário devolve null', () => {
  assert.deepEqual(eventosDoCalendario(ical(), 'c1', HOJE), []);
  for (const resposta of ['<html>Entrar</html>', '', null, { erro: true }]) {
    assert.equal(eventosDoCalendario(resposta, 'c1', HOJE), null);
  }
});

test('cada calendário guarda no máximo EVENTOS_POR_CALENDARIO eventos, os mais próximos', () => {
  const muitos = Array.from({ length: EVENTOS_POR_CALENDARIO + 20 }, (_, i) =>
    evento(`SUMMARY:E${i}`, `DTSTART:202611${i < 20 ? 17 : 16}`),
  );
  const eventos = eventosDoCalendario(ical(...muitos), 'c1', HOJE);
  assert.equal(eventos.length, EVENTOS_POR_CALENDARIO);
  assert.ok(eventos.every((e) => e.dia === '2026-11-16'));
});

test('trocar os eventos de um calendário não mexe nos dos outros', () => {
  const eventos = [
    { calendarioId: 'c1', titulo: 'Velho', dia: HOJE, hora: null },
    { calendarioId: 'c2', titulo: 'Do outro', dia: HOJE, hora: null },
  ];
  const novos = [{ calendarioId: 'c1', titulo: 'Novo', dia: HOJE, hora: '10:00' }];
  assert.deepEqual(trocarEventos(eventos, 'c1', novos), [eventos[1], novos[0]]);
  assert.deepEqual(trocarEventos(eventos, 'c1', []), [eventos[1]]);
  assert.equal(eventos.length, 2); // a lista original fica como estava
});

test('agenda do dia: hoje e amanhã, dia inteiro primeiro, depois pelo relógio, com o nome do calendário', () => {
  const calendarios = [
    { id: 'c1', nome: 'Pessoal', url: GOOGLE },
    { id: 'c2', nome: 'Faculdade', url: GOOGLE },
  ];
  const eventos = [
    { calendarioId: 'c1', titulo: 'Dentista', dia: HOJE, hora: '14:00' },
    { calendarioId: 'c2', titulo: 'Prova', dia: '2026-11-17', hora: '19:30' },
    { calendarioId: 'c2', titulo: 'Entrega do trabalho', dia: HOJE, hora: null },
    { calendarioId: 'c2', titulo: 'Aula', dia: HOJE, hora: '08:00' },
    { calendarioId: 'c1', titulo: 'Academia', dia: HOJE, hora: '08:00' },
    { calendarioId: 'c1', titulo: 'Aniversário', dia: HOJE, hora: null },
    { calendarioId: 'c1', titulo: 'Depois de amanhã', dia: '2026-11-18', hora: null },
    { calendarioId: 'apagado', titulo: 'De calendário removido', dia: HOJE, hora: null },
  ];
  assert.deepEqual(agendaDoDia(eventos, calendarios, HOJE), {
    hoje: [
      { hora: null, titulo: 'Aniversário', calendario: 'Pessoal' },
      { hora: null, titulo: 'Entrega do trabalho', calendario: 'Faculdade' },
      { hora: '08:00', titulo: 'Academia', calendario: 'Pessoal' },
      { hora: '08:00', titulo: 'Aula', calendario: 'Faculdade' },
      { hora: '14:00', titulo: 'Dentista', calendario: 'Pessoal' },
    ],
    amanha: [{ hora: '19:30', titulo: 'Prova', calendario: 'Faculdade' }],
  });
  assert.deepEqual(agendaDoDia([], calendarios, HOJE), { hoje: [], amanha: [] });
  // Na virada do mês, amanhã é o dia 1.
  const virada = [{ calendarioId: 'c1', titulo: 'Dia 1', dia: '2026-12-01', hora: null }];
  assert.equal(agendaDoDia(virada, calendarios, '2026-11-30').amanha.length, 1);
});
