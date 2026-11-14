import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROXIMOS_DA_ROTINA, TAREFAS_NO_PAINEL, resumoDoDia } from '../../www/js/nucleo/painel.js';

const HOJE = '2026-11-13';
const item = (id, hora = null) => ({ id, tipo: 'item', texto: id, hora });
const secao = (id) => ({ id, tipo: 'secao', texto: id, hora: null });
const vazio = {
  rotina: null,
  marcadas: new Set(),
  habitos: [],
  registros: {},
  tarefas: [],
  dia: HOJE,
  hora: '10:00',
};

test('sem nada, tudo zera', () => {
  assert.deepEqual(resumoDoDia(vazio), {
    rotina: { feitos: 0, total: 0, proximos: [], agora: null, depois: null, atrasados: 0 },
    habitos: { feitos: 0, total: 0 },
    emRisco: { total: 0, primeiras: [] },
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
  assert.deepEqual(resumoDoDia({ ...vazio, habitos, registros }).habitos, { feitos: 2, total: 4 });
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

// ------------------------------------------------------- o relógio na rotina

const COM_HORAS = {
  itens: [
    secao('MANHÃ'),
    item('acordar', '06:30'),
    item('cama'),
    item('cafe', '07:00'),
    item('mochila'),
    item('chave'),
    item('onibus'),
    secao('TRABALHO'),
    item('ponto', '09:00'),
    item('almoco', '12:00'),
  ],
};
const noRelogio = (hora, marcadas = []) => {
  const { rotina } = resumoDoDia({ ...vazio, rotina: COM_HORAS, marcadas: new Set(marcadas), hora });
  return { ...rotina, proximos: rotina.proximos.map((i) => i.id) };
};

test('rotina com horário: a lista começa no item do horário atual e traz o próximo horário', () => {
  assert.deepEqual(noRelogio('07:10', ['acordar', 'cama']), {
    feitos: 2,
    total: 8,
    proximos: ['cafe', 'mochila', 'chave', 'ponto'], // o das 09:00 entra além do limite
    agora: 'cafe',
    depois: { id: 'ponto', faltam: 110 },
    atrasados: 0,
  });
});

test('rotina com horário: o que ficou para trás conta como atrasado e vem depois na lista', () => {
  const r = noRelogio('09:30', ['acordar']);
  assert.deepEqual(r.proximos, ['ponto', 'almoco', 'cama']);
  assert.deepEqual([r.agora, r.depois, r.atrasados], ['ponto', { id: 'almoco', faltam: 150 }, 1]);
});

test('rotina com horário: item atual já marcado não é o "agora"; a lista segue do seguinte', () => {
  const r = noRelogio('07:10', ['acordar', 'cama', 'cafe']);
  assert.deepEqual(r.proximos, ['mochila', 'chave', 'onibus', 'ponto']);
  assert.equal(r.agora, null);
});

test('rotina com horário: próximo já marcado some do "depois"; antes do primeiro horário não há "agora"', () => {
  assert.equal(noRelogio('07:10', ['ponto']).depois, null);
  const cedo = noRelogio('05:00');
  assert.deepEqual(cedo.proximos, ['acordar', 'cama', 'cafe']);
  assert.deepEqual([cedo.agora, cedo.depois], [null, { id: 'acordar', faltam: 90 }]);
});

test('sequências em risco: as primeiras, da mais longa para a mais curta, e o total', () => {
  const habitos = Array.from({ length: 7 }, (_, i) => ({ id: `h${i}`, tipo: 'simnao', arquivado: false }));
  // h0 vem de 2 dias seguidos até ontem (12/11), h1 de 3, e assim por diante.
  const registros = Object.fromEntries(
    habitos.map((x, i) => [
      x.id,
      Object.fromEntries(
        Array.from({ length: i + 2 }, (_, d) => [`2026-11-${String(12 - d).padStart(2, '0')}`, 'feito']),
      ),
    ]),
  );
  const { emRisco } = resumoDoDia({ ...vazio, habitos, registros });
  assert.equal(emRisco.total, 7);
  assert.deepEqual(
    emRisco.primeiras.map(({ habito, dias }) => [habito.id, dias]),
    [
      ['h6', 8],
      ['h5', 7],
      ['h4', 6],
      ['h3', 5],
      ['h2', 4],
    ],
  );
});
