import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  SO_DESTE_APARELHO,
  carimbar,
  lerCaminho,
  mesclar,
  pedacos,
  remontar,
} from '../../www/js/nucleo/mesclar.js';
import { lerEstado } from '../../www/js/nucleo/estado.js';

// O teste de mutação reduz os casos (stryker.config.mjs), como em propriedades.test.js.
const OPCOES = { seed: 20261123, numRuns: Number(process.env.FOCO_CASOS_POR_PROPRIEDADE) || 300 };
const c = (...partes) => JSON.stringify(partes);

const base = () => ({
  versao: 11,
  aba: 'tarefas',
  listaAtiva: 'l1',
  rotinaAtiva: null,
  rotinaDoDiaEm: '2026-11-23',
  rotinas: [{ id: 'r1', nome: 'Manhã', diasDaSemana: [], itens: [] }],
  habitos: [{ id: 'h1', nome: 'Ler' }],
  pausas: [],
  listas: [{ id: 'l1', nome: 'Tarefas' }],
  tarefas: [
    { id: 't1', listaId: 'l1', titulo: 'Prova' },
    { id: 't2', listaId: 'l1', titulo: 'Trabalho' },
  ],
  registros: { h1: { '2026-11-22': 'feito', '2026-11-23': 3 } },
  notasHabito: {},
  ordemTarefas: 'data',
  avisosDoDia: { manha: true, noite: false },
});

// Uma cópia como o app guarda para sincronizar: pedaços e carimbos de todos eles.
const copia = (estado, quando) => {
  const p = pedacos(estado);
  return { pedacos: p, carimbos: carimbar({}, new Map(), p, quando) };
};

// Edita o estado e carimba a diferença, como o app fará ao salvar.
const editar = (anterior, quando, mudar) => {
  const estado = remontar(anterior.pedacos, base());
  mudar(estado);
  const depois = pedacos(estado);
  return { pedacos: depois, carimbos: carimbar(anterior.carimbos, anterior.pedacos, depois, quando) };
};

test('pedaços: um por item, um pela ordem de cada coleção, um por célula e um por preferência', () => {
  const p = pedacos(base());
  assert.equal(p.get(c('item', 'tarefas', 't1')), JSON.stringify(base().tarefas[0]));
  assert.equal(p.get(c('ordem', 'tarefas')), '["t1","t2"]');
  assert.equal(p.get(c('ordem', 'pausas')), '[]');
  assert.equal(p.get(c('celula', 'registros', 'h1', '2026-11-23')), '3');
  assert.equal(p.get(c('pref', 'avisosDoDia')), '{"manha":true,"noite":false}');
  // O que é da tela deste aparelho não vira pedaço.
  for (const chave of SO_DESTE_APARELHO) assert.ok(![...p.keys()].some((k) => JSON.parse(k).includes(chave)));
  assert.equal(p.size, 14);
});

test('remontar: os pedaços de um estado voltam ao mesmo estado, com a tela deste aparelho', () => {
  const local = { ...base(), aba: 'habitos', listaAtiva: 'outra' };
  assert.deepEqual(remontar(pedacos(base()), local), local);
  // Sem as chaves locais (aparelho novo), elas simplesmente não aparecem.
  const semLocal = remontar(pedacos(base()), {});
  for (const chave of SO_DESTE_APARELHO) assert.ok(!(chave in semLocal));
  assert.deepEqual(semLocal.tarefas, base().tarefas);
});

test('carimbar: só o que mudou, entrou ou saiu ganha o instante; o resto fica como estava', () => {
  const antes = new Map([
    ['a', '1'],
    ['b', '2'],
    ['c', '3'],
  ]);
  const depois = new Map([
    ['a', '1'],
    ['b', '20'],
    ['d', '4'],
  ]);
  const carimbos = { a: 5, b: 5, c: 5 };
  assert.deepEqual(carimbar(carimbos, antes, depois, 100), { a: 5, b: 100, c: 100, d: 100 });
  assert.deepEqual(carimbos, { a: 5, b: 5, c: 5 }); // não muda o objeto recebido
  // Relógio que voltou no tempo: a mudança ainda fica acima da versão que ela substituiu.
  assert.deepEqual(carimbar({ b: 500 }, antes, depois, 100).b, 501);
});

