import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import {
  CHAVE,
  estadoDeDemonstracao,
  scriptDeDemonstracao,
  semear,
} from '../../tools/dados-de-demonstracao.mjs';
import { lerEstado } from '../../www/js/nucleo/estado.js';

const DIA = '2026-11-14';
const ler = (caminho) => readFileSync(new URL(`../../${caminho}`, import.meta.url), 'utf8');

test('os dados de demonstração já estão no formato atual: a validação não corrige nada', () => {
  const { estado, avisos } = estadoDeDemonstracao(DIA);
  assert.deepEqual(avisos, []);
  // Ler de novo o que foi gerado devolve a mesma coisa, sem aviso.
  const denovo = lerEstado(JSON.stringify(estado), { dia: DIA, gerarId: () => 'x' });
  assert.equal(denovo.problema, null);
  assert.deepEqual(denovo.avisos, []);
  assert.deepEqual(denovo.estado, estado);
});

test('os dados de demonstração têm conteúdo em todas as abas e não agendam lembretes', () => {
  const { estado } = estadoDeDemonstracao(DIA);
  assert.equal(estado.rotinas.length, 2);
  assert.equal(estado.habitos.length, 6);
  assert.equal(estado.listas.length, 3);
  assert.equal(estado.tarefas.length, 9);
  assert.equal(estado.lembretes, false);
  // Nada que a validação teria descartado em silêncio: ligação com hábito, marcas e repetição.
  assert.equal(estado.rotinas[0].itens.filter((i) => i.habitoId).length, 1);
  assert.deepEqual(estado.marcasRotina.porRotina, { r1: ['i2', 'i3'] });
  assert.equal(estado.tarefas.filter((t) => t.repeticao).length, 2);
  assert.equal(estado.tarefas.filter((t) => t.hora).length, 1);
  assert.deepEqual(estado.habitos.find((h) => h.id === 'h3').diasDaSemana, [1, 3, 5]);
  for (const { id } of estado.habitos) assert.ok(Object.keys(estado.registros[id]).length > 10, id);
  assert.ok(
    estado.tarefas.some((t) => t.prazo && t.prazo < DIA && !t.feita),
    'uma atrasada',
  );
});

test('a chave é a mesma do store.js', () => {
  assert.ok(ler('www/js/store.js').includes(`export const CHAVE = '${CHAVE}';`));
});

// Roda o script gerado com um armazenamento de mentira.
function rodar(script, inicial) {
  const dados = new Map(inicial);
  const localStorage = {
    getItem: (chave) => (dados.has(chave) ? dados.get(chave) : null),
    setItem: (chave, valor) => dados.set(chave, valor),
  };
  vm.runInNewContext(script, { localStorage });
  return dados;
}

test('o script grava os dados só quando não há nada salvo', () => {
  const { estado } = estadoDeDemonstracao(DIA);
  const script = scriptDeDemonstracao(estado);

  assert.deepEqual(JSON.parse(rodar(script, []).get(CHAVE)), estado);
  assert.equal(rodar(script, [[CHAVE, '{"versao":6}']]).get(CHAVE), '{"versao":6}');
  // Armazenamento indisponível não derruba a página.
  vm.runInNewContext(script, {});
});

test('semear grava o script na cópia do app e o liga antes dos outros, uma vez só', (t) => {
  const pasta = mkdtempSync(join(tmpdir(), 'foco-demo-'));
  t.after(() => rmSync(pasta, { recursive: true, force: true, maxRetries: 3 }));
  mkdirSync(join(pasta, 'js'));
  writeFileSync(join(pasta, 'index.html'), ler('www/index.html'));

  semear(pasta, DIA);
  semear(pasta, DIA);
  const pagina = readFileSync(join(pasta, 'index.html'), 'utf8');
  assert.equal(pagina.split('js/demonstracao.js').length, 2);
  assert.ok(pagina.indexOf('js/demonstracao.js') < pagina.indexOf('js/tema-inicial.js'));
  assert.ok(readFileSync(join(pasta, 'js', 'demonstracao.js'), 'utf8').includes(CHAVE));

  assert.throws(() => semear(join(pasta, 'nao-existe'), DIA), /cap sync/);
});
