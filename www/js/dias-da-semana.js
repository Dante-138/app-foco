// Seletor de dias da semana: sete botões redondos (D S T Q Q S S), de ligar e desligar.
// Um componente só para o hábito (dias em que ele vale) e para a rotina (dias em que abre sozinha).

import { h } from './ui.js';

// De domingo a sábado: a posição é o número do dia (o de Date.getDay).
const DIAS = [
  ['D', 'Domingo'],
  ['S', 'Segunda'],
  ['T', 'Terça'],
  ['Q', 'Quarta'],
  ['Q', 'Quinta'],
  ['S', 'Sexta'],
  ['S', 'Sábado'],
];

const ATALHOS = {
  uteis: ['Seg a sex', [1, 2, 3, 4, 5]],
  fimDeSemana: ['Sáb e dom', [0, 6]],
  nenhum: ['Nenhum', []],
};

// inicial: lista de dias (0 = domingo).
// minimo:  quantos dias precisam ficar escolhidos (o hábito pede pelo menos um; a rotina, nenhum).
// atalhos: chaves de ATALHOS, na ordem de exibição (padrão: sem atalhos).
// Devolve { grupo, atalhos, ler() }: o grupo dos sete botões, a linha de atalhos (ou null) e
// ler(), que dá os dias escolhidos em ordem.
export function seletorDeDias(inicial, { minimo = 0, atalhos = [] } = {}) {
  const escolhidos = new Set(inicial);
  const grupo = h('div', { class: 'dias-semana', role: 'group', 'aria-label': 'Dias da semana' });

  const desenhar = () => {
    grupo.replaceChildren(
      ...DIAS.map(([letra, nome], dia) =>
        h(
          'button',
          {
            type: 'button',
            class: `dia-semana${escolhidos.has(dia) ? ' ativo' : ''}`,
            'aria-pressed': String(escolhidos.has(dia)),
            'aria-label': nome,
            onclick: () => {
              if (!escolhidos.has(dia)) escolhidos.add(dia);
              else if (escolhidos.size > minimo) escolhidos.delete(dia);
              desenhar();
            },
          },
          letra,
        ),
      ),
    );
  };
  desenhar();

  const linhaDeAtalhos = atalhos.length
    ? h(
        'div',
        { class: 'atalhos' },
        atalhos.map((chave) => {
          const [nome, dias] = ATALHOS[chave];
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
      )
    : null;

  return { grupo, atalhos: linhaDeAtalhos, ler: () => [...escolhidos].sort((a, b) => a - b) };
}
