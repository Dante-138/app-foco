// A versão do app mora em dois arquivos, e o release-please troca os dois a cada release
// (release-please-config.json, "extra-files"). Se um sair do lugar, o APK leva a versão errada.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ler = (caminho) => readFileSync(new URL(`../../${caminho}`, import.meta.url), 'utf8');

test('o build.gradle tem a versão do package.json, na linha marcada para o release-please', () => {
  const { version } = JSON.parse(ler('package.json'));
  const linhas = ler('android/app/build.gradle')
    .split('\n')
    .filter((linha) => linha.includes('x-release-please-version'));
  assert.equal(linhas.length, 1);
  assert.ok(linhas[0].includes(`def versao = "${version}"`), linhas[0]);
  assert.equal(JSON.parse(ler('.release-please-manifest.json'))['.'], version);
});
