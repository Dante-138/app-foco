// Leitor de iCal (RFC 5545): só o que a agenda do Painel precisa. Lógica pura.
//
// lerIcal(texto, { de, dias, teto }) devolve as ocorrências dos eventos (VEVENT) que caem na
// janela pedida, de "de" (AAAA-MM-DD) por "dias" dias, em ordem e no máximo "teto":
//   [{ uid, titulo, dia: 'AAAA-MM-DD', hora: 'HH:MM' | null }]   (hora null = dia inteiro)
//
// O que ele entende:
// - linhas dobradas e escapes de texto. Os parâmetros são ignorados: o formato do valor já diz
//   se é data só, data e hora local (com ou sem TZID, vale o relógio do aparelho) ou UTC (com Z,
//   convertido para o fuso do aparelho);
// - evento de dia inteiro com DTEND em outro dia: uma ocorrência por dia que ele ocupa. Evento
//   com hora aparece só no dia em que começa;
// - RRULE com FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, INTERVAL, BYDAY (no semanal), UNTIL, COUNT e
//   WKST, e EXDATE. Regra com qualquer outra coisa vira evento único na data de início;
// - RECURRENCE-ID: a ocorrência alterada entra como evento único e sai da série original;
// - STATUS:CANCELLED: o evento fica de fora.
//
// Nunca lança exceção: texto que não é iCal devolve lista vazia. E nunca trava: a janela, o
// número de eventos lidos e os passos das repetições têm teto.

import { dataValida } from './datas.js';

export const TETO_DE_OCORRENCIAS = 200;
export const MAXIMO_DE_DIAS = 60; // tamanho máximo da janela
export const MAXIMO_DE_EVENTOS = 20_000; // VEVENTs lidos de um texto
// Períodos (dias, semanas ou meses) que as repetições de um texto inteiro podem percorrer.
export const ORCAMENTO_DE_PASSOS = 1_000_000;
export const SEM_TITULO = 'Sem título';

const DURACAO_MAXIMA = 366; // dias de um evento de dia inteiro
const TAMANHO_DO_TITULO = 200;
const MS_DO_DIA = 86_400_000;
const MINUTOS_DO_DIA = 1440;
const DIAS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']; // na ordem de Date.getDay
const FREQUENCIAS = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
const CHAVES_DA_REGRA = new Set(['FREQ', 'INTERVAL', 'BYDAY', 'UNTIL', 'COUNT', 'WKST']);
const GUARDADAS = new Set([
  'UID',
  'SUMMARY',
  'DTSTART',
  'DTEND',
  'RRULE',
  'EXDATE',
  'RECURRENCE-ID',
  'STATUS',
]);
const FORMATO_MOMENTO = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})\d{2}(Z?))?$/;

// ------------------------------------------------------------- calendário
// Número do dia: dias corridos desde 01/01/1970 no calendário, sem fuso. Com ele a conta entre
// datas é soma de inteiros e não depende do relógio do aparelho.

const numeroDoDia = (ano, mes, dia) => new Date(0).setUTCFullYear(ano, mes - 1, dia) / MS_DO_DIA;
const dataDoNumero = (numero) => new Date(numero * MS_DO_DIA);
const diaDaSemana = (numero) => dataDoNumero(numero).getUTCDay();
const doisDigitos = (n) => String(n).padStart(2, '0');
const resto = (a, n) => ((a % n) + n) % n; // sempre de 0 a n - 1, também com "a" negativo
const comparar = (a, b) => (a < b ? -1 : Number(a > b));

function isoDoNumero(numero) {
  const data = dataDoNumero(numero);
  const ano = String(data.getUTCFullYear()).padStart(4, '0');
  return `${ano}-${doisDigitos(data.getUTCMonth() + 1)}-${doisDigitos(data.getUTCDate())}`;
}

