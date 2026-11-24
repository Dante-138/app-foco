// O Foco no celular, pelo adb (cabo USB ou Wi-Fi): cópia dos dados, instalação de um APK sem
// perder nada e uma conferência rápida depois. Fala com o WebView do app instalado, que precisa
// ser o APK de depuração (pwsh tools/apk.ps1 -Tipo debug): o de release não é inspecionável.
//
// Uso:
//   node tools/aparelho.mjs copia                 salva no PC o que o app tem guardado
//   node tools/aparelho.mjs instalar <apk>        copia, instala por cima e confere que os dados ficaram
//   node tools/aparelho.mjs conferir              abre o app e confere abas, erros e dados
// Opções:
//   --aparelho <serial>  qual aparelho, como o "adb devices" mostra (com Wi-Fi, IP:porta)
//   --pr                 o app de PR (io.github.dante138.foco.pr) em vez do app de verdade
//   --rebaixar           instalar um APK de versão mais antiga (adb install -r -d); os dados ficam
//   --copiei-pelo-app    o app instalado é o de release (não dá para copiar por aqui) e você já
//                        guardou a cópia pelo próprio app, em Ajustes > Copiar dados
//   --pasta <pasta>      onde ficam as cópias (padrão: $FOCO_COPIAS, senão ~/foco-copias)
//
// Regras: nunca desinstala (apagaria os dados), nunca desbloqueia a tela e nunca grava no
// armazenamento do app. A instalação só começa depois da cópia salva.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PACOTE = 'io.github.dante138.foco';
const CHAVE = 'foco:v1';
const ABAS = 4;

// ---- Lógica pura (testada em tests/unidade/aparelho.test.js) ----

// Escolhe o aparelho na saída do "adb devices". Devolve { serial } ou { erro } com o que fazer.
export function escolherAparelho(saida, pedido) {
  const linhas = saida
    .split(/\r?\n/)
    .slice(1)
    .map((linha) => linha.trim().split(/\s+/))
    .filter((partes) => partes.length >= 2);
  const prontos = linhas.filter(([, estado]) => estado === 'device').map(([serial]) => serial);
  const travados = linhas.filter(([, estado]) => estado !== 'device');

  if (pedido) {
    if (prontos.includes(pedido)) return { serial: pedido };
    const travado = travados.find(([serial]) => serial === pedido);
    if (travado) return { erro: `${pedido} está "${travado[1]}": ${dicaDoEstado(travado[1])}` };
    return { erro: `${pedido} não está no adb. Aparelhos: ${prontos.join(', ') || 'nenhum'}.` };
  }
  if (prontos.length === 1) return { serial: prontos[0] };
  if (prontos.length > 1)
    return { erro: `Mais de um aparelho (${prontos.join(', ')}): use --aparelho <serial>.` };
  if (travados.length)
    return { erro: `${travados[0][0]} está "${travados[0][1]}": ${dicaDoEstado(travados[0][1])}` };
  return {
    erro:
      'Nenhum aparelho no adb. Cabo: ligue a depuração USB. Wi-Fi: no celular, Opções do desenvolvedor > ' +
      'Depuração por Wi-Fi > Parear com código; no PC, "adb pair IP:PORTA" e depois "adb connect IP:PORTA".',
  };
}

function dicaDoEstado(estado) {
  if (estado === 'unauthorized') return 'aceite a depuração no aviso que aparece no celular.';
  if (estado === 'offline') return 'reconecte (cabo de novo, ou "adb connect" de novo no Wi-Fi).';
  return 'reconecte o aparelho.';
}

// Tela de bloqueio na saída do "dumpsys window" e do "dumpsys deviceidle": cada versão do Android
// escreve de um jeito, então vale qualquer um dos sinais conhecidos.
const SINAIS_DE_BLOQUEIO = [
  'isKeyguardShowing=true',
  'mShowingLockscreen=true',
  'mDreamingLockscreen=true',
  'mScreenLocked=true',
];
export const telaBloqueada = (saida) => SINAIS_DE_BLOQUEIO.some((sinal) => saida.includes(sinal));

