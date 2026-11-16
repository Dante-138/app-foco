import { test } from 'node:test';
import assert from 'node:assert/strict';
import { botao, prepararNavegador, visivel } from './apoio.js';

const abrir = prepararNavegador();

test('folha da tarefa: abre na metade, sobe e fecha arrastando o topo', async (t) => {
  const { pagina, erros } = await abrir(t);
  await botao(pagina, 'Tarefas').click();
  await botao(pagina, 'Nova tarefa').click();
  // Tarefa nova foca o título e já abre na altura cheia.
  assert.equal(await pagina.locator('dialog[open].metade').count(), 0);
  await pagina.getByLabel('Título').fill('Pagar a conta');
  await botao(pagina, 'Salvar').click();
  await visivel(pagina.getByText('Pagar a conta'));

  const arrastar = async (dy) => {
    // Mede o topo só com a folha parada (a abertura anima por uns 500 ms).
    await pagina.waitForFunction(() => document.querySelector('dialog[open]').getAnimations().length === 0);
    const topo = await pagina.locator('dialog[open] .folha-topo').boundingBox();
    const x = topo.x + topo.width / 2;
    const y = topo.y + 8;
    await pagina.mouse.move(x, y);
    await pagina.mouse.down();
    for (let i = 1; i <= 8; i += 1) await pagina.mouse.move(x, y + (dy * i) / 8);
    await pagina.mouse.up();
  };

  await pagina.getByText('Pagar a conta').click();
  await visivel(pagina.locator('dialog[open].metade'));
  assert.equal(await pagina.getByRole('heading', { name: 'Editar tarefa' }).count(), 1);

  // Para cima: altura cheia.
  await arrastar(-120);
  await pagina.waitForFunction(() => !document.querySelector('dialog[open]').classList.contains('metade'));

  // Tocar em Cancelar no topo continua sendo um toque (não vira arraste).
  await botao(pagina, 'Cancelar').click();
  await pagina.waitForFunction(() => document.querySelector('dialog[open]') === null);

  // Da metade, puxar bem para baixo fecha.
  await pagina.getByText('Pagar a conta').click();
  await visivel(pagina.locator('dialog[open].metade'));
  await arrastar(400);
  await pagina.waitForFunction(() => document.querySelector('dialog[open]') === null);
  await visivel(pagina.getByText('Pagar a conta'));
  assert.deepEqual(erros, []);
});