test('mesclar: cada lado mudou uma coisa diferente e as duas mudanças chegam', () => {
  const comum = copia(base(), 10);
  const celular = editar(comum, 20, (e) => {
    e.tarefas[0].titulo = 'Prova de cálculo';
  });
  const pc = editar(comum, 30, (e) => {
    e.registros.h1['2026-11-24'] = 'feito';
    e.ordemTarefas = 'manual';
  });
  const junto = remontar(mesclar(celular, pc).pedacos, base());
  assert.equal(junto.tarefas[0].titulo, 'Prova de cálculo');
  assert.equal(junto.registros.h1['2026-11-24'], 'feito');
  assert.equal(junto.ordemTarefas, 'manual');
});

test('mesclar: a mesma coisa mudada nos dois lados fica com a mudança mais nova', () => {
  const comum = copia(base(), 10);
  const antiga = editar(comum, 20, (e) => {
    e.tarefas[1].titulo = 'Trabalho A';
  });
  const nova = editar(comum, 25, (e) => {
    e.tarefas[1].titulo = 'Trabalho B';
  });
  assert.equal(remontar(mesclar(antiga, nova).pedacos, {}).tarefas[1].titulo, 'Trabalho B');
  assert.equal(remontar(mesclar(nova, antiga).pedacos, {}).tarefas[1].titulo, 'Trabalho B');
});

test('mesclar: excluir num aparelho exclui no outro, e a lápide fica para a próxima vez', () => {
  const comum = copia(base(), 10);
  const semT1 = editar(comum, 20, (e) => {
    e.tarefas.shift();
    delete e.registros.h1['2026-11-22'];
  });
  const junto = mesclar(comum, semT1);
  const estado = remontar(junto.pedacos, {});
  assert.deepEqual(
    estado.tarefas.map((t) => t.id),
    ['t2'],
  );
  assert.deepEqual(estado.registros, { h1: { '2026-11-23': 3 } });
  assert.equal(junto.carimbos[c('item', 'tarefas', 't1')], 20);
  // Editar depois de excluído, no outro aparelho, traz o item de volta (a mudança é mais nova).
  const editada = editar(comum, 30, (e) => {
    e.tarefas[0].titulo = 'Prova adiada';
  });
  const voltou = remontar(mesclar(junto, editada).pedacos, {}).tarefas;
  assert.equal(voltou.find((t) => t.id === 't1').titulo, 'Prova adiada');
});

test('mesclar: arrastar muda só a ordem; item novo do outro aparelho entra no fim', () => {
  const comum = copia(base(), 10);
  const arrastou = editar(comum, 20, (e) => {
    e.tarefas.reverse();
  });
  const criou = editar(comum, 30, (e) => {
    e.tarefas.unshift({ id: 't0', listaId: 'l1', titulo: 'Nova' });
  });
  const ids = remontar(mesclar(arrastou, criou).pedacos, {}).tarefas.map((t) => t.id);
  // A ordem mais nova é a de quem criou; a do arrasto perdeu, mas nenhum item se perdeu.
  assert.deepEqual(ids, ['t0', 't1', 't2']);
  const ids2 = remontar(
    mesclar(
      editar(comum, 40, (e) => e.tarefas.reverse()),
      criou,
    ).pedacos,
    {},
  ).tarefas.map((t) => t.id);
  assert.deepEqual(ids2, ['t2', 't1', 't0']);
});

test('mesclar: empate de carimbo decide igual nos dois aparelhos, e o conteúdo vence a lápide', () => {
  const a = { pedacos: new Map([[c('pref', 'x'), '"a"']]), carimbos: { [c('pref', 'x')]: 7 } };
  const b = { pedacos: new Map([[c('pref', 'x'), '"b"']]), carimbos: { [c('pref', 'x')]: 7 } };
  const lapide = { pedacos: new Map(), carimbos: { [c('pref', 'x')]: 7 } };
  assert.equal(mesclar(a, b).pedacos.get(c('pref', 'x')), '"b"');
  assert.equal(mesclar(b, a).pedacos.get(c('pref', 'x')), '"b"');
  assert.equal(mesclar(lapide, a).pedacos.get(c('pref', 'x')), '"a"');
  assert.equal(mesclar(a, lapide).pedacos.get(c('pref', 'x')), '"a"');
  assert.deepEqual(mesclar(lapide, lapide), lapide);
  // Pedaço sem carimbo conta como o mais antigo possível.
  const semCarimbo = { pedacos: new Map([[c('pref', 'x'), '"z"']]), carimbos: {} };
  assert.equal(mesclar(semCarimbo, a).pedacos.get(c('pref', 'x')), '"a"');
  assert.equal(mesclar(semCarimbo, semCarimbo).carimbos[c('pref', 'x')], 0);
});

