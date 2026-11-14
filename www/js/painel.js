// Aba Painel: o dia numa tela só, com pouco texto. Rotina aberta (anel e próximos itens),
// hábitos e tarefas de hoje. Marca item da rotina e conclui tarefa ali mesmo; o resto
// leva para a aba de cada coisa. Não guarda nada próprio: lê os mesmos dados das abas.

import { estado, marcasDeHoje } from './store.js';
import { agoraLocal, hoje } from './nucleo/datas.js';
import { COR_PADRAO, corValida } from './nucleo/paleta.js';
import { PROXIMOS_DA_ROTINA, resumoDoDia } from './nucleo/painel.js';
import { rotuloData } from './nucleo/prazos.js';
import { h, svg, icone, estadoVazio } from './ui.js';
import { rotinas, alternarItemDaRotina } from './rotinas.js';
import { tarefas, concluirTarefa } from './tarefas.js';

const fmtDia = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

const corCss = (chave) => `var(--cor-${corValida(chave) ? chave : COR_PADRAO})`;

const irPara = (aba) => document.dispatchEvent(new CustomEvent('foco:ir-para-aba', { detail: aba }));

function anel(fracao, porcento) {
  const raio = 52;
  const volta = 2 * Math.PI * raio;
  const circulo = { cx: 60, cy: 60, r: raio, fill: 'none', stroke: 'currentColor', 'stroke-width': 10 };
  return h(
    'div',
    { class: 'painel-anel', role: 'img', 'aria-label': `${porcento}% da rotina feita` },
    svg(
      'svg',
      { viewBox: '0 0 120 120', width: 136, height: 136, 'aria-hidden': 'true' },
      svg('circle', { ...circulo, 'stroke-opacity': 0.16 }),
      svg('circle', {
        ...circulo,
        'stroke-linecap': 'round',
        'stroke-dasharray': `${(fracao * volta).toFixed(2)} ${volta.toFixed(2)}`,
        transform: 'rotate(-90 60 60)',
      }),
    ),
    h('b', {}, `${porcento}%`),
  );
}

function contador(rotulo, valor, aba) {
  return h(
    'button',
    { type: 'button', class: 'painel-contador', onclick: () => irPara(aba) },
    h('span', {}, rotulo),
    h('b', {}, valor),
  );
}

// Linha de item da rotina, que marca ali mesmo. rotulo: "Agora" ou "Depois", quando houver.
function linhaDoItem(rotina, item, rotulo) {
  return h(
    'li',
    {},
    h(
      'button',
      {
        type: 'button',
        class: 'rotina-item',
        role: 'checkbox',
        'aria-checked': 'false',
        onclick: () => alternarItemDaRotina(rotina, item),
      },
      h('span', { class: 'caixa' }, icone('check', { tam: 16 })),
      item.hora ? h('span', { class: 'hora' }, item.hora) : null,
      h('span', { class: 'rotina-texto' }, item.texto),
      rotulo ? h('span', { class: 'painel-rotulo' }, rotulo) : null,
    ),
  );
}

// O item de agora e o de depois (pelo horário) vêm primeiro, com rótulo; os próximos que faltam,
// na ordem da rotina, completam a lista.
function itensDoPainel(rotina, resumo) {
  const marcados = [
    [resumo.agora, 'Agora'],
    [resumo.depois, 'Depois'],
  ].filter(([item]) => item);
  const comRotulo = new Set(marcados.map(([item]) => item.id));
  const resto = resumo.proximos.filter((item) => !comRotulo.has(item.id));
  const linhas = [
    ...marcados.map(([item, rotulo]) => linhaDoItem(rotina, item, rotulo)),
    ...resto
      .slice(0, Math.max(0, PROXIMOS_DA_ROTINA - marcados.length))
      .map((item) => linhaDoItem(rotina, item)),
  ];
  if (!linhas.length) return h('p', { class: 'painel-pronto' }, 'Rotina concluída hoje.');
  return h('ul', {}, linhas);
}

// Sequências que quebram se o dia acabar sem marca. Tocar leva para a aba Hábitos.
function blocoDosRiscos(emRisco) {
  if (!emRisco.length) return null;
  return h(
    'section',
    { class: 'cartao painel-bloco' },
    h('h3', { class: 'grupo-titulo' }, 'Sequências em risco'),
    h(
      'ul',
      {},
      emRisco.map(({ habito, dias }) =>
        h(
          'li',
          {},
          h(
            'button',
            {
              type: 'button',
              class: 'rotina-item painel-risco',
              style: { '--cor': corCss(habito.cor) },
              onclick: () => irPara('habitos'),
            },
            h('span', { class: 'rotina-texto' }, habito.nome),
            h('span', { class: 'painel-dias' }, `${dias} dias`),
          ),
        ),
      ),
    ),
  );
}

