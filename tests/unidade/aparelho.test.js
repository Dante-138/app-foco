import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PACOTE,
  escolherAparelho,
  falhaDaInstalacao,
  lerOpcoes,
  nomeDaCopia,
  perdas,
  resumoDoEstado,
  semConferencia,
  telaBloqueada,
} from '../../tools/aparelho.mjs';

const lista = (...linhas) => ['List of devices attached', ...linhas, ''].join('\r\n');

test('aparelho: um só pronto é o escolhido, por cabo ou por Wi-Fi', () => {
  assert.deepEqual(escolherAparelho(lista('R5CX12345\tdevice'), undefined), { serial: 'R5CX12345' });
  assert.deepEqual(escolherAparelho(lista('192.168.0.10:5555\tdevice'), undefined), {
    serial: '192.168.0.10:5555',
  });
  // Os que não estão prontos não contam quando há um pronto.
  assert.deepEqual(escolherAparelho(lista('emulador\toffline', 'R5CX12345\tdevice'), undefined), {
    serial: 'R5CX12345',
  });
});

test('aparelho: mais de um, pedido certo, pedido ausente e pedido travado', () => {
  const dois = lista('R5CX12345\tdevice', '192.168.0.10:5555\tdevice');
  assert.match(escolherAparelho(dois, undefined).erro, /Mais de um aparelho .*--aparelho/);
  assert.deepEqual(escolherAparelho(dois, '192.168.0.10:5555'), { serial: '192.168.0.10:5555' });
  assert.match(escolherAparelho(dois, 'outro').erro, /outro não está no adb. Aparelhos: R5CX12345, 192/);
  assert.match(escolherAparelho(lista(), 'outro').erro, /Aparelhos: nenhum\./);
  assert.match(escolherAparelho(lista('R5CX12345\tunauthorized'), 'R5CX12345').erro, /aceite a depuração/);
});

test('aparelho: nenhum pronto explica o que fazer', () => {
  assert.match(escolherAparelho(lista(), undefined).erro, /adb pair IP:PORTA.*adb connect IP:PORTA/);
  assert.match(escolherAparelho(lista('R5CX12345\tunauthorized'), undefined).erro, /aceite a depuração/);
  assert.match(escolherAparelho(lista('192.168.0.10:5555\toffline'), undefined).erro, /adb connect/);
  assert.match(escolherAparelho(lista('R5CX12345\tauthorizing'), undefined).erro, /reconecte o aparelho/);
});

test('resumo: conta o que importa e aceita estado vazio ou ilegível', () => {
  const estado = {
    versao: 11,
    rotinas: [{}, {}],
    habitos: [{}],
    registros: { h1: { '2026-11-01': 1, '2026-11-02': 1 }, h2: { '2026-11-01': 1 } },
    listas: [{}],
    tarefas: [{}, {}, {}],
  };
  assert.deepEqual(resumoDoEstado(JSON.stringify(estado)), {
    versao: 11,
    rotinas: 2,
    habitos: 1,
    registros: 3,
    listas: 1,
    tarefas: 3,
  });
  assert.deepEqual(resumoDoEstado('{"versao":1,"registros":{"h":null}}'), {
    versao: 1,
    rotinas: 0,
    habitos: 0,
    registros: 0,
    listas: 0,
    tarefas: 0,
  });
  for (const ruim of [null, '', '{', 'null', '3']) assert.equal(resumoDoEstado(ruim), null, String(ruim));
});

test('perdas: contagem que cai ou estado que some é perda; formato que sobe não é', () => {
  const antes = { versao: 10, rotinas: 2, habitos: 3, registros: 40, listas: 1, tarefas: 5 };
  assert.deepEqual(perdas(antes, { ...antes }), []);
  assert.deepEqual(perdas(antes, { ...antes, versao: 11, tarefas: 6 }), []);
  assert.deepEqual(perdas(antes, { ...antes, tarefas: 4, registros: 39 }), [
    'registros: 40 -> 39',
    'tarefas: 5 -> 4',
  ]);
  assert.deepEqual(perdas(antes, { ...antes, versao: 9 }), ['versão do formato: 10 -> 9']);
  assert.deepEqual(perdas(antes, null), ['os dados sumiram do aparelho']);
  assert.deepEqual(perdas(null, null), []); // app que não estava instalado
});

