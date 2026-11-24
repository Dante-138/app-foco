import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAVE, ESPERA, botao, lerSalvo, prepararNavegador, visivel } from './apoio.js';

const abrir = prepararNavegador();

// Segura o meio de "de" até a linha soltar (classe arrastando), leva o dedo um pouco acima do
// meio de "ate" e solta.
async function arrastar(pagina, de, ate) {
  const caixa = await de.boundingBox();
  const destino = await ate.boundingBox();
  const x = caixa.x + caixa.width / 2;
  await pagina.mouse.move(x, caixa.y + caixa.height / 2);
  await pagina.mouse.down();
  await pagina.locator('.arrastando').waitFor(ESPERA);
  await pagina.mouse.move(x, destino.y + destino.height * 0.3, { steps: 12 });
  await pagina.mouse.up();
  await pagina.waitForFunction(() => !document.querySelector('.arrastando'), null, ESPERA);
}

const salvoDe = async (pagina) => JSON.parse(await lerSalvo(pagina, CHAVE));

test('tarefas: segurar e arrastar muda a ordem e liga a Minha ordem, com Desfazer', async (t) => {
  const tarefa = (id, titulo, extra = {}) => ({
    id,
    listaId: 'l',
    titulo,
    notas: '',
    prazo: null,
    estrela: false,
    feita: false,
    criadaEm: 1,
    feitaEm: null,
    ...extra,
  });
  const salvo = JSON.stringify({
    versao: 2,
    aba: 'tarefas',
    listas: [
      { id: 'l', nome: 'Faculdade' },
      { id: 'outra', nome: 'Outra' },
    ],
    listaAtiva: 'l',
    tarefas: [
      tarefa('a', 'Prova', { prazo: '2030-01-05' }),
      tarefa('b', 'Trabalho', { prazo: '2030-01-10' }),
      tarefa('c', 'Ler o livro'),
      tarefa('d', 'Feita antes', { feita: true, feitaEm: 2 }),
      tarefa('e', 'De outra lista', { listaId: 'outra' }),
    ],
  });
  const { pagina, erros } = await abrir(t, { salvo });
  const titulos = () => pagina.locator('.tarefa-titulo').allTextContents();
  const linha = (titulo) => pagina.locator('li.tarefa', { hasText: titulo }).locator('.tarefa-corpo');

  // Padrão: por data, em grupos. "Ler o livro" (sem data) vai para o alto.
  await visivel(pagina.getByRole('heading', { name: 'Sem data' }));
  assert.deepEqual(await titulos(), ['Prova', 'Trabalho', 'Ler o livro']);
  await arrastar(pagina, linha('Ler o livro'), linha('Prova'));

  await visivel(pagina.getByText('Lista em Minha ordem'));
  assert.deepEqual(await titulos(), ['Ler o livro', 'Prova', 'Trabalho']);
  assert.equal(await pagina.getByRole('heading', { name: 'Sem data' }).count(), 0); // lista única
  let salvoAgora = await salvoDe(pagina);
  assert.equal(salvoAgora.ordemTarefas, 'manual');
  // A concluída e a da outra lista não saem do lugar.
  assert.deepEqual(
    salvoAgora.tarefas.map((x) => x.id),
    ['c', 'a', 'b', 'd', 'e'],
  );

  // Desfazer devolve a ordem guardada e a regra de antes.
  await botao(pagina, 'Desfazer').click();
  await visivel(pagina.getByRole('heading', { name: 'Sem data' }));
  salvoAgora = await salvoDe(pagina);
  assert.equal(salvoAgora.ordemTarefas, 'data');
  assert.deepEqual(
    salvoAgora.tarefas.map((x) => x.id),
    ['a', 'b', 'c', 'd', 'e'],
  );

  // Em Minha ordem, arrastar para baixo também vale, e a tarefa nova entra no alto.
  await arrastar(pagina, linha('Ler o livro'), linha('Prova'));
  await arrastar(pagina, linha('Ler o livro'), linha('Trabalho'));
  assert.deepEqual(await titulos(), ['Prova', 'Ler o livro', 'Trabalho']);
  await botao(pagina, 'Nova tarefa').click();
  await pagina.getByLabel('Título').fill('Comprar caderno');
  await botao(pagina, 'Salvar').click();
  await pagina.waitForFunction(() => !document.querySelector('dialog'), null, ESPERA);
  assert.deepEqual(await titulos(), ['Comprar caderno', 'Prova', 'Ler o livro', 'Trabalho']);

  // A opção aparece marcada no menu de ordem.
  await botao(pagina, 'Opções da lista').click();
  await botao(pagina, 'Ordenar por: Minha ordem').click();
  assert.equal(await botao(pagina, 'Minha ordem').getAttribute('aria-current'), 'true');
  assert.deepEqual(erros, []);
});

