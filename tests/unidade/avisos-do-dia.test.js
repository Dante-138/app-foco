import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AVISOS_DO_DIA,
  AVISOS_PADRAO,
  DIAS_DE_RESUMO,
  HORA_DA_MANHA,
  HORA_DA_NOITE,
  MAXIMO_DA_ROTINA,
  MAXIMO_DE_HABITOS,
  avisosDoDiaValidos,
  planejarDoDia,
} from '../../www/js/nucleo/avisos-do-dia.js';
import { idDaNotificacao } from '../../www/js/nucleo/lembretes.js';

// Sábado, 14/11/2026, às 06:00: antes do resumo da manhã.
const HOJE = '2026-11-14';
const AMANHA = '2026-11-15';
const CEDO = `${HOJE}T06:00`;

const item = (id, hora = null, habitoId = null) => ({
  id,
  tipo: 'item',
  texto: `Item ${id}`,
  hora,
  habitoId,
});
const secao = (id) => ({ id, tipo: 'secao', texto: id, hora: null, habitoId: null });
const habito = (id, extra = {}) => ({
  id,
  nome: `Hábito ${id}`,
  tipo: 'simnao',
  arquivado: false,
  lembrete: null,
  ...extra,
});
const tarefa = (id, prazo, extra = {}) => ({ id, titulo: id, prazo, feita: false, ...extra });

const ROTINA = {
  id: 'r',
  nome: 'Manhã',
  itens: [secao('ACORDAR'), item('a', '06:30'), item('b'), item('c', '07:15', 'ler'), item('d', '09:00')],
};
const TUDO = { manha: true, noite: true, rotina: true, habitos: true };
const so = (chave) => ({ manha: false, noite: false, rotina: false, habitos: false, [chave]: true });

function dados(extra = {}) {
  return {
    rotinaDe: () => ROTINA,
    marcadas: new Set(),
    habitos: [],
    registros: {},
    tarefas: [],
    habitoVale: () => true,
    ...extra,
  };
}
const resumo = (plano) => plano.map((x) => [x.quando, x.titulo, x.corpo]);

test('as horas, os limites e as chaves dos avisos', () => {
  assert.deepEqual([HORA_DA_MANHA, HORA_DA_NOITE, DIAS_DE_RESUMO], ['07:00', '22:00', 7]);
  assert.deepEqual([MAXIMO_DA_ROTINA, MAXIMO_DE_HABITOS], [40, 30]);
  assert.deepEqual([...AVISOS_DO_DIA], ['manha', 'noite', 'rotina', 'habitos']);
});

test('avisosDoDiaValidos: a rotina no relógio nasce desligada e os outros ligados; só lógico explícito muda', () => {
  const padrao = { manha: true, noite: true, rotina: false, habitos: true };
  assert.deepEqual({ ...AVISOS_PADRAO }, padrao);
  assert.deepEqual(avisosDoDiaValidos(undefined), padrao);
  for (const errado of [null, 'x', 3, []]) assert.deepEqual(avisosDoDiaValidos(errado), padrao);
  // Valor que não é verdadeiro nem falso fica com o padrão da chave; chave estranha sai.
  assert.deepEqual(avisosDoDiaValidos({ manha: false, rotina: 1, habitos: 'não', lixo: true }), {
    manha: false,
    noite: true,
    rotina: false,
    habitos: true,
  });
  assert.deepEqual(avisosDoDiaValidos({ rotina: true, noite: false }), {
    manha: true,
    noite: false,
    rotina: true,
    habitos: true,
  });
  assert.deepEqual(avisosDoDiaValidos(TUDO), TUDO);
});

test('tudo desligado, ou app sem dados: plano vazio', () => {
  const nada = { manha: false, noite: false, rotina: false, habitos: false };
  assert.deepEqual(planejarDoDia(dados({ habitos: [habito('h', { lembrete: '08:00' })] }), nada, CEDO), []);
  assert.deepEqual(planejarDoDia(dados({ rotinaDe: () => null }), TUDO, CEDO), []);
});

// -------------------------------------------------------------- resumo da manhã

