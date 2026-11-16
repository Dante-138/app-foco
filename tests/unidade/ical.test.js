import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agoraLocal } from '../../www/js/nucleo/datas.js';
import {
  MAXIMO_DE_DIAS,
  MAXIMO_DE_EVENTOS,
  ORCAMENTO_DE_PASSOS,
  SEM_TITULO,
  TETO_DE_OCORRENCIAS,
  desfazerEscapes,
  lerIcal,
  pareceIcal,
} from '../../www/js/nucleo/ical.js';

// 16/11/2026 é uma segunda-feira.
const HOJE = '2026-11-16';

const calendario = (...eventos) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', ...eventos.flat(), 'END:VCALENDAR'].join('\r\n');
const evento = (...linhas) => ['BEGIN:VEVENT', ...linhas, 'END:VEVENT'];
const ler = (texto, de = HOJE, dias = 7) => lerIcal(texto, { de, dias });
// "2026-11-16 09:00 Título", ou "dia" no lugar da hora.
const resumo = (ocorrencias) => ocorrencias.map((o) => `${o.dia} ${o.hora ?? 'dia'} ${o.titulo}`);
const dias = (ocorrencias) => ocorrencias.map((o) => o.dia);
// Um instante de novembro de 2026, em UTC, visto no relógio desta máquina: "AAAA-MM-DD HH:MM".
const local = (dia, hora, minuto) =>
  agoraLocal(new Date(Date.UTC(2026, 10, dia, hora, minuto))).replace('T', ' ');

// ---------------------------------------------------------------- leitura

test('lê evento de dia inteiro, com hora local e com TZID, em ordem', () => {
  const texto = calendario(
    evento(
      'UID:b',
      'SUMMARY:Aula',
      'DTSTART;TZID=America/Sao_Paulo:20261116T193000',
      'DTEND:20261116T213000',
    ),
    evento('UID:a', 'SUMMARY:Reunião', 'DTSTART:20261116T090000'),
    evento('UID:c', 'SUMMARY:Feriado', 'DTSTART;VALUE=DATE:20261116'),
    evento('UID:d', 'SUMMARY:Amanhã cedo', 'DTSTART:20261117T070000'),
  );
  assert.deepEqual(ler(texto), [
    { uid: 'c', titulo: 'Feriado', dia: '2026-11-16', hora: null },
    { uid: 'a', titulo: 'Reunião', dia: '2026-11-16', hora: '09:00' },
    { uid: 'b', titulo: 'Aula', dia: '2026-11-16', hora: '19:30' },
    { uid: 'd', titulo: 'Amanhã cedo', dia: '2026-11-17', hora: '07:00' },
  ]);
});

test('no mesmo momento, a ordem é a do título', () => {
  const texto = calendario(
    evento('SUMMARY:Beta', 'DTSTART:20261116T090000'),
    evento('SUMMARY:Alfa', 'DTSTART:20261116T090000'),
    evento('SUMMARY:Alfa', 'DTSTART:20261116T090000'),
  );
  assert.deepEqual(resumo(ler(texto)), [
    '2026-11-16 09:00 Alfa',
    '2026-11-16 09:00 Alfa',
    '2026-11-16 09:00 Beta',
  ]);
});

test('só entra o que cai na janela pedida', () => {
  const texto = calendario(
    evento('SUMMARY:Ontem', 'DTSTART:20261115T100000'),
    evento('SUMMARY:Hoje', 'DTSTART:20261116T100000'),
    evento('SUMMARY:Último dia', 'DTSTART:20261118'),
    evento('SUMMARY:Depois', 'DTSTART:20261119'),
  );
  assert.deepEqual(resumo(ler(texto, HOJE, 3)), ['2026-11-16 10:00 Hoje', '2026-11-18 dia Último dia']);
});

