import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAVE, botao, lerSalvo, prepararNavegador, visivel } from './apoio.js';

const abrir = prepararNavegador();

test('janela do dia: fica perto da célula, sem teclado, e tocar fora fecha sem salvar', async (t) => {
  const salvo = JSON.stringify({
    versao: 5,
    aba: 'habitos',
    habitos: [{ id: 'h1', nome: 'Leitura', cor: 'azul', tipo: 'simnao' }],
  });
  const { pagina, erros } = await abrir(t, { salvo, celular: true });
  const celula = botao(pagina, 'Leitura, hoje: não feito');
  await celula.click({ delay: 800 });
  const janela = pagina.getByRole('dialog', { name: 'Leitura (hoje)' });
  await visivel(janela);
  await pagina.waitForFunction(() => document.querySelector('dialog.janela').getAnimations().length === 0);

  // Presa à célula (logo abaixo dela ou acima), dentro da tela e sem cobrir a célula.
  const [caixaJanela, caixaCelula] = await Promise.all([janela.boundingBox(), celula.boundingBox()]);
  const tela = pagina.viewportSize();
  assert.ok(caixaJanela.x >= 0 && caixaJanela.x + caixaJanela.width <= tela.width);
  assert.ok(caixaJanela.y >= 0 && caixaJanela.y + caixaJanela.height <= tela.height);
  const distancia =
    caixaJanela.y >= caixaCelula.y
      ? caixaJanela.y - (caixaCelula.y + caixaCelula.height)
      : caixaCelula.y - (caixaJanela.y + caixaJanela.height);
  assert.ok(distancia >= 0 && distancia <= 16, `distância ${distancia}`);

  // Sem teclado: nenhum campo de texto com o foco.
  assert.equal(
    await pagina.evaluate(() => document.activeElement?.matches('input, textarea') ?? false),
    false,
  );

  // Os três botões redondos têm pelo menos 44 px e um deles vem marcado (Vazio).
  for (const nome of ['Feito', 'Folga', 'Vazio']) {
    const caixa = await pagina.getByRole('radio', { name: nome, exact: true }).boundingBox();
    assert.ok(caixa.width >= 44 && caixa.height >= 44, `${nome}: ${caixa.width}x${caixa.height}`);
  }
  await pagina.getByRole('radio', { name: 'Feito', exact: true }).click();
  await pagina.getByLabel('Nota do dia').fill('não salvar');

  // Tocar fora fecha sem salvar nem o estado nem a nota.
  await pagina.mouse.click(5, 5);
  await pagina.waitForFunction(() => document.querySelector('dialog[open]') === null);
  await visivel(botao(pagina, 'Leitura, hoje: não feito'));
  const gravado = JSON.parse(await lerSalvo(pagina, CHAVE));
  assert.deepEqual(gravado.registros ?? {}, {});
  assert.deepEqual(gravado.notasHabito ?? {}, {});
  assert.deepEqual(erros, []);
});
