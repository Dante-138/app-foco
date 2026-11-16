// Testes por propriedade da agenda e do clima (ver propriedades.test.js para a ideia geral).
// O que vem da rede e o que estava guardado é de origem não confiável: o leitor de iCal, o
// leitor do clima e o saneador não podem lançar exceção com entrada nenhuma, e a lista de
// destinos não pode aceitar host de fora dela, por mais torto que seja o endereço.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { dataValida, horaValida, somaDias } from '../../www/js/nucleo/datas.js';
import { MAXIMO_DE_DIAS, lerIcal } from '../../www/js/nucleo/ical.js';
import { lerClima, linhaDoClima, sanearClima } from '../../www/js/nucleo/clima.js';
import {
  EVENTOS_POR_CALENDARIO,
  HOSTS_PERMITIDOS,
  LIMITES_DA_REDE,
  MAXIMO_DE_CALENDARIOS,
  SUFIXO_PERMITIDO,
  destinoDoRedirecionamento,
  destinoPermitido,
  hostDe,
  lerRedeSalva,
  sanearRede,
} from '../../www/js/nucleo/rede.js';
import { agendaDoDia, eventosDoCalendario } from '../../www/js/nucleo/agenda.js';

const DIA = '2026-11-16';
const OPCOES = { seed: 20261116, numRuns: 500 };
const MINIMO_COM_CONTEUDO = 0.1; // parte mínima do que é gerado que precisa exercitar cada caso

const GOOGLE = 'https://calendar.google.com/calendar/ical/exemplo/basic.ics';
const BLACKBOARD = 'https://exemplo.blackboard.com/webapps/calendar/calendarFeed/exemplo/learn.ics';

const talvez = (certo) => fc.oneof({ weight: 9, arbitrary: certo }, { weight: 1, arbitrary: fc.jsonValue() });
const registro = (campos) => fc.record(campos, { requiredKeys: [] });
const curto = fc.string({ minLength: 1, maxLength: 12 });
const doisDigitos = (n) => String(n).padStart(2, '0');
const parte = (amostra, condicao) => amostra.filter(condicao).length / amostra.length;

// ------------------------------------------------------------------- iCal
// Eventos em volta de novembro de 2026, com datas às vezes impossíveis (31/02, 25h) e regras
// de repetição às vezes sem sentido.

const dataIcal = fc
  .tuple(
    fc.constantFrom(2024, 2026, 2026, 2026, 2026, 2027),
    fc.constantFrom(1, 2, 10, 11, 11, 11, 11, 12, 13),
    fc.integer({ min: 0, max: 31 }),
  )
  .map(([ano, mes, dia]) => `${ano}${doisDigitos(mes)}${doisDigitos(dia)}`);
const horaIcal = fc
  .tuple(fc.integer({ min: 0, max: 24 }), fc.integer({ min: 0, max: 60 }), fc.constantFrom('', '', 'Z'))
  .map(([hora, minuto, utc]) => `T${doisDigitos(hora)}${doisDigitos(minuto)}00${utc}`);
