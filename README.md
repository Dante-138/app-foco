# Foco

App de organização pessoal que junta em um lugar só o que costuma ficar espalhado em três:
rotinas do dia, hábitos e tarefas com prazo.

> Nome provisório. Projeto em desenvolvimento.

## O que tem hoje

- **Rotinas**: checklists do dia com seções e horários. As marcas zeram sozinhas no dia seguinte.
  O item marcado desce para o fim da seção, e um botão desfaz a última marca. Um item pode ser
  ligado a um hábito: marcar o item marca o hábito no dia. Cada rotina pode ter dias da semana
  (menu da rotina, "Dias da semana"): ao virar o dia, o app abre a rotina do dia, e trocar à mão
  depois disso vale até o dia seguinte.
- **Hábitos**: grade com um hábito por linha e um dia por coluna (feito, não feito, pulado),
  além de hábitos numéricos com meta diária. O anel mostra a pontuação do hábito, e a edição
  mostra as sequências. Um filtro esconde os já resolvidos no dia e os arquivados. Segurar um
  dia abre a folha dele: o estado (feito, folga ou vazio; quantidade, no numérico) e uma nota.
- **Tarefas**: listas com prazo e horário, agrupadas em Atrasadas, Hoje, Amanhã, datas e Sem data,
  ou em outra ordem (estrela, título, mais recentes). Uma tarefa pode se repetir a cada N dias,
  semanas, meses ou anos. Segurar o nome de uma lista abre o menu dela, com renomear, mover na
  faixa e excluir.
- **Lembretes**: no app Android, a tarefa com prazo avisa por notificação, na hora marcada ou
  às 9h quando só tem a data.
- **Painel**: o dia numa tela só, com o anel da rotina aberta, os próximos itens, os hábitos e as
  tarefas de hoje. Marca item e conclui tarefa ali mesmo. Em rotina com horários, a lista começa
  no item do horário atual ("agora") e mostra quanto falta para o próximo. As sequências em
  risco (hábitos que vêm de dois dias seguidos ou mais e ainda estão em branco hoje) aparecem
  num bloco próprio, e dá para marcar ali.
- **Gestos**: deslizar o dedo para o lado troca de aba, na ordem da barra: Painel, Hábitos,
  Rotinas, Tarefas. O app abre na última aba usada; na primeira vez, em Rotinas.
- **Tema**: escuro (padrão), claro ou o do sistema, em Ajustes.
- **Backup**: em Ajustes, copiar todos os dados como texto e restaurar colando esse texto.
  O app confere o que foi colado e pede confirmação antes de substituir.

## Como rodar

Requer Node.js 22.8 ou mais novo. No navegador o app não tem dependências nem etapa de build;
o app Android usa o Capacitor e o plugin de notificações locais dele.

```bash
node tools/serve.mjs
```

Abra `http://localhost:8137`.

Para abrir em um celular Android ligado por USB, com a depuração ativada:

```bash
adb reverse tcp:8137 tcp:8137
```

Depois acesse `http://localhost:8137` no Chrome do celular.

## Desenvolvimento

Quem edita o quê, o fluxo de PR e as armadilhas conhecidas estão em [AGENTS.md](AGENTS.md).

Fora o Capacitor, as dependências são só de desenvolvimento (ESLint, Prettier e playwright-core). Os testes usam
o executor nativo do Node; os de ponta a ponta abrem o Google Chrome instalado na máquina.

```bash
npm install         # uma vez
npm run dev         # servidor local em http://localhost:8137
npm run check       # o portão inteiro: commits, lint, formatação, testes de unidade e de ponta a ponta
npm run commits     # só as mensagens de commit do branch, contra a origin/main
npm run test:mutation  # teste de mutação do núcleo (uns 3 minutos; roda sozinho no CI)
npm run format      # formata o código com o Prettier
```

O repositório traz um gancho de `pre-push` (pasta `.githooks`) que confere as mensagens dos
commits antes de eles saírem da máquina. Ative uma vez por clone:

```bash
git config core.hooksPath .githooks
```

Vale a pena porque commit enviado com mensagem fora do padrão não tem conserto simples: a
`main` e os branches enviados não aceitam reescrita de histórico, então o jeito é refazer o
branch com outro nome.

O mesmo portão reprova nomes e dados que não podem ir para um repositório público, a partir de
uma lista que nunca fica no repositório: um termo por linha em
`~/.config/portao-de-qualidade/termos-proibidos.txt` (ou no arquivo de
`ARQUIVO_TERMOS_PROIBIDOS`), e no CI o secret `TERMOS_PROIBIDOS`. Maiúscula e acento não
contam, e o aviso diz só o número do termo na lista.

## APK Android

O app é empacotado com o Capacitor (pasta `android/`). O APK é compilado dentro do Docker:
não é preciso instalar Java nem Android Studio.

A assinatura usa uma chave fixa, criada uma vez e guardada fora do repositório, em uma pasta
com dois arquivos: `foco.jks` (a keystore) e `assinatura.properties` (modelo em
`docker/android/assinatura.properties.exemplo`). Um APK assinado com outra chave só instala
depois de desinstalar o app, e isso apaga os dados. Por isso a chave nunca muda e precisa de
cópia de segurança.

