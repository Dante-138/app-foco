import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITE_DE_SUBTAREFAS,
  limparSubtarefas,
  paraProximaOcorrencia,
  progresso,
  textoDoProgresso,
} from '../../www/js/nucleo/subtarefas.js';

const sub = (id, titulo, feita = false) => ({ id, titulo, feita });
const TRES = [sub('a', 'Comprar passagem', true), sub('b', 'Reservar hotel'), sub('c', 'Fazer a mala', true)];

test('progresso e o texto da linha: feitas de total; sem subtarefas, texto vazio', () => {
  assert.deepEqual(progresso(TRES), { feitas: 2, total: 3 });
  assert.deepEqual(progresso([]), { feitas: 0, total: 0 });
  assert.equal(textoDoProgresso(TRES), '2 de 3 subtarefas');
  assert.equal(textoDoProgresso([sub('a', 'Uma só')]), '0 de 1 subtarefa');
  assert.equal(textoDoProgresso([]), '');
});

test('limparSubtarefas: título aparado e cortado, linha em branco fora, no máximo o limite', () => {
  assert.equal(LIMITE_DE_SUBTAREFAS, 30);
  assert.deepEqual(
    limparSubtarefas(
      [sub('a', '  Passagem  ', true), sub('b', '   '), sub('c', 'x'.repeat(12)), sub('d', '')],
      10,
    ),
    [sub('a', 'Passagem', true), sub('c', 'x'.repeat(10))],
  );
  // O corte no limite não deixa espaço sobrando no fim.
  assert.deepEqual(limparSubtarefas([sub('a', 'abc  def')], 4), [sub('a', 'abc')]);
  const muitas = Array.from({ length: 40 }, (_, i) => sub(`s${i}`, `Passo ${i}`));
  const limpas = limparSubtarefas(muitas, 200);
  assert.equal(limpas.length, LIMITE_DE_SUBTAREFAS);
  assert.equal(limpas.at(-1).id, 's29');
  // Devolve cópias: mexer no resultado não altera a origem, e campo extra não passa.
  const origem = [{ ...sub('a', 'Um'), lixo: 1 }];
  const [copia] = limparSubtarefas(origem, 200);
  copia.feita = true;
  assert.deepEqual(origem, [{ id: 'a', titulo: 'Um', feita: false, lixo: 1 }]);
  assert.deepEqual(Object.keys(copia), ['id', 'titulo', 'feita']);
});

test('paraProximaOcorrencia: mesmos títulos na mesma ordem, todas por fazer, com ids novos', () => {
  let n = 0;
  const gerarId = () => {
    n += 1;
    return `novo${n}`;
  };
  assert.deepEqual(paraProximaOcorrencia(TRES, gerarId), [
    sub('novo1', 'Comprar passagem'),
    sub('novo2', 'Reservar hotel'),
    sub('novo3', 'Fazer a mala'),
  ]);
  assert.equal(TRES[0].feita, true); // as da tarefa concluída ficam como estavam
  assert.deepEqual(paraProximaOcorrencia([], gerarId), []);
});