// Lê "AAAAMMDD" ou "AAAAMMDDTHHMMSS", com ou sem Z. Devolve o momento
// { dia: número do dia, minuto: minutos desde 0h | null (data só), utc } ou null.
function lerMomento(valor) {
  const partes = FORMATO_MOMENTO.exec(valor.trim());
  if (!partes) return null;
  const [ano, mes, dia] = [partes[1], partes[2], partes[3]].map(Number);
  const numero = numeroDoDia(ano, mes, dia);
  const conferida = dataDoNumero(numero);
  // 30 de fevereiro e mês 13 mudam de data na ida e volta: não existem.
  if (conferida.getUTCMonth() + 1 !== mes || conferida.getUTCDate() !== dia) return null;
  if (partes[4] === undefined) return { dia: numero, minuto: null, utc: false };
  const [hora, minuto] = [Number(partes[4]), Number(partes[5])];
  if (hora > 23 || minuto > 59) return null;
  return { dia: numero, minuto: hora * 60 + minuto, utc: partes[6] === 'Z' };
}

// Momento em UTC visto no relógio do aparelho.
function paraLocal(momento) {
  const data = new Date(momento.dia * MS_DO_DIA + momento.minuto * 60_000);
  return {
    dia: numeroDoDia(data.getFullYear(), data.getMonth() + 1, data.getDate()),
    minuto: data.getHours() * 60 + data.getMinutes(),
    utc: false,
  };
}

// UNTIL e EXDATE costumam vir em UTC mesmo quando o evento é em hora local: para comparar com
// as ocorrências, o momento passa para o mesmo relógio do início do evento.
const noRelogioDe = (inicio, momento) => (momento.utc && !inicio.utc ? paraLocal(momento) : momento);

// ------------------------------------------------------------------ texto