test('com Z, o horário UTC vira o do relógio do aparelho, inclusive quando muda o dia', () => {
  const texto = calendario(
    evento('SUMMARY:Madrugada em UTC', 'DTSTART:20261117T013000Z'),
    evento('SUMMARY:Tarde em UTC', 'DTSTART:20261116T150000Z'),
  );
  // A janela de três dias em volta cobre qualquer fuso em que os testes rodem.
  assert.deepEqual(resumo(ler(texto, '2026-11-15', 4)).sort(), [
    `${local(16, 15, 0)} Tarde em UTC`,
    `${local(17, 1, 30)} Madrugada em UTC`,
  ]);
});

test('desdobra linhas, ignora parâmetros (até com ":" entre aspas) e desfaz os escapes do título', () => {
  const texto = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'DTSTART;TZID="GMT-03:00";X-OUTRO=1:20261116T100000',
    'SUMMARY;LANGUAGE=pt-BR:Prova\\, sala 3\\; trazer l',
    ' ápis\\ne\\\\ou caneta \\N  azul',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\n');
  assert.deepEqual(resumo(ler(texto)), ['2026-11-16 10:00 Prova, sala 3; trazer lápis e\\ou caneta azul']);
  assert.equal(desfazerEscapes('a\\nb\\Nc\\,d\\;e\\\\f\\x'), 'a\nb\nc,d;e\\f\\x');
});

test('título vazio vira "Sem título", e título longo é cortado', () => {
  const texto = calendario(
    evento('DTSTART:20261116T080000'),
    evento('SUMMARY:   ', 'DTSTART:20261116T090000'),
    evento(`SUMMARY:${'x'.repeat(500)}`, 'DTSTART:20261116T100000'),
  );
  const lidos = ler(texto);
  assert.deepEqual([lidos[0].titulo, lidos[1].titulo], [SEM_TITULO, SEM_TITULO]);
  assert.equal(lidos[0].uid, '');
  assert.equal(lidos[2].titulo.length, 200);
});

test('fica com a primeira propriedade repetida e ignora o que está dentro de um VALARM', () => {
  const texto = calendario(
    evento(
      'SUMMARY:Consulta',
      'SUMMARY:Outro nome',
      'DESCRIPTION:não é guardada',
      'DTSTART:20261116T140000',
      'BEGIN:VALARM',
      'SUMMARY:Lembrete do alarme',
      'DTSTART:20261117T000000',
      'BEGIN:X-ANINHADO',
      'END:X-ANINHADO',
      'END:VALARM',
    ),
  );
  assert.deepEqual(resumo(ler(texto)), ['2026-11-16 14:00 Consulta']);
});

test('texto que não é iCal, evento sem fim ou com data impossível: lista vazia, sem exceção', () => {
  const invalidos = [
    '',
    'um texto qualquer\nsem dois pontos',
    '<html><body>Entrar</body></html>',
    'END:VEVENT',
    calendario(['BEGIN:VEVENT', 'SUMMARY:Sem fim', 'DTSTART:20261116']),
    calendario(['BEGIN:VEVENT', 'SUMMARY:Fim errado', 'DTSTART:20261116', 'END:VCALENDAR']),
    calendario(['BEGIN:VTODO', 'SUMMARY:Tarefa', 'DTSTART:20261116', 'END:VTODO']),
    calendario(evento('SUMMARY:Sem data')),
    calendario(evento('SUMMARY:Mês 13', 'DTSTART:20261316')),
    calendario(evento('SUMMARY:30 de fevereiro', 'DTSTART:20260230')),
    calendario(evento('SUMMARY:Dia zero', 'DTSTART:20261100')),
    calendario(evento('SUMMARY:25 horas', 'DTSTART:20261116T250000')),
    calendario(evento('SUMMARY:61 minutos', 'DTSTART:20261116T106100')),
    calendario(evento('SUMMARY:Sem formato', 'DTSTART:16/11/2026')),
    calendario(evento('SUMMARY:Cancelado', 'DTSTART:20261116', 'STATUS: cancelled ')),
  ];
  for (const texto of invalidos) assert.deepEqual(ler(texto), [], texto);
});

