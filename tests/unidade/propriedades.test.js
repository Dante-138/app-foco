// Testes por propriedade. Em vez de exemplos escolhidos à mão, o fast-check gera centenas de
// entradas, muitas delas malformadas, e confere regras que têm de valer para todas:
// ler dados salvos nunca lança exceção, a validação é estável (validar de novo não muda nada),
// a migração e o backup não perdem dados, e os cálculos de hábito ficam dentro dos limites.
// A semente é fixa: a mesma entrada, e o mesmo resultado, em qualquer máquina.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { ABAS, ORDENS_TAREFAS, VISAO_ESTRELA } from '../../www/js/nucleo/esquema.js';
import { VERSAO } from '../../www/js/nucleo/migracao.js';
import { PROBLEMA, lerEstado } from '../../www/js/nucleo/estado.js';
import { MOTIVO, gerarBackup, lerBackup } from '../../www/js/nucleo/backup.js';
import { UNIDADES } from '../../www/js/nucleo/repeticao.js';
import { pontuacao, sequencias } from '../../www/js/nucleo/habito-calculo.js';
import { somaDias } from '../../www/js/nucleo/datas.js';
import { paraProximaOcorrencia } from '../../www/js/nucleo/subtarefas.js';
import { abrirRotinaDoDia, definirDias, rotinaDoDia } from '../../www/js/nucleo/rotina-do-dia.js';

const DIA = '2026-11-14';
const OPCOES = { seed: 20261114, numRuns: 500 };
const MINIMO_COM_CONTEUDO = 0.1; // parte mínima dos estados gerados que precisa ter cada tipo de dado

function contexto() {
  let n = 0;
  const gerarId = () => {
    n += 1;
    return `novo${n}`;
  };
  return { dia: DIA, gerarId };
}