// O que interessa do estado guardado, para comparar antes e depois. null: nada guardado ou ilegível.
export function resumoDoEstado(texto) {
  if (!texto) return null;
  let e;
  try {
    e = JSON.parse(texto);
  } catch {
    return null;
  }
  if (typeof e !== 'object' || e === null) return null;
  const tamanho = (lista) => (Array.isArray(lista) ? lista.length : 0);
  const celulas = (mapa) =>
    Object.values(mapa ?? {}).reduce((n, porDia) => n + Object.keys(porDia ?? {}).length, 0);
  return {
    versao: e.versao,
    rotinas: tamanho(e.rotinas),
    habitos: tamanho(e.habitos),
    registros: celulas(e.registros),
    listas: tamanho(e.listas),
    tarefas: tamanho(e.tarefas),
  };
}

// Diferenças que indicam perda de dados: alguma contagem caiu, ou o estado sumiu. A versão do
// formato pode subir (migração ao abrir o app novo); descer é perda.
export function perdas(antes, depois) {
  if (!antes) return [];
  if (!depois) return ['os dados sumiram do aparelho'];
  const saida = [];
  for (const campo of ['rotinas', 'habitos', 'registros', 'listas', 'tarefas']) {
    if (depois[campo] < antes[campo]) saida.push(`${campo}: ${antes[campo]} -> ${depois[campo]}`);
  }
  if (depois.versao < antes.versao) saida.push(`versão do formato: ${antes.versao} -> ${depois.versao}`);
  return saida;
}

// Instalou, mas não deu para falar com o app depois. Sem dados de antes para comparar (app novo,
// cópia feita pelo próprio app ou app sem dados): aviso. Com dados de antes, o app era
// inspecionável e deixou de ser: erro, porque nada foi conferido.
export function semConferencia(antes) {
  if (!antes) {
    return {
      aviso:
        'Instalado, sem conferir: não havia dados de antes para comparar e o app não responde ao PC ' +
        '(o APK de release não responde). Abra o app e confira.',
    };
  }
  return {
    erro:
      'Instalou, mas não consegui falar com o app para conferir os dados. Abra o app e confira; ' +
      'se algo faltar, a cópia do passo 1 tem tudo. Se o APK instalado for o de release, ele não deixa conferir por aqui.',
  };
}

// Lê a saída do "adb install". null: instalou. Senão, a explicação e o que fazer.
export function falhaDaInstalacao(saida) {
  if (/^Success\s*$/m.test(saida)) return null;
  if (!saida.trim()) {
    return 'O adb não respondeu à instalação (o aparelho desconectou?). Reconecte e rode de novo: a cópia já está salva.';
  }
  if (/INSTALL_FAILED_UPDATE_INCOMPATIBLE/.test(saida)) {
    return (
      'O APK foi assinado com outra chave. Não desinstale: desinstalar apaga os dados. ' +
      'Gere o APK com a chave do projeto (tools/apk.ps1) ou use o app de PR (--pr).'
    );
  }
  if (/INSTALL_FAILED_VERSION_DOWNGRADE/.test(saida)) {
    return 'O APK é de uma versão mais antiga que a instalada. Para instalar mesmo assim (os dados ficam), use --rebaixar.';
  }
  if (/INSTALL_FAILED_INSUFFICIENT_STORAGE/.test(saida)) return 'Sem espaço no celular.';
  const linha = saida.split(/\r?\n/).find((l) => /Failure|Error|error:/.test(l));
  return `A instalação falhou: ${linha?.trim() ?? saida.trim()}`;
}