test('entrada que não é texto, opções ausentes ou dia inválido: lista vazia', () => {
  const texto = calendario(evento('SUMMARY:Hoje', 'DTSTART:20261116'));
  for (const outro of [null, undefined, 42, {}, []]) assert.deepEqual(ler(outro), []);
  assert.deepEqual(lerIcal(texto), []);
  assert.deepEqual(lerIcal(texto, null), []);
  assert.deepEqual(lerIcal(texto, { de: '2026-02-30' }), []);
  assert.deepEqual(lerIcal(texto, { de: 20261116 }), []);
});

test('pareceIcal: só texto com a linha de abertura do calendário', () => {
  assert.equal(pareceIcal(calendario()), true);
  assert.equal(pareceIcal(String.fromCharCode(0xfeff).concat('begin:vcalendar \r\nEND:VCALENDAR')), true);
  assert.equal(pareceIcal('lixo\r\n BEGIN:VCALENDAR\r\n'), false);
  assert.equal(pareceIcal('<html>BEGIN:VCALENDAR</html>'), false);
  assert.equal(pareceIcal(''), false);
  assert.equal(pareceIcal({ data: 'BEGIN:VCALENDAR' }), false);
});

// ----------------------------------------------------------- vários dias

test('evento de dia inteiro com vários dias aparece em cada dia que ocupa dentro da janela', () => {
  const texto = calendario(
    // DTEND é o dia seguinte ao último: de 15 a 17.
    evento('SUMMARY:Congresso', 'DTSTART;VALUE=DATE:20261115', 'DTEND;VALUE=DATE:20261118'),
    evento('SUMMARY:Um dia', 'DTSTART:20261118', 'DTEND:20261119'),
    evento('SUMMARY:Fim igual ao início', 'DTSTART:20261119', 'DTEND:20261119'),
    evento('SUMMARY:Fim antes do início', 'DTSTART:20261120', 'DTEND:20261101'),
    evento('SUMMARY:Fim com hora', 'DTSTART:20261121', 'DTEND:20261123T100000'),
    evento('SUMMARY:Fim inválido', 'DTSTART:20261122', 'DTEND:amanhã'),
  );
  assert.deepEqual(resumo(ler(texto)), [
    '2026-11-16 dia Congresso',
    '2026-11-17 dia Congresso',
    '2026-11-18 dia Um dia',
    '2026-11-19 dia Fim igual ao início',
    '2026-11-20 dia Fim antes do início',
    '2026-11-21 dia Fim com hora',
    '2026-11-22 dia Fim inválido',
  ]);
});

test('evento com hora que termina em outro dia aparece só no dia em que começa', () => {
  const texto = calendario(evento('SUMMARY:Plantão', 'DTSTART:20261116T220000', 'DTEND:20261118T060000'));
  assert.deepEqual(resumo(ler(texto)), ['2026-11-16 22:00 Plantão']);
});

test('férias longas que começaram antes da janela ocupam a janela inteira', () => {
  const texto = calendario(evento('SUMMARY:Férias', 'DTSTART:20261101', 'DTEND:20261201'));
  assert.deepEqual(dias(ler(texto, HOJE, 3)), ['2026-11-16', '2026-11-17', '2026-11-18']);
});

// -------------------------------------------------------------- repetição

test('diária: todo dia, a cada N dias e a partir de um começo antigo', () => {
  const todoDia = calendario(evento('SUMMARY:Remédio', 'DTSTART:20200101T080000', 'RRULE:FREQ=DAILY'));
  assert.deepEqual(dias(ler(todoDia, HOJE, 3)), ['2026-11-16', '2026-11-17', '2026-11-18']);

  // De 3 em 3 dias desde 10/11: 10, 13, 16, 19, 22.
  const cadaTres = calendario(evento('SUMMARY:Regar', 'DTSTART:20261110', 'RRULE:FREQ=DAILY;INTERVAL=3'));
  assert.deepEqual(resumo(ler(cadaTres)), [
    '2026-11-16 dia Regar',
    '2026-11-19 dia Regar',
    '2026-11-22 dia Regar',
  ]);

  const futuro = calendario(evento('SUMMARY:Ainda não', 'DTSTART:20261118', 'RRULE:FREQ=DAILY'));
  assert.deepEqual(dias(ler(futuro, HOJE, 4)), ['2026-11-18', '2026-11-19']);
});