test('instalação: sucesso, chave diferente, versão antiga, sem espaço e falha desconhecida', () => {
  assert.equal(falhaDaInstalacao('Performing Streamed Install\r\nSuccess\r\n'), null);
  const chave = falhaDaInstalacao(
    'adb: failed to install foco.apk: Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE: Existing package signatures do not match]',
  );
  assert.match(chave, /outra chave\. Não desinstale/);
  assert.match(falhaDaInstalacao('Failure [INSTALL_FAILED_VERSION_DOWNGRADE]'), /--rebaixar/);
  assert.match(falhaDaInstalacao('Failure [INSTALL_FAILED_INSUFFICIENT_STORAGE]'), /Sem espaço/);
  assert.equal(
    falhaDaInstalacao(
      'Performing Streamed Install\nadb: failed to install x.apk: Failure [INSTALL_PARSE_FAILED]\n',
    ),
    'A instalação falhou: adb: failed to install x.apk: Failure [INSTALL_PARSE_FAILED]',
  );
  assert.equal(falhaDaInstalacao(' algo estranho '), 'A instalação falhou: algo estranho');
  // adb que caiu no meio não devolve nada: a mensagem diz o que fazer.
  assert.match(falhaDaInstalacao(''), /Reconecte e rode de novo/);
  assert.match(falhaDaInstalacao(' \r\n'), /Reconecte e rode de novo/);
});

test('tela bloqueada: qualquer sinal conhecido conta; desbloqueada e saída vazia não', () => {
  for (const sinal of [
    '  isKeyguardShowing=true',
    'mShowingLockscreen=true mShowingDream=false',
    'mDreamingLockscreen=true',
    '  mScreenOn=true mScreenLocked=true',
  ]) {
    assert.equal(telaBloqueada(`linha\n${sinal}\noutra`), true, sinal);
  }
  assert.equal(telaBloqueada('isKeyguardShowing=false mShowingLockscreen=false mScreenLocked=false'), false);
  assert.equal(telaBloqueada(''), false);
});

test('sem conferência depois de instalar: aviso sem cópia de antes, erro com cópia de antes', () => {
  assert.match(semConferencia(null).aviso, /release/);
  assert.equal(semConferencia(null).erro, undefined);
  const resumo = { versao: 11, rotinas: 1, habitos: 1, registros: 1, listas: 1, tarefas: 1 };
  assert.match(semConferencia(resumo).erro, /cópia do passo 1 tem tudo/);
  assert.equal(semConferencia(resumo).aviso, undefined);
});

test('cópia: nome por data, sem caractere proibido no Windows, separando o app de PR', () => {
  const data = new Date('2026-11-23T18:04:05.678Z');
  assert.equal(nomeDaCopia(PACOTE, data), 'foco-copia-2026-11-23T18-04-05.json');
  assert.equal(nomeDaCopia(`${PACOTE}.pr`, data), 'foco-pr-copia-2026-11-23T18-04-05.json');
});

test('opções: comandos, valores e erros', () => {
  assert.deepEqual(lerOpcoes(['copia']), {
    comando: 'copia',
    pacote: PACOTE,
    rebaixar: false,
    copieiPeloApp: false,
  });
  assert.deepEqual(
    lerOpcoes(['instalar', 'saida/foco-debug.apk', '--aparelho', '192.168.0.10:5555', '--rebaixar']),
    {
      comando: 'instalar',
      pacote: PACOTE,
      rebaixar: true,
      copieiPeloApp: false,
      aparelho: '192.168.0.10:5555',
      apk: 'saida/foco-debug.apk',
    },
  );
  assert.deepEqual(lerOpcoes(['conferir', '--pr', '--pasta', 'copias']), {
    comando: 'conferir',
    pacote: `${PACOTE}.pr`,
    rebaixar: false,
    copieiPeloApp: false,
    pasta: 'copias',
  });
  assert.equal(lerOpcoes(['instalar', 'foco-debug.apk', '--copiei-pelo-app']).copieiPeloApp, true);
  assert.match(lerOpcoes([]).erro, /Comando: copia/);
  assert.match(lerOpcoes(['apagar']).erro, /Comando: copia/);
  assert.match(lerOpcoes(['instalar']).erro, /caminho do APK/);
  assert.match(lerOpcoes(['instalar', 'a.apk', 'b.apk']).erro, /caminho do APK/);
  assert.match(lerOpcoes(['copia', 'extra']).erro, /Argumento a mais: extra/);
  assert.match(lerOpcoes(['copia', '--aparelho']).erro, /--aparelho precisa de um valor/);
  assert.match(lerOpcoes(['copia', '--pasta', '--pr']).erro, /--pasta precisa de um valor/);
  assert.match(lerOpcoes(['copia', '--forcar']).erro, /Opção desconhecida: --forcar/);
});