test('caminhos: só os quatro formatos conhecidos; o resto é ignorado sem exceção', () => {
  assert.deepEqual(lerCaminho(c('item', 'tarefas', 't1')), ['item', 'tarefas', 't1']);
  assert.deepEqual(lerCaminho(c('ordem', 'habitos')), ['ordem', 'habitos']);
  assert.deepEqual(lerCaminho(c('celula', 'notasHabito', 'h1', '2026-11-23')), [
    'celula',
    'notasHabito',
    'h1',
    '2026-11-23',
  ]);
  assert.deepEqual(lerCaminho(c('pref', 'ordemTarefas')), ['pref', 'ordemTarefas']);
  for (const ruim of [
    'não é json',
    '{"a":1}',
    '"item"',
    c('item', 'tarefas'),
    c('item', 'outra', 'x'),
    c('item', 'tarefas', ''),
    c('item', 'tarefas', 5),
    c('ordem', 'tarefas', 'x'),
    c('ordem', 'registros'),
    c('celula', 'registros', 'h1'),
    c('celula', 'tarefas', 'h1', 'd'),
    c('outro', 'registros', 'h1', 'd'),
    c('pref', 'aba'),
    c('pref', 'tarefas'),
    c('pref', 'registros'),
    c('pref', 'x', 'y'),
    c('outro', 'x'),
  ]) {
    assert.equal(lerCaminho(ruim), null, ruim);
  }
  // Só texto: uma lista com o caminho dentro não vale, mesmo que vire o caminho ao ser convertida.
  assert.equal(lerCaminho([c('pref', 'x')]), null);
  assert.equal(lerCaminho(5), null);
});

test('dado de fora malformado: caminho ou conteúdo estranho some, o resto chega', () => {
  const estranha = {
    pedacos: new Map([
      [c('pref', 'aba'), '"painel"'],
      [c('item', 'tarefas', 't9'), '{quebrado'],
      [c('ordem', 'tarefas'), '"não é lista"'],
      [c('item', 'tarefas', 't8'), '{"id":"t8"}'],
      [c('item', 'tarefas', 't7'), '{"id":"t7"}'],
      ['__proto__', '{"poluir":true}'],
    ]),
    carimbos: JSON.parse(`{"__proto__": 1, ${JSON.stringify(c('pref', 'aba'))}: 1}`),
  };
  const junto = mesclar(estranha, { pedacos: new Map(), carimbos: {} });
  assert.ok(!junto.pedacos.has('__proto__'));
  assert.ok(!junto.pedacos.has(c('pref', 'aba')));
  const estado = remontar(junto.pedacos, { aba: 'tarefas' });
  assert.equal(estado.aba, 'tarefas');
  assert.deepEqual(
    estado.tarefas.map((t) => t.id),
    ['t7', 't8'],
  );
  assert.deepEqual(estado.registros, {});
  assert.equal({}.poluir, undefined);
  // remontar também ignora sozinho caminho e conteúdo ruins (pedaços que não passaram pela junção).
  const direto = remontar(
    new Map([
      ['lixo', '1'],
      [c('item', 'tarefas', 't1'), 'lixo'],
      [c('celula', 'registros', 'h1', 'd1'), '1'],
      [c('celula', 'registros', 'h1', 'd2'), '2'],
      // Conteúdo que não é texto não é lido como JSON: 5 viraria a preferência 5.
      [c('pref', 'numero'), 5],
      [c('pref', 'nulo'), null],
    ]),
    {},
  );
  assert.deepEqual(direto.tarefas, []);
  assert.deepEqual(direto.registros, { h1: { d1: 1, d2: 2 } });
  assert.ok(!Object.hasOwn(direto, 'numero'));
  assert.ok(!Object.hasOwn(direto, 'nulo'));
});

