import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENTOS_POR_CALENDARIO,
  HOSTS_PERMITIDOS,
  LIMITES_DA_REDE,
  MAXIMO_DE_CALENDARIOS,
  RECUSA,
  SUFIXO_PERMITIDO,
  VALIDADE_DA_AGENDA_MS,
  VALIDADE_DO_CLIMA_MS,
  conferirCalendario,
  destinoDoRedirecionamento,
  destinoPermitido,
  hostDe,
  lerRedeSalva,
  redeInicial,
  sanearRede,
  vencido,
} from '../../www/js/nucleo/rede.js';

const GOOGLE = 'https://calendar.google.com/calendar/ical/exemplo/basic.ics';
const BLACKBOARD = 'https://exemplo.blackboard.com/webapps/calendar/calendarFeed/exemplo/learn.ics';

// ---------------------------------------------------------------- destinos

test('a lista de destinos: Open-Meteo, Google Calendar e o Blackboard de qualquer instituição', () => {
  assert.deepEqual(HOSTS_PERMITIDOS, ['api.open-meteo.com', 'calendar.google.com']);
  assert.equal(SUFIXO_PERMITIDO, '.blackboard.com');
  const aceitos = [
    GOOGLE,
    BLACKBOARD,
    'https://api.open-meteo.com/v1/forecast?latitude=-23.55&daily=a,b&timezone=America%2FSao_Paulo',
    'https://calendar.google.com',
    'https://calendar.google.com/',
    'HTTPS://Calendar.Google.COM/calendar/ical/exemplo%40gmail.com/private-abc/basic.ics',
    'https://a.b-c.blackboard.com/x',
  ];
  for (const url of aceitos) assert.equal(destinoPermitido(url), true, url);
});

test('destino fora da lista é recusado, com ou sem truque no endereço', () => {
  const recusados = [
    'https://example.com/basic.ics',
    'https://google.com/calendar',
    'https://www.calendar.google.com/x',
    'https://calendar.google.com.evil.example/x',
    'https://evilblackboard.com/x',
    'https://blackboard.com/x',
    'https://blackboard.com.evil.example/x',
    'https://.blackboard.com/x',
    'https://a..blackboard.com/x',
    'https://-a.blackboard.com/x',
    'https://a-.blackboard.com/x',
    'http://calendar.google.com/x',
    'webcal://calendar.google.com/x',
    'calendar.google.com/x',
    '//calendar.google.com/x',
    'https:/calendar.google.com/x',
    'https://calendar.google.com:8443/x',
    'https://calendar.google.com@evil.example/x',
    'https://evil.example@calendar.google.com/x',
    'https://usuario:senha@calendar.google.com/x',
    'https://evil.example/x@calendar.google.com',
    'https://evil.example\\@calendar.google.com/x',
    'https://calendar.google.com\\.evil.example/x',
    'https://calendar.google.com?x=1',
    'https://calendar.google.com#@evil.example',
    'https://calendar.google.com/x#fragmento',
    'https://calendar.google.com/x y',
    'https://calendar.google.com/x\nHost: evil.example',
    ' https://calendar.google.com/x',
    'https://calendar.google.com/x\n',
    'https://calendar.google.com./x',
    `https://c${String.fromCharCode(0x430)}lendar.google.com/x`, // com um "a" cirílico no lugar do latino
    'https://[::1]/x',
    'https://127.0.0.1/x',
    `https://calendar.google.com/${'x'.repeat(2000)}`,
    '',
    null,
    undefined,
    42,
    { href: GOOGLE },
  ];
  for (const url of recusados) assert.equal(destinoPermitido(url), false, String(url));
});

test('hostDe: o host em minúsculas, ou null quando o endereço não tem a forma aceita', () => {
  assert.equal(hostDe(GOOGLE), 'calendar.google.com');
  assert.equal(hostDe('https://Exemplo.Blackboard.com/x'), 'exemplo.blackboard.com');
  assert.equal(hostDe('https://example.com/x'), 'example.com'); // tem forma, só não está na lista
  assert.equal(hostDe('http://calendar.google.com/x'), null);
  assert.equal(hostDe(null), null);
});

test('redirecionamento: só segue para destino da lista, com endereço completo ou só o caminho', () => {
  const resposta = (status, headers) => ({ status, headers });
  const novo = 'https://calendar.google.com/calendar/ical/exemplo/novo.ics';

  assert.equal(destinoDoRedirecionamento(resposta(302, { Location: novo }), GOOGLE), novo);
  assert.equal(destinoDoRedirecionamento(resposta(301, { location: BLACKBOARD }), GOOGLE), BLACKBOARD);
  assert.equal(
    destinoDoRedirecionamento(resposta(307, { LOCATION: '/outro/learn.ics' }), BLACKBOARD),
    'https://exemplo.blackboard.com/outro/learn.ics',
  );

  const recusados = [
    resposta(302, { Location: 'https://accounts.google.com/login' }),
    resposta(302, { Location: 'http://calendar.google.com/x' }),
    resposta(302, { Location: '//evil.example/x' }),
    resposta(302, { Location: 'novo.ics' }),
    resposta(302, { Location: ['https://calendar.google.com/x'] }),
    resposta(302, {}),
    resposta(302, null),
    resposta(302, 'Location: https://calendar.google.com/x'),
    resposta(200, { Location: novo }),
    resposta(404, { Location: novo }),
    {},
    null,
    undefined,
  ];
  for (const r of recusados) assert.equal(destinoDoRedirecionamento(r, GOOGLE), null, JSON.stringify(r));
  // Caminho relativo a uma origem que não tem forma aceita não vira destino.
  assert.equal(destinoDoRedirecionamento(resposta(302, { Location: '/x' }), 'lixo'), null);
});