test('resumo da manhã: às 7h dos próximos sete dias, com a rotina, os hábitos e as tarefas do dia', () => {
  const plano = planejarDoDia(
    dados({
      habitos: [habito('a'), habito('b'), habito('velho', { arquivado: true })],
      tarefas: [
        tarefa('atrasada', '2026-11-10'),
        tarefa('hoje', HOJE),
        tarefa('amanhã', AMANHA),
        tarefa('feita', HOJE, { feita: true }),
        tarefa('sem data', null),
      ],
    }),
    so('manha'),
    CEDO,
  );
  assert.equal(plano.length, DIAS_DE_RESUMO);
  assert.deepEqual(resumo(plano).slice(0, 2), [
    [`${HOJE}T07:00`, 'Hoje, sáb., 14 de nov.', 'Rotina Manhã · 2 hábitos · 2 tarefas (1 atrasada)'],
    // Amanhã, a de hoje também conta como atrasada se continuar pendente.
    [`${AMANHA}T07:00`, 'Hoje, dom., 15 de nov.', 'Rotina Manhã · 2 hábitos · 3 tarefas (2 atrasadas)'],
  ]);
  assert.equal(plano[0].id, idDaNotificacao(`manha:${HOJE}:resumo`));
  assert.deepEqual(
    [plano[0].tipo, plano[0].dia, plano[0].habitoId, plano[0].comFeito],
    ['manha', HOJE, null, false],
  );
});

test('resumo da manhã: só o que existe entra; o de hoje sai depois das 7h; dia sem nada não avisa', () => {
  const umHabito = dados({ rotinaDe: () => null, habitos: [habito('a')] });
  const depois = planejarDoDia(umHabito, so('manha'), `${HOJE}T07:00`);
  assert.equal(depois.length, DIAS_DE_RESUMO - 1);
  assert.deepEqual(resumo(depois)[0], [`${AMANHA}T07:00`, 'Hoje, dom., 15 de nov.', '1 hábito']);

  const umaTarefa = dados({ rotinaDe: () => null, tarefas: [tarefa('t', AMANHA)] });
  assert.deepEqual(resumo(planejarDoDia(umaTarefa, so('manha'), CEDO))[0], [
    `${AMANHA}T07:00`,
    'Hoje, dom., 15 de nov.',
    '1 tarefa',
  ]);
  // Hábito que não vale no dia (frequência) fica fora da conta.
  const folga = dados({ rotinaDe: () => null, habitos: [habito('a')], habitoVale: (_, dia) => dia !== HOJE });
  assert.equal(planejarDoDia(folga, so('manha'), CEDO)[0].dia, AMANHA);
});

// ------------------------------------------------------------ revisão da noite

test('revisão da noite: a de hoje diz o que falta; a dos outros dias é genérica', () => {
  const plano = planejarDoDia(
    dados({
      marcadas: new Set(['a']),
      habitos: [
        habito('feito'),
        habito('falta'),
        habito('folga'),
        habito('velho', { arquivado: true }),
        habito('pouca', { tipo: 'numero', meta: 8 }),
      ],
      registros: { feito: { [HOJE]: 'feito' }, folga: { [HOJE]: 'pulado' }, pouca: { [HOJE]: 3 } },
      tarefas: [tarefa('t1', HOJE), tarefa('t2', AMANHA)],
    }),
    so('noite'),
    CEDO,
  );
  assert.equal(plano.length, DIAS_DE_RESUMO);
  assert.deepEqual(resumo(plano).slice(0, 2), [
    [`${HOJE}T22:00`, 'Revisão do dia', 'Faltam: 2 hábitos, 3 itens da rotina e 1 tarefa.'],
    [`${AMANHA}T22:00`, 'Revisão do dia', 'Confira o que falta nos hábitos, na rotina e nas tarefas.'],
  ]);
  assert.equal(plano[0].id, idDaNotificacao(`noite:${HOJE}:revisao`));
});

