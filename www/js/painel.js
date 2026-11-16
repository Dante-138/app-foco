// Aba Painel: o dia numa tela só, com pouco texto. Rotina aberta (anel, o item do horário
// atual e os próximos), hábitos, sequências em risco e tarefas de hoje. Marca item da rotina,
// hábito e tarefa ali mesmo; o resto leva para a aba de cada coisa. Não guarda nada próprio:
// lê os mesmos dados das abas.

import { estado, marcasDeHoje } from './store.js';
import { agoraLocal, hoje } from './nucleo/datas.js';
import { resumoDoDia } from './nucleo/painel.js';
import { rotuloData } from './nucleo/prazos.js';
import { emQuanto } from './nucleo/rotina-horario.js';
import { h, svg, icone, estadoVazio } from './ui.js';
import { rotinas, alternarItemDaRotina } from './rotinas.js';
import { marcarHabitoHoje } from './habitos.js';
import { tarefas, concluirTarefa } from './tarefas.js';

const fmtDia = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

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
      h(
        'p',
        { class: 'painel-rotina' },
        rotina.nome,
        h(
          'small',
          {},
          [
            `${resumo.feitos} de ${resumo.total}`,
            resumo.atrasados
              ? `${resumo.atrasados} ${resumo.atrasados === 1 ? 'atrasado' : 'atrasados'}`
              : null,
          ]
            .filter(Boolean)
            .join(' · '),
        ),
      ),
    ),
    resumo.proximos.length
      ? h(
          'ul',
          {},
          resumo.proximos.map((item) =>
            h(
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
                // Onde o relógio está: o item do horário atual e quanto falta para o próximo.
                item.id === resumo.agora ? h('small', { class: 'etiqueta' }, 'agora') : null,
                item.id === resumo.depois?.id
                  ? h('small', { class: 'painel-falta' }, emQuanto(resumo.depois.faltam))
                  : null,
              ),
            ),
          ),
        )
      : h('p', { class: 'painel-pronto' }, 'Rotina concluída hoje.'),
    h(
      'button',
      { type: 'button', class: 'botao painel-ver', onclick: () => irPara('rotinas') },
      'Ver rotina completa',
    ),
  );
}

// Hábitos que vêm de dias seguidos e ainda estão em branco hoje: se o dia acabar assim, a
// sequência zera. O círculo marca o hábito ali mesmo (no numérico, abre a quantidade).
function blocoDasSequencias(resumo) {
  if (!resumo.total) return null;
  return h(
    'section',
    { class: 'cartao painel-bloco' },
    h('h3', { class: 'grupo-titulo' }, 'Sequências em risco'),
    h(
      'ul',
      {},
      resumo.primeiras.map(({ habito, dias }) =>
        h(
          'li',
          { class: 'tarefa' },
          h(
            'button',
            {
              type: 'button',
              class: 'tarefa-check',
              role: 'checkbox',
              'aria-checked': 'false',
              'aria-label': `Marcar hoje: ${habito.nome}`,
              onclick: () => marcarHabitoHoje(habito),
            },
            h('span', { class: 'circulo' }),
          ),
          h(
            'button',
            { type: 'button', class: 'tarefa-corpo', onclick: () => irPara('habitos') },
            h('span', { class: 'tarefa-titulo' }, habito.nome),
            h('span', { class: 'tarefa-sub' }, `${dias} dias seguidos`),
          ),
        ),
      ),
    ),
    resumo.total > resumo.primeiras.length
      ? h(
          'button',
          { type: 'button', class: 'botao painel-ver', onclick: () => irPara('habitos') },
          `Ver todas (${resumo.total})`,
        )
      : null,
  );
}

// Os três eixos do dia, cada um com a contagem e uma barra: Disciplina (hábitos), Execução
// (rotina) e Entrega (tarefas com prazo até hoje). Eixo sem nada pedido hoje fica com a barra vazia.
function blocoDosEixos(eixos) {
  return h(
    'section',
    { class: 'cartao painel-bloco painel-eixos' },
    eixos.map(({ nome, feitos, total }) => {
      const valor = total ? `${feitos} de ${total}` : 'nada para hoje';
      return h(
        'div',
        { class: 'painel-eixo', role: 'img', 'aria-label': `${nome}: ${valor}` },
        h('span', { class: 'painel-eixo-nome' }, nome),
        h('span', { class: 'painel-eixo-valor' }, valor),
        h(
          'div',
          { class: 'progresso' },
          h('div', {
            class: 'progresso-barra',
            style: { transform: `scaleX(${total ? feitos / total : 0})` },
          }),
        ),
      );
    }),
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

  // Os blocos de sequências e de tarefas devolvem null quando não há o que mostrar, e o
  // replaceChildren do navegador escreveria a palavra "null" na tela: só entra o que é elemento.
  const blocos = [
    h('p', { class: 'painel-data' }, fmtDia.format(new Date())),
    blocoDaRotina(rotina, resumo.rotina),
    blocoDosEixos(resumo.eixos),
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
    blocoDasSequencias(resumo.emRisco),
    blocoDasTarefas(deHoje, dia),
  ];
  raiz.replaceChildren(...blocos.filter(Boolean));
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
