// Seletor de dias da semana: sete botões (D S T Q Q S S) e atalhos para os conjuntos comuns.
// Usado onde algo vale só em alguns dias (a rotina que abre sozinha, por exemplo).

import { h } from './ui.js';

const DIAS = [
  ['D', 'Domingo'],
  ['S', 'Segunda'],
  ['T', 'Terça'],
  ['Q', 'Quarta'],
  ['Q', 'Quinta'],
  ['S', 'Sexta'],
  ['S', 'Sábado'],
];

export const ATALHOS_DE_DIAS = Object.freeze({
  todos: ['Todos', [0, 1, 2, 3, 4, 5, 6]],
  uteis: ['Seg a sex', [1, 2, 3, 4, 5]],
  fimDeSemana: ['Sáb e dom', [0, 6]],
  nenhum: ['Nenhum', []],
});

// inicial: lista de dias (0 = domingo). atalhos: chaves de ATALHOS_DE_DIAS, na ordem de exibição.
// Devolve { elemento, ler() }; ler() dá os dias escolhidos, em ordem.
export function seletorDeDias(inicial, { rotulo, atalhos }) {
  const escolhidos = new Set(inicial);
  const botoes = h('div', { class: 'segmentos', role: 'group', 'aria-label': rotulo });

  const desenhar = () => {
    botoes.replaceChildren(
      ...DIAS.map(([letra, nome], dia) =>
        h(
          'button',
          {
            type: 'button',
            class: `segmento${escolhidos.has(dia) ? ' ativo' : ''}`,
            'aria-pressed': String(escolhidos.has(dia)),
            'aria-label': nome,
            onclick: () => {
              if (escolhidos.has(dia)) escolhidos.delete(dia);
              else escolhidos.add(dia);
              desenhar();
            },
          },
          letra,
        ),
      ),
    );
  };
  desenhar();

  const elemento = h(
    'div',
    { class: 'rotulo' },
    rotulo,
    botoes,
    h(
      'div',
      { class: 'atalhos' },
      atalhos.map((chave) => {
        const [nome, dias] = ATALHOS_DE_DIAS[chave];
        return h(
          'button',
          {
            type: 'button',
            class: 'chip',
            onclick: () => {
              escolhidos.clear();
              for (const dia of dias) escolhidos.add(dia);
              desenhar();
            },
          },
          nome,
        );
      }),
    ),
  );

  return { elemento, ler: () => [...escolhidos].sort((a, b) => a - b) };
}