// Nome do arquivo da cópia: ordena por data e não tem caractere proibido no Windows.
export function nomeDaCopia(pacote, data) {
  const carimbo = data.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${pacote === PACOTE ? 'foco' : 'foco-pr'}-copia-${carimbo}.json`;
}

export function lerOpcoes(argumentos) {
  const opcoes = { comando: argumentos[0], pacote: PACOTE, rebaixar: false, copieiPeloApp: false };
  const resto = [];
  for (let i = 1; i < argumentos.length; i++) {
    const a = argumentos[i];
    if (a === '--pr') opcoes.pacote = `${PACOTE}.pr`;
    else if (a === '--rebaixar') opcoes.rebaixar = true;
    else if (a === '--copiei-pelo-app') opcoes.copieiPeloApp = true;
    else if (a === '--aparelho' || a === '--pasta') {
      const valor = argumentos[++i];
      if (!valor || valor.startsWith('--')) return { erro: `${a} precisa de um valor.` };
      opcoes[a.slice(2)] = valor;
    } else if (a.startsWith('--')) return { erro: `Opção desconhecida: ${a}` };
    else resto.push(a);
  }
  if (!['copia', 'instalar', 'conferir'].includes(opcoes.comando)) {
    return { erro: 'Comando: copia, instalar <apk> ou conferir.' };
  }
  if (opcoes.comando === 'instalar') {
    if (resto.length !== 1) return { erro: 'instalar precisa do caminho do APK.' };
    opcoes.apk = resto[0];
  } else if (resto.length) return { erro: `Argumento a mais: ${resto.join(' ')}` };
  return opcoes;
}

// ---- Aparelho (adb e WebView) ----

class Parada extends Error {}
// O app instalado não deixa o PC falar com o WebView dele: é o APK de release.
class NaoInspecionavel extends Parada {}

const esperar = (ms) =>
  new Promise((pronto) => {
    setTimeout(pronto, ms);
  });

// O aviso que o adb escreve no stderr de um comando que deu certo não aparece; o de um comando que
// falhou vem no erro (erro.stderr).
function ligarAdb(serial) {
  return (...argumentos) =>
    execFileSync('adb', ['-s', serial, ...argumentos], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
}

function aparelhoEscolhido(pedido) {
  let saida;
  try {
    saida = execFileSync('adb', ['devices'], { encoding: 'utf8' });
  } catch {
    throw new Parada('Não achei o adb. Instale o Android Platform Tools e deixe o adb no PATH.');
  }
  const { serial, erro } = escolherAparelho(saida, pedido);
  if (erro) throw new Parada(erro);
  return serial;
}

// Só no usuário em uso: sem o filtro, o pm tenta os outros (a Pasta Segura da Samsung, por
// exemplo) e o shell não tem permissão para eles.
const instalado = (adb, pacote) =>
  adb('shell', 'pm', 'list', 'packages', '--user', 'current', pacote)
    .split(/\r?\n/)
    .includes(`package:${pacote}`);

// Abre o app e liga no WebView dele. Recusa a tela bloqueada: desbloquear é do dono do aparelho.
async function abrirApp(adb, serial, pacote) {
  const leitura = ['window', 'deviceidle'].map((servico) => {
    try {
      return adb('shell', 'dumpsys', servico);
    } catch {
      return '';
    }
  });
  if (telaBloqueada(leitura.join('\n'))) {
    throw new Parada('O celular está na tela de bloqueio. Desbloqueie e rode de novo.');
  }
  adb('shell', 'am', 'start', '-n', `${pacote}/${PACOTE}.MainActivity`);
  const { _android: android } = await import('playwright-core');
  // Sem o driver do Playwright: ele instalaria apps auxiliares no celular, e o WebView não precisa dele.
  const aparelho = (await android.devices({ omitDriverInstall: true })).find((a) => a.serial() === serial);
  if (!aparelho) throw new Parada(`O Playwright não achou ${serial} no adb.`);
  try {
    const webview = await aparelho.webView({ pkg: pacote }, { timeout: 15000 });
    const pagina = await webview.page();
    pagina.setDefaultTimeout(10000);
    return { aparelho, pagina };
  } catch {
    await aparelho.close();
    throw new NaoInspecionavel(
      'Não consegui falar com o app. Se o celular bloqueou, desbloqueie e rode de novo. ' +
        'Senão, ele precisa ser o APK de depuração (pwsh tools/apk.ps1 -Tipo debug), ' +
        'que instala por cima do de release, com a mesma chave, sem apagar os dados. Para instalar o de ' +
        'depuração agora: guarde a cópia pelo próprio app (Ajustes > Copiar dados) e rode de novo com --copiei-pelo-app.',
    );
  }
}

async function lerGuardado(pagina) {
  await pagina.waitForSelector('#abas button, .sem-conteudo');
  return pagina.evaluate(() =>
    Object.fromEntries(Object.keys(localStorage).map((chave) => [chave, localStorage.getItem(chave)])),
  );
}

async function copiar(adb, serial, opcoes) {
  const { aparelho, pagina } = await abrirApp(adb, serial, opcoes.pacote);
  try {
    const guardado = await lerGuardado(pagina);
    const pasta = resolve(opcoes.pasta ?? process.env.FOCO_COPIAS ?? join(homedir(), 'foco-copias'));
    mkdirSync(pasta, { recursive: true });
    const arquivo = join(pasta, nomeDaCopia(opcoes.pacote, new Date()));
    writeFileSync(arquivo, JSON.stringify(guardado), 'utf8');
    const resumo = resumoDoEstado(guardado[CHAVE]);
    console.log(`Cópia salva em ${arquivo}`);
    console.log(`No aparelho: ${JSON.stringify(resumo)}`);
    return resumo;
  } finally {
    await aparelho.close();
  }
}

async function conferir(adb, serial, opcoes) {
  const { aparelho, pagina } = await abrirApp(adb, serial, opcoes.pacote);
  try {
    const erros = [];
    pagina.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
    pagina.on('pageerror', (e) => erros.push(`exceção: ${e.message}`));
    await pagina.reload();
    await pagina.waitForSelector('#abas button');
    await esperar(1500);
    const abas = await pagina.locator('#abas button').count();
    const build = await pagina.evaluate(() =>
      import('./js/build-info.js').then(
        (m) => m.BUILD,
        () => null,
      ),
    );
    const resumo = resumoDoEstado(await pagina.evaluate((chave) => localStorage.getItem(chave), CHAVE));
    console.log(`Build: ${JSON.stringify(build)}`);
    console.log(`Dados: ${JSON.stringify(resumo)}`);
    console.log(`Abas: ${abas} de ${ABAS}. Erros no console: ${erros.length}.`);
    for (const erro of erros) console.log(`  ${erro}`);
    return { resumo, ok: abas === ABAS && erros.length === 0 };
  } finally {
    await aparelho.close();
  }
}

async function instalar(adb, serial, opcoes) {
  const apk = resolve(opcoes.apk);
  if (!existsSync(apk)) throw new Parada(`APK não encontrado: ${apk}`);
  let antes = null;
  if (!instalado(adb, opcoes.pacote)) {
    console.log('1. App ainda não instalado: nada a copiar');
  } else if (opcoes.copieiPeloApp) {
    console.log('1. Cópia feita pelo próprio app (--copiei-pelo-app): sem comparação dos dados no fim');
  } else {
    console.log('1. Cópia dos dados antes de instalar');
    antes = await copiar(adb, serial, opcoes);
  }

  console.log(`2. Instalando ${apk}`);
  let saida;
  try {
    saida = adb('install', '-r', ...(opcoes.rebaixar ? ['-d'] : []), apk);
  } catch (erro) {
    saida = `${erro.stdout ?? ''}${erro.stderr ?? ''}`;
  }
  const falha = falhaDaInstalacao(saida);
  if (falha) throw new Parada(falha);

  console.log('3. Conferência depois de instalar');
  let conferido;
  try {
    conferido = await conferir(adb, serial, opcoes);
  } catch (erro) {
    if (!(erro instanceof NaoInspecionavel)) throw erro;
    const { aviso, erro: falhou } = semConferencia(antes);
    if (falhou) throw new Parada(falhou);
    console.log(aviso);
    return;
  }
  const { resumo, ok } = conferido;
  const perdido = perdas(antes, resumo);
  if (perdido.length) {
    throw new Parada(
      `Dados diferentes depois de instalar (${perdido.join('; ')}). A cópia do passo 1 tem tudo.`,
    );
  }
  if (!ok) throw new Parada('Instalou e os dados ficaram, mas o app abriu com erro (acima).');
  console.log('Instalado. Dados conferidos.');
}

async function principal(argumentos) {
  const opcoes = lerOpcoes(argumentos);
  if (opcoes.erro) throw new Parada(opcoes.erro);
  const serial = aparelhoEscolhido(opcoes.aparelho);
  const adb = ligarAdb(serial);
  if (opcoes.comando !== 'instalar' && !instalado(adb, opcoes.pacote)) {
    throw new Parada(`${opcoes.pacote} não está instalado em ${serial}.`);
  }
  if (opcoes.comando === 'copia') await copiar(adb, serial, opcoes);
  else if (opcoes.comando === 'conferir') {
    const { ok } = await conferir(adb, serial, opcoes);
    if (!ok) throw new Parada('A conferência achou problema (acima).');
  } else await instalar(adb, serial, opcoes);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  principal(process.argv.slice(2)).catch((erro) => {
    console.error(erro instanceof Parada ? erro.message : erro);
    process.exitCode = 1;
  });
}
