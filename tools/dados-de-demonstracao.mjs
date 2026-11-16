// Dados de demonstração para o APK de PR (variante ".pr"): um app já cheio, para testar uma
// mudança no celular sem tocar nos dados de verdade. Sem dependências.
//
// Uso: node tools/dados-de-demonstracao.mjs [<pasta do app web>]
//   <pasta>  cópia do app web a alterar (padrão: a de dentro do projeto Android, criada pelo
//            "npx cap sync android"). A pasta www/ do repositório nunca é tocada.
//
// O que faz na cópia: grava js/demonstracao.js, um script que põe os dados no armazenamento só
// quando ele está vazio, e o liga no index.html antes dos outros scripts.
//
// Os dados são inventados e as datas são relativas ao dia do build. Antes de gravar, passam pela
// mesma leitura do app (migração e validação), então saem sempre no formato atual.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hoje, somaDias } from '../www/js/nucleo/datas.js';
import { lerEstado } from '../www/js/nucleo/estado.js';

// A mesma chave de www/js/store.js (um teste confere que as duas são iguais).
export const CHAVE = 'foco:v1';
const PASTA_PADRAO = fileURLToPath(new URL('../android/app/src/main/assets/public', import.meta.url));
const MARCA_NO_HTML = '<script src="js/tema-inicial.js"></script>';
const DIAS_DE_HISTORICO = 60;

// Marca "feito" em parte dos dias, sempre igual para o mesmo hábito e a mesma distância de hoje.
function historico(dia, semente, parte, valor = () => 'feito') {
  const dias = {};
  for (let n = 1; n <= DIAS_DE_HISTORICO; n += 1) {
    if ((n * 7 + semente * 13) % 10 < parte) dias[somaDias(dia, -n)] = valor(n);
  }
  return dias;
}

function dadosBrutos(dia) {
  const manha = [
    { id: 'i1', tipo: 'secao', texto: 'Ao acordar' },
    { id: 'i2', tipo: 'item', texto: 'Beber um copo de água', hora: '07:00', habitoId: 'h1' },
    { id: 'i3', tipo: 'item', texto: 'Arrumar a cama', hora: '07:05' },
    { id: 'i4', tipo: 'item', texto: 'Alongar por 5 minutos', hora: '07:10' },
    { id: 'i5', tipo: 'secao', texto: 'Antes de sair' },
    { id: 'i6', tipo: 'item', texto: 'Café da manhã', hora: '07:30' },
    { id: 'i7', tipo: 'item', texto: 'Conferir a agenda do dia', hora: '07:50' },
  ];
  const noite = [
    { id: 'i8', tipo: 'item', texto: 'Separar a roupa de amanhã', hora: '21:30' },
    { id: 'i9', tipo: 'item', texto: 'Ler 20 minutos', hora: '22:00', habitoId: 'h2' },
    { id: 'i10', tipo: 'item', texto: 'Celular fora do quarto', hora: '22:30' },
  ];
  const criada = Date.parse(`${somaDias(dia, -10)}T12:00:00`);
  const tarefa = (id, listaId, titulo, extra = {}) => ({ id, listaId, titulo, criadaEm: criada, ...extra });

  return {
    aba: 'painel',
    rotinas: [
      { id: 'r1', nome: 'Manhã', itens: manha },
      { id: 'r2', nome: 'Noite', itens: noite },
    ],
    rotinaAtiva: 'r1',
    marcasRotina: { data: dia, porRotina: { r1: ['i2', 'i3'] } },
    habitos: [
      { id: 'h1', nome: 'Beber água', cor: 'ciano', tipo: 'numero', unidade: 'copos', meta: 8 },
      { id: 'h2', nome: 'Ler 20 minutos', cor: 'amarelo' },
      { id: 'h3', nome: 'Exercício', cor: 'verde', diasDaSemana: [1, 3, 5] },
      { id: 'h4', nome: 'Meditar', cor: 'lilas' },
      { id: 'h5', nome: 'Estudar inglês', cor: 'laranja', diasDaSemana: [1, 2, 3, 4, 5] },
      { id: 'h6', nome: 'Diário', cor: 'rosa', arquivado: true },
    ],
    registros: {
      h1: { ...historico(dia, 1, 9, (n) => 4 + (n % 6)), [dia]: 3 },
      h2: { ...historico(dia, 2, 8), [dia]: 'feito' },
      h3: historico(dia, 3, 6),
      h4: { ...historico(dia, 4, 5), [somaDias(dia, -1)]: 'pulado' },
      h5: historico(dia, 5, 7),
      h6: historico(dia, 6, 3),
    },
    notasHabito: { h3: { [somaDias(dia, -2)]: 'Treino mais curto, 30 minutos.' } },
    listas: [
      { id: 'l1', nome: 'Minhas tarefas' },
      { id: 'l2', nome: 'Estudos' },
      { id: 'l3', nome: 'Casa' },
    ],
    listaAtiva: 'l1',
    tarefas: [
      tarefa('t1', 'l1', 'Renovar a carteirinha da biblioteca', { prazo: somaDias(dia, -2) }),
      tarefa('t2', 'l1', 'Marcar a revisão da bicicleta', { prazo: dia, hora: '18:00', estrela: true }),
      tarefa('t3', 'l1', 'Comprar presente de aniversário', { prazo: somaDias(dia, 1) }),
      tarefa('t4', 'l1', 'Organizar as fotos da viagem'),
      tarefa('t5', 'l2', 'Entregar o trabalho de cálculo', {
        prazo: somaDias(dia, 6),
        notas: 'Lista 4, exercícios 1 a 12.',
        estrela: true,
      }),
      tarefa('t6', 'l2', 'Revisar o capítulo 3', { prazo: somaDias(dia, 3) }),
      tarefa('t7', 'l3', 'Pagar a conta de luz', {
        prazo: somaDias(dia, 4),
        repeticao: { cada: 1, unidade: 'mes' },
      }),
      tarefa('t8', 'l3', 'Regar as plantas', { prazo: dia, repeticao: { cada: 3, unidade: 'dia' } }),
      tarefa('t9', 'l3', 'Trocar a lâmpada do corredor', { feita: true, feitaEm: criada + 86_400_000 }),
    ],
    // Sem lembretes: o app de demonstração não deve pedir permissão nem notificar ninguém.
    lembretes: false,
  };
}

