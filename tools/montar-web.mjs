// Monta o app web para publicar no GitHub Pages: copia www/ para <destino>, grava o carimbo do
// build (versão, commit e data) e preenche no service worker a lista de arquivos e a versão, que é
// o resumo do conteúdo: qualquer arquivo diferente gera uma versão nova, e o navegador troca tudo
// de uma vez. Sem dependências.
//
// Uso: node tools/montar-web.mjs <destino>
//   <destino>  pasta nova ou vazia (no CI, _site). Nunca é apagada: pasta com conteúdo é recusada.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const WWW = join(RAIZ, 'www');
const MARCA_VERSAO = "const VERSAO = 'dev';";
const MARCA_ARQUIVOS = 'const ARQUIVOS = [];';

// Troca as duas marcas do sw.js do repositório pela versão e pela lista do build.
export function prepararServiceWorker(fonte, versao, arquivos) {
  if (!fonte.includes(MARCA_VERSAO) || !fonte.includes(MARCA_ARQUIVOS)) {
    throw new Error(`sw.js sem as marcas "${MARCA_VERSAO}" e "${MARCA_ARQUIVOS}"`);
  }
  return fonte
    .replace(MARCA_VERSAO, `const VERSAO = ${JSON.stringify(versao)};`)
    .replace(MARCA_ARQUIVOS, `const ARQUIVOS = ${JSON.stringify(arquivos)};`);
}

// Todos os arquivos da pasta, com caminho relativo e barra normal, em ordem fixa.
export function listarArquivos(pasta) {
  return readdirSync(pasta, { recursive: true, withFileTypes: true })
    .filter((item) => item.isFile())
    .map((item) => relative(pasta, join(item.parentPath, item.name)).split(sep).join('/'))
    .sort();
}

// A versão do build: resumo do nome e do conteúdo de cada arquivo. Muda com qualquer arquivo
// diferente, inclusive o carimbo (commit e data): cada publicação é uma versão nova.
export function resumir(pasta, arquivos) {
  const resumo = createHash('sha256');
  for (const arquivo of arquivos) {
    resumo.update(arquivo).update('\0');
    resumo.update(readFileSync(join(pasta, arquivo)));
  }
  return resumo.digest('hex').slice(0, 12);
}

export function montar(destino) {
  if (existsSync(destino) && readdirSync(destino).length > 0) {
    throw new Error(`${destino} já tem arquivos: use uma pasta nova ou vazia.`);
  }
  cpSync(WWW, destino, { recursive: true });
  const carimbador = join(RAIZ, 'tools', 'carimbar-build.mjs');
  execFileSync(process.execPath, [carimbador, join(destino, 'js', 'build-info.js')], { stdio: 'inherit' });

  const arquivos = listarArquivos(destino).filter((arquivo) => arquivo !== 'sw.js');
  const versao = resumir(destino, arquivos);

  const sw = join(destino, 'sw.js');
  writeFileSync(sw, prepararServiceWorker(readFileSync(sw, 'utf8'), versao, arquivos), 'utf8');
  return { versao, arquivos };
}

// Executado direto pela linha de comando (e não importado por um teste).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const destino = process.argv[2];
  if (!destino) {
    console.error('Uso: node tools/montar-web.mjs <destino>');
    process.exit(1);
  }
  const { versao, arquivos } = montar(resolve(destino));
  console.log(`App web montado em ${destino}: versão ${versao}, ${arquivos.length} arquivos.`);
}