test('COUNT conta desde o início, mesmo quando o início é anterior à janela', () => {
  // Dez dias a partir de 10/11: o último é 19/11.
  const diaria = calendario(evento('SUMMARY:Curso', 'DTSTART:20261110T190000', 'RRULE:FREQ=DAILY;COUNT=10'));
  assert.deepEqual(dias(ler(diaria)), ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19']);

  const acabou = calendario(evento('SUMMARY:Já acabou', 'DTSTART:20261101', 'RRULE:FREQ=DAILY;COUNT=5'));
  assert.deepEqual(ler(acabou), []);
});

test('UNTIL: com data, com hora local e em UTC para evento em hora local', () => {
  const comData = calendario(evento('SUMMARY:A', 'DTSTART:20261110', 'RRULE:FREQ=DAILY;UNTIL=20261117'));
  assert.deepEqual(dias(ler(comData)), ['2026-11-16', '2026-11-17']);

  // O limite às 9h deixa de fora a ocorrência das 10h do mesmo dia.
  const comHora = calendario(
    evento('SUMMARY:B', 'DTSTART:20261110T100000', 'RRULE:FREQ=DAILY;UNTIL=20261117T090000'),
  );
  assert.deepEqual(dias(ler(comHora)), ['2026-11-16']);

  // O limite em UTC vale no relógio do aparelho: é ele que diz qual é o último dia.
  const emUtc = calendario(
    evento(
      'SUMMARY:C',
      'DTSTART;TZID=America/Sao_Paulo:20261110T235900',
      'RRULE:FREQ=DAILY;UNTIL=20261118T120000Z',
    ),
  );
  const ultimo = local(18, 12, 0) >= '2026-11-18 23:59' ? '2026-11-18' : '2026-11-17';
  assert.equal(dias(ler(emUtc)).at(-1), ultimo);
});

test('EXDATE tira ocorrências: data só, data e hora, várias linhas e lista com vírgula', () => {
  const texto = calendario(
    evento(
      'SUMMARY:Treino',
      'DTSTART:20261116T070000',
      'RRULE:FREQ=DAILY;COUNT=7',
      'EXDATE:20261117T070000,20261118T070000',
      'EXDATE;VALUE=DATE:20261120',
      'EXDATE:20261121T080000', // outro horário: não tira nada
      'EXDATE:lixo',
    ),
  );
  assert.deepEqual(dias(ler(texto)), ['2026-11-16', '2026-11-19', '2026-11-21', '2026-11-22']);
});

test('EXDATE em UTC: vale para evento em UTC e, convertido, para evento em hora local', () => {
  const emUtc = calendario(
    evento('SUMMARY:U', 'DTSTART:20261116T150000Z', 'RRULE:FREQ=DAILY;COUNT=3', 'EXDATE:20261117T150000Z'),
  );
  assert.deepEqual(resumo(ler(emUtc, '2026-11-15', 6)), [`${local(16, 15, 0)} U`, `${local(18, 15, 0)} U`]);

  // O evento local acontece na hora local que corresponde às 15h UTC; o EXDATE em UTC acerta nele.
  const [diaLocal, horaLocal] = local(16, 15, 0).split(' ');
  const inicio = `${diaLocal.replaceAll('-', '')}T${horaLocal.replace(':', '')}00`;
  const emLocal = calendario(
    evento('SUMMARY:L', `DTSTART:${inicio}`, 'RRULE:FREQ=DAILY;COUNT=3', 'EXDATE:20261117T150000Z'),
  );
  assert.equal(ler(emLocal, '2026-11-14', 8).length, 2);
});

test('repetição em UTC: cada ocorrência cai no dia local certo', () => {
  const texto = calendario(evento('SUMMARY:Chamada', 'DTSTART:20261110T013000Z', 'RRULE:FREQ=DAILY'));
  const esperado = [16, 17, 18]
    .map((dia) => local(dia, 1, 30))
    .filter((momento) => momento >= '2026-11-16' && momento < '2026-11-18');
  const lidos = resumo(ler(texto, HOJE, 2)).map((linha) => linha.replace(' Chamada', ''));
  // Em qualquer fuso, a janela de dois dias tem exatamente duas ocorrências diárias.
  assert.equal(lidos.length, 2);
  for (const momento of esperado) assert.ok(lidos.includes(momento), `${momento} em ${lidos}`);
});

test('semanal: sem BYDAY repete no dia da semana do início', () => {
  // 02/11/2026 é segunda.
  const texto = calendario(evento('SUMMARY:Aula', 'DTSTART:20261102T193000', 'RRULE:FREQ=WEEKLY'));
  assert.deepEqual(resumo(ler(texto, HOJE, 14)), ['2026-11-16 19:30 Aula', '2026-11-23 19:30 Aula']);
});

test('semanal com BYDAY: os dias escolhidos, sem repetir, e nada antes do início', () => {
  const texto = calendario(
    evento('SUMMARY:Academia', 'DTSTART:20261104T060000', 'RRULE:FREQ=WEEKLY;BYDAY=MO, WE,FR,MO'),
  );
  // Começa na quarta, 04/11: a segunda daquela semana (02/11) não conta.
  assert.deepEqual(dias(ler(texto, '2026-11-02', 7)), ['2026-11-04', '2026-11-06']);
  assert.deepEqual(dias(ler(texto)), ['2026-11-16', '2026-11-18', '2026-11-20']);
});

test('semanal com COUNT: a conta inclui a primeira semana, que pode ser incompleta', () => {
  // Quarta 04/11 e sexta 06/11 na primeira semana; depois seg, qua, sex. A 6a ocorrência é 16/11.
  const texto = calendario(
    evento('SUMMARY:Fisioterapia', 'DTSTART:20261104', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=6'),
  );
  assert.deepEqual(dias(ler(texto, '2026-11-09', 14)), [
    '2026-11-09',
    '2026-11-11',
    '2026-11-13',
    '2026-11-16',
  ]);
  // Com a janela na semana do início, a conta começa do zero.
  assert.deepEqual(dias(ler(texto, '2026-11-01', 7)), ['2026-11-04', '2026-11-06']);
});

test('semanal a cada duas semanas: WKST decide onde a semana vira', () => {
  // Início no domingo 01/11, aos domingos e segundas, de 2 em 2 semanas.
  const regra = 'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,MO';
  const semanaNaSegunda = calendario(evento('SUMMARY:S', 'DTSTART:20261101', regra));
  const semanaNoDomingo = calendario(evento('SUMMARY:D', 'DTSTART:20261101', `${regra};WKST=SU`));
  // Semana de segunda a domingo: 01/11 fecha uma semana; a seguinte ativa começa em 09/11.
  assert.deepEqual(dias(ler(semanaNaSegunda, '2026-11-01', 21)), ['2026-11-01', '2026-11-09', '2026-11-15']);
  // Semana de domingo a sábado: 01/11 e 02/11 estão na mesma semana.
  assert.deepEqual(dias(ler(semanaNoDomingo, '2026-11-01', 21)), [
    '2026-11-01',
    '2026-11-02',
    '2026-11-15',
    '2026-11-16',
  ]);
});

test('mensal: no dia do mês do início, pulando os meses que não têm esse dia', () => {
  const dia16 = calendario(evento('SUMMARY:Aluguel', 'DTSTART:20260116', 'RRULE:FREQ=MONTHLY'));
  assert.deepEqual(resumo(ler(dia16)), ['2026-11-16 dia Aluguel']);

  const dia31 = calendario(evento('SUMMARY:Fechamento', 'DTSTART:20260131T180000', 'RRULE:FREQ=MONTHLY'));
  assert.deepEqual(ler(dia31, '2026-11-01', 30), []); // novembro tem 30 dias
  assert.deepEqual(resumo(ler(dia31, '2026-12-25', 10)), ['2026-12-31 18:00 Fechamento']);

  const bimestral = calendario(evento('SUMMARY:Conta', 'DTSTART:20260816', 'RRULE:FREQ=MONTHLY;INTERVAL=2'));
  assert.deepEqual(ler(bimestral), []); // agosto, outubro, dezembro
  assert.deepEqual(dias(ler(bimestral, '2026-12-10', 10)), ['2026-12-16']);
});

test('mensal com COUNT: conta direta até o dia 28; do 29 em diante conta mês a mês', () => {
  // Dia 16, 11 vezes desde janeiro: a última é em novembro.
  const direto = (vezes) =>
    calendario(evento('SUMMARY:Parcela', 'DTSTART:20260116', `RRULE:FREQ=MONTHLY;COUNT=${vezes}`));
  assert.deepEqual(dias(ler(direto(11))), ['2026-11-16']);
  assert.deepEqual(ler(direto(10)), []);

  // Dia 31 desde janeiro de 2026: jan, mar, mai, jul, ago, out, dez. Dezembro é a 7a.
  const dia31 = (vezes) =>
    calendario(evento('SUMMARY:Balanço', 'DTSTART:20260131', `RRULE:FREQ=MONTHLY;COUNT=${vezes}`));
  assert.deepEqual(dias(ler(dia31(7), '2026-12-25', 10)), ['2026-12-31']);
  assert.deepEqual(ler(dia31(6), '2026-12-25', 10), []);
});

test('anual: aniversário todo ano, e 29 de fevereiro só em ano bissexto', () => {
  const aniversario = calendario(evento('SUMMARY:Aniversário', 'DTSTART:19901116', 'RRULE:FREQ=YEARLY'));
  assert.deepEqual(resumo(ler(aniversario)), ['2026-11-16 dia Aniversário']);

  const bienal = calendario(evento('SUMMARY:Bienal', 'DTSTART:20231116', 'RRULE:FREQ=YEARLY;INTERVAL=2'));
  assert.deepEqual(ler(bienal), []); // 2023, 2025, 2027
  assert.deepEqual(dias(ler(bienal, '2027-11-16', 1)), ['2027-11-16']);

  const bissexto = calendario(evento('SUMMARY:29/02', 'DTSTART:20240229', 'RRULE:FREQ=YEARLY'));
  assert.deepEqual(ler(bissexto, '2027-02-25', 10), []);
  assert.deepEqual(dias(ler(bissexto, '2028-02-25', 10)), ['2028-02-29']);
});

test('regra que o leitor não entende vira evento único na data de início', () => {
  const regras = [
    'FREQ=HOURLY',
    'FREQ=MONTHLY;BYDAY=2MO',
    'FREQ=MONTHLY;BYMONTHDAY=16',
    'FREQ=DAILY;BYDAY=MO',
    'FREQ=WEEKLY;BYDAY=XX',
    'FREQ=WEEKLY;BYDAY=',
    'FREQ=DAILY;INTERVAL=0',
    'FREQ=DAILY;INTERVAL=dois',
    'FREQ=DAILY;COUNT=0',
    'FREQ=DAILY;COUNT',
    'FREQ=DAILY;UNTIL=depois',
    'FREQ=WEEKLY;WKST=XX',
    'FREQ=DAILY; ;COUNT=3',
    'INTERVAL=2',
    '',
  ];
  for (const regra of regras) {
    const texto = calendario(evento('SUMMARY:Única', 'DTSTART:20261116T100000', `RRULE:${regra}`));
    assert.deepEqual(resumo(ler(texto)), ['2026-11-16 10:00 Única'], regra);
  }
  // Minúsculas e ";" sobrando no fim não atrapalham uma regra válida.
  const valida = calendario(evento('SUMMARY:V', 'DTSTART:20261116', 'RRULE:freq=daily;count=2;'));
  assert.deepEqual(dias(ler(valida)), ['2026-11-16', '2026-11-17']);
});

test('ocorrência alterada (RECURRENCE-ID) sai da série e entra como evento único', () => {
  const texto = calendario(
    evento('UID:aula', 'SUMMARY:Aula', 'DTSTART:20261102T193000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE'),
    // A de segunda, 16/11, foi para terça; a de quarta, 18/11, só mudou de nome.
    evento(
      'UID:aula',
      'SUMMARY:Aula (reposição)',
      'DTSTART:20261117T180000',
      'RECURRENCE-ID:20261116T193000',
    ),
    evento('UID:aula', 'SUMMARY:Prova', 'DTSTART:20261118T193000', 'RECURRENCE-ID:20261118T193000'),
    // Outra série, sem alteração: fica inteira.
    evento('UID:outra', 'SUMMARY:Inglês', 'DTSTART:20261102T080000', 'RRULE:FREQ=WEEKLY'),
  );
  assert.deepEqual(resumo(ler(texto, HOJE, 4)), [
    '2026-11-16 08:00 Inglês',
    '2026-11-17 18:00 Aula (reposição)',
    '2026-11-18 19:30 Prova',
  ]);
});

// ----------------------------------------------------------------- limites

test('o teto corta as ocorrências mais distantes; teto e janela inválidos caem no padrão', () => {
  const texto = calendario(evento('SUMMARY:Todo dia', 'DTSTART:20200101', 'RRULE:FREQ=DAILY'));
  assert.deepEqual(dias(lerIcal(texto, { de: HOJE, dias: 30, teto: 2 })), ['2026-11-16', '2026-11-17']);
  assert.deepEqual(lerIcal(texto, { de: HOJE, dias: 30, teto: 0 }), []);
  assert.equal(lerIcal(texto, { de: HOJE, dias: 30, teto: -1 }).length, 30);
  assert.equal(lerIcal(texto, { de: HOJE, dias: 30, teto: 'muitos' }).length, 30);

  // Janela: sem "dias" ou com valor inválido, um dia; acima do máximo, o máximo.
  assert.equal(lerIcal(texto, { de: HOJE }).length, 1);
  assert.equal(lerIcal(texto, { de: HOJE, dias: 0 }).length, 1);
  assert.equal(lerIcal(texto, { de: HOJE, dias: 2.5 }).length, 1);
  assert.equal(lerIcal(texto, { de: HOJE, dias: 100_000, teto: 1000 }).length, MAXIMO_DE_DIAS);

  const muitos = calendario(
    ...Array.from({ length: 300 }, (_, i) => evento(`SUMMARY:E${i}`, 'DTSTART:20261116')),
  );
  assert.equal(ler(muitos).length, TETO_DE_OCORRENCIAS);
});

test('lê no máximo MAXIMO_DE_EVENTOS eventos de um texto', () => {
  const um = evento('SUMMARY:E', 'DTSTART:20261116');
  const texto = calendario(...Array.from({ length: MAXIMO_DE_EVENTOS + 5 }, () => um));
  assert.equal(lerIcal(texto, { de: HOJE, teto: MAXIMO_DE_EVENTOS * 2 }).length, MAXIMO_DE_EVENTOS);
});

test('o orçamento de passos limita as repetições que só dão para contar uma a uma', () => {
  // Dia 31 desde o ano 1, com COUNT: até o ano 9000 são quase 108 mil meses por evento.
  const pesado = evento('SUMMARY:Pesado', 'DTSTART:00010131', 'RRULE:FREQ=MONTHLY;COUNT=999999999');
  const mesesPorEvento = 8999 * 12 + 1;
  const cabem = Math.floor(ORCAMENTO_DE_PASSOS / mesesPorEvento);
  const texto = calendario(...Array.from({ length: cabem + 3 }, () => pesado));
  const lidos = lerIcal(texto, { de: '9000-01-31', dias: 1 });
  assert.equal(lidos.length, cabem);
  assert.deepEqual(lidos[0], { uid: '', titulo: 'Pesado', dia: '9000-01-31', hora: null });
});