test('revisão da noite: uma coisa só, duas, ou tudo feito', () => {
  const corpoDeHoje = (extra) => planejarDoDia(dados(extra), so('noite'), CEDO)[0].corpo;
  const todas = new Set(['a', 'b', 'c', 'd']);
  assert.equal(corpoDeHoje({ marcadas: todas }), 'Tudo feito hoje.');
  assert.equal(corpoDeHoje({ marcadas: new Set(['a', 'b', 'c']) }), 'Faltam: 1 item da rotina.');
  assert.equal(
    corpoDeHoje({ marcadas: todas, habitos: [habito('h')], tarefas: [tarefa('t', HOJE), tarefa('u', HOJE)] }),
    'Faltam: 1 hábito e 2 tarefas.',
  );
  // Hábito de folga hoje (frequência) não falta.
  assert.equal(
    corpoDeHoje({ marcadas: todas, habitos: [habito('h')], habitoVale: () => false }),
    'Tudo feito hoje.',
  );
});

test('revisão da noite: sem rotina, vale se houver hábito ativo ou tarefa pendente', () => {
  const sem = { rotinaDe: () => null };
  const quantos = (extra) => planejarDoDia(dados({ ...sem, ...extra }), so('noite'), CEDO).length;
  assert.equal(quantos({}), 0);
  assert.equal(quantos({ habitos: [habito('velho', { arquivado: true })] }), 0);
  assert.equal(quantos({ tarefas: [tarefa('feita', HOJE, { feita: true })] }), 0);
  assert.equal(quantos({ habitos: [habito('h')] }), DIAS_DE_RESUMO);
  assert.equal(quantos({ tarefas: [tarefa('sem data', null)] }), DIAS_DE_RESUMO);
  // Depois das 22h, a de hoje já passou.
  assert.equal(planejarDoDia(dados(), so('noite'), `${HOJE}T22:00`).length, DIAS_DE_RESUMO - 1);
});

// --------------------------------------------------------- a rotina no relógio

test('rotina no relógio: cada item com horário avisa na hora, hoje e amanhã', () => {
  const plano = planejarDoDia(dados(), so('rotina'), CEDO);
  assert.deepEqual(resumo(plano), [
    [`${HOJE}T06:30`, 'Item a', '06:30 · Manhã'],
    [`${HOJE}T07:15`, 'Item c', '07:15 · Manhã'],
    [`${HOJE}T09:00`, 'Item d', '09:00 · Manhã'],
    [`${AMANHA}T06:30`, 'Item a', '06:30 · Manhã'],
    [`${AMANHA}T07:15`, 'Item c', '07:15 · Manhã'],
    [`${AMANHA}T09:00`, 'Item d', '09:00 · Manhã'],
  ]);
  assert.equal(plano[0].id, idDaNotificacao(`rotina:${HOJE}:a`));
  assert.notEqual(plano[0].id, plano[3].id); // o mesmo item em outro dia é outro aviso
  assert.deepEqual([plano[0].tipo, plano[0].comFeito], ['rotina', false]);
});

test('rotina no relógio: o que já passou, o que já foi marcado e o item de hábito resolvido não avisam hoje', () => {
  const hojeDe = (extra, agora = CEDO) =>
    planejarDoDia(dados(extra), so('rotina'), agora)
      .filter((x) => x.dia === HOJE)
      .map((x) => x.titulo);
  assert.deepEqual(hojeDe({}, `${HOJE}T07:15`), ['Item d']);
  assert.deepEqual(hojeDe({ marcadas: new Set(['a', 'd']) }), ['Item c']);
  // O item c marca o hábito "ler": com o hábito já feito (ou pulado) hoje, não precisa avisar.
  const ler = habito('ler');
  assert.deepEqual(hojeDe({ habitos: [ler], registros: { ler: { [HOJE]: 'feito' } } }), ['Item a', 'Item d']);
  assert.deepEqual(hojeDe({ habitos: [ler] }), ['Item a', 'Item c', 'Item d']);
  // Ligação com hábito que não existe mais não muda nada; amanhã todos avisam de novo.
  assert.deepEqual(hojeDe({ habitos: [] }), ['Item a', 'Item c', 'Item d']);
  const amanha = planejarDoDia(dados({ marcadas: new Set(['a', 'c', 'd']) }), so('rotina'), CEDO);
  assert.deepEqual(
    amanha.map((x) => x.dia),
    [AMANHA, AMANHA, AMANHA],
  );
});