```bash
pwsh tools/apk.ps1 -AceitoLicencaAndroid
```

- `-AceitoLicencaAndroid` declara o aceite da
  [licença do Android SDK](https://developer.android.com/studio/terms), exigido para baixá-lo.
- O APK sai em `saida/foco.apk`. Para instalar com o celular ligado por USB:
  `adb install -r saida/foco.apk`.
- No fim o script apaga do Docker tudo o que criou (imagem, volume e construtor de build) e
  nada além disso. Para vários builds seguidos, use `-Manter` e termine com `-Limpar`.
- `-Simular` mostra os comandos sem executar.
- O APK leva um carimbo com a versão, o commit e a data do build, mostrado no fim de Ajustes.
  É o que identifica o app instalado ao relatar um defeito.
- `-Tipo debug` gera `saida/foco-debug.apk`: o mesmo app, com a mesma chave, mas
  inspecionável pelo cabo USB. Um instala por cima do outro sem apagar os dados.

## Releases

A versão sai dos commits (Conventional Commits), pelo [release-please](https://github.com/googleapis/release-please):

1. A cada merge na `main`, o workflow `Release` mantém um PR `chore: release x.y.z`, em
   rascunho, com a versão nova no `package.json` e no `android/app/build.gradle` e o
   `CHANGELOG.md` (Novidades, Correções, Desempenho). Antes da versão 1.0, `feat` sobe o número
   do meio e `fix` o último.
2. Esse PR segue o fluxo de qualquer outro: revisão, sai do rascunho, merge.
3. No merge saem a tag `vX.Y.Z` e a release. O job `Construir APK` compila sem assinar e sem
   nenhum segredo; o job `Assinar e publicar o APK` alinha e assina com a chave fixa, reprova se
   o certificado não for o de `android/assinatura-sha256.txt`, atesta a proveniência (SLSA) e
   anexa `foco-vX.Y.Z.apk`. Para conferir que o APK saiu deste repositório, deste commit:

   ```bash
   gh attestation verify foco-vX.Y.Z.apk --repo Dante-138/app-foco
   ```

O `versionCode` do Android sai da versão (1.2.3 vira 10203), então cada release instala por
cima da anterior sem apagar os dados.

### Secrets da release (uma vez, pelo dono do repositório)

Sem eles o workflow só avisa e termina verde. Nada disso é lido por agente nenhum.

1. **Ambiente `release`**: em Settings, Environments, New environment, nome `release`. Em
   Deployment branches and tags, escolha Selected branches and tags e acrescente só `main`.
   Assim a chave do APK só fica disponível para workflow rodando na `main`.
2. **Chave do APK, no ambiente `release`**. No PowerShell, na pasta das chaves:

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD/foco.jks")) | gh secret set FOCO_KEYSTORE_BASE64 --env release --repo Dante-138/app-foco
   ```

   Depois as três que o `gh` pergunta sem mostrar o que é digitado (os mesmos valores do
   `assinatura.properties`):

   ```bash
   gh secret set FOCO_KEYSTORE_SENHA --env release --repo Dante-138/app-foco
   ```

   ```bash
   gh secret set FOCO_CHAVE_ALIAS --env release --repo Dante-138/app-foco
   ```

   ```bash
   gh secret set FOCO_CHAVE_SENHA --env release --repo Dante-138/app-foco
   ```

3. **`RELEASE_TOKEN`**, no repositório (não no ambiente): em GitHub, Settings, Developer
   settings, Fine-grained tokens, crie um token só para o repositório `app-foco`, com Contents e
   Pull requests em leitura e escrita, e validade de até um ano. Com o token padrão do workflow
   o PR de release não dispararia o CI, e a proteção da `main` nunca o liberaria.

   ```bash
   gh secret set RELEASE_TOKEN --repo Dante-138/app-foco
   ```

4. **Impressão digital do certificado**, uma vez: o job que assina reprova se o APK sair com
   outra chave, e compara com a linha que você pôs em `android/assinatura-sha256.txt` (a
   impressão digital é pública). O build local já mostra a sua, no fim, depois de
   "== Conferindo a assinatura":

   ```bash
   pwsh tools/apk.ps1 -AceitoLicencaAndroid -Tipo debug
   ```

   Copie o valor de `certificate SHA-256 digest` para o arquivo, numa linha sem `#`, e faça um PR.
   Enquanto o arquivo não tiver uma impressão digital válida, a release sai sem APK e o job
   falha com essa mensagem.

5. Conferir: o próximo merge na `main` abre o PR de release. Quando o token vencer, o workflow
   falha no passo do release-please; é só criar outro e repetir o passo 3.

## Portão de qualidade

Nada entra na `main` sem pull request, e o merge só é liberado com o job `Gate` do CI verde.
A regra vale também para o dono do repositório. O portão confere, nesta ordem:

1. **Mensagens de commit e título do PR** no padrão Conventional Commits, com até 72 caracteres
   e sem linha de coautoria. O job `Título` repete a conferência do título e da descrição
   quando o PR é editado: no merge por squash, são eles que viram o commit na `main`. A única exceção é a linha de assinatura que o
   Dependabot escreve nos commits dele. As atualizações que ele propõe (npm e GitHub Actions,
   uma vez por semana) estão em `.github/dependabot.yml`.
2. **Lint sem nenhum aviso**, e sem comentário de exceção: o `eslint-disable` é proibido.
   Além dos erros comuns, o lint impõe a estrutura descrita abaixo.
3. **Formatação** conferida pelo Prettier.
4. **Testes de unidade** com cobertura de 100% de linhas, desvios e funções do núcleo.
   Um módulo novo no núcleo sem teste reprova. Parte deles é por propriedade (fast-check): centenas
   de dados gerados, muitos malformados, conferem que ler os dados salvos nunca lança exceção,
   que validar de novo não muda nada e que a migração e o backup não perdem dados.
5. **Testes de ponta a ponta** em um Chrome real: os fluxos das três abas, o tema, dados
   salvos com problema, duas abas abertas e a política de segurança. Qualquer erro no console
   da página reprova.

O merge é sempre por squash: cada pull request vira um commit na `main`, com o título do PR.

Todo pull request tem a `main` como base: uma mudança por vez, sem pilha de PRs. O job `Base`
reprova o PR que aponta para outra branch, inclusive quando a base é trocada depois de aberto.
Mesclar em outra branch não passa pela proteção da `main`, e a mudança fica fora dela.

Fora do portão, o workflow `Análise` roda em todo PR, na `main` e uma vez por semana:

- **CodeQL**, a análise estática do GitHub, no JavaScript do app e nos workflows. Os resultados
  ficam na aba Security do repositório.
- **Dependências**: reprova o PR que traz dependência com vulnerabilidade conhecida.
- **Workflows**: o actionlint confere a sintaxe e os scripts de shell dos próprios workflows.

## Estrutura

O código tem duas camadas, e o lint impede que elas se misturem.

```text
www/js/nucleo/          lógica pura: roda sem navegador, não toca DOM nem armazenamento
  esquema.js            formato dos dados e a validação que impõe esse formato
  estado.js             leitura do estado salvo: JSON, migração e validação
  backup.js             conferência do texto de backup antes de restaurar
  migracao.js           atualização de dados de versões anteriores
  rotina-texto.js       conversão entre o texto do editor e os itens da rotina
  rotina-ordem.js       ordem de exibição dos itens (marcados no fim) e o desfazer
  ligacao.js            item de rotina ligado a hábito
  prazos.js             ordenação e agrupamento das tarefas por prazo
  repeticao.js          tarefas que se repetem: próxima data
  lembretes.js          plano de notificações das tarefas com prazo
  habito-calculo.js     leitura de números, metas, pontuação, sequências e filtros
  gesto.js              deslize do dedo para trocar de aba
  painel.js             resumo do dia para a aba Painel
  datas.js              datas no fuso local
  paleta.js             cores dos hábitos
  ids.js                identificadores

www/js/                 interface: monta o DOM e chama o núcleo
  app.js                ponto de entrada e navegação entre as abas
  store.js              único módulo de dados que acessa o armazenamento
  ui.js                 elementos, ícones e folhas
  rotinas.js, habitos.js, tarefas.js
  lembretes.js          agenda as notificações pelo plugin do Capacitor
  ajustes.js, tema.js, tema-inicial.js

tests/unidade/          testes do núcleo e das ferramentas (node --test)
tests/e2e/              testes de ponta a ponta no Chrome
tools/                  servidor de desenvolvimento e portão de commits
```

## Dados e segurança

- Os dados ficam só no aparelho (`localStorage`). O app não faz nenhuma conexão de rede, e a
  política de segurança da página (CSP) bloqueia qualquer tentativa.
- Todo dado lido do armazenamento passa por migração e validação antes de chegar à interface.
  O que dá para aproveitar é corrigido, o resto é descartado, e uma cópia do conteúdo original
  fica guardada quando há correção.
- Dados gravados por uma versão mais nova do app nunca são sobrescritos: o app avisa e não abre.
- A interface não usa HTML em texto. O DOM é montado elemento por elemento, o lint proíbe
  `innerHTML` e a página exige Trusted Types.
- Permissões do app Android: notificações (a única que o Android pergunta, para os lembretes das
  tarefas), vibrar (resposta ao toque), iniciar com o aparelho e manter o processador acordado
  (o plugin reagenda os lembretes depois de reiniciar) e internet (vem da casca do Capacitor; a
  página não faz conexões). Os lembretes são agendados no próprio aparelho, sem servidor, e como
  alarmes não exatos: podem atrasar alguns minutos, e a permissão de alarme exato é retirada.

## Próximos passos

O roteiro está nas [issues](https://github.com/Dante-138/app-foco/issues) e nos
[milestones](https://github.com/Dante-138/app-foco/milestones) do repositório.
