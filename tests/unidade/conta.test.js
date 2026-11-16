import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dadosDaConta, diaDoMesValido, proximoVencimento, valorEmReais } from '../../www/js/nucleo/conta.js';
import { AVISOS_DE_CONTA } from '../../www/js/nucleo/lembretes.js';
import { sanear } from '../../www/js/nucleo/esquema.js';

const HOJE = '2026-11-14';

test('diaDoMesValido: inteiro de 1 a 31', () => {
  assert.deepEqual([1, 15, 31, 0, 32, 1.5, '5', null].map(diaDoMesValido), [
    true,
    true,
    true,
    false,
    false,
    false,
    false,
    false,
  ]);
});

test('valorEmReais: número no costume brasileiro, com dois decimais; o que não é número dá null', () => {
  assert.equal(valorEmReais('120'), '120,00');
  assert.equal(valorEmReais('89,9'), '89,90');
  assert.equal(valorEmReais('1.250'), '1.250,00');
  assert.equal(valorEmReais(' 45,678 '), '45,68');
  for (const errado of ['', '   ', 'R$ 10', 'dez', '-5']) assert.equal(valorEmReais(errado), null);
});

test('proximoVencimento: neste mês se o dia ainda não passou (hoje conta); senão, no mês seguinte', () => {
  assert.equal(proximoVencimento(20, HOJE), '2026-11-20');
  assert.equal(proximoVencimento(14, HOJE), '2026-11-14');
  assert.equal(proximoVencimento(13, HOJE), '2026-12-13');
  assert.equal(proximoVencimento(5, '2026-12-20'), '2027-01-05'); // vira o ano
});

test('proximoVencimento: em mês mais curto vale o último dia dele', () => {
  assert.equal(proximoVencimento(31, HOJE), '2026-11-30');
  assert.equal(proximoVencimento(31, '2026-12-01'), '2026-12-31');
  assert.equal(proximoVencimento(30, '2027-01-31'), '2027-02-28');
  assert.equal(proximoVencimento(29, '2028-02-01'), '2028-02-29'); // ano bissexto
  assert.equal(proximoVencimento(31, '2026-11-30'), '2026-11-30'); // o último dia ainda vale hoje
});

test('dadosDaConta: valor no título, próximo vencimento, todo mês e aviso antecipado', () => {
  assert.deepEqual(dadosDaConta({ nome: 'Luz', valor: '120', diaDoMes: 20 }, HOJE), {
    titulo: 'Luz - R$ 120,00',
    prazo: '2026-11-20',
    hora: null,
    repeticao: { cada: 1, unidade: 'mes' },
    avisos: [1, 3],
  });
  // Sem valor (ou com texto que não é número), o título é só o nome.
  assert.equal(dadosDaConta({ nome: 'Internet', valor: '', diaDoMes: 5 }, HOJE).titulo, 'Internet');
  assert.equal(dadosDaConta({ nome: 'Água', valor: 'varia', diaDoMes: 5 }, HOJE).titulo, 'Água');
  // Cada conta leva a própria lista de avisos, não a constante.
  const { avisos } = dadosDaConta({ nome: 'Luz', valor: '', diaDoMes: 20 }, HOJE);
  avisos.push(7);
  assert.deepEqual([...AVISOS_DE_CONTA], [1, 3]);
});

test('a tarefa de uma conta passa pela validação sem correção', () => {
  const tarefa = {
    id: 't',
    listaId: 'l',
    notas: '',
    ...dadosDaConta({ nome: 'Luz', valor: '89,9', diaDoMes: 31 }, HOJE),
    estrela: false,
    feita: false,
    criadaEm: 1,
    feitaEm: null,
  };
  const { estado, avisos } = sanear(
    { listas: [{ id: 'l', nome: 'Contas' }], tarefas: [tarefa] },
    { dia: HOJE, gerarId: () => 'x' },
  );
  assert.deepEqual(estado.tarefas, [tarefa]);
  assert.deepEqual(avisos, []);
});