function blocoDaRotina(rotina, resumo) {
  if (!rotina) {
    return h(
      'section',
      { class: 'cartao painel-bloco' },
      estadoVazio('Sem rotina', 'Crie uma na aba Rotinas.', { compacto: true }),
    );
  }
  const fracao = resumo.total ? resumo.feitos / resumo.total : 0;
  const porcento = Math.round(fracao * 100);
  return h(
    'section',
    { class: 'cartao painel-bloco' },
    h(
      'div',
      { class: 'painel-topo' },
      anel(fracao, porcento),
      h('p', { class: 'painel-rotina' }, rotina.nome, h('small', {}, `${resumo.feitos} de ${resumo.total}`)),
    ),
    itensDoPainel(rotina, resumo),
    h(
      'button',
      { type: 'button', class: 'botao painel-ver', onclick: () => irPara('rotinas') },
      'Ver rotina completa',
    ),
  );
}

function blocoDasTarefas(resumo, dia) {
  if (!resumo.total) return null;
  return h(
    'section',
    { class: 'cartao painel-bloco' },
    h('h3', { class: 'grupo-titulo' }, 'Tarefas de hoje'),
    h(
      'ul',
      {},
      resumo.primeiras.map((tarefa) => {
        const atrasada = tarefa.prazo < dia;
        const quando = [atrasada ? rotuloData(tarefa.prazo, dia) : null, tarefa.hora]
          .filter(Boolean)
          .join(', ');
        return h(
          'li',
          { class: 'tarefa' },
          h(
            'button',
            {
              type: 'button',
              class: 'tarefa-check',
              role: 'checkbox',
              'aria-checked': 'false',
              'aria-label': `Concluir: ${tarefa.titulo}`,
              onclick: () => concluirTarefa(tarefa),
            },
            h('span', { class: 'circulo' }),
          ),
          h(
            'button',
            { type: 'button', class: 'tarefa-corpo', onclick: () => irPara('tarefas') },
            h('span', { class: 'tarefa-titulo' }, tarefa.titulo),
            quando ? h('span', { class: `tarefa-sub${atrasada ? ' atrasada' : ''}` }, quando) : null,
          ),
        );
      }),
    ),
    resumo.total > resumo.primeiras.length
      ? h(
          'button',
          { type: 'button', class: 'botao painel-ver', onclick: () => irPara('tarefas') },
          `Ver todas (${resumo.total})`,
        )
      : null,
  );
}

function render(raiz) {
  const dia = hoje();
  const rotina = estado.rotinas.find((r) => r.id === estado.rotinaAtiva) ?? estado.rotinas[0] ?? null;
  const resumo = resumoDoDia({
    rotina,
    marcadas: new Set(rotina ? (marcasDeHoje()[rotina.id] ?? []) : []),
    habitos: estado.habitos,
    registros: estado.registros,
    tarefas: estado.tarefas,
    dia,
    hora: agoraLocal().slice(11),
  });
  const { tarefas: deHoje } = resumo;

  raiz.replaceChildren(
    h('p', { class: 'painel-data' }, fmtDia.format(new Date())),
    blocoDaRotina(rotina, resumo.rotina),
    h(
      'div',
      { class: 'painel-contadores' },
      contador('Hábitos', `${resumo.habitos.feitos} de ${resumo.habitos.total}`, 'habitos'),
      contador(
        deHoje.atrasadas
          ? `Tarefas (${deHoje.atrasadas} atrasada${deHoje.atrasadas === 1 ? '' : 's'})`
          : 'Tarefas para hoje',
        String(deHoje.total),
        'tarefas',
      ),
    ),
    blocoDosRiscos(resumo.habitos.emRisco),
    blocoDasTarefas(deHoje, dia),
  );
}

export const painel = {
  id: 'painel',
  titulo: 'Painel',
  rotuloAdicionar: 'Nova tarefa',
  render,
  aoAdicionar: () => tarefas.aoAdicionar(),
  // Desfazer a última marca da rotina, como na aba Rotinas: o painel também marca itens.
  flutuante: () => rotinas.flutuante(),
};
