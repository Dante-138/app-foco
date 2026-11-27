import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { montar, prepararServiceWorker, resumir } from '../../tools/montar-web.mjs';

const pastaNova = (t) => {
  const pasta = mkdtempSync(join(tmpdir(), 'foco-web-'));
  t.after(() => rmSync(pasta, { recursive: true, force: true, maxRetries: 3 }));
  return pasta;
};

test('service worker: as marcas do repositório viram a versão e a lista do build', () => {
  const fonte = "const VERSAO = 'dev';\nconst ARQUIVOS = [];\nself.resto = 1;\n";
  assert.equal(
    prepararServiceWorker(fonte, 'abc123', ['index.html', 'js/app.js']),
    'const VERSAO = "abc123";\nconst ARQUIVOS = ["index.html","js/app.js"];\nself.resto = 1;\n',
  );
  assert.throws(() => prepararServiceWorker('const ARQUIVOS = [];', 'x', []), /sw\.js sem as marcas/);
  assert.throws(() => prepararServiceWorker("const VERSAO = 'dev';", 'x', []), /sw\.js sem as marcas/);
});

test('montar: copia o app, carimba o build e lista no service worker tudo menos ele mesmo', (t) => {
  const destino = pastaNova(t);
  const { versao, arquivos } = montar(destino);

  assert.match(versao, /^[0-9a-f]{12}$/);
  for (const esperado of [
    'index.html',
    'manifest.webmanifest',
    'icone-192.png',
    'icone-512.png',
    'js/app.js',
  ]) {
    assert.ok(arquivos.includes(esperado), `${esperado} fora da lista`);
  }
  assert.ok(!arquivos.includes('sw.js'));
  assert.ok(
    arquivos.every((arquivo) => !arquivo.includes('\\')),
    'caminho com barra invertida',
  );
  assert.deepEqual(arquivos, [...arquivos].sort());

  const sw = readFileSync(join(destino, 'sw.js'), 'utf8');
  assert.ok(sw.includes(`const VERSAO = "${versao}";`));
  assert.ok(sw.includes(`const ARQUIVOS = ${JSON.stringify(arquivos)};`));

  // Lido como texto: importar o módulo de uma pasta temporária, fora do package.json do projeto,
  // faz o Node avisar que não sabe o tipo do módulo.
  const carimbo = readFileSync(join(destino, 'js', 'build-info.js'), 'utf8');
  const build = JSON.parse(carimbo.match(/Object\.freeze\((\{.*\})\);/)[1]);
  assert.match(build.commit, /^[0-9a-f]{7,}\+?$/); // só o build carimbado registra o service worker
});

test('versão: muda quando muda o conteúdo ou o nome de um arquivo, e só então', (t) => {
  const pasta = pastaNova(t);
  writeFileSync(join(pasta, 'a.js'), 'um');
  writeFileSync(join(pasta, 'b.js'), 'dois');
  const original = resumir(pasta, ['a.js', 'b.js']);
  assert.match(original, /^[0-9a-f]{12}$/);
  assert.equal(resumir(pasta, ['a.js', 'b.js']), original);

  writeFileSync(join(pasta, 'b.js'), 'doiz');
  assert.notEqual(resumir(pasta, ['a.js', 'b.js']), original);
  writeFileSync(join(pasta, 'b.js'), 'dois');
  assert.equal(resumir(pasta, ['a.js', 'b.js']), original);

  // O separador impede que nome e conteúdo se confundam: "a.js" + "um" não vira "a.j" + "sum".
  writeFileSync(join(pasta, 'a.j'), 'sum');
  assert.notEqual(resumir(pasta, ['a.j', 'b.js']), original);
});

test('montar: recusa pasta que já tem arquivos, sem apagar nada', (t) => {
  const destino = pastaNova(t);
  writeFileSync(join(destino, 'meu-arquivo.txt'), 'não apagar');
  assert.throws(() => montar(destino), /já tem arquivos/);
  assert.equal(readFileSync(join(destino, 'meu-arquivo.txt'), 'utf8'), 'não apagar');
});