// Junta as linhas dobradas (a continuação começa com espaço ou tabulação).
function desdobrar(texto) {
  return texto
    .replace(/\r\n?/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n');
}

// "NOME;PARAMETRO=valor:conteúdo" vira { nome, valor }. O valor começa no primeiro ":" fora de
// aspas (um parâmetro entre aspas pode ter ":", como TZID="GMT-03:00").
function propriedade(linha) {
  let aspas = false;
  for (let i = 0; i < linha.length; i += 1) {
    if (linha[i] === '"') aspas = !aspas;
    else if (linha[i] === ':' && !aspas) {
      return { nome: linha.slice(0, i).split(';')[0].trim().toUpperCase(), valor: linha.slice(i + 1) };
    }
  }
  return null;
}

// Desfaz os escapes do tipo TEXT: \n vira quebra de linha; \, \; e \\ viram o próprio caractere.
export function desfazerEscapes(texto) {
  return texto.replace(/\\([\\;,nN])/g, (_, caractere) =>
    caractere.toLowerCase() === 'n' ? '\n' : caractere,
  );
}

function titulo(resumo) {
  return desfazerEscapes(resumo).replace(/\s+/g, ' ').trim().slice(0, TAMANHO_DO_TITULO).trim() || SEM_TITULO;
}

// O texto tem cara de calendário? Página de erro ou de login respondida no lugar do feed não tem.
export function pareceIcal(texto) {
  // trimStart tira também a marca de ordem de bytes que alguns servidores põem no começo.
  return typeof texto === 'string' && /^BEGIN:VCALENDAR[ \t]*$/im.test(texto.trimStart());
}

// Os VEVENT do texto: de cada um, um Map do nome da propriedade para os valores dela.
// O que vem dentro de outro componente do evento (um VALARM, por exemplo) é ignorado.
function blocosDeEvento(texto) {
  const blocos = [];
  let atual = null;
  let aninhado = 0;
  for (const linha of desdobrar(texto)) {
    if (blocos.length === MAXIMO_DE_EVENTOS) break;
    const lida = propriedade(linha);
    if (!lida) continue;
    const componente = lida.valor.trim().toUpperCase();
    if (lida.nome === 'BEGIN') {
      if (atual) aninhado += 1;
      else if (componente === 'VEVENT') atual = new Map();
    } else if (lida.nome === 'END') {
      if (aninhado) aninhado -= 1;
      else if (atual && componente === 'VEVENT') {
        blocos.push(atual);
        atual = null;
      }
    } else if (atual && !aninhado && GUARDADAS.has(lida.nome)) {
      atual.set(lida.nome, [...(atual.get(lida.nome) ?? []), lida.valor]);
    }
  }
  return blocos;
}

// ------------------------------------------------------------------ regra

const inteiro = (texto) => (/^\d{1,9}$/.test(texto) ? Number(texto) : 0);

// BYDAY só no semanal e só com os dias puros ("MO,WE"). "2MO" (a segunda segunda-feira do mês)
// ele não entende. Devolve os dias da semana, sem repetir, ou null.
function lerDias(valor, freq) {
  if (valor === undefined) return [];
  const dias = valor.split(',').map((codigo) => DIAS.indexOf(codigo.trim()));
  return freq === 'WEEKLY' && dias.every((dia) => dia >= 0) ? [...new Set(dias)] : null;
}

// Devolve { freq, intervalo, vezes: número | null, ate: momento | null, dias, inicioDaSemana },
// ou null quando a regra tem algo que o leitor não entende.
function lerRegra(valor) {
  const partes = new Map(
    valor
      .toUpperCase()
      .split(';')
      .filter(Boolean)
      .map((trecho) => {
        const [chave, conteudo = ''] = trecho.trim().split('=');
        return [chave, conteudo];
      }),
  );
  if ([...partes.keys()].some((chave) => !CHAVES_DA_REGRA.has(chave))) return null;

  const freq = partes.get('FREQ');
  const intervalo = partes.has('INTERVAL') ? inteiro(partes.get('INTERVAL')) : 1;
  const vezes = partes.has('COUNT') ? inteiro(partes.get('COUNT')) : null;
  const ate = partes.has('UNTIL') ? lerMomento(partes.get('UNTIL')) : undefined;
  const dias = lerDias(partes.get('BYDAY'), freq);
  const inicioDaSemana = DIAS.indexOf(partes.get('WKST') ?? 'MO');

  const entendida =
    FREQUENCIAS.includes(freq) &&
    intervalo >= 1 &&
    vezes !== 0 &&
    ate !== null &&
    dias &&
    inicioDaSemana >= 0;
  return entendida ? { freq, intervalo, vezes, ate: ate ?? null, dias, inicioDaSemana } : null;
}

// Uma regra anda em períodos contados a partir do início: o período 0 é o do início.
//   comeco(p):  primeiro dia do período p
//   dias(p):    os dias com ocorrência no período p, em ordem
//   periodo(n): período em que cai o dia de número n
//   antes(p):   quantas ocorrências há antes do período p, ou null quando só contando uma a uma

function porDia(inicio, cada) {
  return {
    comeco: (p) => inicio + p * cada,
    dias: (p) => [inicio + p * cada],
    periodo: (n) => Math.floor((n - inicio) / cada),
    antes: (p) => p,
  };
}

function porSemana(inicio, regra) {
  const cada = regra.intervalo * 7;
  // Posição do dia na semana, que começa em WKST (segunda, se a regra não disser).
  const posicao = (dia) => resto(dia - regra.inicioDaSemana, 7);
  const semana = inicio - posicao(diaDaSemana(inicio));
  const escolhidos = regra.dias.length ? regra.dias : [diaDaSemana(inicio)];
  const posicoes = escolhidos.map(posicao).sort((a, b) => a - b);
  const dias = (p) => posicoes.map((pos) => semana + p * cada + pos).filter((dia) => dia >= inicio);
  return {
    comeco: (p) => semana + p * cada,
    dias,
    periodo: (n) => Math.floor((n - semana) / cada),
    antes: (p) => (p === 0 ? 0 : dias(0).length + (p - 1) * posicoes.length),
  };
}

function porMes(inicio, cada) {
  const mesCorrido = (data) => data.getUTCFullYear() * 12 + data.getUTCMonth();
  const primeiroMes = mesCorrido(dataDoNumero(inicio));
  const diaDoMes = dataDoNumero(inicio).getUTCDate();
  const comeco = (p) => {
    const mes = primeiroMes + p * cada;
    return numeroDoDia(Math.floor(mes / 12), (mes % 12) + 1, 1);
  };
  return {
    comeco,
    // Mês sem esse dia (30 de fevereiro, 31 de abril): a regra pula o mês.
    dias: (p) => [comeco(p) + diaDoMes - 1].filter((dia) => dataDoNumero(dia).getUTCDate() === diaDoMes),
    periodo: (n) => Math.floor((mesCorrido(dataDoNumero(n)) - primeiroMes) / cada),
    antes: (p) => (diaDoMes <= 28 ? p : null),
  };
}

function andamento(inicio, regra) {
  if (regra.freq === 'DAILY') return porDia(inicio, regra.intervalo);
  if (regra.freq === 'WEEKLY') return porSemana(inicio, regra);
  return porMes(inicio, regra.freq === 'MONTHLY' ? regra.intervalo : regra.intervalo * 12);
}

// Último instante (em minutos corridos) em que a regra ainda dá ocorrência.
function limiteDaRegra(inicio, regra) {
  if (!regra.ate) return Infinity;
  const ate = noRelogioDe(inicio, regra.ate);
  return ate.dia * MINUTOS_DO_DIA + (ate.minuto ?? MINUTOS_DO_DIA - 1);
}

// Dias (números) em que a regra do evento dá ocorrência dentro da busca { de, ate }, em ordem.
// Sem COUNT, ou quando a conta é direta, pula para o período da busca em vez de vir do início.
// O orçamento de passos é da leitura inteira: quando acaba, as repetições que faltam ficam de fora.
function expandir(evento, busca, orcamento) {
  const { inicio, regra } = evento;
  const passo = andamento(inicio.dia, regra);
  const minutoDoInicio = inicio.minuto ?? 0;
  const ultimo = Math.min((busca.ate + 1) * MINUTOS_DO_DIA - 1, limiteDaRegra(inicio, regra));

  let p = Math.max(0, passo.periodo(busca.de));
  let feitas = regra.vezes === null ? 0 : passo.antes(p);
  if (feitas === null) {
    p = 0;
    feitas = 0;
  }

  const dias = [];
  for (; passo.comeco(p) <= busca.ate && orcamento.passos > 0; p += 1) {
    orcamento.passos -= 1;
    for (const dia of passo.dias(p)) {
      feitas += 1;
      const passou = dia * MINUTOS_DO_DIA + minutoDoInicio > ultimo;
      if (passou || (regra.vezes !== null && feitas > regra.vezes)) return dias;
      if (dia >= busca.de) dias.push(dia);
    }
  }
  return dias;
}

// ----------------------------------------------------------------- evento

// Evento de dia inteiro com DTEND (que é o dia seguinte ao último) ocupa vários dias.
function duracaoEmDias(inicio, fim) {
  if (!fim || inicio.minuto !== null || fim.minuto !== null) return 1;
  return Math.min(Math.max(fim.dia - inicio.dia, 1), DURACAO_MAXIMA);
}

function lerEvento(bloco) {
  const valor = (nome) => bloco.get(nome)?.[0] ?? '';
  const inicio = lerMomento(valor('DTSTART'));
  if (!inicio || valor('STATUS').trim().toUpperCase() === 'CANCELLED') return null;
  const alterada = lerMomento(valor('RECURRENCE-ID'));
  return {
    uid: valor('UID').trim(),
    titulo: titulo(valor('SUMMARY')),
    inicio,
    duracao: duracaoEmDias(inicio, lerMomento(valor('DTEND'))),
    alterada,
    regra: alterada ? null : lerRegra(valor('RRULE')),
    excluidos: (bloco.get('EXDATE') ?? [])
      .flatMap((lista) => lista.split(','))
      .map(lerMomento)
      .filter(Boolean),
  };
}

// Dias em que o evento começa dentro da busca. Na série, saem os EXDATE e as ocorrências
// alteradas (cada uma tem o próprio VEVENT, com RECURRENCE-ID).
function comecos(evento, busca, contexto) {
  if (!evento.regra) return [evento.inicio.dia];
  const fora = new Set(
    [...evento.excluidos, ...(contexto.alteradas.get(evento.uid) ?? [])].map((momento) => {
      const { dia, minuto } = noRelogioDe(evento.inicio, momento);
      return minuto === null ? String(dia) : `${dia}:${minuto}`;
    }),
  );
  return expandir(evento, busca, contexto.orcamento).filter(
    (dia) => !fora.has(String(dia)) && !fora.has(`${dia}:${evento.inicio.minuto}`),
  );
}

// Ocorrências do evento na janela: Map do número do dia, no relógio do aparelho, para o
// minuto do dia (null = dia inteiro).
function ocorrencias(evento, janela, contexto) {
  const { inicio, duracao } = evento;
  const folga = inicio.utc ? 1 : 0; // em UTC, o dia pode ser o vizinho do dia local
  const busca = { de: janela.de - folga - (duracao - 1), ate: janela.ate + folga };
  const saida = new Map();
  for (const comeco of comecos(evento, busca, contexto)) {
    const noDia = { dia: comeco, minuto: inicio.minuto };
    const local = inicio.utc ? paraLocal(noDia) : noDia;
    const fim = Math.min(local.dia + duracao - 1, janela.ate);
    for (let dia = Math.max(local.dia, janela.de); dia <= fim; dia += 1) saida.set(dia, local.minuto);
  }
  return saida;
}

// As ocorrências alteradas de cada série, pelo UID: Map de uid para os momentos de RECURRENCE-ID.
function alteradasPorUid(eventos) {
  const mapa = new Map();
  for (const { uid, alterada } of eventos) {
    if (alterada) mapa.set(uid, [...(mapa.get(uid) ?? []), alterada]);
  }
  return mapa;
}

// ---------------------------------------------------------------- leitura

const horaDoMinuto = (minuto) => `${doisDigitos(Math.floor(minuto / 60))}:${doisDigitos(minuto % 60)}`;

// Dia inteiro vem antes dos eventos com hora do mesmo dia; no empate, pelo título.
const porMomento = (a, b) =>
  comparar(`${a.dia} ${a.hora ?? ''}`, `${b.dia} ${b.hora ?? ''}`) || comparar(a.titulo, b.titulo);

const inteiroEntre = (valor, minimo, padrao) => (Number.isInteger(valor) && valor >= minimo ? valor : padrao);

export function lerIcal(texto, opcoes) {
  const { de, dias, teto } = opcoes ?? {};
  if (typeof texto !== 'string' || !dataValida(de)) return [];

  const [ano, mes, dia] = de.split('-').map(Number);
  const primeiro = numeroDoDia(ano, mes, dia);
  const janela = { de: primeiro, ate: primeiro + Math.min(inteiroEntre(dias, 1, 1), MAXIMO_DE_DIAS) - 1 };

  const eventos = blocosDeEvento(texto).map(lerEvento).filter(Boolean);
  const contexto = { alteradas: alteradasPorUid(eventos), orcamento: { passos: ORCAMENTO_DE_PASSOS } };

  const saida = [];
  for (const evento of eventos) {
    for (const [numero, minuto] of ocorrencias(evento, janela, contexto)) {
      saida.push({
        uid: evento.uid,
        titulo: evento.titulo,
        dia: isoDoNumero(numero),
        hora: minuto === null ? null : horaDoMinuto(minuto),
      });
    }
  }
  return saida.sort(porMomento).slice(0, inteiroEntre(teto, 0, TETO_DE_OCORRENCIAS));
}
