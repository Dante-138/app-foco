import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acharEscapes } from '../../tools/verificar-escapes.mjs';

const SCRIPT = fileURLToPath(new URL('../../tools/verificar-escapes.mjs', import.meta.url));

const motivos = (texto) => acharEscapes(texto).map((achado) => achado.motivo);

test('acha cada rota de fuga, com a linha', () => {
  const casos = [
    ['// Stryker disable next-line all', 'desliga o teste de mutação'],
    ['/* c8 ignore next */', 'esconde código da cobertura'],
    ['/* node:coverage ignore next */', 'esconde código da cobertura'],
    ['// eslint-disable-next-line no-console', 'desliga regra do lint no código'],
    ['/* eslint no-console: off */', 'desliga regra do lint no código'],
    ['<!-- prettier-ignore -->', 'desliga a formatação'],
    ["test.only('x', () => {});", 'pula ou isola teste'],
    ["describe.skip('x', () => {});", 'pula ou isola teste'],
    ['t.skip();', 'pula teste'],
    ["test('x', { skip: true }, () => {});", 'pula ou isola teste'],
    ["test('x', { todo: 'depois' }, () => {});", 'pula ou isola teste'],
  ];
  for (const [linha, motivo] of casos) assert.deepEqual(motivos(linha), [motivo], linha);
  assert.deepEqual(acharEscapes('ok\n\n// c8 ignore start').at(0)?.linha, 3);
});

test('não acusa código comum', () => {
  const comuns = [
    "test('pula o dia de folga', () => {});",
    'const pular = { skip: valor };',
    'if (opcoes.only) mostrar();',
    'estado.todos.filter(Boolean);',
  ];
  for (const linha of comuns) assert.deepEqual(motivos(linha), [], linha);
});

test('pela linha de comando, reprova e aponta arquivo e linha', (t) => {
  const pasta = mkdtempSync(join(tmpdir(), 'foco-escapes-'));
  t.after(() => rmSync(pasta, { recursive: true, force: true, maxRetries: 3 }));
  mkdirSync(join(pasta, 'node_modules'));
  writeFileSync(join(pasta, 'node_modules', 'dep.js'), 'test.only(1);\n'); // dependência não conta
  writeFileSync(join(pasta, 'a.test.js'), "import x from 'y';\ntest.only('x', () => {});\n");

  const resultado = spawnSync(process.execPath, [SCRIPT, pasta, join(pasta, 'nao-existe')], {
    encoding: 'utf8',
  });
  assert.equal(resultado.status, 1);
  assert.match(resultado.stderr, /a\.test\.js:2 {2}pula ou isola teste/);
  assert.match(resultado.stdout, /Rotas de fuga: 1\./);
});