// ----------------------------------------------------------------- formato

const clima = () => ({
  atual: 24.3,
  dias: [{ dia: '2026-11-16', minima: 18.4, maxima: 27.4, chuva: 60 }],
});

const redeCheia = () => ({
  clima: true,
  calendarios: [
    { id: 'c1', nome: 'Pessoal', url: GOOGLE },
    { id: 'c2', nome: 'Faculdade', url: BLACKBOARD },
  ],
  cache: {
    agenda: {
      em: 1_800_000_000_000,
      eventos: [
        { calendarioId: 'c1', titulo: 'Dentista', dia: '2026-11-16', hora: '14:00' },
        { calendarioId: 'c2', titulo: 'Entrega do trabalho', dia: '2026-11-17', hora: null },
      ],
    },
    clima: { em: 1_800_000_000_000, dados: clima() },
  },
});

test('rede inicial: clima desligado, sem calendários e sem cache', () => {
  assert.deepEqual(redeInicial(), {
    clima: false,
    calendarios: [],
    cache: { agenda: { em: 0, eventos: [] }, clima: { em: 0, dados: null } },
  });
  assert.equal(MAXIMO_DE_CALENDARIOS, 5);
  assert.equal(VALIDADE_DA_AGENDA_MS, 30 * 60 * 1000);
  assert.equal(VALIDADE_DO_CLIMA_MS, 60 * 60 * 1000);
});

test('sanear: o que está certo passa igual, e sanear de novo não muda nada', () => {
  assert.deepEqual(sanearRede(redeCheia()), redeCheia());
  assert.deepEqual(sanearRede(sanearRede(redeCheia())), redeCheia());
  assert.deepEqual(lerRedeSalva(JSON.stringify(redeCheia())), redeCheia());
});

test('sanear: valor que não é objeto, ou sem os campos, vira a rede inicial', () => {
  for (const valor of [
    null,
    undefined,
    'texto',
    42,
    [],
    {},
    { cache: 'x' },
    { cache: { agenda: 'x', clima: 7 } },
  ]) {
    assert.deepEqual(sanearRede(valor), redeInicial(), JSON.stringify(valor));
  }
  assert.deepEqual(lerRedeSalva(null), redeInicial());
  assert.deepEqual(lerRedeSalva(''), redeInicial());
  assert.deepEqual(lerRedeSalva('{ quebrado'), redeInicial());
});

test('sanear: o clima só liga com verdadeiro de fato', () => {
  for (const valor of ['sim', 1, {}, null]) assert.equal(sanearRede({ clima: valor }).clima, false);
  assert.equal(sanearRede({ clima: true }).clima, true);
});

test('sanear calendários: descarta inválido, repetido e link fora da lista; corta nome e quantidade', () => {
  const lidos = sanearRede({
    calendarios: [
      { id: 'a', nome: `  ${'N'.repeat(80)}  `, url: GOOGLE, extra: 'some' },
      { id: 'a', nome: 'Id repetido', url: BLACKBOARD },
      { id: '', nome: 'Sem id', url: GOOGLE },
      { id: 7, nome: 'Id que não é texto', url: GOOGLE },
      { id: 'x'.repeat(LIMITES_DA_REDE.id + 1), nome: 'Id longo', url: GOOGLE },
      { id: 'b', nome: '   ', url: GOOGLE },
      { id: 'c', nome: 42, url: GOOGLE },
      { id: 'd', nome: 'Fora da lista', url: 'https://example.com/a.ics' },
      { id: 'e', nome: 'Sem link' },
      null,
      'texto',
      ...Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, nome: `Mais ${i}`, url: BLACKBOARD })),
    ],
  }).calendarios;
  assert.deepEqual(
    lidos.map((c) => c.id),
    ['a', 'n0', 'n1', 'n2', 'n3'],
  );
  assert.deepEqual(lidos[0], { id: 'a', nome: 'N'.repeat(LIMITES_DA_REDE.nomeCalendario), url: GOOGLE });
  assert.deepEqual(sanearRede({ calendarios: 'nenhum' }).calendarios, []);
});

