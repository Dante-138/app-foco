// Subtarefas no formulário da tarefa: a lista (marcar, editar o texto, remover) e o campo
// para acrescentar. Trabalha numa cópia; quem grava é o Salvar da tarefa, com ler().
// As regras estão em nucleo/subtarefas.js.

import { uid } from './nucleo/ids.js';
import { LIMITES } from './nucleo/esquema.js';
import { LIMITE_DE_SUBTAREFAS, limparSubtarefas } from './nucleo/subtarefas.js';
import { h, icone } from './ui.js';

// tarefa: a tarefa em edição (ou null, na tarefa nova). Devolve { elemento, ler() }; ler() dá a lista pronta
// para gravar (títulos aparados, sem linha em branco).
export function campoDeSubtarefas(tarefa) {
  let itens = (tarefa?.subtarefas ?? []).map((s) => ({ ...s }));
  const lista = h('ul', { class: 'subtarefas' });
  const nova = h('input', {
    class: 'entrada',
    type: 'text',
    'aria-label': 'Nova subtarefa',
    placeholder: 'Nova subtarefa',
    maxLength: LIMITES.tituloTarefa,
    autocomplete: 'off',
  });

  const desenhar = () => {
    lista.replaceChildren(
      ...itens.map((item) =>
        h(
          'li',
          { class: 'tarefa' },
          h(
            'button',
            {
              type: 'button',
              class: 'tarefa-check',
              role: 'checkbox',
              'aria-checked': String(item.feita),
              'aria-label': `Subtarefa feita: ${item.titulo}`,
              onclick: () => {
                item.feita = !item.feita;
                desenhar();
              },
            },
            item.feita ? icone('check') : h('span', { class: 'circulo' }),
          ),
          h('input', {
            class: 'entrada',
            type: 'text',
            'aria-label': 'Subtarefa',
            value: item.titulo,
            maxLength: LIMITES.tituloTarefa,
            autocomplete: 'off',
            oninput: (e) => {
              item.titulo = e.target.value;
            },
          }),
          h(
            'button',
            {
              type: 'button',
              class: 'botao-icone',
              'aria-label': `Remover a subtarefa ${item.titulo}`,
              onclick: () => {
                itens = itens.filter((outro) => outro !== item);
                desenhar();
              },
            },
            icone('x', { tam: 18 }),
          ),
        ),
      ),
    );
    nova.disabled = itens.length >= LIMITE_DE_SUBTAREFAS;
  };

  const acrescentar = () => {
    const titulo = nova.value.trim();
    if (!titulo) return;
    itens.push({ id: uid(), titulo, feita: false });
    nova.value = '';
    desenhar();
    nova.focus();
  };
  // Enter acrescenta a subtarefa, em vez de salvar a tarefa inteira.
  nova.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    acrescentar();
  });
  desenhar();

  return {
    elemento: h(
      'div',
      { class: 'rotulo' },
      'Subtarefas',
      lista,
      h(
        'div',
        { class: 'linha-botoes' },
        nova,
        h('button', { type: 'button', class: 'botao', onclick: acrescentar }, 'Adicionar'),
      ),
    ),
    // O texto digitado no campo e ainda não acrescentado entra também: quem salva não o perde.
    ler: () => {
      acrescentar();
      return limparSubtarefas(itens, LIMITES.tituloTarefa);
    },
  };
}
