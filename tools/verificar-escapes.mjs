// Procura "rotas de fuga": comentários e opções que desligam um portão sem mudar a configuração
// dele. Sem dependências.
//
// Uso: node tools/verificar-escapes.mjs [pastas ou arquivos...]   (padrão: www tests tools e os
// arquivos de configuração da raiz)
//
// O ESLint já ignora comentário de configuração no código (noInlineConfig), mas só nos arquivos
// que ele lê; este detector olha também o resto e reprova o comentário antes de alguém achar
// que ele vale.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PROIBIDOS = [
  { padrao: /Stryker\s+(disable|restore)/, motivo: 'desliga o teste de mutação' },
  { padrao: /\b(c8|v8|istanbul|node:coverage)\s+(ignore|disable)/, motivo: 'esconde código da cobertura' },
  { padrao: /eslint-(disable|enable)|\/\*\s*eslint\s/, motivo: 'desliga regra do lint no código' },
  { padrao: /prettier-ignore/, motivo: 'desliga a formatação' },
  // test.only(, describe.skip(, it.todo( e o t.skip() de dentro de um teste do node:test.
  { padrao: /\b(test|it|describe|suite)\.(only|skip|todo)\s*\(/, motivo: 'pula ou isola teste' },
  { padrao: /\bt\.(skip|todo)\s*\(/, motivo: 'pula teste' },
  // As mesmas opções escritas no objeto de opções: test('nome', { skip: true }, ...).
  { padrao: /\b(only|skip|todo)\s*:\s*(true|['"`])/, motivo: 'pula ou isola teste' },
];

const PADRAO_INICIAL = ['www', 'tests', 'tools', 'eslint.config.js', 'stryker.config.mjs'];
const EXTENSOES = /\.(js|mjs|cjs|html|css)$/;
const IGNORADAS = new Set(['node_modules', '.stryker-tmp', 'vendor']);
// Este arquivo e o teste dele citam os padrões de propósito.
const ESTE_DETECTOR = /^verificar-escapes(\.test)?\.m?js$/;

/** Ocorrências proibidas em um texto, com o número da linha (base 1). */
export function acharEscapes(texto) {
  return texto.split('\n').flatMap((conteudo, indice) =>
    PROIBIDOS.filter(({ padrao }) => padrao.test(conteudo)).map(({ motivo }) => ({
      linha: indice + 1,
      motivo,
      trecho: conteudo.trim(),
    })),
  );
}

function arquivos(caminho) {
  let info;
  try {
    info = statSync(caminho);
  } catch {
    return []; // pasta do padrão que não existe neste clone
  }
  if (info.isDirectory()) {
    if (IGNORADAS.has(basename(caminho))) return [];
    return readdirSync(caminho).flatMap((nome) => arquivos(join(caminho, nome)));
  }
  const nome = basename(caminho);
  return EXTENSOES.test(nome) && !ESTE_DETECTOR.test(nome) ? [caminho] : [];
}

function principal(caminhos) {
  const achados = caminhos
    .flatMap(arquivos)
    .flatMap((arquivo) =>
      acharEscapes(readFileSync(arquivo, 'utf8')).map((achado) => ({ arquivo, ...achado })),
    );
  for (const { arquivo, linha, motivo, trecho } of achados) {
    console.error(`${arquivo}:${linha}  ${motivo}: ${trecho}`);
  }
  console.log(`Rotas de fuga: ${achados.length}.`);
  return achados.length > 0 ? 1 : 0;
}

// Executado direto pela linha de comando (e não importado por um teste).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const caminhos = process.argv.slice(2);
  process.exitCode = principal(caminhos.length > 0 ? caminhos : PADRAO_INICIAL);
}