/**
 * O estado de demonstração no formato atual do app, para o dia informado ('AAAA-MM-DD').
 * Devolve { estado, avisos }: avisos vazio quer dizer que a validação não corrigiu nada.
 */
export function estadoDeDemonstracao(dia) {
  const { estado, problema, avisos } = lerEstado(JSON.stringify({ versao: 1, ...dadosBrutos(dia) }), {
    dia,
    gerarId: () => 'l0',
  });
  if (problema) throw new Error(`Dados de demonstração ilegíveis: ${problema}`);
  return { estado, avisos };
}

/** O texto de js/demonstracao.js: só grava quando ainda não há dado nenhum. */
export function scriptDeDemonstracao(estado) {
  // JSON de um JSON: vira um literal de texto seguro dentro do script.
  const conteudo = JSON.stringify(JSON.stringify(estado));
  return [
    '// Gerado por tools/dados-de-demonstracao.mjs no build do APK de PR. Não editar.',
    '(function () {',
    '  try {',
    `    if (localStorage.getItem(${JSON.stringify(CHAVE)}) === null) {`,
    `      localStorage.setItem(${JSON.stringify(CHAVE)}, ${conteudo});`,
    '    }',
    '  } catch {',
    '    /* armazenamento indisponível: o app abre vazio */',
    '  }',
    '})();',
    '',
  ].join('\n');
}

/** Grava o script na cópia do app web e o liga no index.html dela. */
export function semear(pasta, dia) {
  const html = join(pasta, 'index.html');
  if (!existsSync(html)) throw new Error(`Não achei ${html}. Rode "npx cap sync android" antes.`);
  const pagina = readFileSync(html, 'utf8');
  if (!pagina.includes(MARCA_NO_HTML)) throw new Error(`${html}: não achei ${MARCA_NO_HTML}`);

  const { estado, avisos } = estadoDeDemonstracao(dia);
  if (avisos.length) throw new Error(`Dados de demonstração fora do formato: ${avisos.join('; ')}`);
  writeFileSync(join(pasta, 'js', 'demonstracao.js'), scriptDeDemonstracao(estado), 'utf8');
  if (!pagina.includes('js/demonstracao.js')) {
    const ligado = pagina.replace(
      MARCA_NO_HTML,
      `<script src="js/demonstracao.js"></script>\n    ${MARCA_NO_HTML}`,
    );
    writeFileSync(html, ligado, 'utf8');
  }
  return estado;
}

// Executado direto pela linha de comando (e não importado por um teste).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const estado = semear(process.argv[2] ?? PASTA_PADRAO, hoje());
    console.log(
      `Dados de demonstração: ${estado.rotinas.length} rotinas, ${estado.habitos.length} hábitos, ${estado.tarefas.length} tarefas.`,
    );
  } catch (erro) {
    console.error(erro.message);
    process.exitCode = 1;
  }
}