test('rotina no relógio: fica com os avisos mais próximos, até o limite; rotina diferente amanhã', () => {
  const longa = {
    id: 'l',
    nome: 'Longa',
    itens: Array.from({ length: 30 }, (_, i) =>
      item(`i${i}`, `${String(8 + Math.floor(i / 6)).padStart(2, '0')}:${i % 6}0`),
    ),
  };
  const plano = planejarDoDia(dados({ rotinaDe: () => longa }), so('rotina'), CEDO);
  assert.equal(plano.length, MAXIMO_DA_ROTINA);
  assert.equal(plano.filter((x) => x.dia === HOJE).length, 30);

  const outra = { id: 'o', nome: 'Domingo', itens: [item('z', '10:00')] };
  const dois = planejarDoDia(
    dados({ rotinaDe: (dia) => (dia === HOJE ? ROTINA : outra) }),
    so('rotina'),
    CEDO,
  );
  assert.deepEqual(resumo(dois).at(-1), [`${AMANHA}T10:00`, 'Item z', '10:00 · Domingo']);
  // Dia sem rotina não tem aviso de item.
  const semAmanha = planejarDoDia(
    dados({ rotinaDe: (dia) => (dia === HOJE ? ROTINA : null) }),
    so('rotina'),
    CEDO,
  );
  assert.ok(semAmanha.every((x) => x.dia === HOJE));
});

// --------------------------------------------------------- lembrete dos hábitos

test('lembrete do hábito: na hora guardada, hoje e amanhã, com o botão Feito no de sim ou não', () => {
  const habitos = [
    habito('agua', { tipo: 'numero', meta: 8, lembrete: '10:00' }),
    habito('alongar', { lembrete: '08:00' }),
    habito('sem-hora'),
    habito('velho', { arquivado: true, lembrete: '08:00' }),
  ];
  const plano = planejarDoDia(dados({ habitos }), so('habitos'), CEDO);
  assert.deepEqual(
    plano.map((x) => [x.quando, x.titulo, x.corpo, x.habitoId, x.comFeito]),
    [
      [`${HOJE}T08:00`, 'Hábito alongar', 'Hábito de hoje', 'alongar', true],
      [`${HOJE}T10:00`, 'Hábito agua', 'Hábito de hoje', 'agua', false],
      [`${AMANHA}T08:00`, 'Hábito alongar', 'Hábito de hoje', 'alongar', true],
      [`${AMANHA}T10:00`, 'Hábito agua', 'Hábito de hoje', 'agua', false],
    ],
  );
  assert.equal(plano[0].id, idDaNotificacao(`habito:${HOJE}:alongar`));
  assert.equal(plano[0].tipo, 'habito');
});

test('lembrete do hábito: resolvido hoje, fora da frequência ou já passado não avisa', () => {
  const habitos = [habito('a', { lembrete: '08:00' }), habito('b', { lembrete: '12:00' })];
  const dias = (extra, agora = CEDO) =>
    planejarDoDia(dados({ habitos, ...extra }), so('habitos'), agora).map((x) => `${x.habitoId} ${x.dia}`);
  assert.deepEqual(dias({ registros: { a: { [HOJE]: 'feito' }, b: { [HOJE]: 'pulado' } } }), [
    `a ${AMANHA}`,
    `b ${AMANHA}`,
  ]);
  assert.deepEqual(dias({ habitoVale: (x, dia) => x.id === 'b' || dia === AMANHA }), [
    `b ${HOJE}`,
    `a ${AMANHA}`,
    `b ${AMANHA}`,
  ]);
  assert.deepEqual(dias({}, `${HOJE}T08:00`), [`b ${HOJE}`, `a ${AMANHA}`, `b ${AMANHA}`]);
});

