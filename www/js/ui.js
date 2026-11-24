// Auxiliares de interface: criação de elementos, ícones, folhas e avisos.

// Cria um elemento. Texto entra sempre como nó de texto, nunca como HTML,
// então o que o usuário digita ou cola não é interpretado.
export function h(tag, props, ...filhos) {
  const el = document.createElement(tag);
  for (const [chave, valor] of Object.entries(props ?? {})) {
    if (valor == null || valor === false) continue;
    if (chave === 'class') {
      el.className = valor;
    } else if (chave === 'style') {
      for (const [prop, v] of Object.entries(valor)) el.style.setProperty(prop, v);
    } else if (chave.startsWith('on')) {
      el.addEventListener(chave.slice(2), valor);
    } else if (chave in el) {
      el[chave] = valor;
    } else {
      el.setAttribute(chave, valor === true ? '' : valor);
    }
  }
  for (const filho of filhos.flat(Infinity)) {
    if (filho == null || filho === false) continue;
    el.append(filho.nodeType ? filho : document.createTextNode(String(filho)));
  }
  return el;
}

// Pede ao app para redesenhar a aba atual mantendo a rolagem.
export function redesenhar() {
  document.dispatchEvent(new Event('foco:redesenhar'));
}

// ------------------------------------------------------------------ SVG

const SVG_NS = 'http://www.w3.org/2000/svg';

// Cria um elemento SVG. Como em h(), nada é interpretado como HTML: o app não
// usa innerHTML em lugar nenhum (o lint e a política de segurança da página proíbem).
export function svg(tag, atributos = {}, ...filhos) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [nome, valor] of Object.entries(atributos)) el.setAttribute(nome, String(valor));
  el.append(...filhos);
  return el;
}

const ponto = (cy) => ['circle', { cx: 12, cy, r: 1.7, fill: 'currentColor', stroke: 'none' }];