const momentoIcal = fc.tuple(dataIcal, fc.option(horaIcal)).map(([data, hora]) => data + (hora ?? ''));
const diasDaSemana = fc
  .subarray(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU', '2MO', 'XX'], { minLength: 1 })
  .map((codigos) => codigos.join(','));
const emTexto = (campos) =>
  Object.entries(campos)
    .map(([chave, valor]) => `${chave}=${valor}`)
    .join(';');
// Três em cada quatro regras são das que o leitor entende; a outra tem de tudo.
const regraIcal = fc.oneof(
  {
    weight: 3,
    arbitrary: registro({
      FREQ: fc.constantFrom('DAILY', 'WEEKLY'),
      INTERVAL: fc.integer({ min: 1, max: 3 }),
      COUNT: fc.integer({ min: 2, max: 60 }),
    }).map((campos) => emTexto({ FREQ: 'DAILY', ...campos })),
  },
  {
    weight: 1,
    arbitrary: registro({
      FREQ: fc.constantFrom('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'HOURLY'),
      INTERVAL: fc.integer({ min: -1, max: 40 }),
      COUNT: fc.integer({ min: 0, max: 400 }),
      UNTIL: momentoIcal,
      BYDAY: diasDaSemana,
      WKST: fc.constantFrom('MO', 'SU', 'XX'),
      BYMONTHDAY: fc.integer({ min: 1, max: 31 }),
    }).map(emTexto),
  },
);
// null = o evento não tem a propriedade.
const comum = (certo) => fc.option(certo, { freq: 3 });
const raro = (certo) =>
  fc.oneof({ weight: 7, arbitrary: fc.constant(null) }, { weight: 1, arbitrary: certo });
const eventoIcal = fc
  .record({
    DTSTART: momentoIcal,
    DTEND: comum(momentoIcal),
    SUMMARY: comum(fc.string({ maxLength: 30 })),
    UID: comum(fc.constantFrom('a', 'b', 'c')),
    RRULE: comum(regraIcal),
    EXDATE: raro(fc.array(momentoIcal, { minLength: 1, maxLength: 3 }).map((datas) => datas.join(','))),
    'RECURRENCE-ID': raro(momentoIcal),
    STATUS: raro(fc.constantFrom('CONFIRMED', 'CANCELLED')),
  })
  .map((campos) => [
    'BEGIN:VEVENT',
    ...Object.entries(campos)
      .filter(([, valor]) => valor !== null)
      .map(([nome, valor]) => `${nome}:${valor}`),
    'END:VEVENT',
  ]);
const textoIcal = fc
  .array(eventoIcal, { maxLength: 6 })
  .map((eventos) => ['BEGIN:VCALENDAR', ...eventos.flat(), 'END:VCALENDAR'].join('\r\n'));

const janelaGerada = fc.record({
  de: fc.integer({ min: -40, max: 40 }).map((n) => somaDias(DIA, n)),
  dias: fc.integer({ min: 1, max: MAXIMO_DE_DIAS }),
  teto: fc.integer({ min: 0, max: 60 }),
});

test('propriedade: o leitor de iCal nunca lança exceção, seja qual for o texto e a janela', () => {
  const texto = fc.oneof(
    fc.string(),
    fc.string({ unit: 'binary' }),
    fc.json(),
    textoIcal,
    // Um calendário válido picado em qualquer ponto, ou com as linhas embaralhadas.
    fc.tuple(textoIcal, fc.nat()).map(([valido, corte]) => valido.slice(0, corte % (valido.length + 1))),
    textoIcal.chain((valido) => fc.shuffledSubarray(valido.split('\r\n')).map((linhas) => linhas.join('\n'))),
  );
  const opcoes = fc.oneof(janelaGerada, fc.jsonValue());
  fc.assert(
    fc.property(texto, opcoes, (bruto, janela) => {
      assert.ok(Array.isArray(lerIcal(bruto, janela)));
    }),
    OPCOES,
  );
});

test('propriedade: as ocorrências saem dentro da janela, em ordem e sem passar do teto', () => {
  fc.assert(
    fc.property(textoIcal, janelaGerada, (texto, janela) => {
      const ocorrencias = lerIcal(texto, janela);
      const ultimoDia = somaDias(janela.de, janela.dias - 1);
      assert.ok(
        ocorrencias.length <= janela.teto,
        `${ocorrencias.length} ocorrências com teto ${janela.teto}`,
      );

      for (const { uid, titulo, dia, hora } of ocorrencias) {
        assert.ok(
          dataValida(dia) && dia >= janela.de && dia <= ultimoDia,
          `${dia} fora de ${janela.de}..${ultimoDia}`,
        );
        assert.ok(hora === null || horaValida(hora), `hora ${hora}`);
        assert.ok(
          titulo.length > 0 && titulo.length <= LIMITES_DA_REDE.tituloEvento && titulo === titulo.trim(),
        );
        assert.equal(typeof uid, 'string');
      }
      const momentos = ocorrencias.map((o) => `${o.dia} ${o.hora ?? ''}`);
      assert.deepEqual(momentos, [...momentos].sort());

      // Uma janela maior, com teto folgado, contém tudo o que a menor devolveu sem corte.
      if (ocorrencias.length < janela.teto) {
        const maior = lerIcal(texto, { ...janela, dias: MAXIMO_DE_DIAS, teto: 100_000 });
        for (const ocorrencia of ocorrencias) {
          assert.ok(
            maior.some(
              (o) => o.dia === ocorrencia.dia && o.hora === ocorrencia.hora && o.titulo === ocorrencia.titulo,
            ),
          );
        }
      }
    }),
    OPCOES,
  );
});

test('o gerador de iCal produz eventos que aparecem, repetições e janelas vazias', () => {
  const amostra = fc.sample(textoIcal, { seed: OPCOES.seed, numRuns: 400 });
  const mes = (texto) => lerIcal(texto, { de: '2026-11-01', dias: 30, teto: 100_000 });
  const partes = {
    'com ocorrência no mês': parte(amostra, (texto) => mes(texto).length > 0),
    'com evento em três dias ou mais (repetição ou vários dias)': parte(amostra, (texto) => {
      const lidas = mes(texto);
      return lidas.some(
        (o) => lidas.filter((outra) => outra.uid === o.uid && outra.titulo === o.titulo).length >= 3,
      );
    }),
    'com evento de hora marcada': parte(amostra, (texto) => mes(texto).some((o) => o.hora !== null)),
    'sem nada no mês': parte(amostra, (texto) => mes(texto).length === 0),
  };
  if (process.env.MOSTRAR_GERADOR) console.log(partes);
  for (const [nome, valor] of Object.entries(partes)) {
    assert.ok(valor >= MINIMO_COM_CONTEUDO, `${nome}: só ${Math.round(valor * 100)}% dos textos gerados`);
  }
});

// --------------------------------------------------------------- destinos
// Endereços montados peça por peça, com as peças que costumam enganar um leitor de endereço:
// usuário e senha, porta, host parecido, barra invertida, "#", "?" e espaço.

const hostDaLista = fc.constantFrom(...HOSTS_PERMITIDOS, 'exemplo.blackboard.com', 'a.b-c.blackboard.com');
const hostDeFora = fc.oneof(
  fc.domain(),
  fc.constantFrom(
    'evil.example',
    'blackboard.com',
    'evilblackboard.com',
    'calendar.google.com.evil.example',
    'api.open-meteo.com.evil.example',
    'google.com',
    'localhost',
    '127.0.0.1',
    '[::1]',
    'calendar.google.com.',
    '.blackboard.com',
  ),
);
const separador = fc.constantFrom('@', '#', '?', '/', '\\', '.', '%2f', '%00', '%40', ' ', ':', '\t', '\n');
const host = fc.oneof(
  { weight: 5, arbitrary: hostDaLista },
  { weight: 2, arbitrary: hostDeFora },
  // Um host de cada lado de um separador: quem lê errado pega o lado errado.
  {
    weight: 4,
    arbitrary: fc
      .tuple(hostDaLista, separador, hostDeFora, fc.boolean())
      .map(([dentro, meio, fora, inverte]) => (inverte ? fora + meio + dentro : dentro + meio + fora)),
  },
);
const enderecoComTruque = fc
  .tuple(
    fc.constantFrom(
      'https://',
      'https://',
      'https://',
      'https://',
      'HTTPS://',
      'http://',
      'https:/',
      'https:',
      '//',
      '',
    ),
    fc.constantFrom('', '', '', '', 'u@', 'u:s@', 'calendar.google.com@', 'calendar.google.com:x@'),
    host,
    fc.constantFrom('', '', '', '', ':443', ':8443', ':'),
    fc.constantFrom(
      '',
      '/',
      '/calendar/ical/exemplo/basic.ics',
      '/v1/forecast?a=1&b=x,y&c=America%2FSao_Paulo',
      '/x#y',
      '/@evil.example',
      '/x y',
      '/x\\y',
      '?x=1',
      '#x',
      '/x%0d%0aHost:%20evil.example',
    ),
  )
  .map((pecas) => pecas.join(''));
// Endereços como os de verdade: um host da lista e um caminho comum.
const enderecoComum = fc
  .tuple(
    hostDaLista,
    fc.constantFrom(
      '',
      '/',
      '/calendar/ical/exemplo/basic.ics',
      '/v1/forecast?a=1&b=x,y&c=America%2FSao_Paulo',
    ),
  )
  .map(([nome, caminho]) => `https://${nome}${caminho}`);
const endereco = fc.oneof(
  { weight: 6, arbitrary: enderecoComTruque },
  { weight: 2, arbitrary: enderecoComum },
  { weight: 1, arbitrary: fc.webUrl({ withQueryParameters: true, withFragments: true }) },
  { weight: 1, arbitrary: fc.string() },
  { weight: 1, arbitrary: fc.jsonValue() },
);

const naLista = (nome) => HOSTS_PERMITIDOS.includes(nome) || nome.endsWith(SUFIXO_PERMITIDO);

// O que tem de valer para todo endereço aceito: o leitor de endereços do padrão da web enxerga
// https e um host da lista, sem usuário, senha, porta nem fragmento; e o texto não tem nenhum
// caractere que outro leitor (o do Android) pudesse entender de outro jeito.
function conferirAceito(url) {
  const lida = new URL(url);
  assert.equal(lida.protocol, 'https:');
  assert.ok(naLista(lida.hostname), `host ${lida.hostname} em ${url}`);
  assert.deepEqual([lida.username, lida.password, lida.port, lida.hash], ['', '', '', '']);
  assert.equal(hostDe(url), lida.hostname);
  assert.equal(url.slice('https://'.length).split('/')[0].toLowerCase(), lida.hostname);
  assert.ok(!/[\s\\@#]/.test(url), url);
}

test('propriedade: destinoPermitido nunca aceita host fora da lista, nem com truque no endereço', () => {
  fc.assert(
    fc.property(endereco, (url) => {
      const aceito = destinoPermitido(url);
      assert.equal(typeof aceito, 'boolean');
      if (aceito) conferirAceito(url);
    }),
    { ...OPCOES, numRuns: 3000 },
  );
});

test('propriedade: um redirecionamento só leva a destino da lista', () => {
  const resposta = fc.record({
    status: fc.constantFrom(200, 301, 302, 303, 307, 308, 404),
    headers: talvez(
      fc.dictionary(
        fc.constantFrom('Location', 'location', 'Content-Type'),
        fc.oneof(endereco, fc.constant('/novo.ics')),
      ),
    ),
  });
  fc.assert(
    fc.property(
      fc.oneof(resposta, fc.jsonValue()),
      fc.oneof(endereco, fc.constant(GOOGLE)),
      (lida, origem) => {
        const destino = destinoDoRedirecionamento(lida, origem);
        if (destino !== null) conferirAceito(destino);
      },
    ),
    { ...OPCOES, numRuns: 2000 },
  );
});

test('o gerador de endereços produz aceitos e recusados, com e sem truque', () => {
  const amostra = fc.sample(endereco, { seed: OPCOES.seed, numRuns: 2000 });
  const textos = amostra.filter((url) => typeof url === 'string');
  const partes = {
    aceitos: parte(amostra, destinoPermitido),
    'recusados com um host da lista no texto': parte(
      textos,
      (url) => !destinoPermitido(url) && HOSTS_PERMITIDOS.some((nome) => url.includes(nome)),
    ),
    'recusados que o leitor da web aceitaria com host da lista': parte(textos, (url) => {
      if (destinoPermitido(url) || !URL.canParse(url)) return false;
      return naLista(new URL(url).hostname);
    }),
  };
  if (process.env.MOSTRAR_GERADOR) console.log(partes);
  for (const [nome, valor] of Object.entries(partes)) {
    assert.ok(valor >= MINIMO_COM_CONTEUDO, `${nome}: só ${Math.round(valor * 100)}% dos endereços gerados`);
  }
});

// ------------------------------------------------------------------ clima

// Aqui o valor estranho é mais raro (um em vinte): a resposta só vale com todos os campos certos.
const quase = (certo) => fc.oneof({ weight: 19, arbitrary: certo }, { weight: 1, arbitrary: fc.jsonValue() });
const temperatura = fc.oneof(
  { weight: 9, arbitrary: fc.double({ min: -40, max: 45, noNaN: true }) },
  { weight: 1, arbitrary: fc.double() },
);
const chuva = fc.option(fc.integer({ min: -5, max: 105 }));
const diaQualquer = fc.constantFrom(
  DIA,
  DIA,
  DIA,
  '2026-11-17',
  '2026-11-17',
  '2026-11-18',
  '2026-02-30',
  'hoje',
);
const dois = (certo) => fc.array(quase(certo), { minLength: 2, maxLength: 3 });
const respostaDoClima = fc.record({
  current: quase(fc.record({ temperature_2m: quase(temperatura) })),
  daily: quase(
    fc.record({
      time: quase(dois(diaQualquer)),
      temperature_2m_min: quase(dois(temperatura)),
      temperature_2m_max: quase(dois(temperatura)),
      precipitation_probability_max: quase(dois(chuva)),
    }),
  ),
});
const climaGuardado = fc.record({
  atual: quase(temperatura),
  dias: quase(
    fc.array(
      fc.record({
        dia: quase(diaQualquer),
        minima: quase(temperatura),
        maxima: quase(temperatura),
        chuva: quase(chuva),
      }),
      { minLength: 1, maxLength: 2 },
    ),
  ),
});

test('propriedade: ler o clima nunca lança exceção; o que sai é nulo ou está no formato guardado', () => {
  const entrada = fc.oneof(
    { weight: 3, arbitrary: respostaDoClima },
    { weight: 3, arbitrary: respostaDoClima.map((dados) => JSON.stringify(dados)) },
    { weight: 1, arbitrary: fc.jsonValue() },
    { weight: 1, arbitrary: fc.string() },
  );
  const lidos = [];
  fc.assert(
    fc.property(entrada, diaQualquer, fc.boolean(), (resposta, dia, comAtual) => {
      const clima = lerClima(resposta);
      lidos.push(clima);
      const linha = linhaDoClima(clima, dia, comAtual);
      if (clima === null) {
        assert.equal(linha, null);
        return;
      }
      assert.deepEqual(sanearClima(clima), clima);
      assert.ok(clima.dias.length >= 1 && clima.dias.length <= 2);
      assert.match(
        linhaDoClima(clima, clima.dias[0].dia, comAtual),
        /^São Paulo · (-?\d+° agora · )?-?\d+° a -?\d+°/,
      );
    }),
    OPCOES,
  );
  const validas = parte(lidos, (clima) => clima !== null);
  if (process.env.MOSTRAR_GERADOR) console.log({ 'respostas de clima válidas': validas });
  assert.ok(
    validas >= MINIMO_COM_CONTEUDO,
    `só ${Math.round(validas * 100)}% das respostas geradas são válidas`,
  );
});

// ----------------------------------------------------------- armazenamento

const id = fc.oneof(
  { weight: 6, arbitrary: fc.constantFrom('a', 'b', 'c', 'd') },
  { weight: 1, arbitrary: curto },
);
// As chaves vêm sempre; o que varia é o valor. Com chave faltando ao acaso, quase nenhum
// calendário gerado seria válido (chave ausente fica com os testes de unidade).
const calendarioRuim = fc.record({
  id: talvez(id),
  nome: talvez(curto),
  url: talvez(
    fc.oneof(
      { weight: 3, arbitrary: fc.constantFrom(GOOGLE, BLACKBOARD) },
      { weight: 1, arbitrary: enderecoComTruque },
    ),
  ),
});
const eventoRuim = fc.record({
  calendarioId: talvez(id),
  titulo: talvez(curto),
  dia: talvez(diaQualquer),
  hora: talvez(fc.constantFrom('06:30', '23:59', null, null, '24:00', '7:5')),
});
const instante = talvez(fc.oneof(fc.integer({ min: -5, max: 2_000_000_000_000 }), fc.double()));
const redeRuim = fc.record({
  clima: talvez(fc.boolean()),
  calendarios: talvez(fc.array(calendarioRuim, { maxLength: 8 })),
  cache: talvez(
    fc.record({
      agenda: talvez(fc.record({ em: instante, eventos: talvez(fc.array(eventoRuim, { maxLength: 8 })) })),
      clima: talvez(fc.record({ em: instante, dados: talvez(climaGuardado) })),
    }),
  ),
});

function conferirFormato(rede) {
  assert.equal(typeof rede.clima, 'boolean');
  assert.ok(rede.calendarios.length <= MAXIMO_DE_CALENDARIOS);
  const ids = rede.calendarios.map((calendario) => calendario.id);
  assert.equal(new Set(ids).size, ids.length, 'id de calendário repetido');
  for (const calendario of rede.calendarios) {
    assert.deepEqual(Object.keys(calendario), ['id', 'nome', 'url']);
    assert.ok(calendario.nome.length > 0 && calendario.nome.length <= LIMITES_DA_REDE.nomeCalendario);
    conferirAceito(calendario.url);
  }
  const { agenda, clima } = rede.cache;
  assert.ok(Number.isFinite(agenda.em) && agenda.em >= 0 && Number.isFinite(clima.em) && clima.em >= 0);
  assert.ok(agenda.eventos.length <= MAXIMO_DE_CALENDARIOS * EVENTOS_POR_CALENDARIO);
  for (const evento of agenda.eventos) {
    assert.ok(ids.includes(evento.calendarioId), 'evento de calendário que não existe');
    assert.ok(evento.titulo.length > 0 && dataValida(evento.dia));
    assert.ok(evento.hora === null || horaValida(evento.hora));
  }
  if (clima.dados === null) assert.equal(clima.em, 0);
  else assert.deepEqual(sanearClima(clima.dados), clima.dados);
}

test('propriedade: o saneador da rede nunca lança exceção, impõe o formato e é estável', () => {
  const lidas = [];
  fc.assert(
    fc.property(
      fc.oneof({ weight: 5, arbitrary: redeRuim }, { weight: 1, arbitrary: fc.jsonValue() }),
      (dados) => {
        const rede = sanearRede(dados);
        lidas.push(rede);
        conferirFormato(rede);
        assert.deepEqual(sanearRede(rede), rede);
        // Gravar e ler de volta não muda nada (fora o -0, que o JSON guarda como 0).
        const texto = JSON.stringify(rede);
        assert.equal(JSON.stringify(lerRedeSalva(texto)), texto);
      },
    ),
    OPCOES,
  );
  // Se o saneador passar a descartar quase tudo, a propriedade acima passa sem provar nada.
  const partes = {
    'com calendário': parte(lidas, (rede) => rede.calendarios.length > 0),
    'com evento no cache': parte(lidas, (rede) => rede.cache.agenda.eventos.length > 0),
    'com clima no cache': parte(lidas, (rede) => rede.cache.clima.dados !== null),
  };
  if (process.env.MOSTRAR_GERADOR) console.log(partes);
  for (const [nome, valor] of Object.entries(partes)) {
    assert.ok(valor >= MINIMO_COM_CONTEUDO, `${nome}: só ${Math.round(valor * 100)}% das redes geradas`);
  }
});

test('propriedade: ler a rede guardada nunca lança exceção, seja qual for o texto', () => {
  fc.assert(
    fc.property(fc.oneof(fc.string(), fc.json(), fc.constant(null)), (bruto) => {
      conferirFormato(lerRedeSalva(bruto));
    }),
    OPCOES,
  );
});

// ----------------------------------------------------------------- agenda

test('propriedade: do iCal ao Painel, os eventos passam pelo saneador e saem do dia certo, em ordem', () => {
  fc.assert(
    fc.property(textoIcal, (texto) => {
      const eventos = eventosDoCalendario(texto, 'c1', DIA);
      assert.ok(eventos.length <= EVENTOS_POR_CALENDARIO);
      const calendarios = [{ id: 'c1', nome: 'Pessoal', url: GOOGLE }];
      const rede = sanearRede({ calendarios, cache: { agenda: { em: 1, eventos } } });
      assert.deepEqual(rede.cache.agenda.eventos, eventos);

      const { hoje, amanha } = agendaDoDia(eventos, calendarios, DIA);
      assert.equal(hoje.length, eventos.filter((e) => e.dia === DIA).length);
      assert.equal(amanha.length, eventos.filter((e) => e.dia === somaDias(DIA, 1)).length);
      for (const lista of [hoje, amanha]) {
        const horas = lista.map((e) => e.hora ?? '');
        assert.deepEqual(horas, [...horas].sort());
        assert.ok(lista.every((e) => e.calendario === 'Pessoal'));
      }
    }),
    OPCOES,
  );
});