test('nomes que mexeriam no protótipo viram campos comuns, sem poluir nada e sem se perder', () => {
  const juntos = new Map([
    [c('celula', 'registros', '__proto__', 'd1'), '1'],
    [c('celula', 'registros', 'toString', 'd1'), '2'],
    [c('celula', 'registros', 'toString', 'hasOwnProperty'), '3'],
    [c('celula', 'notasHabito', 'h1', '__proto__'), '"nota"'],
    [c('pref', 'constructor'), '"x"'],
    [c('item', 'tarefas', '__proto__'), '{"id":"__proto__","titulo":"Estranha"}'],
  ]);
  for (const partes of juntos.keys()) assert.ok(lerCaminho(partes), partes);
  const estado = remontar(juntos, {});
  assert.deepEqual(Object.keys(estado.registros), ['__proto__', 'toString']);
  assert.equal(Object.getOwnPropertyDescriptor(estado.registros, '__proto__').value.d1, 1);
  assert.deepEqual(estado.registros.toString, { d1: 2, hasOwnProperty: 3 });
  assert.equal(Object.getOwnPropertyDescriptor(estado.notasHabito.h1, '__proto__').value, 'nota');
  assert.equal(Object.getOwnPropertyDescriptor(estado, 'constructor').value, 'x');
  assert.deepEqual(
    estado.tarefas.map((t) => t.titulo),
    ['Estranha'],
  );
  // Nenhum protótipo mudou: nem o dos objetos montados, nem o de todos os objetos.
  for (const objeto of [estado, estado.registros, estado.notasHabito.h1]) {
    assert.equal(Object.getPrototypeOf(objeto), Object.prototype);
  }
  assert.equal({}.d1, undefined);
  assert.equal(typeof Object.prototype.toString, 'function');
  // E a ida e volta preserva tudo (mais a ordem de cada coleção, que remontar sempre refaz).
  const ida = pedacos(estado);
  for (const [k, v] of juntos) assert.equal(ida.get(k), v, k);
  assert.equal(ida.get(c('ordem', 'tarefas')), '["__proto__"]');
});

test('remontar: ordem com id repetido ou sem item é ignorada nessa parte; os de fora vêm em ordem fixa', () => {
  const estado = remontar(
    new Map([
      [c('item', 'tarefas', 't3'), '{"id":"t3"}'],
      [c('item', 'tarefas', 't1'), '{"id":"t1"}'],
      [c('item', 'tarefas', 't2'), '{"id":"t2"}'],
      [c('item', 'tarefas', 't4'), '{"id":"t4"}'],
      [c('ordem', 'tarefas'), '["t9","t2","t2"]'],
    ]),
    {},
  );
  assert.deepEqual(
    estado.tarefas.map((t) => t.id),
    ['t2', 't1', 't3', 't4'],
  );
});

test('o id do item é o do caminho, mesmo que o conteúdo diga outro ou não diga nenhum', () => {
  const estado = remontar(
    new Map([
      [c('item', 'tarefas', 't1'), '{"id":"t2","titulo":"A"}'],
      [c('item', 'tarefas', 't3'), '{"titulo":"B"}'],
      [c('item', 'tarefas', 't4'), '[1]'],
    ]),
    {},
  );
  assert.deepEqual(estado.tarefas, [{ id: 't1', titulo: 'A' }, { id: 't3', titulo: 'B' }, [1]]);
});

