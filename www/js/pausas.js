// Folha "Férias e feriados": a lista das pausas e o formulário para acrescentar uma.
// Cada mudança é gravada na hora. As regras estão em nucleo/pausas.js.

import { estado, salvar } from './store.js';
import { uid } from './nucleo/ids.js';
import { hoje } from './nucleo/datas.js';
import { LIMITES } from './nucleo/esquema.js';
import { LIMITE_DE_PAUSAS, emOrdem, periodoDaPausa, porDataDaPausa } from './nucleo/pausas.js';
import { h, abrirFolha, campo, redesenhar } from './ui.js';

// A lista é trocada por outra a cada mudança: quem guarda contas dos hábitos percebe pela
// troca que as pausas mudaram.
function gravar(pausas) {
  estado.pausas = pausas;
  salvar();
  redesenhar();
}

export function abrirPausas() {
  const lista = h('ul', { class: 'pausas' });
  const nome = h('input', {
    class: 'entrada',
    type: 'text',
    placeholder: 'Ex.: Férias',
    maxLength: LIMITES.nomePausa,
    autocomplete: 'off',
  });
  const de = h('input', { class: 'entrada', type: 'date', required: true });
  const ate = h('input', { class: 'entrada', type: 'date' });
  const adicionar = h('button', { type: 'submit', class: 'botao cheio' }, 'Adicionar');

  const desenhar = () => {
    const pausas = [...estado.pausas].sort(porDataDaPausa);
    lista.replaceChildren(
      ...(pausas.length
        ? pausas.map((pausa) =>
            h(
              'li',
              { class: 'tarefa' },
              h(
                'span',
                { class: 'tarefa-corpo' },
                h('span', { class: 'tarefa-titulo' }, pausa.nome),
                h('span', { class: 'tarefa-sub' }, periodoDaPausa(pausa, hoje())),
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: 'botao perigo',
                  'aria-label': `Excluir a pausa ${pausa.nome}`,
                  onclick: () => {
                    gravar(estado.pausas.filter((p) => p.id !== pausa.id));
                    desenhar();
                  },
                },
                'Excluir',
              ),
            ),
          )
        : [h('li', { class: 'dica' }, 'Nenhuma pausa cadastrada.')]),
    );
    adicionar.disabled = estado.pausas.length >= LIMITE_DE_PAUSAS;
  };
  desenhar();

  const aoAdicionar = (e) => {
    e.preventDefault();
    if (!de.value) {
      de.reportValidity();
      return;
    }
    // Sem a data final, a pausa é de um dia só (feriado).
    const [inicio, fim] = emOrdem(de.value, ate.value || de.value);
    gravar([...estado.pausas, { id: uid(), nome: nome.value.trim() || 'Pausa', de: inicio, ate: fim }]);
    nome.value = '';
    de.value = '';
    ate.value = '';
    desenhar();
  };

  const fechar = abrirFolha({
    titulo: 'Férias e feriados',
    corpo: h(
      'form',
      { class: 'folha-form', onsubmit: aoAdicionar },
      h(
        'p',
        { class: 'dica' },
        'Nos dias de uma pausa todo hábito fica de folga: a sequência não quebra e a pontuação não cai. Marcar num dia de pausa continua valendo.',
      ),
      lista,
      campo('Nome', nome),
      h('div', { class: 'dupla' }, campo('De', de), campo('Até (opcional)', ate)),
      h(
        'div',
        { class: 'linha-botoes' },
        h('span', { class: 'espaco' }),
        h('button', { type: 'button', class: 'botao', onclick: () => fechar() }, 'Fechar'),
        adicionar,
      ),
    ),
  });
}
