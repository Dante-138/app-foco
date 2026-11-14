import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROXIMOS_DA_ROTINA,
  RISCOS_NO_PAINEL,
  TAREFAS_NO_PAINEL,
  agoraEDepois,
  resumoDoDia,
} from '../../www/js/nucleo/painel.js';

const HOJE = '2026-11-13';
const item = (id) => ({ id, tipo: 'item', texto: id, hora: null });
const secao = (id) => ({ id, tipo: 'secao', texto: id, hora: null });
const vazio = { rotina: null, marcadas: new Set(), habitos: [], registros: {}, tarefas: [], dia: HOJE };

test('sem nada, tudo zera', () => {
  assert.deepEqual(resumoDoDia(vazio), {
    rotina: { feitos: 0, total: 0, proximos: [], agora: null, depois: null },
    habitos: { feitos: 0, total: 0, emRisco: [] },
    tarefas: { total: 0, atrasadas: 0, primeiras: [] },
  });
});

test('rotina: conta só itens, e os próximos são os que faltam, na ordem, até o limite', () => {
  const rotina = { itens: [secao('MANHÃ'), item('a'), item('b'), item('c'), item('d'), item('e')] };
  const { rotina: resumo } = resumoDoDia({ ...vazio, rotina, marcadas: new Set(['b']) });
  assert.equal(PROXIMOS_DA_ROTINA, 3);
  assert.deepEqual([resumo.feitos, resumo.total], [1, 5]);
  assert.deepEqual(
    resumo.proximos.map((i) => i.id),
    ['a', 'c', 'd'],
  );
});

test('hábitos: arquivado e dia pulado saem da conta; numérico conta quando bate a meta', () => {
  const habitos = [
    { id: 'feito', tipo: 'simnao', arquivado: false },
    { id: 'falta', tipo: 'simnao', arquivado: false },
    { id: 'pulado', tipo: 'simnao', arquivado: false },
    { id: 'velho', tipo: 'simnao', arquivado: true },
    { id: 'agua', tipo: 'numero', meta: 2, arquivado: false },
    { id: 'pouca', tipo: 'numero', meta: 2, arquivado: false },
  ];
  const registros = {
    feito: { [HOJE]: 'feito' },
    pulado: { [HOJE]: 'pulado' },
    velho: { [HOJE]: 'feito' },
    agua: { [HOJE]: 3 },
    pouca: { [HOJE]: 1, '2026-11-12': 5 },
  };
  assert.deepEqual(resumoDoDia({ ...vazio, habitos, registros }).habitos, {
    feitos: 2,
    total: 4,
    emRisco: [],
  });
});

test('tarefas: pendentes com prazo até hoje, atrasadas primeiro, até o limite', () => {
  let n = 0;
  const tarefa = (titulo, prazo, extra = {}) => {
    n += 1;
    return { titulo, prazo, hora: null, feita: false, criadaEm: n, ...extra };
  };
  const tarefas = [
    tarefa('amanhã', '2026-11-14'),
    tarefa('sem data', null),
    tarefa('feita hoje', HOJE, { feita: true }),
    tarefa('hoje à tarde', HOJE, { hora: '15:00' }),
    tarefa('hoje sem hora', HOJE),
    tarefa('atrasada', '2026-11-10'),
    ...Array.from({ length: 4 }, (_, i) => tarefa(`mais ${i}`, HOJE)),
  ];
  const { tarefas: resumo } = resumoDoDia({ ...vazio, tarefas });
  assert.equal(TAREFAS_NO_PAINEL, 5);
  assert.deepEqual([resumo.total, resumo.atrasadas], [7, 1]);
  assert.deepEqual(
    resumo.primeiras.map((t) => t.titulo),
    ['atrasada', 'hoje à tarde', 'hoje sem hora', 'mais 0', 'mais 1'],
  );
});

test('agora e depois: pelo horário, só itens pendentes; sem horário ou sem hora, nada', () => {
  const comHora = (id, hora) => ({ ...item(id), hora });
  const itens = [
    comHora('almoco', '12:00'),
    comHora('cafe', '07:00'),
    item('solto'),
    comHora('jantar', '19:30'),
  ];
  const nada = new Set();
  const ids = (r) => [r.agora?.id ?? null, r.depois?.id ?? null];
  assert.deepEqual(ids(agoraEDepois(itens, nada, '06:00')), [null, 'cafe']);
  assert.deepEqual(ids(agoraEDepois(itens, nada, '12:00')), ['almoco', 'jantar']);
  assert.deepEqual(ids(agoraEDepois(itens, new Set(['almoco']), '13:00')), ['cafe', 'jantar']);
  assert.deepEqual(ids(agoraEDepois(itens, nada, '23:00')), ['jantar', null]);
  assert.deepEqual(ids(agoraEDepois([comHora('a', '08:00'), comHora('b', '08:00')], nada, '09:00')), [
    'b',
    null,
  ]);

  const rotina = { itens };
  const resumo = resumoDoDia({ ...vazio, rotina, hora: '12:30' }).rotina;
  assert.deepEqual(ids(resumo), ['almoco', 'jantar']);
});

test('sequências em risco: viva, de 2 dias ou mais, sem nada hoje; maiores primeiro, até o limite', () => {
  const dias = (n) =>
    Object.fromEntries(
      Array.from({ length: n }, (_, i) => [`2026-11-${String(12 - i).padStart(2, '0')}`, 'feito']),
    );
  const habitos = ['a', 'b', 'c', 'd', 'e', 'feitoHoje', 'curta', 'arquivado'].map((id) => ({
    id,
    nome: id,
    tipo: 'simnao',
    arquivado: id === 'arquivado',
  }));
  const registros = {
    a: dias(2),
    b: dias(5),
    c: dias(3),
    d: dias(4),
    e: dias(9),
    feitoHoje: { ...dias(6), [HOJE]: 'feito' },
    curta: dias(1),
    arquivado: dias(8),
  };
  const r = resumoDoDia({ ...vazio, habitos, registros }).habitos.emRisco;
  assert.equal(RISCOS_NO_PAINEL, 3);
  assert.deepEqual(
    r.map((x) => [x.habito.id, x.dias]),
    [
      ['e', 9],
      ['b', 5],
      ['d', 4],
    ],
  );
});