test('carimbo de fora estranho (texto, NaN, negativo, fração) conta como zero, nos dois sentidos', () => {
  const k = c('pref', 'x');
  for (const estranho of ['9', Number.NaN, -1, 1.5, null, Infinity]) {
    const ruim = { pedacos: new Map([[k, '"ruim"']]), carimbos: { [k]: estranho } };
    const boa = { pedacos: new Map([[k, '"boa"']]), carimbos: { [k]: 1 } };
    assert.equal(mesclar(ruim, boa).pedacos.get(k), '"boa"', String(estranho));
    assert.deepEqual(mesclar(ruim, boa), mesclar(boa, ruim), String(estranho));
    // Ao carimbar por cima de um carimbo estranho, o novo é número: "9" + 1 não vira "91".
    assert.equal(carimbar({ [k]: estranho }, new Map(), new Map([[k, '1']]), 5)[k], 5);
  }
  // Negativo conta como zero também ao carimbar: o novo carimbo fica acima de zero.
  assert.equal(carimbar({ [k]: -5 }, new Map(), new Map([[k, '1']]), 0)[k], 1);
  // "agora" fora do contrato também conta como zero: o carimbo sai válido e acima do anterior.
  for (const agora of [Number.NaN, 1.5, -1, '9']) {
    assert.equal(carimbar({ [k]: 7 }, new Map(), new Map([[k, '1']]), agora)[k], 8, String(agora));
  }
});

test('no empate, a lápide perde até de conteúdo vazio, e conteúdo que não é texto vale como lápide', () => {
  const k = c('pref', 'x');
  const lapide = { pedacos: new Map(), carimbos: { [k]: 3 } };
  const vazio = { pedacos: new Map([[k, '']]), carimbos: { [k]: 3 } };
  const naoTexto = { pedacos: new Map([[k, 7]]), carimbos: { [k]: 3 } };
  assert.equal(mesclar(lapide, vazio).pedacos.get(k), '');
  assert.equal(mesclar(vazio, lapide).pedacos.get(k), '');
  assert.equal(mesclar(naoTexto, vazio).pedacos.get(k), '');
  assert.equal(mesclar(naoTexto, lapide).pedacos.has(k), false);
});

test('cópia de fora com pedaços ou carimbos de tipo errado vale como vazia nessa parte', () => {
  const k = c('pref', 'x');
  const boa = { pedacos: new Map([[k, '"a"']]), carimbos: { [k]: 2 } };
  for (const ruim of [
    null,
    undefined,
    5,
    {},
    { pedacos: {}, carimbos: null },
    { pedacos: [[k, '"b"']], carimbos: 7 },
  ]) {
    assert.deepEqual(mesclar(ruim, boa), boa);
    assert.deepEqual(mesclar(boa, ruim), boa);
  }
  assert.deepEqual(mesclar(null, null), { pedacos: new Map(), carimbos: {} });
  // remontar também não quebra com entrada de tipo errado.
  for (const [juntos, local] of [
    [null, null],
    [{}, 5],
    [new Map([[5, '1']]), { aba: 'painel' }],
  ]) {
    const estado = remontar(juntos, local);
    assert.deepEqual(estado.tarefas, []);
    assert.deepEqual(estado.registros, {});
  }
});

// ------------------------------------------------------------------ propriedades

const id = fc.constantFrom('a', 'b', 'c', 'd');
const caminhoQualquer = fc.oneof(
  fc.tuple(fc.constant('item'), fc.constantFrom('tarefas', 'habitos'), id),
  fc.tuple(fc.constant('ordem'), fc.constantFrom('tarefas', 'habitos')),
  fc.tuple(fc.constant('celula'), fc.constant('registros'), id, fc.constantFrom('d1', 'd2')),
  fc.tuple(fc.constant('pref'), fc.constantFrom('ordemTarefas', 'lembretes')),
);
// Quase sempre um instante pequeno (para haver empate); às vezes um carimbo estranho vindo de fora.
const carimboQualquer = fc.oneof(
  { weight: 9, arbitrary: fc.integer({ min: 0, max: 5 }) },
  { weight: 1, arbitrary: fc.constantFrom('3', Number.NaN, -1, 1.5, null) },
);
// Uma cópia: todo caminho tem carimbo; alguns são lápides (sem pedaço).
const copiaQualquer = fc
  .array(fc.tuple(caminhoQualquer, carimboQualquer, fc.option(fc.constantFrom('1', '2', '"x"', ''))), {
    maxLength: 12,
  })
  .map((linhas) => {
    const pedacosGerados = new Map();
    const carimbos = {};
    for (const [partes, carimbo, conteudo] of linhas) {
      const k = JSON.stringify(partes);
      carimbos[k] = carimbo;
      if (conteudo === null) pedacosGerados.delete(k);
      else pedacosGerados.set(k, conteudo);
    }
    return { pedacos: pedacosGerados, carimbos };
  });