test('sanear eventos: só os de calendário existente e bem formados, até o limite', () => {
  const rede = redeCheia();
  rede.cache.agenda.eventos = [
    { calendarioId: 'c1', titulo: '  Dentista  ', dia: '2026-11-16', hora: '14:00', extra: 1 },
    { calendarioId: 'c1', titulo: 'Sem hora', dia: '2026-11-16' },
    { calendarioId: 'apagado', titulo: 'De calendário removido', dia: '2026-11-16', hora: null },
    { calendarioId: 'c1', titulo: '', dia: '2026-11-16', hora: null },
    { calendarioId: 'c1', titulo: 7, dia: '2026-11-16', hora: null },
    { calendarioId: 'c1', titulo: 'Dia inválido', dia: '16/11/2026', hora: null },
    { calendarioId: 'c1', titulo: 'Hora inválida', dia: '2026-11-16', hora: '25:00' },
    { calendarioId: 'c1', titulo: 'Hora que não é texto', dia: '2026-11-16', hora: 14 },
    null,
    'texto',
  ];
  assert.deepEqual(sanearRede(rede).cache.agenda.eventos, [
    { calendarioId: 'c1', titulo: 'Dentista', dia: '2026-11-16', hora: '14:00' },
    { calendarioId: 'c1', titulo: 'Sem hora', dia: '2026-11-16', hora: null },
  ]);

  rede.cache.agenda.eventos = Array.from({ length: 800 }, (_, i) => ({
    calendarioId: 'c2',
    titulo: `Evento ${i}`,
    dia: '2026-11-16',
    hora: null,
  }));
  assert.equal(sanearRede(rede).cache.agenda.eventos.length, MAXIMO_DE_CALENDARIOS * EVENTOS_POR_CALENDARIO);

  rede.cache.agenda.eventos = { 0: 'não é lista' };
  assert.deepEqual(sanearRede(rede).cache.agenda.eventos, []);
});

test('sanear cache: instante inválido zera; sem calendário ou sem clima válido, o cache some', () => {
  const comInstanteRuim = redeCheia();
  comInstanteRuim.cache.agenda.em = 'ontem';
  comInstanteRuim.cache.clima.em = -5;
  const lido = sanearRede(comInstanteRuim);
  assert.equal(lido.cache.agenda.em, 0);
  assert.equal(lido.cache.clima.em, 0);
  assert.deepEqual(lido.cache.clima.dados, clima());

  const semCalendarios = { ...redeCheia(), calendarios: [] };
  assert.deepEqual(sanearRede(semCalendarios).cache.agenda, { em: 0, eventos: [] });

  const climaRuim = redeCheia();
  climaRuim.cache.clima.dados = { atual: 'quente' };
  assert.deepEqual(sanearRede(climaRuim).cache.clima, { em: 0, dados: null });

  const infinito = redeCheia();
  infinito.cache.agenda.em = Infinity;
  assert.equal(sanearRede(infinito).cache.agenda.em, 0);
});

test('vencido: nunca lido, velho demais ou com o relógio atrasado depois da leitura', () => {
  const agora = 1_800_000_000_000;
  assert.equal(vencido(0, agora, VALIDADE_DA_AGENDA_MS), true);
  assert.equal(vencido(agora - VALIDADE_DA_AGENDA_MS, agora, VALIDADE_DA_AGENDA_MS), true);
  assert.equal(vencido(agora - VALIDADE_DA_AGENDA_MS + 1, agora, VALIDADE_DA_AGENDA_MS), false);
  assert.equal(vencido(agora, agora, VALIDADE_DO_CLIMA_MS), false);
  assert.equal(vencido(agora + 1, agora, VALIDADE_DO_CLIMA_MS), true);
});

// -------------------------------------------------------------- calendários

test('conferir calendário: aceita nome e link da lista, aparando os espaços', () => {
  assert.deepEqual(conferirCalendario([], '  Faculdade  ', `  ${BLACKBOARD}\n`), {
    calendario: { nome: 'Faculdade', url: BLACKBOARD },
  });
  const longo = conferirCalendario([], 'N'.repeat(90), GOOGLE);
  assert.equal(longo.calendario.nome.length, LIMITES_DA_REDE.nomeCalendario);
});

test('conferir calendário: recusa sem nome, link fora da lista, repetido e acima do limite', () => {
  const existentes = [{ id: 'c1', nome: 'Pessoal', url: GOOGLE }];
  assert.deepEqual(conferirCalendario(existentes, '   ', BLACKBOARD), { recusa: RECUSA.SEM_NOME });
  assert.deepEqual(conferirCalendario(existentes, null, BLACKBOARD), { recusa: RECUSA.SEM_NOME });
  for (const link of [
    'https://example.com/a.ics',
    'http://calendar.google.com/x',
    'meu calendário',
    '',
    null,
  ]) {
    assert.deepEqual(conferirCalendario(existentes, 'Outro', link), { recusa: RECUSA.LINK_RECUSADO }, link);
  }
  assert.deepEqual(conferirCalendario(existentes, 'De novo', GOOGLE), { recusa: RECUSA.REPETIDO });

  const cheio = Array.from({ length: MAXIMO_DE_CALENDARIOS }, (_, i) => ({
    id: `c${i}`,
    nome: `C${i}`,
    url: `${GOOGLE}?n=${i}`,
  }));
  assert.deepEqual(conferirCalendario(cheio, 'Sexto', BLACKBOARD), { recusa: RECUSA.LIMITE });
});