// ------------------------------------------------------------- geradores
// Cada campo sai quase sempre plausível e, uma vez em dez, um valor qualquer.
const talvez = (certo) => fc.oneof({ weight: 9, arbitrary: certo }, { weight: 1, arbitrary: fc.jsonValue() });
const registro = (campos) => fc.record(campos, { requiredKeys: [] });
const curto = fc.string({ minLength: 1, maxLength: 12 });
// Poucos ids, para as referências entre as coleções acertarem com frequência.
const id = fc.oneof(
  { weight: 6, arbitrary: fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h') },
  { weight: 1, arbitrary: curto },
);
// Datas quase sempre válidas; as três últimas não são.
const dia = fc.constantFrom(
  '2026-11-12',
  '2026-11-13',
  DIA,
  DIA,
  '2026-11-15',
  '2026-12-01',
  '2027-01-10',
  '2026-02-30',
  'ontem',
  '',
);
const hora = fc.constantFrom('06:30', '23:59', '24:00', '7:5', '', null);
const logico = talvez(fc.boolean());

const item = registro({
  id: talvez(id),
  tipo: talvez(fc.constantFrom('item', 'secao', 'outro')),
  texto: talvez(curto),
  hora: talvez(hora),
  habitoId: talvez(fc.option(id)),
});
const rotina = registro({
  id: talvez(id),
  nome: talvez(curto),
  diasDaSemana: talvez(fc.array(fc.integer({ min: -1, max: 7 }), { maxLength: 8 })),
  itens: talvez(fc.array(item, { maxLength: 6 })),
});
const habito = registro({
  id: talvez(id),
  nome: talvez(curto),
  cor: talvez(fc.constantFrom('azul', 'verde', 'vermelho', '#5aaaf5', 'roxo')),
  tipo: talvez(fc.constantFrom('simnao', 'numero', 'outro')),
  unidade: talvez(fc.option(curto)),
  meta: talvez(fc.option(fc.oneof(fc.integer({ min: -2, max: 50 }), fc.double({ noNaN: true })))),
  arquivado: logico,
  diasDaSemana: talvez(fc.oneof(fc.array(fc.integer({ min: -1, max: 8 }), { maxLength: 9 }), curto)),
});
const marca = fc.oneof(
  fc.constantFrom('feito', 'pulado', 'talvez'),
  fc.integer({ min: -3, max: 30 }),
  fc.double(),
);
const tarefa = registro({
  id: talvez(id),
  listaId: talvez(id),
  titulo: talvez(curto),
  notas: talvez(curto),
  prazo: talvez(fc.option(dia)),
  hora: talvez(hora),
  repeticao: talvez(
    fc.option(
      // As duas chaves sempre presentes: sem elas a repetição quase nunca seria válida e o
      // gerador deixaria de cobrir tarefas que repetem (chave ausente fica com os testes do esquema).
      fc.record({
        cada: talvez(fc.integer({ min: -1, max: 120 })),
        unidade: talvez(fc.constantFrom(...UNIDADES, 'seculo')),
      }),
    ),
  ),
  estrela: logico,
  feita: logico,
  criadaEm: talvez(fc.integer()),
  feitaEm: talvez(fc.option(fc.integer())),
  subtarefas: talvez(
    fc.array(registro({ id: talvez(id), titulo: talvez(curto), feita: logico }), { maxLength: 4 }),
  ),
});
const estadoRuim = registro({
  versao: talvez(fc.integer({ min: -1, max: VERSAO + 2 })),
  aba: talvez(fc.constantFrom(...ABAS, 'outra')),
  rotinas: talvez(fc.array(rotina, { maxLength: 4 })),
  rotinaAtiva: talvez(fc.option(id)),
  rotinaDoDiaEm: talvez(fc.option(dia)),
  marcasRotina: talvez(
    registro({
      data: talvez(dia),
      porRotina: talvez(fc.dictionary(id, talvez(fc.array(id, { maxLength: 5 })), { maxKeys: 4 })),
    }),
  ),
  marcadosNoFim: logico,
  habitos: talvez(fc.array(habito, { maxLength: 5 })),
  registros: talvez(fc.dictionary(id, talvez(fc.dictionary(dia, marca, { maxKeys: 5 })), { maxKeys: 5 })),
  notasHabito: talvez(
    fc.dictionary(id, talvez(fc.dictionary(dia, talvez(curto), { maxKeys: 4 })), { maxKeys: 4 }),
  ),
  ocultarConcluidos: logico,
  ocultarArquivados: logico,
  listas: talvez(fc.array(registro({ id: talvez(id), nome: talvez(curto) }), { maxLength: 4 })),
  listaAtiva: talvez(fc.oneof(id, fc.constant(VISAO_ESTRELA))),
  tarefas: talvez(fc.array(tarefa, { maxLength: 6 })),
  ordemTarefas: talvez(fc.constantFrom(...ORDENS_TAREFAS, 'outra')),
  lembretes: logico,
});
// Referências geradas ao acaso quase nunca apontam para algo que existe. Em três de cada quatro casos,
// as marcas do dia, a ligação item-hábito, os registros e as notas são refeitos a partir das
// rotinas e dos hábitos gerados, para esses campos chegarem preenchidos à validação.
function ligarReferencias(dados) {
  const ligado = structuredClone(dados);
  const rotinas = Array.isArray(ligado.rotinas) ? ligado.rotinas.filter((r) => Array.isArray(r?.itens)) : [];
  const habitos = Array.isArray(ligado.habitos)
    ? ligado.habitos.filter((x) => typeof x?.id === 'string')
    : [];
  ligado.marcasRotina = {
    data: DIA,
    porRotina: Object.fromEntries(rotinas.map((r) => [r.id, r.itens.slice(0, 2).map((i) => i?.id)])),
  };
  for (const r of rotinas) {
    if (habitos.length && typeof r.itens[0] === 'object' && r.itens[0]) r.itens[0].habitoId = habitos[0].id;
  }
  ligado.registros = Object.fromEntries(
    habitos.map((x) => [x.id, { [DIA]: 'feito', '2026-11-13': 'pulado' }]),
  );
  ligado.notasHabito = Object.fromEntries(habitos.map((x) => [x.id, { [DIA]: 'nota do dia' }]));
  return ligado;
}
const estadoRuimLigado = fc
  .tuple(estadoRuim, fc.integer({ min: 0, max: 3 }))
  .map(([dados, sorteio]) => (sorteio > 0 ? ligarReferencias(dados) : dados));

// Um estado válido qualquer: o que a leitura devolve a partir de dados ruins.
const estadoValido = estadoRuimLigado.map((dados) => lerEstado(JSON.stringify(dados), contexto()).estado);

// ------------------------------------------------- leitura dos dados salvos

test('propriedade: ler os dados salvos nunca lança exceção, seja qual for o texto', () => {
  const texto = fc.oneof(
    fc.string(),
    fc.json(),
    estadoRuimLigado.map((dados) => JSON.stringify(dados)),
  );
  fc.assert(
    fc.property(texto, (bruto) => {
      const { estado, problema, avisos } = lerEstado(bruto, contexto());
      assert.equal(estado.versao, VERSAO);
      assert.ok(problema === null || Object.values(PROBLEMA).includes(problema));
      assert.ok(Array.isArray(avisos));
      assert.ok(estado.listas.length >= 1, 'sempre sobra uma lista');
    }),
    OPCOES,
  );
});

test('propriedade: a validação é estável; validar de novo o que ela devolveu não muda nada', () => {
  fc.assert(
    fc.property(estadoRuimLigado, (dados) => {
      const primeira = lerEstado(JSON.stringify(dados), contexto());
      const segunda = lerEstado(JSON.stringify(primeira.estado), contexto());
      assert.deepEqual(segunda.estado, primeira.estado);
      assert.deepEqual(segunda.avisos, []);
      assert.equal(segunda.problema, null);
    }),
    OPCOES,
  );
});

test('propriedade: a migração preserva os dados; um estado válido marcado com versão antiga volta igual', () => {
  fc.assert(
    fc.property(estadoValido, fc.integer({ min: 1, max: VERSAO }), (estado, versao) => {
      const lido = lerEstado(JSON.stringify({ ...estado, versao }), contexto());
      assert.equal(lido.problema, null);
      assert.deepEqual(lido.estado, estado);
      assert.deepEqual(lido.avisos, []);
    }),
    OPCOES,
  );
});

// ------------------------------------------------------------------ backup

test('propriedade: o backup de um estado válido volta idêntico e sem correções', () => {
  fc.assert(
    fc.property(estadoValido, (estado) => {
      const lido = lerBackup(gerarBackup(estado), contexto());
      assert.equal(lido.ok, true);
      assert.deepEqual(lido.estado, estado);
      assert.equal(lido.correcoes, 0);
    }),
    OPCOES,
  );
});

test('propriedade: conferir um texto colado como backup nunca lança exceção', () => {
  fc.assert(
    fc.property(fc.oneof(fc.string(), fc.json(), fc.jsonValue()), (texto) => {
      const lido = lerBackup(texto, contexto());
      if (lido.ok) assert.equal(lido.estado.versao, VERSAO);
      else assert.ok(Object.values(MOTIVO).includes(lido.motivo));
    }),
    OPCOES,
  );
});

// ------------------------------------------------------- cálculos de hábito

test('propriedade: a pontuação fica entre 0 e 1 e a sequência atual nunca passa da melhor', () => {
  const habitoValido = fc.oneof(
    fc.constant({
      id: 'h',
      nome: 'Hábito',
      cor: 'azul',
      tipo: 'simnao',
      unidade: null,
      meta: null,
      arquivado: false,
    }),
    fc.double({ min: 0.5, max: 500, noNaN: true }).map((meta) => ({
      id: 'h',
      nome: 'Hábito',
      cor: 'azul',
      tipo: 'numero',
      unidade: 'x',
      meta,
      arquivado: false,
    })),
  );
  // Dias da semana em que o hábito vale: de um a sete, sem repetir, em ordem.
  const dias = fc
    .uniqueArray(fc.integer({ min: 0, max: 6 }), { minLength: 1, maxLength: 7 })
    .map((d) => d.sort((a, b) => a - b));
  // Dias de 60 antes a 5 depois de hoje, com as marcas que o formato aceita.
  const marcas = fc.dictionary(
    fc.integer({ min: -60, max: 5 }).map((n) => somaDias(DIA, n)),
    fc.oneof(fc.constantFrom('feito', 'pulado'), fc.double({ min: 0, max: 5000, noNaN: true })),
    { maxKeys: 40 },
  );
  fc.assert(
    fc.property(habitoValido, dias, marcas, (habitoBase, diasDaSemana, registroGerado) => {
      const habitoGerado = { ...habitoBase, diasDaSemana };
      const pontos = pontuacao(habitoGerado, registroGerado, DIA);
      assert.ok(pontos >= 0 && pontos <= 1 + 1e-9, `pontuação fora do intervalo: ${pontos}`);

      const { atual, melhor } = sequencias(habitoGerado, registroGerado, DIA);
      const diasAteHoje = Object.keys(registroGerado).filter((d) => d <= DIA).length;
      assert.ok(Number.isInteger(atual) && Number.isInteger(melhor));
      assert.ok(atual >= 0 && atual <= melhor, `atual ${atual}, melhor ${melhor}`);
      assert.ok(melhor <= diasAteHoje, `melhor ${melhor} com ${diasAteHoje} dias registrados`);
    }),
    OPCOES,
  );
});

test('propriedade: hábito com os sete dias conta igual a hábito sem a lista de dias', () => {
  const marcas = fc.dictionary(
    fc.integer({ min: -60, max: 5 }).map((n) => somaDias(DIA, n)),
    fc.constantFrom('feito', 'pulado'),
    { maxKeys: 40 },
  );
  const semLista = { id: 'h', tipo: 'simnao' };
  const comTodos = { ...semLista, diasDaSemana: [0, 1, 2, 3, 4, 5, 6] };
  fc.assert(
    fc.property(marcas, (registroGerado) => {
      assert.equal(pontuacao(comTodos, registroGerado, DIA), pontuacao(semLista, registroGerado, DIA));
      assert.deepEqual(sequencias(comTodos, registroGerado, DIA), sequencias(semLista, registroGerado, DIA));
    }),
    OPCOES,
  );
});

// ------------------------------------------------------------ rotina do dia

test('propriedade: abrir a rotina do dia deixa o estado válido e só age uma vez por dia', () => {
  const diaQualquer = fc.integer({ min: -10, max: 10 }).map((n) => somaDias(DIA, n));
  fc.assert(
    fc.property(estadoValido, diaQualquer, (estado, diaAberto) => {
      const antes = structuredClone(estado);
      const mexeu = abrirRotinaDoDia(estado, diaAberto);
      assert.equal(mexeu, antes.rotinaDoDiaEm !== diaAberto);
      assert.equal(estado.rotinaDoDiaEm, diaAberto);

      // A rotina aberta é a do dia, se houver; senão, a mesma de antes. Nada mais muda.
      const esperada = mexeu
        ? (rotinaDoDia(antes.rotinas, diaAberto)?.id ?? antes.rotinaAtiva)
        : antes.rotinaAtiva;
      assert.deepEqual(estado, { ...antes, rotinaAtiva: esperada, rotinaDoDiaEm: diaAberto });

      // De novo no mesmo dia não faz nada, nem depois de uma troca à mão.
      const outra = estado.rotinas.at(-1)?.id ?? null;
      estado.rotinaAtiva = outra;
      assert.equal(abrirRotinaDoDia(estado, diaAberto), false);
      assert.equal(estado.rotinaAtiva, outra);

      // O que a função grava passa pela validação sem correção.
      const lido = lerEstado(JSON.stringify(estado), contexto());
      assert.deepEqual(lido.estado, estado);
      assert.deepEqual(lido.avisos, []);
    }),
    OPCOES,
  );
});

test('propriedade: definir os dias de uma rotina deixa cada dia da semana com uma rotina só', () => {
  const dias = fc.array(fc.integer({ min: -1, max: 7 }), { maxLength: 9 });
  fc.assert(
    fc.property(estadoValido, fc.nat(), dias, (estado, sorteio, escolhidos) => {
      fc.pre(estado.rotinas.length > 0);
      const escolhida = estado.rotinas[sorteio % estado.rotinas.length];
      const itensAntes = structuredClone(estado.rotinas.map((r) => [r.id, r.nome, r.itens]));
      definirDias(estado.rotinas, escolhida, escolhidos);

      const validos = [...new Set(escolhidos.filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b);
      assert.deepEqual(escolhida.diasDaSemana, validos);
      for (const d of validos) {
        assert.equal(estado.rotinas.filter((r) => r.diasDaSemana.includes(d)).length, 1, `dia ${d} repetido`);
      }
      // Só os dias mudam: nome e itens ficam como estavam, e o estado continua válido.
      assert.deepEqual(
        estado.rotinas.map((r) => [r.id, r.nome, r.itens]),
        itensAntes,
      );
      const lido = lerEstado(JSON.stringify(estado), contexto());
      assert.deepEqual(lido.estado, estado);
      assert.deepEqual(lido.avisos, []);
    }),
    OPCOES,
  );
});

// ------------------------------------------------------------------ subtarefas

test('propriedade: a próxima ocorrência leva as subtarefas por fazer, com ids novos, e continua válida', () => {
  fc.assert(
    fc.property(estadoValido, (estado) => {
      let n = 0;
      const gerarId = () => {
        n += 1;
        return `sub${n}`;
      };
      for (const tarefaValida of estado.tarefas) {
        const antes = structuredClone(tarefaValida.subtarefas);
        const novas = paraProximaOcorrencia(tarefaValida.subtarefas, gerarId);
        assert.deepEqual(
          novas.map((s) => s.titulo),
          antes.map((s) => s.titulo),
        );
        assert.ok(novas.every((s) => s.feita === false));
        assert.equal(new Set(novas.map((s) => s.id)).size, novas.length);
        assert.deepEqual(tarefaValida.subtarefas, antes); // as da tarefa concluída não mudam
        tarefaValida.subtarefas = novas;
      }
      // O estado com as subtarefas trocadas passa pela validação sem correção.
      const lido = lerEstado(JSON.stringify(estado), contexto());
      assert.deepEqual(lido.estado, estado);
      assert.deepEqual(lido.avisos, []);
    }),
    OPCOES,
  );
});

// --------------------------------------------------------- o próprio gerador

test('o gerador de estados válidos produz estados com conteúdo, não só estados vazios', () => {
  const amostra = fc.sample(estadoValido, { seed: OPCOES.seed, numRuns: 400 });
  const parte = (condicao) => amostra.filter(condicao).length / amostra.length;
  const itensDaRotina = (estado) => estado.rotinas.some((r) => r.itens.length > 0);
  const marcasDoDia = (estado) => Object.values(estado.marcasRotina.porRotina).some((ids) => ids.length > 0);
  const diasRegistrados = (estado) =>
    Object.values(estado.registros).some((dias) => Object.keys(dias).length > 0);

  // Se a validação passar a descartar quase tudo, as propriedades acima passam sem provar nada.
  const partes = {
    hábitos: parte((e) => e.habitos.length > 0),
    'hábitos com dias da semana': parte((e) => e.habitos.some((x) => x.diasDaSemana.length < 7)),
    'rotinas com itens': parte(itensDaRotina),
    'rotinas com dia da semana': parte((e) => e.rotinas.some((r) => r.diasDaSemana.length > 0)),
    'dia da rotina do dia': parte((e) => e.rotinaDoDiaEm !== null),
    'itens ligados a hábito': parte((e) => e.rotinas.some((r) => r.itens.some((i) => i.habitoId))),
    tarefas: parte((e) => e.tarefas.length > 0),
    'tarefas com prazo': parte((e) => e.tarefas.some((x) => x.prazo)),
    'tarefas que repetem': parte((e) => e.tarefas.some((x) => x.repeticao)),
    'tarefas com subtarefas': parte((e) => e.tarefas.some((x) => x.subtarefas.length > 0)),
    'registros de hábito': parte(diasRegistrados),
    'notas de hábito': parte((e) => Object.keys(e.notasHabito).length > 0),
    'marcas do dia nas rotinas': parte(marcasDoDia),
  };
  if (process.env.MOSTRAR_GERADOR) console.log(partes);
  for (const [nome, valor] of Object.entries(partes)) {
    assert.ok(valor >= MINIMO_COM_CONTEUDO, `${nome}: só ${Math.round(valor * 100)}% dos estados gerados`);
  }
});

test('propriedade: n dias seguidos cumpridos até hoje dão sequência n e pontuação 1 - peso^n', () => {
  // O mesmo peso do cálculo: a marca de um dia perde metade do valor em 13 dias, como no Loop.
  const peso = 0.5 ** (1 / 13);
  const simNao = {
    id: 'h',
    nome: 'Hábito',
    cor: 'azul',
    tipo: 'simnao',
    unidade: null,
    meta: null,
    arquivado: false,
  };
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 120 }), (n) => {
      const cheio = Object.fromEntries(Array.from({ length: n }, (_, i) => [somaDias(DIA, -i), 'feito']));
      assert.deepEqual(sequencias(simNao, cheio, DIA), { atual: n, melhor: n });
      assert.ok(Math.abs(pontuacao(simNao, cheio, DIA) - (1 - peso ** n)) < 1e-9);

      // Um dia em branco no meio quebra a sequência em duas e baixa a pontuação.
      if (n < 3) return;
      const furo = Math.floor(n / 2);
      const comFuro = { ...cheio };
      delete comFuro[somaDias(DIA, -furo)];
      assert.deepEqual(sequencias(simNao, comFuro, DIA), {
        atual: furo,
        melhor: Math.max(furo, n - furo - 1),
      });
      assert.ok(pontuacao(simNao, comFuro, DIA) < pontuacao(simNao, cheio, DIA));
    }),
    OPCOES,
  );
});