test('propriedade: a ordem de quem junta não importa (comutativa)', () => {
  fc.assert(
    fc.property(copiaQualquer, copiaQualquer, (a, b) => {
      const ab = mesclar(a, b);
      const ba = mesclar(b, a);
      assert.deepEqual(ab, ba);
      // Até a ordem das chaves é a mesma: o texto salvo dos dois aparelhos fica idêntico.
      assert.deepEqual(Object.keys(ab.carimbos), Object.keys(ba.carimbos));
      assert.deepEqual([...ab.pedacos.keys()], [...ba.pedacos.keys()]);
    }),
    OPCOES,
  );
});

test('propriedade: juntar de novo não muda nada, e juntar em grupos dá o mesmo (idempotente e associativa)', () => {
  fc.assert(
    fc.property(copiaQualquer, copiaQualquer, copiaQualquer, (a, b, d) => {
      const ab = mesclar(a, b);
      assert.deepEqual(mesclar(ab, ab), ab);
      assert.deepEqual(mesclar(ab, a), ab);
      assert.deepEqual(mesclar(mesclar(a, b), d), mesclar(a, mesclar(b, d)));
    }),
    OPCOES,
  );
});

test('propriedade: a mudança mais nova de um lado sempre chega ao resultado', () => {
  fc.assert(
    fc.property(copiaQualquer, copiaQualquer, caminhoQualquer, (a, b, partes) => {
      const k = JSON.stringify(partes);
      const agora = 1000;
      const editada = {
        pedacos: new Map([...a.pedacos, [k, '"novo"']]),
        carimbos: carimbar(a.carimbos, a.pedacos, new Map([...a.pedacos, [k, '"novo"']]), agora),
      };
      assert.equal(mesclar(editada, b).pedacos.get(k), '"novo"');
    }),
    OPCOES,
  );
});

// Estados válidos: dados gerados passam pela leitura do app, como um backup importado. Os ids
// incluem nomes do protótipo e textos quaisquer de até 64 caracteres.
const contexto = () => {
  let n = 0;
  return {
    dia: '2026-11-23',
    gerarId: () => {
      n += 1;
      return `novo${n}`;
    },
  };
};
const idValido = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom('a', 'b', 'c', 'constructor', 'toString', 'hasOwnProperty') },
  { weight: 1, arbitrary: fc.string({ minLength: 1, maxLength: 64 }) },
);
const nome = fc.string({ minLength: 1, maxLength: 12 });
const unicos = (registro, minimo) =>
  fc.uniqueArray(registro, { selector: (x) => x.id, minLength: minimo, maxLength: 4 });
const estadoValido = fc
  .record({
    habitos: unicos(fc.record({ id: idValido, nome }), 0),
    listas: unicos(fc.record({ id: idValido, nome }), 1),
    tarefas: unicos(fc.record({ id: idValido, titulo: nome }), 0),
    dias: fc.uniqueArray(fc.constantFrom('2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23'), {
      maxLength: 3,
    }),
  })
  .map(({ habitos, listas, tarefas, dias }) => {
    const dados = {
      ...base(),
      habitos,
      listas,
      tarefas: tarefas.map((t, i) => ({ ...t, listaId: listas[i % listas.length].id })),
      registros: Object.fromEntries(
        habitos.map((h) => [h.id, Object.fromEntries(dias.map((d) => [d, 'feito']))]),
      ),
      notasHabito: {},
    };
    return lerEstado(JSON.stringify(dados), contexto()).estado;
  });

test('propriedade: o estado válido vai a pedaços e volta, e passa na validação sem aviso nem perda', () => {
  fc.assert(
    fc.property(estadoValido, (estado) => {
      const volta = remontar(pedacos(estado), estado);
      assert.deepEqual(volta, estado);
      const relido = lerEstado(JSON.stringify(volta), contexto());
      assert.deepEqual(relido.avisos, []);
      assert.deepEqual(relido.estado, estado);
    }),
    OPCOES,
  );
});
