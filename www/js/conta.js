// Tarefas com aviso antecipado: os botões "Avisar antes" do formulário da tarefa e a criação
// rápida de uma conta mensal (repete todo mês, com o valor no título e avisos antes do vencimento).
// As regras ficam em nucleo/lembretes.js e nucleo/conta.js.

import { estado, salvar } from './store.js';
import { uid } from './nucleo/ids.js';
import { hoje, deIso } from './nucleo/datas.js';
import { LIMITES } from './nucleo/esquema.js';
import { OPCOES_DE_AVISO } from './nucleo/lembretes.js';
import { dadosDaConta, diaDoMesValido, valorEmReais } from './nucleo/conta.js';
import { pedirPermissaoSeFaltar } from './lembretes.js';
import { h, abrirFolha, campo, redesenhar } from './ui.js';

const rotuloDoAviso = (dias) => (dias === 1 ? '1 dia' : `${dias} dias`);

// Botões de liga e desliga com as antecedências do aviso. inicial: os avisos da tarefa; um
// valor fora das opções de sempre (vindo de um backup) ganha o próprio botão, para não sumir.
// Devolve { elemento, ler(), limpar() }; ler() dá os dias escolhidos, em ordem crescente.
export function campoDeAvisos(inicial) {
  const escolhidos = new Set(inicial);
  const opcoes = [...new Set([...OPCOES_DE_AVISO, ...inicial])].sort((a, b) => a - b);
  const botoes = h('div', { class: 'atalhos', role: 'group', 'aria-label': 'Avisar antes' });

  const desenhar = () => {
    botoes.replaceChildren(
      ...opcoes.map((dias) =>
        h(
          'button',
          {
            type: 'button',
            class: `chip${escolhidos.has(dias) ? ' ativo' : ''}`,
            'aria-pressed': String(escolhidos.has(dias)),
            'aria-label': `Avisar ${rotuloDoAviso(dias)} antes`,
            onclick: () => {
              if (escolhidos.has(dias)) escolhidos.delete(dias);
              else escolhidos.add(dias);
              desenhar();
            },
          },
          rotuloDoAviso(dias),
        ),
      ),
    );
  };
  desenhar();

  return {
    elemento: h('div', { class: 'rotulo' }, 'Avisar antes', botoes),
    ler: () => [...escolhidos].sort((a, b) => a - b),
    limpar() {
      escolhidos.clear();
      desenhar();
    },
  };
}

// Folha "Nova conta mensal": nome, valor e dia do vencimento. Cria a tarefa já com o próximo
// vencimento, repetindo todo mês e avisando antes. listaId: a lista em que a conta entra.
export function novaConta(listaId, nomeInicial = '') {
  const nome = h('input', {
    class: 'entrada',
    type: 'text',
    value: nomeInicial,
    placeholder: 'Ex.: Luz',
    maxLength: LIMITES.tituloTarefa - 24, // sobra lugar para o valor no título
    required: true,
    autocomplete: 'off',
  });
  const valor = h('input', {
    class: 'entrada',
    type: 'text',
    inputMode: 'decimal',
    placeholder: '0,00',
    autocomplete: 'off',
  });
  const dia = h('input', {
    class: 'entrada',
    type: 'number',
    inputMode: 'numeric',
    min: 1,
    max: 31,
    value: String(deIso(hoje()).getDate()),
    required: true,
  });
  const lista = h(
    'select',
    { class: 'entrada' },
    estado.listas.map((l) => h('option', { value: l.id }, l.nome)),
  );
  lista.value = listaId;

  const aoSalvar = (e) => {
    e.preventDefault();
    const nomeFinal = nome.value.trim();
    if (!nomeFinal) {
      nome.value = '';
      nome.reportValidity();
      return;
    }
    if (valor.value.trim() && valorEmReais(valor.value) === null) {
      valor.focus();
      valor.select();
      return;
    }
    const diaDoMes = Number(dia.value);
    if (!diaDoMesValido(diaDoMes)) {
      dia.focus();
      dia.select();
      return;
    }

    estado.tarefas.push({
      id: uid(),
      listaId: lista.value || estado.listas[0].id,
      notas: '',
      ...dadosDaConta({ nome: nomeFinal, valor: valor.value, diaDoMes }, hoje()),
      estrela: false,
      feita: false,
      criadaEm: Date.now(),
      feitaEm: null,
    });
    salvar();
    fechar();
    redesenhar();
    pedirPermissaoSeFaltar();
  };

  const fechar = abrirFolha({
    titulo: 'Nova conta mensal',
    corpo: h(
      'form',
      { class: 'folha-form', onsubmit: aoSalvar },
      campo('Nome', nome),
      h('div', { class: 'dupla' }, campo('Valor (opcional)', valor), campo('Dia do vencimento', dia)),
      estado.listas.length > 1 ? campo('Lista', lista) : null,
      h(
        'p',
        { class: 'dica' },
        'Repete todo mês: ao concluir, a do mês seguinte já aparece. Avisa 3 dias antes, 1 dia antes, no dia e, se continuar pendente, na manhã seguinte.',
      ),
      h(
        'div',
        { class: 'linha-botoes' },
        h('span', { class: 'espaco' }),
        h('button', { type: 'button', class: 'botao', onclick: () => fechar() }, 'Cancelar'),
        h('button', { type: 'submit', class: 'botao cheio' }, 'Salvar'),
      ),
    ),
  });
  if (nomeInicial) valor.focus();
  else nome.focus();
}
