import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AVISOS_DE_CONTA,
  HORA_PADRAO,
  MAXIMO_DE_ANTECEDENCIA,
  MAXIMO_DE_LEMBRETES,
  OPCOES_DE_AVISO,
  avisosValidos,
  idDaNotificacao,
  planejar,
} from '../../www/js/nucleo/lembretes.js';

const AGORA = '2026-11-12T10:00';
const LISTAS = [
  { id: 'fac', nome: 'Faculdade' },
  { id: 'casa', nome: 'Casa' },
];

let relogio = 0;
function tarefa(id, extra = {}) {
  relogio += 1;
  return {
    id,
    listaId: 'fac',
    titulo: `Tarefa ${id}`,
    notas: '',
    prazo: '2026-11-13',
    hora: null,
    avisos: [],
    feita: false,
    criadaEm: relogio,
    ...extra,
  };
}

test('id da notificação: inteiro de 1 a 2^30, estável e diferente entre tarefas', () => {
  const ids = ['a', 'b', 'mhx3k2p0001abcd', 'mhx3k2p0002abcd', ''].map(idDaNotificacao);
  for (const id of ids) {
    assert.ok(Number.isInteger(id) && id > 0 && id <= 2 ** 30, String(id));
  }
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(idDaNotificacao('mhx3k2p0001abcd'), idDaNotificacao('mhx3k2p0001abcd'));
});

test('tarefa com horário avisa na hora; só com data, de manhã', () => {
  const plano = planejar([tarefa('com-hora', { hora: '14:30' }), tarefa('sem-hora')], LISTAS, AGORA);
  assert.equal(HORA_PADRAO, '09:00');
  assert.deepEqual(
    plano.map((l) => [l.tarefaId, l.quando]),
    [
      ['sem-hora', '2026-11-13T09:00'],
      ['com-hora', '2026-11-13T14:30'],
    ],
  );
  assert.equal(plano[0].id, idDaNotificacao('sem-hora'));
  assert.equal(plano[0].titulo, 'Tarefa sem-hora');
});

test('ficam de fora: concluída, sem data e a que já passou', () => {
  const plano = planejar(
    [
      tarefa('feita', { feita: true }),
      tarefa('sem-data', { prazo: null }),
      tarefa('ontem', { prazo: '2026-11-11' }),
      tarefa('hoje-cedo', { prazo: '2026-11-12', hora: '09:59' }),
      tarefa('hoje-agora', { prazo: '2026-11-12', hora: '10:00' }),
      tarefa('hoje-sem-hora', { prazo: '2026-11-12' }), // o aviso das 9h já passou
      tarefa('hoje-tarde', { prazo: '2026-11-12', hora: '10:01' }),
    ],
    LISTAS,
    AGORA,
  );
  assert.deepEqual(
    plano.map((l) => l.tarefaId),
    ['hoje-tarde'],
  );
});

test('a ordem é a do relógio; no mesmo momento, a criada antes vem primeiro', () => {
  const plano = planejar(
    [
      tarefa('c', { prazo: '2026-11-20' }),
      tarefa('b', { prazo: '2026-11-13', hora: '08:00' }),
      tarefa('a2', { prazo: '2026-11-12', hora: '18:00' }),
      tarefa('a1', { prazo: '2026-11-12', hora: '18:00', criadaEm: 0 }),
    ],
    LISTAS,
    AGORA,
  );
  assert.deepEqual(
    plano.map((l) => l.tarefaId),
    ['a1', 'a2', 'b', 'c'],
  );
});

test('o corpo junta a lista e a primeira linha da nota, cortada com reticências', () => {
  const longa = 'x'.repeat(200);
  const [simples, comNota, semLista, cortada] = planejar(
    [
      tarefa('1'),
      tarefa('2', { listaId: 'casa', notas: '  Levar o certificado  \nsegunda linha' }),
      tarefa('3', { listaId: 'apagada', notas: 'Só a nota' }),
      tarefa('4', { notas: longa }),
    ],
    LISTAS,
    AGORA,
  ).map((l) => l.corpo);
  assert.equal(simples, 'Faculdade');
  assert.equal(comNota, 'Casa · Levar o certificado');
  assert.equal(semLista, 'Só a nota');
  assert.equal(cortada, `Faculdade · ${'x'.repeat(119)}…`);
});

test('o plano fica com os lembretes mais próximos, até o máximo', () => {
  const muitas = Array.from({ length: MAXIMO_DE_LEMBRETES + 5 }, (_, i) =>
    tarefa(`t${i}`, {
      prazo: '2026-12-01',
      hora: `${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`,
    }),
  );
  const plano = planejar([...muitas].reverse(), LISTAS, AGORA);
  assert.equal(plano.length, MAXIMO_DE_LEMBRETES);
  assert.equal(plano[0].tarefaId, 't0');
  assert.equal(plano.at(-1).tarefaId, `t${MAXIMO_DE_LEMBRETES - 1}`);

  // Com outro máximo, vale o que foi pedido; Infinity devolve todos, na mesma ordem.
  assert.equal(planejar(muitas, LISTAS, AGORA, 3).length, 3);
  const todos = planejar([...muitas].reverse(), LISTAS, AGORA, Infinity);
  assert.equal(todos.length, MAXIMO_DE_LEMBRETES + 5);
  assert.deepEqual(todos.slice(0, MAXIMO_DE_LEMBRETES), plano);
});