test('coerência com a rotina: hábito ligado a item com horário é avisado pela rotina, não duas vezes', () => {
  const habitos = [habito('ler', { lembrete: '21:00' }), habito('outro', { lembrete: '21:00' })];
  const tipos = (ligados) =>
    planejarDoDia(dados({ habitos }), ligados, CEDO)
      .filter((x) => x.dia === HOJE && (x.habitoId === 'ler' || x.titulo === 'Item c'))
      .map((x) => x.tipo);
  // O item c (07:15) marca o hábito "ler": com a rotina no relógio, só o item avisa.
  assert.deepEqual(tipos({ ...so('habitos'), rotina: true }), ['rotina']);
  // Sem a rotina no relógio, vale o lembrete do próprio hábito.
  assert.deepEqual(tipos(so('habitos')), ['habito']);
  // Item ligado mas sem horário não cobre o hábito.
  const semHora = { ...ROTINA, itens: [item('x', null, 'ler')] };
  const plano = planejarDoDia(
    dados({ habitos, rotinaDe: () => semHora }),
    { ...so('habitos'), rotina: true },
    CEDO,
  );
  assert.deepEqual(
    plano.filter((x) => x.dia === HOJE).map((x) => x.habitoId),
    ['ler', 'outro'],
  );
});

test('lembrete dos hábitos: fica com os mais próximos, até o limite', () => {
  const muitos = Array.from({ length: 20 }, (_, i) =>
    habito(`h${i}`, { lembrete: `1${Math.floor(i / 10)}:${i % 10}0` }),
  );
  const plano = planejarDoDia(dados({ habitos: muitos, rotinaDe: () => null }), so('habitos'), CEDO);
  assert.equal(plano.length, MAXIMO_DE_HABITOS);
  assert.equal(plano.filter((x) => x.dia === HOJE).length, 20);
});

test('sem limite: todos os avisos de rotina e de hábito de hoje e de amanhã, na mesma ordem', () => {
  const longa = {
    id: 'l',
    nome: 'Longa',
    itens: Array.from({ length: 30 }, (_, i) =>
      item(`i${i}`, `${String(8 + Math.floor(i / 6)).padStart(2, '0')}:${i % 6}0`),
    ),
  };
  const muitos = Array.from({ length: 20 }, (_, i) =>
    habito(`h${i}`, { lembrete: `2${Math.floor(i / 10)}:${i % 10}0` }),
  );
  const tudo = dados({ rotinaDe: () => longa, habitos: muitos });
  const ligados = { ...so('rotina'), habitos: true };
  const cortado = planejarDoDia(tudo, ligados, CEDO);
  const inteiro = planejarDoDia(tudo, ligados, CEDO, { semLimite: true });
  assert.equal(cortado.length, MAXIMO_DA_ROTINA + MAXIMO_DE_HABITOS);
  assert.equal(inteiro.length, 60 + 40);
  // O plano com limite é um pedaço do plano inteiro: nada muda além do corte.
  const ids = new Set(inteiro.map((x) => x.id));
  assert.ok(cortado.every((x) => ids.has(x.id)));
  assert.deepEqual(planejarDoDia(tudo, ligados, CEDO, {}), cortado);
});

// ------------------------------------------------------------------ tudo junto

test('o plano inteiro sai em ordem de relógio e sem número repetido', () => {
  const habitos = [habito('ler', { lembrete: '21:00' }), habito('alongar', { lembrete: '08:00' })];
  const plano = planejarDoDia(dados({ habitos, tarefas: [tarefa('t', HOJE)] }), TUDO, CEDO);
  assert.deepEqual(
    plano.filter((x) => x.dia === HOJE).map((x) => [x.quando.slice(11), x.tipo]),
    [
      ['06:30', 'rotina'],
      ['07:00', 'manha'],
      ['07:15', 'rotina'],
      ['08:00', 'habito'],
      ['09:00', 'rotina'],
      ['22:00', 'noite'],
    ],
  );
  assert.equal(new Set(plano.map((x) => x.id)).size, plano.length);
  assert.ok(plano.every((x, i) => i === 0 || plano[i - 1].quando <= x.quando));
});
