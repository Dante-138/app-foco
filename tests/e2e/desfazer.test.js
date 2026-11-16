import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAVE, botao, lerSalvo, prepararNavegador, visivel } from './apoio.js';

const abrir = prepararNavegador();

test('desfazer: concluir e excluir tarefa e excluir hábito voltam como estavam', async (t) => {
  const { pagina, erros } = await abrir(t);
  const salvo = async () => JSON.parse(await lerSalvo(pagina, CHAVE));

  // Concluir uma tarefa que repete: Desfazer reabre, devolve a repetição e tira a próxima.
  await botao(pagina, 'Tarefas').click();
  await botao(pagina, 'Nova tarefa').click();
  await pagina.getByLabel('Título').fill('Regar as plantas');
  await pagina.getByLabel('Repetir').selectOption('semana');
  await botao(pagina, 'Salvar').click();
  const [original] = (await salvo()).tarefas;
  await pagina.getByRole('checkbox', { name: 'Concluir: Regar as plantas' }).click();
  await visivel(pagina.getByText('Tarefa concluída'));
  assert.equal((await salvo()).tarefas.length, 2);
  await botao(pagina, 'Desfazer').click();
  assert.deepEqual((await salvo()).tarefas, [original]);
  await visivel(pagina.getByRole('checkbox', { name: 'Concluir: Regar as plantas' }));

  // Excluir a tarefa: Desfazer devolve igual.
  await pagina.getByText('Regar as plantas').click();
  await botao(pagina, 'Excluir').click();
  await pagina.locator('dialog[open]').last().getByRole('button', { name: 'Excluir', exact: true }).click();
  await visivel(pagina.getByText('Tarefa excluída'));
  assert.deepEqual((await salvo()).tarefas, []);
  await botao(pagina, 'Desfazer').click();
  assert.deepEqual((await salvo()).tarefas, [original]);

  // Excluir um hábito com histórico: Desfazer devolve o hábito e os registros.
  await botao(pagina, 'Hábitos').click();
  await botao(pagina, 'Novo hábito').click();
  await pagina.getByLabel('Nome').fill('Leitura');
  await botao(pagina, 'Salvar').click();
  await pagina.locator('.cel').last().click();
  const antes = await salvo();
  assert.equal(Object.keys(antes.registros).length, 1);
  await pagina
    .getByRole('button', { name: /Leitura/ })
    .first()
    .click();
  await botao(pagina, 'Excluir').click();
  await pagina.locator('dialog[open]').last().getByRole('button', { name: 'Excluir', exact: true }).click();
  await visivel(pagina.getByText('Hábito excluído'));
  assert.deepEqual((await salvo()).habitos, []);
  await botao(pagina, 'Desfazer').click();
  const depois = await salvo();
  assert.deepEqual(depois.habitos, antes.habitos);
  assert.deepEqual(depois.registros, antes.registros);
  assert.deepEqual(erros, []);
});