test('tarefas: segurar e soltar no mesmo lugar não abre a tarefa nem muda nada', async (t) => {
  const salvo = JSON.stringify({
    versao: 2,
    aba: 'tarefas',
    listas: [{ id: 'l', nome: 'Faculdade' }],
    listaAtiva: 'l',
    tarefas: [
      {
        id: 'a',
        listaId: 'l',
        titulo: 'Prova',
        notas: '',
        prazo: null,
        estrela: false,
        feita: false,
        criadaEm: 1,
        feitaEm: null,
      },
    ],
  });
  const { pagina, erros } = await abrir(t, { salvo });
  const corpo = pagina.locator('.tarefa-corpo');
  const caixa = await corpo.boundingBox();
  await pagina.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
  await pagina.mouse.down();
  await pagina.locator('.arrastando').waitFor(ESPERA);
  await pagina.mouse.up();
  await pagina.waitForFunction(() => !document.querySelector('.arrastando'), null, ESPERA);
  assert.equal(await pagina.locator('dialog[open]').count(), 0);
  assert.notEqual((await salvoDe(pagina)).ordemTarefas, 'manual'); // nada mudou, nada gravado

  // Um toque curto continua abrindo a tarefa.
  await corpo.click();
  await visivel(pagina.locator('dialog[open]'));
  assert.deepEqual(erros, []);
});

test('tarefas: se o sistema toma o gesto no meio do arrasto, a linha volta e nada grava', async (t) => {
  const tarefa = (id, titulo) => ({
    id,
    listaId: 'l',
    titulo,
    notas: '',
    prazo: null,
    estrela: false,
    feita: false,
    criadaEm: 1,
    feitaEm: null,
  });
  const salvo = JSON.stringify({
    versao: 2,
    aba: 'tarefas',
    listas: [{ id: 'l', nome: 'Faculdade' }],
    listaAtiva: 'l',
    tarefas: [tarefa('a', 'Prova'), tarefa('b', 'Trabalho'), tarefa('c', 'Ler o livro')],
  });
  const { pagina, erros } = await abrir(t, { salvo });
  const titulos = () => pagina.locator('.tarefa-titulo').allTextContents();
  const linha = (titulo) => pagina.locator('li.tarefa', { hasText: titulo }).locator('.tarefa-corpo');
  const antes = await titulos();

  const caixa = await linha('Ler o livro').boundingBox();
  const destino = await linha(antes[0]).boundingBox();
  const x = caixa.x + caixa.width / 2;
  await pagina.mouse.move(x, caixa.y + caixa.height / 2);
  await pagina.mouse.down();
  await pagina.locator('.arrastando').waitFor(ESPERA);
  await pagina.mouse.move(x, destino.y + destino.height * 0.3, { steps: 12 });
  assert.notDeepEqual(await titulos(), antes); // a linha já andou na tela
  await pagina.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel')));
  await pagina.mouse.up();

  assert.deepEqual(await titulos(), antes);
  assert.equal(await pagina.locator('.arrastando').count(), 0);
  assert.notEqual((await salvoDe(pagina)).ordemTarefas, 'manual');
  assert.deepEqual(erros, []);
});

test('hábitos: segurar o nome e arrastar muda a ordem; os ocultos não saem do lugar', async (t) => {
  const habito = (id, nome, extra = {}) => ({ id, nome, cor: 'azul', tipo: 'simnao', ...extra });
  const salvo = JSON.stringify({
    versao: 5,
    aba: 'habitos',
    ocultarArquivados: true,
    habitos: [
      habito('h1', 'Leitura'),
      habito('h2', 'Água'),
      habito('h3', 'Antigo', { arquivado: true }),
      habito('h4', 'Correr'),
    ],
  });
  const { pagina, erros } = await abrir(t, { salvo });
  const nome = (texto) => pagina.locator('.habito-nome', { hasText: texto });
  const nomes = () => pagina.locator('.habito-nome > span:nth-of-type(2)').allTextContents();

  await visivel(nome('Correr'));
  assert.deepEqual(await nomes(), ['Leitura', 'Água', 'Correr']);
  await arrastar(pagina, nome('Correr'), nome('Leitura'));

  assert.deepEqual(await nomes(), ['Correr', 'Leitura', 'Água']);
  assert.deepEqual(
    (await salvoDe(pagina)).habitos.map((x) => x.id),
    ['h4', 'h1', 'h3', 'h2'],
  );
  // Soltar não abre a edição do hábito.
  assert.equal(await pagina.locator('dialog[open]').count(), 0);
  assert.deepEqual(erros, []);
});