test('sem limite e sem olhar o relógio: todo lembrete de tarefa pendente com prazo, até os que já passaram', () => {
  // É como o app pergunta "quais avisos continuam valendo": 60 atrasadas não tiram a de hoje.
  const atrasadas = Array.from({ length: MAXIMO_DE_LEMBRETES }, (_, i) =>
    tarefa(`velha${i}`, { prazo: '2026-11-01' }),
  );
  const hoje = tarefa('hoje', { prazo: '2026-11-12', hora: '09:00' });
  assert.equal(
    planejar([...atrasadas, hoje], LISTAS, '').some((l) => l.tarefaId === 'hoje'),
    false,
  );
  const vivos = planejar([...atrasadas, hoje], LISTAS, '', Infinity);
  assert.equal(vivos.length, MAXIMO_DE_LEMBRETES + 1);
  assert.equal(vivos.at(-1).tarefaId, 'hoje');
});

test('duas tarefas com o mesmo número de notificação: fica só o lembrete mais próximo', () => {
  // mesmo id de tarefa repetido força a coincidência do número
  const plano = planejar(
    [tarefa('igual', { prazo: '2026-11-20' }), tarefa('igual', { prazo: '2026-11-14' })],
    LISTAS,
    AGORA,
  );
  assert.deepEqual(
    plano.map((l) => l.quando),
    ['2026-11-14T09:00'],
  );
});

test('sem tarefas, o plano é vazio', () => {
  assert.deepEqual(planejar([], LISTAS, AGORA), []);
});

// ------------------------------------------------------ aviso antecipado

test('avisosValidos: dias inteiros de 1 ao máximo, sem repetir, em ordem; o resto vira vazio', () => {
  assert.equal(MAXIMO_DE_ANTECEDENCIA, 30);
  assert.deepEqual(avisosValidos([7, 3, 3, 1, 0, 31, -1, 2.5, '1', null]), [1, 3, 7]);
  for (const errado of [undefined, null, 'x', 3, { 0: 1 }]) assert.deepEqual(avisosValidos(errado), []);
  // O que a interface oferece e o padrão das contas passam pela validação sem mudar.
  assert.deepEqual(avisosValidos([...OPCOES_DE_AVISO]), [1, 3, 7]);
  assert.deepEqual(avisosValidos([...AVISOS_DE_CONTA]), [1, 3]);
});

test('tarefa com aviso antecipado: avisa em cada dia pedido, no prazo e na manhã seguinte', () => {
  const conta = tarefa('luz', { titulo: 'Luz', listaId: 'casa', prazo: '2026-11-20', avisos: [1, 3] });
  const plano = planejar([conta], LISTAS, AGORA);
  assert.deepEqual(
    plano.map((l) => [l.quando, l.corpo]),
    [
      ['2026-11-17T09:00', 'Vence em 3 dias, sex., 20 de nov. · Casa'],
      ['2026-11-19T09:00', 'Vence amanhã, sex., 20 de nov. · Casa'],
      ['2026-11-20T09:00', 'Casa'],
      ['2026-11-21T09:00', 'Venceu ontem e continua pendente · Casa'],
    ],
  );
  assert.ok(plano.every((l) => l.tarefaId === 'luz' && l.titulo === 'Luz'));
  assert.equal(new Set(plano.map((l) => l.id)).size, 4);
  assert.equal(plano[2].id, idDaNotificacao('luz')); // o do prazo continua com o número de sempre
  assert.deepEqual(Object.keys(plano[0]).sort(), ['corpo', 'id', 'quando', 'tarefaId', 'titulo']);
});

test('aviso antecipado: o que já passou fica de fora; tarefa com horário avisa antes de manhã', () => {
  const prova = tarefa('prova', { prazo: '2026-11-14', hora: '19:30', avisos: [1, 3, 7] });
  assert.deepEqual(
    planejar([prova], LISTAS, AGORA).map((l) => l.quando),
    ['2026-11-13T09:00', '2026-11-14T19:30', '2026-11-15T09:00'],
  );
});

test('atrasada com aviso: sobra só o lembrete da manhã seguinte, e depois dele mais nenhum', () => {
  const vencida = tarefa('agua', { prazo: '2026-11-12', hora: '09:00', avisos: [1] });
  assert.deepEqual(
    planejar([vencida], LISTAS, AGORA).map((l) => l.quando),
    ['2026-11-13T09:00'],
  );
  assert.deepEqual(planejar([vencida], LISTAS, '2026-11-13T09:00'), []);
});

test('sem aviso antecipado não há lembrete de atraso; concluir cancela todos os avisos', () => {
  const simples = tarefa('simples', { prazo: '2026-11-20' });
  assert.equal(planejar([simples], LISTAS, AGORA).length, 1);
  const paga = tarefa('paga', { prazo: '2026-11-20', avisos: [1, 3], feita: true });
  assert.deepEqual(planejar([paga], LISTAS, AGORA), []);
});