// Cada ícone é uma lista de formas [tag, atributos] em uma área de 24 x 24.
const ICONES = {
  check: [['path', { d: 'M5 12.5l4.5 4.5L19 7.5' }]],
  x: [['path', { d: 'M7 7l10 10M17 7L7 17' }]],
  menos: [['path', { d: 'M7 12h10' }]],
  mais: [['path', { d: 'M12 5v14M5 12h14' }]],
  pontos: [ponto(5.5), ponto(12), ponto(18.5)],
  estrela: [['path', { d: 'M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.8l-5.1 2.7 1-5.7-4.1-4 5.7-.8z' }]],
  cima: [['path', { d: 'M6 14.5l6-6 6 6' }]],
  baixo: [['path', { d: 'M6 9.5l6 6 6-6' }]],
  filtro: [['path', { d: 'M4 7h16M7 12h10M10 17h4' }]],
  lapis: [
    ['path', { d: 'M4.5 19.5l1-4.2L16 4.8a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L8.7 18.5z' }],
    ['path', { d: 'M14 6.8l3.2 3.2' }],
  ],
  elo: [
    ['path', { d: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1' }],
    ['path', { d: 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1' }],
  ],
  refazer: [
    ['path', { d: 'M15 6.5l5 5-5 5' }],
    ['path', { d: 'M20 11.5H10a4.5 4.5 0 0 0 0 9h3' }],
  ],
  alca: [
    ponto(6),
    ponto(12),
    ponto(18),
    ['circle', { cx: 16, cy: 6, r: 1.7, fill: 'currentColor', stroke: 'none' }],
    ['circle', { cx: 16, cy: 12, r: 1.7, fill: 'currentColor', stroke: 'none' }],
    ['circle', { cx: 16, cy: 18, r: 1.7, fill: 'currentColor', stroke: 'none' }],
  ],
  desfazer: [
    ['path', { d: 'M9 6.5l-5 5 5 5' }],
    ['path', { d: 'M4 11.5h10a4.5 4.5 0 0 1 0 9h-3' }],
  ],
  ajustes: [
    ['path', { d: 'M4 7h8M18 7h2M4 17h2M12 17h8' }],
    ['circle', { cx: 15, cy: 7, r: 2.5 }],
    ['circle', { cx: 9, cy: 17, r: 2.5 }],
  ],
  painel: [
    ['rect', { x: 4, y: 4, width: 7, height: 7, rx: 2 }],
    ['rect', { x: 13, y: 4, width: 7, height: 7, rx: 2 }],
    ['rect', { x: 4, y: 13, width: 7, height: 7, rx: 2 }],
    ['rect', { x: 13, y: 13, width: 7, height: 7, rx: 2 }],
  ],
  rotinas: [
    ['circle', { cx: 12, cy: 12, r: 8.5 }],
    ['path', { d: 'M12 7.5V12l3 2' }],
  ],
  habitos: [
    ['circle', { cx: 12, cy: 12, r: 8.5 }],
    ['path', { d: 'M8.3 12.3l2.5 2.5 4.9-5.3' }],
  ],
  tarefas: [
    [
      'path',
      {
        d: 'M3.5 6.5L5 8l2.5-3M3.5 12.5L5 14l2.5-3M3.5 18.5L5 20l2.5-3M11 6.5h9.5M11 12.5h9.5M11 18.5h9.5',
      },
    ],
  ],
};

export function icone(nome, { cheio = false, tam = 24 } = {}) {
  const formas = ICONES[nome];
  if (!formas) throw new Error(`Ícone desconhecido: ${nome}`);
  return h(
    'span',
    { class: `icone${cheio ? ' cheio' : ''}` },
    svg(
      'svg',
      {
        viewBox: '0 0 24 24',
        width: tam,
        height: tam,
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 2,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'aria-hidden': 'true',
      },
      ...formas.map(([tag, atributos]) => svg(tag, atributos)),
    ),
  );
}

// --------------------------------------------------------------- folhas

// Botão voltar. Enquanto houver folha aberta, o app mantém UMA entrada de guarda
// no histórico do navegador. O voltar (gesto ou botão do Android, ou o do
// navegador) consome essa entrada e fecha a folha de cima em vez de sair do app.
//
// A guarda entra na hora em que a primeira folha abre. A retirada é adiada: fechar
// uma folha só marca que é preciso conferir, e a conferência roda depois, uma vez,
// comparando o que deveria existir com o que existe. Assim "fechar uma folha e
// abrir outra em seguida" não gera um vai e volta no histórico, e uma volta
// pedida pelo app nunca corre junto com uma entrada nova.
const folhasAbertas = []; // pilha: a última é a folha de cima
let guardaNoHistorico = false; // a entrada de guarda existe
let voltaEmAndamento = false; // o app pediu history.back() e o popstate ainda não chegou
let acertoAgendado = false;

function acertarHistorico() {
  acertoAgendado = false;
  if (voltaEmAndamento) return; // o popstate dessa volta chama de novo
  const precisaDeGuarda = folhasAbertas.length > 0;
  if (precisaDeGuarda && !guardaNoHistorico) {
    window.history.pushState({ folha: true }, '');
    guardaNoHistorico = true;
  } else if (!precisaDeGuarda && guardaNoHistorico) {
    guardaNoHistorico = false;
    voltaEmAndamento = true;
    window.history.back();
  }
}

function agendarAcerto() {
  if (acertoAgendado) return;
  acertoAgendado = true;
  setTimeout(acertarHistorico, 0);
}

window.addEventListener('popstate', () => {
  if (voltaEmAndamento) {
    // Volta pedida pelo app para retirar a guarda: nada a fechar.
    voltaEmAndamento = false;
    acertarHistorico();
    return;
  }
  // Voltar da pessoa: a guarda foi consumida. Fecha a folha de cima, ou deixa
  // que ela pergunte antes. Se sobrar folha aberta, o acerto repõe a guarda.
  guardaNoHistorico = false;
  const topo = folhasAbertas.at(-1);
  if (topo?.aoTentarFechar) topo.aoTentarFechar();
  else topo?.fechar();
  agendarAcerto();
});

// Guarda do voltar para um modo da tela que não é folha (a edição da rotina): enquanto ele está
// aberto, o voltar chama aoVoltar em vez de sair do app. Usa a mesma pilha das folhas, então uma
// folha aberta por cima fecha primeiro. Devolve a função que tira a guarda; aoVoltar tem que
// chamá-la (é ele quem fecha o modo).
export function guardarVoltar(aoVoltar) {
  const registro = { fechar: aoVoltar };
  folhasAbertas.push(registro);
  acertarHistorico();
  return () => {
    const posicao = folhasAbertas.indexOf(registro);
    if (posicao < 0) return;
    folhasAbertas.splice(posicao, 1);
    agendarAcerto();
  };
}

// Tempo e curva da mola de folha, lidos do CSS (variáveis --mola-folha*), com reserva.
function molaDaFolha() {
  const css = getComputedStyle(document.documentElement);
  const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ms = Number.parseFloat(css.getPropertyValue('--mola-folha-ms'));
  const curva = css.getPropertyValue('--mola-folha').replace(/\s+/g, ' ').trim();
  return {
    duration: reduzir ? 0 : Number.isFinite(ms) ? ms : 485,
    easing: curva || 'cubic-bezier(0.2, 0, 0, 1)',
  };
}

// Com aoTerminar (fechar), a folha fica onde a animação terminou até sair da tela.
function deslizar(dialogo, de, para, aoTerminar) {
  const animacao = dialogo.animate(
    [{ transform: `translateY(${de}px)` }, { transform: `translateY(${para}px)` }],
    { ...molaDaFolha(), fill: aoTerminar ? 'forwards' : 'none' },
  );
  if (aoTerminar) animacao.onfinish = aoTerminar;
}

const ARRASTE_MINIMO = 6; // px até o toque no topo virar arraste (antes disso é toque normal)

// Arrastar a folha pelo topo, como no iPhone. Para baixo fecha (ou pergunta antes, com
// aoTentarFechar). Com alturas, a folha abre na metade da tela, sobe para a altura cheia
// ao arrastar para cima ou ao focar um campo, e desce para a metade antes de fechar.
// Só transform anima; a troca de altura muda o layout de uma vez e a diferença é animada.
function tornarArrastavel(dialogo, topo, { alturas, fechar, tentarFechar }) {
  let inicio = null; // { y, id }
  let arrastando = false;
  let deslocamento = 0;
  let amostras = []; // [tempo, y] dos últimos movimentos, para a velocidade ao soltar

  const cheia = () => !dialogo.classList.contains('metade');

  const trocarAltura = (paraCheia) => {
    const antes = dialogo.getBoundingClientRect().top;
    dialogo.style.transform = '';
    dialogo.classList.toggle('metade', !paraCheia);
    const depois = dialogo.getBoundingClientRect().top;
    deslizar(dialogo, antes - depois, 0);
  };

  const soltar = () => {
    dialogo.classList.remove('arrastando');
    const altura = dialogo.offsetHeight;
    const [t0, y0] = amostras[0] ?? [0, 0];
    const [t1, y1] = amostras.at(-1) ?? [0, 0];
    const velocidade = t1 > t0 ? (y1 - y0) / (t1 - t0) : 0; // px/ms, positivo para baixo
    const desceu = velocidade > 0.6 || deslocamento > altura * 0.3;
    const subiu = velocidade < -0.4 || deslocamento < -40;
    // trocarAltura mede a folha ainda deslocada pelo dedo e anima dali.
    if (alturas && !cheia() && subiu) {
      trocarAltura(true);
    } else if (alturas && cheia() && desceu && deslocamento < altura * 0.6 && velocidade < 1.5) {
      trocarAltura(false);
    } else {
      dialogo.style.transform = '';
      if (desceu && !tentarFechar) {
        deslizar(dialogo, deslocamento, altura, fechar);
      } else {
        deslizar(dialogo, deslocamento, 0);
        if (desceu) tentarFechar();
      }
    }
  };

  // O movimento é ouvido na janela a partir do toque no topo: o dedo pode sair do topo
  // sem perder o arraste, e sem captura um toque parado num botão do topo continua clique.
  const mover = (e) => {
    if (!inicio || e.pointerId !== inicio.id) return;
    const dy = e.clientY - inicio.y;
    if (!arrastando) {
      if (Math.abs(dy) < ARRASTE_MINIMO) return;
      arrastando = true;
      // A folha pode ainda estar subindo: a animação de abrir venceria o transform do dedo.
      for (const animacao of dialogo.getAnimations()) animacao.finish();
      dialogo.classList.add('arrastando');
    }
    // Para cima a folha resiste: cresce até a cheia (com alturas) ou quase não sai do lugar.
    const resistencia = alturas && !cheia() ? 0.5 : 0.15;
    deslocamento = dy >= 0 ? dy : Math.max(dy * resistencia, -60);
    dialogo.style.transform = `translateY(${deslocamento}px)`;
    amostras.push([e.timeStamp, e.clientY]);
    amostras = amostras.filter(([t]) => e.timeStamp - t <= 80);
  };
  // Depois de um arraste, o clique que o navegador gera ao soltar não aciona nada.
  const engolirClique = (e) => {
    e.stopPropagation();
    e.preventDefault();
  };
  const terminar = (e) => {
    if (!inicio || e.pointerId !== inicio.id) return;
    inicio = null;
    window.removeEventListener('pointermove', mover);
    window.removeEventListener('pointerup', terminar);
    window.removeEventListener('pointercancel', terminar);
    if (!arrastando) return;
    window.addEventListener('click', engolirClique, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', engolirClique, { capture: true }), 0);
    soltar();
  };
  topo.addEventListener('pointerdown', (e) => {
    inicio = { y: e.clientY, id: e.pointerId };
    arrastando = false;
    deslocamento = 0;
    amostras = [[e.timeStamp, e.clientY]];
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', terminar);
    window.addEventListener('pointercancel', terminar);
  });

  if (alturas) {
    dialogo.classList.add('com-alturas', 'metade');
    const abertaEm = performance.now();
    dialogo.addEventListener('focusin', (e) => {
      if (cheia() || !e.target.matches('input, textarea, select')) return;
      // Foco logo ao abrir (tarefa nova): já abre cheia, sem passar pela metade.
      if (performance.now() - abertaEm < 100) dialogo.classList.remove('metade');
      else trocarAltura(true);
    });
  }
}

// Folha que sobe do rodapé (bottom sheet). Devolve a função que a fecha.
// aoTentarFechar: chamado no Esc ou no botão voltar, no lugar de fechar direto.
// Serve para a folha perguntar antes de descartar o que foi digitado.
// cabecalho: elemento no lugar do título (por exemplo, a barra com Cancelar e Salvar).
// alturas: a folha abre na metade da tela e sobe para a altura cheia (o corpo rola dentro).
export function abrirFolha({
  titulo,
  cabecalho,
  corpo,
  alturas = false,
  fecharNoFundo = true,
  aoFechar,
  aoTentarFechar,
}) {
  const topo = h(
    'div',
    { class: 'folha-topo' },
    h('div', { class: 'folha-pega' }),
    cabecalho ?? (titulo ? h('h2', { class: 'folha-titulo' }, titulo) : null),
  );
  const dialogo = h(
    'dialog',
    { class: 'folha' },
    h('div', { class: 'folha-dentro' }, topo, alturas ? h('div', { class: 'folha-corpo' }, corpo) : corpo),
  );
  document.body.append(dialogo);

  // A limpeza roda na hora em que fechar() é chamado. O evento "close" do
  // navegador só é entregue no próximo quadro desenhado (e não chega com a
  // página em segundo plano), então fica apenas como rede de segurança.
  const registro = { aoTentarFechar, fechar: null };
  let finalizado = false;
  const finalizar = () => {
    if (finalizado) return;
    finalizado = true;
    const posicao = folhasAbertas.indexOf(registro);
    if (posicao >= 0) folhasAbertas.splice(posicao, 1);
    agendarAcerto();
    dialogo.remove();
    aoFechar?.();
  };
  const fechar = () => {
    if (dialogo.open) dialogo.close();
    finalizar();
  };
  registro.fechar = fechar;
  dialogo.addEventListener('close', finalizar);

  folhasAbertas.push(registro);
  // Ao abrir, a guarda entra na hora (se não houver volta em andamento), para o
  // voltar já encontrar a entrada. Só a retirada da guarda é adiada.
  acertarHistorico();

  // Tecla Esc: fechamos nós mesmos, na hora.
  dialogo.addEventListener('cancel', (e) => {
    if (e.target !== dialogo) return;
    e.preventDefault();
    if (aoTentarFechar) aoTentarFechar();
    else fechar();
  });

  if (fecharNoFundo) {
    // Fecha só se o toque começou e terminou no fundo escuro. Sem isso, soltar
    // uma seleção de texto fora da folha fecharia e perderia o que foi digitado.
    let comecouNoFundo = false;
    dialogo.addEventListener('pointerdown', (e) => {
      comecouNoFundo = e.target === dialogo;
    });
    dialogo.addEventListener('click', (e) => {
      if (comecouNoFundo && e.target === dialogo) fechar();
    });
  }

  tornarArrastavel(dialogo, topo, { alturas, fechar, tentarFechar: aoTentarFechar });

  dialogo.showModal();
  return fechar;
}

// Janela pequena presa a um elemento da tela (como o popup da marca no Loop), em vez da folha
// que sobe do rodapé. Usa a mesma guarda do botão voltar das folhas. rotulo: nome para o
// leitor de tela. aoTocarFora: chamado quando o toque começa e termina fora da janela
// (sem ele, fecha). Devolve a função que fecha.
export function abrirJanela({ rotulo, ancora, corpo, aoTocarFora }) {
  const fechar = abrirFolha({ corpo, fecharNoFundo: false });
  const dialogo = corpo.closest('dialog');
  dialogo.classList.add('janela');
  dialogo.setAttribute('aria-label', rotulo);
  // A janela não tem puxador nem título: some com o topo da folha.
  dialogo.querySelector('.folha-topo')?.remove();
  dialogo.querySelector('.folha-pega')?.remove();

  let comecouFora = false;
  dialogo.addEventListener('pointerdown', (e) => {
    comecouFora = e.target === dialogo;
  });
  dialogo.addEventListener('click', (e) => {
    if (!comecouFora || e.target !== dialogo) return;
    if (aoTocarFora) aoTocarFora();
    else fechar();
  });

  posicionarJanela(dialogo, ancora);
  return fechar;
}

// Abaixo do elemento quando cabe; senão, acima. Centrada nele, sem sair da margem de 16 px.
// A animação de abrir cresce a partir do elemento.
function posicionarJanela(dialogo, ancora) {
  const margem = 16;
  const alvo = ancora.getBoundingClientRect();
  const largura = dialogo.offsetWidth;
  const altura = dialogo.offsetHeight;
  const centro = alvo.left + alvo.width / 2;
  const esquerda = Math.min(Math.max(centro - largura / 2, margem), window.innerWidth - largura - margem);
  const abaixo = alvo.bottom + 8;
  const embaixo = abaixo + altura <= window.innerHeight - margem;
  const topo = embaixo ? abaixo : Math.max(margem, alvo.top - 8 - altura);
  dialogo.style.setProperty('left', `${esquerda}px`);
  dialogo.style.setProperty('top', `${topo}px`);
  dialogo.style.setProperty('transform-origin', `${centro - esquerda}px ${embaixo ? 0 : altura}px`);
}

// Cada opção: { rotulo, acao, perigo, desativado } e, para as que ficam marcadas:
//   marcado (verdadeiro ou falso): liga e desliga, como um interruptor;
//   atual (verdadeiro ou falso): a escolhida entre várias.
export function abrirMenu(titulo, opcoes) {
  const fechar = abrirFolha({
    titulo,
    corpo: h(
      'div',
      { class: 'menu' },
      opcoes.map((o) =>
        h(
          'button',
          {
            type: 'button',
            class: `menu-item${o.perigo ? ' perigo' : ''}`,
            role: o.marcado == null ? null : 'switch',
            'aria-checked': o.marcado == null ? null : String(o.marcado),
            'aria-current': o.atual ? 'true' : null,
            disabled: Boolean(o.desativado),
            onclick: () => {
              fechar();
              o.acao();
            },
          },
          h('span', {}, o.rotulo),
          o.marcado || o.atual ? icone('check', { tam: 20 }) : null,
        ),
      ),
    ),
  });
}

export function confirmar(mensagem, rotuloSim = 'Excluir') {
  return new Promise((resolver) => {
    let resposta = false;
    const fechar = abrirFolha({
      titulo: mensagem,
      corpo: h(
        'div',
        { class: 'linha-botoes' },
        h('button', { type: 'button', class: 'botao', onclick: () => fechar() }, 'Cancelar'),
        h(
          'button',
          {
            type: 'button',
            class: 'botao perigo',
            onclick: () => {
              resposta = true;
              fechar();
            },
          },
          rotuloSim,
        ),
      ),
      aoFechar: () => resolver(resposta),
    });
  });
}

// ------------------------------------------------------------- diversos

export function campo(rotulo, entrada) {
  return h('label', { class: 'rotulo' }, rotulo, entrada);
}

// Linha de um grupo de campos, como nos Ajustes do iPhone: rótulo à esquerda, valor à direita.
export function linhaCampo(rotulo, entrada) {
  return h('label', { class: 'linha-campo' }, h('span', null, rotulo), entrada);
}

// compacto: quando há mais conteúdo logo abaixo (a seção de concluídas), a mensagem
// ocupa só o espaço dela em vez de ficar no meio da tela.
export function estadoVazio(titulo, dica, { compacto = false } = {}) {
  return h(
    'div',
    { class: `sem-conteudo${compacto ? ' compacto' : ''}` },
    h('p', { class: 'sem-conteudo-titulo' }, titulo),
    h('p', {}, dica),
  );
}

// Aviso curto perto do rodapé, que some sozinho. Com "acao" ({ rotulo, executar }) ganha um
// botão, como o "Desfazer" depois de uma exclusão: tocar executa e fecha o aviso.
// Um aviso novo substitui o anterior, e com ele vai embora a ação que o anterior oferecia.
const AVISO_MS = 4000;

// Aviso com "Desfazer" depois de concluir ou excluir. desfazer põe tudo como estava
// (e grava); o aviso some sozinho e a ação fica.
export const DESFAZER_MS = 5000;

export function avisarComDesfazer(texto, desfazer) {
  avisar(texto, { duracao: DESFAZER_MS, acao: { rotulo: 'Desfazer', executar: desfazer } });
}

export function avisar(texto, { acao = null, duracao = AVISO_MS } = {}) {
  for (const anterior of document.querySelectorAll('.aviso')) anterior.remove();
  const el = h('div', { class: `aviso${acao ? ' com-acao' : ''}`, role: 'status' }, texto);
  if (acao) {
    el.append(
      h(
        'button',
        {
          type: 'button',
          class: 'aviso-acao',
          onclick: () => {
            el.remove();
            acao.executar();
          },
        },
        acao.rotulo,
      ),
    );
  }
  document.body.append(el);
  setTimeout(() => el.remove(), duracao);
}

// Segurar o dedo (ou o botão do mouse) sobre o elemento chama "acao", e o clique que
// viria ao soltar não acontece. Rolar a tela ou tirar o dedo antes do tempo cancela.
// O menu do sistema (long press no Android, botão direito no computador) também chama.
const TEMPO_DE_SEGURAR_MS = 550;

export function aoSegurar(elemento, acao) {
  let espera = null;
  let disparou = false;
  const cancelar = () => clearTimeout(espera);
  const disparar = () => {
    if (disparou) return;
    disparou = true;
    cancelar();
    vibrar('segurar');
    acao();
  };
  elemento.addEventListener('pointerdown', () => {
    disparou = false;
    cancelar();
    espera = setTimeout(disparar, TEMPO_DE_SEGURAR_MS);
  });
  for (const tipo of ['pointerup', 'pointerleave', 'pointercancel'])
    elemento.addEventListener(tipo, cancelar);
  elemento.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    disparar();
  });
  // Depois de segurar, o clique ao soltar não vale (fase de captura: roda antes do onclick).
  elemento.addEventListener(
    'click',
    (e) => {
      if (!disparou) return;
      disparou = false;
      e.stopImmediatePropagation();
    },
    { capture: true },
  );
}

// Segurar e arrastar para mudar a ordem, como no Google Keep. Segurar a "pega" de uma linha pelo
// mesmo tempo do aoSegurar, sem mexer o dedo, levanta a linha: ela fica presa embaixo do dedo,
// as outras deslizam para abrir o lugar, a tela para de rolar e a lista rola sozinha perto da
// borda. Ao soltar, a linha assenta no lugar e aoSoltar(ids, id) recebe os ids (data-<chave>)
// das linhas à vista na ordem nova e o id da que andou, só se a ordem mudou. Mexer o dedo antes
// do tempo é rolagem, e o toque segue normal. O clique que viria ao soltar não acontece.
// "elemento" é fixo (o #conteudo): ligar uma vez só por tela, com seletores que só ela usa.
// Opções:
//   imediato  levanta no primeiro toque, sem esperar (a alça da edição da rotina).
//   chave     nome do data-* com o id (padrão "id").
//   junto     (linha) => elementos que vão com ela (a seção leva o bloco): somem durante o
//             arraste e não entram nos ids.
//   alvos     (linha) => seletor das linhas que podem ficar logo abaixo dela (a seção só passa
//             para antes de outra seção); sem ele, qualquer linha.
//   fim       () => elemento antes do qual a linha fica quando vai para o fim da lista.
const FOLGA_DO_DEDO = 10; // px que o dedo pode tremer enquanto segura
const BORDA_QUE_ROLA = 56; // px perto da borda da área rolável em que a lista rola sozinha
const ASSENTAR_MS = 160; // a linha solta desliza do dedo para o lugar dela
const ABRIR_LUGAR_MS = 180; // as outras linhas deslizam para abrir o lugar
let fimDoUltimoArraste = -Infinity;
let emArraste = false; // do levantar até a linha assentar

// O deslize entre abas (app.js) ignora o dedo que está arrastando ou acabou de arrastar uma linha.
export const arrastouAgora = () => emArraste || performance.now() - fimDoUltimoArraste < 400;

const semMovimento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const CURVA_DO_ARRASTE = 'cubic-bezier(0.2, 0, 0, 1)';

export function rolarSePerto(area, y) {
  const caixa = area.getBoundingClientRect();
  if (y < caixa.top + BORDA_QUE_ROLA) area.scrollTop -= 12;
  else if (y > caixa.bottom - BORDA_QUE_ROLA) area.scrollTop += 12;
}

// Deslocamento vertical que a animação está aplicando agora: a posição de verdade da linha, para
// decidir o lugar, é a da tela menos esse deslocamento.
function deslocamentoAnimado(el) {
  const transform = getComputedStyle(el).transform;
  return transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42;
}

// Muda a tela com "mudar" e faz as linhas que mudaram de altura deslizarem do lugar antigo para o
// novo, em vez de pular (a técnica FLIP: mede, muda, inverte e anima até zero).
const animacoesDeLugar = new WeakMap();
function deslizarLinhas(linhas, mudar) {
  const antes = new Map(linhas.map((el) => [el, el.getBoundingClientRect().top]));
  mudar();
  if (semMovimento()) return;
  for (const el of linhas) {
    animacoesDeLugar.get(el)?.cancel();
    const de = antes.get(el) - el.getBoundingClientRect().top;
    if (Math.abs(de) < 1) continue;
    animacoesDeLugar.set(
      el,
      el.animate([{ transform: `translateY(${de}px)` }, { transform: 'none' }], {
        duration: ABRIR_LUGAR_MS,
        easing: CURVA_DO_ARRASTE,
      }),
    );
  }
}

export function reordenavel(
  elemento,
  { linhas, pega, aoSoltar, imediato = false, chave = 'id', junto, alvos, fim },
) {
  let espera = null;
  let inicio = null;
  let arrastando = null;
  let engolirClique = false;
  const cancelar = () => {
    clearTimeout(espera);
    espera = null;
  };
  const aVista = () => [...elemento.querySelectorAll(linhas)].filter((el) => !el.hidden);
  const ids = () => aVista().map((el) => el.dataset[chave]);

  const arrastar = (linha) => {
    espera = null;
    arrastando = linha;
    engolirClique = true;
    emArraste = true;
    const juntas = junto?.(linha) ?? [];
    const seletorDosAlvos = alvos?.(linha);
    const lugar = { pai: linha.parentNode, proxima: linha.nextSibling };
    animacoesDeLugar.get(linha)?.cancel(); // a linha pode estar deslizando de um arraste anterior
    // Tudo o que pode mudar de altura: as linhas e o que mora entre elas (botões, títulos).
    const vizinhas = () =>
      [...new Set(aVista().map((el) => el.parentElement))]
        .flatMap((pai) => [...pai.children])
        .filter((el) => el !== linha && !el.hidden && !juntas.includes(el));
    deslizarLinhas(vizinhas(), () => {
      for (const el of juntas) el.hidden = true;
    });
    const antes = ids().join('\n');
    let dedoY = inicio.y;
    let deslocamento = 0; // translateY da linha levantada
    const pegaY = inicio.y - linha.getBoundingClientRect().top; // onde o dedo pegou a linha
    let quadro = null;
    linha.classList.add('arrastando');
    vibrar('arrastar');

    // A linha fica presa embaixo do dedo, onde quer que o lugar dela esteja na lista.
    const seguirDedo = () => {
      const naLista = linha.getBoundingClientRect().top - deslocamento;
      deslocamento = dedoY - pegaY - naLista;
      linha.style.transform = `translateY(${deslocamento}px)`;
    };

    // O lugar é antes da primeira linha (entre os alvos) cujo meio está abaixo do dedo; sem
    // nenhuma, o fim da lista.
    const posicionar = () => {
      const outras = aVista().filter((el) => el !== linha);
      const candidatas = seletorDosAlvos ? outras.filter((el) => el.matches(seletorDosAlvos)) : outras;
      const alvo = candidatas.find((el) => {
        const topo = el.getBoundingClientRect().top - deslocamentoAnimado(el);
        return topo + el.offsetHeight / 2 > dedoY;
      });
      const ultima = outras.at(-1);
      const depoisDe = fim?.() ?? null;
      let mudar = null;
      if (alvo) {
        if (linha.nextElementSibling !== alvo) mudar = () => alvo.before(linha);
      } else if (depoisDe) {
        if (linha.nextElementSibling !== depoisDe) mudar = () => depoisDe.before(linha);
      } else if (ultima && ultima.nextElementSibling !== linha) {
        mudar = () => ultima.after(linha);
      }
      if (mudar) deslizarLinhas(vizinhas(), mudar);
      seguirDedo();
    };
    const mover = (e) => {
      dedoY = e.clientY;
      posicionar();
    };
    // Com o dedo parado perto da borda, a lista continua rolando, e a linha acompanha.
    const rolar = () => {
      const topo = elemento.scrollTop;
      rolarSePerto(elemento, dedoY);
      if (elemento.scrollTop !== topo) posicionar();
      quadro = requestAnimationFrame(rolar);
    };
    quadro = requestAnimationFrame(rolar);

    const terminar = (e) => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', terminar);
      window.removeEventListener('pointercancel', terminar);
      cancelAnimationFrame(quadro);
      const concluir = () => {
        linha.classList.remove('arrastando');
        for (const el of juntas) el.hidden = false;
        arrastando = null;
        emArraste = false;
        fimDoUltimoArraste = performance.now();
      };
      const solta = deslocamento;
      linha.style.transform = '';
      // O sistema tomou o gesto (pointercancel): a linha volta para onde estava e nada grava.
      if (e.type === 'pointercancel') {
        lugar.pai.insertBefore(linha, lugar.proxima);
        concluir();
        return;
      }
      const depois = ids();
      const id = linha.dataset[chave];
      const gravar = () => {
        concluir();
        if (depois.join('\n') !== antes) aoSoltar(depois, id);
      };
      if (semMovimento() || Math.abs(solta) < 1) {
        gravar();
        return;
      }
      // A linha desliza do dedo para o lugar; a gravação (que redesenha a tela) vem depois.
      linha.animate([{ transform: `translateY(${solta}px)` }, { transform: 'none' }], {
        duration: ASSENTAR_MS,
        easing: CURVA_DO_ARRASTE,
      });
      setTimeout(gravar, ASSENTAR_MS);
    };

    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', terminar);
    window.addEventListener('pointercancel', terminar);
    posicionar();
  };

  elemento.addEventListener('pointerdown', (e) => {
    if (arrastando) return; // a linha anterior ainda está assentando
    engolirClique = false;
    cancelar();
    const linha = e.button > 0 ? null : e.target.closest(pega)?.closest(linhas);
    if (!linha || !elemento.contains(linha)) return;
    inicio = { x: e.clientX, y: e.clientY };
    if (imediato) {
      e.preventDefault(); // a alça não seleciona texto nem tira o foco do campo
      arrastar(linha);
      return;
    }
    espera = setTimeout(() => arrastar(linha), TEMPO_DE_SEGURAR_MS);
  });
  elemento.addEventListener('pointermove', (e) => {
    if (espera && Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > FOLGA_DO_DEDO) cancelar();
  });
  for (const tipo of ['pointerup', 'pointercancel']) elemento.addEventListener(tipo, cancelar);
  // Com a linha no dedo, a tela não rola (o primeiro toque que se mexe ainda pode ser barrado).
  elemento.addEventListener(
    'touchmove',
    (e) => {
      if (arrastando && e.cancelable) e.preventDefault();
    },
    { passive: false },
  );
  // Segurar no Android abre o menu do sistema (ou seleciona texto); na pega, não.
  elemento.addEventListener('contextmenu', (e) => {
    if (e.target.closest(pega)) e.preventDefault();
  });
  // O clique que o navegador manda logo depois de soltar não abre a tarefa nem o hábito. Só
  // esse: um toque novo (ou o teclado, passado o instante) volta a abrir.
  elemento.addEventListener(
    'click',
    (e) => {
      if (!engolirClique || !arrastouAgora()) return;
      engolirClique = false;
      e.stopImmediatePropagation();
    },
    { capture: true },
  );
}

// Resposta tátil. No app Android vai pelo plugin local Haptica (HapticaPlugin.java), que usa os
// efeitos do próprio sistema e segue a opção de vibração ao toque do aparelho. No navegador,
// navigator.vibrate faz um toque curto. Tipos: marcar, desmarcar, concluido, segurar, arrastar.
// Chamadas a menos de 80 ms da anterior são ignoradas: vibração em rajada vira zumbido.
const VIBRACAO = { marcar: 8, desmarcar: 6, concluido: [12, 70, 22], segurar: 12, arrastar: 10 };
const INTERVALO_MINIMO_MS = 80;
let ultimaVibracao = -Infinity;

export function vibrar(tipo) {
  const agora = performance.now();
  if (agora - ultimaVibracao < INTERVALO_MINIMO_MS) return;
  ultimaVibracao = agora;
  const sistema = window.Capacitor?.Plugins?.Haptica;
  try {
    if (sistema) sistema.tocar({ tipo })?.catch?.(() => {});
    else navigator.vibrate?.(VIBRACAO[tipo]);
  } catch {
    /* sem vibração neste aparelho */
  }
}
