// Edição da rotina direto na lista, como no Google Keep: cada linha vira um campo.
// Enter cria um item abaixo; apagar o texto de uma linha vazia remove a linha.
// O id de cada item nunca muda, então a marca do dia e a ligação com o hábito ficam.

import { estado, salvar } from './store.js';
import { uid } from './nucleo/ids.js';
import { horaValida } from './nucleo/datas.js';
import { LIMITES } from './nucleo/esquema.js';
import { emBlocos, moverSecao } from './nucleo/rotina-ordem.js';
import {
  inserirDepois,
  inserirNoFimDoBloco,
  limparVazios,
  naOrdem,
  remover,
} from './nucleo/rotina-edicao.js';
import { h, icone, avisar, guardarVoltar, redesenhar, reordenavel } from './ui.js';

// Desfazer e refazer da edição: fotos do nome e dos itens da rotina. Uma foto é tirada
// antes de cada mudança de estrutura (criar ou tirar linha) e quando um campo recebe o
// foco, isto é, antes de se digitar nele. Valem enquanto a edição está aberta.
const historico = { passado: [], futuro: [] };
const foto = (rotina) => JSON.stringify({ nome: rotina.nome, itens: rotina.itens });

function registrar(rotina) {
  const atual = foto(rotina);
  if (historico.passado.at(-1) === atual) return;
  historico.passado.push(atual);
  historico.futuro = [];
}

function voltarPara(rotina, de, para) {
  const atual = foto(rotina);
  let alvo = de.pop();
  while (alvo === atual) alvo = de.pop(); // foto igual à tela: não conta como um passo
  if (alvo === undefined) return;
  para.push(atual);
  const { nome, itens } = JSON.parse(alvo);
  rotina.nome = nome;
  rotina.itens = itens;
  salvar();
  redesenhar();
}

export const desfazerEdicao = (rotina) => voltarPara(rotina, historico.passado, historico.futuro);
export const refazerEdicao = (rotina) => voltarPara(rotina, historico.futuro, historico.passado);

let editando = null; // id da rotina em edição
let focarEm = null; // id do item que recebe o foco no próximo desenho
let tirarGuarda = null; // enquanto edita, o voltar do Android conclui a edição em vez de sair do app

export const emEdicao = (rotina) => Boolean(rotina) && editando === rotina.id;

// O texto é guardado enquanto se digita, com uma pequena espera entre as gravações.
let espera = null;
let pendente = false;

function gravarPendente() {
  clearTimeout(espera);
  if (!pendente) return;
  pendente = false;
  salvar();
}

function salvarLogo() {
  pendente = true;
  clearTimeout(espera);
  espera = setTimeout(gravarPendente, 500);
}

// O Android pode encerrar o app logo depois de ele ir para o fundo: o que foi digitado
// e ainda esperava a gravação é gravado na hora.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) gravarPendente();
});
window.addEventListener('pagehide', gravarPendente);

const novoItem = (tipo) => ({ id: uid(), tipo, texto: '', hora: null, habitoId: null });

function cabeNaRotina(rotina) {
  if (rotina.itens.length < LIMITES.itensPorRotina) return true;
  avisar(`Uma rotina pode ter até ${LIMITES.itensPorRotina} linhas.`);
  return false;
}

// Entra na edição. Com adicionar, já cria um item no fim da rotina e põe o foco nele.
export function entrarNaEdicao(rotina, { adicionar = false } = {}) {
  if (editando !== rotina.id) {
    historico.passado = [];
    historico.futuro = [];
  }
  editando = rotina.id;
  tirarGuarda ??= guardarVoltar(terminarEdicaoAberta);
  ligarArraste();
  registrar(rotina);
  if (adicionar && cabeNaRotina(rotina)) {
    const novo = novoItem('item');
    rotina.itens = [...rotina.itens, novo];
    focarEm = novo.id;
  }
  redesenhar();
}

// Sai da edição: linhas sem texto saem, e o nome nunca fica vazio.
export function sairDaEdicao(rotina) {
  if (!emEdicao(rotina)) return;
  editando = null;
  focarEm = null;
  tirarGuarda?.();
  tirarGuarda = null;
  clearTimeout(espera);
  pendente = false;
  rotina.nome = rotina.nome.trim().slice(0, LIMITES.nomeRotina).trim() || 'Rotina';
  rotina.itens = limparVazios(rotina.itens, LIMITES.textoItem);
  salvar();
  redesenhar();
}

function inserir(rotina, novo, onde) {
  if (!cabeNaRotina(rotina)) return;
  registrar(rotina);
  rotina.itens = onde(rotina.itens, novo);
  focarEm = novo.id;
  salvar();
  redesenhar();
}

// aoRemoverItem: chamado antes de tirar um item, para desfazer a marca do dia dele.
function removerLinha(rotina, linha, aoRemoverItem, { focarAnterior = false } = {}) {
  registrar(rotina);
  const posicao = rotina.itens.indexOf(linha);
  if (linha.tipo === 'item') aoRemoverItem(linha);
  rotina.itens = remover(rotina.itens, linha.id);
  focarEm = focarAnterior ? (rotina.itens[posicao - 1]?.id ?? null) : null;
  salvar();
  redesenhar();
}

function campoDeTexto(rotina, linha, aoRemoverItem) {
  const secao = linha.tipo === 'secao';
  const campo = h('input', {
    class: secao ? 'campo-texto campo-secao' : 'campo-texto',
    type: 'text',
    value: linha.texto,
    maxLength: LIMITES.textoItem,
    placeholder: secao ? 'Nome da seção' : 'Item',
    enterKeyHint: 'next',
    autocapitalize: 'sentences',
    'aria-label': secao ? 'Nome da seção' : 'Texto do item',
    'data-id': linha.id,
  });
  campo.addEventListener('focus', () => registrar(rotina));
  campo.addEventListener('input', () => {
    linha.texto = campo.value;
    salvarLogo();
  });
  campo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      inserir(rotina, novoItem('item'), (itens, novo) => inserirDepois(itens, linha.id, novo));
    } else if (e.key === 'Backspace' && campo.value === '') {
      e.preventDefault();
      removerLinha(rotina, linha, aoRemoverItem, { focarAnterior: true });
    }
  });
  return campo;
}

function botaoExcluir(rotina, linha, aoRemoverItem) {
  return h(
    'button',
    {
      type: 'button',
      class: 'botao-icone pequeno',
      'aria-label': linha.tipo === 'secao' ? 'Excluir seção' : 'Excluir item',
      onclick: () => removerLinha(rotina, linha, aoRemoverItem),
    },
    icone('x', { tam: 18 }),
  );
}

function linhaDoItem(rotina, item, aoRemoverItem) {
  const hora = h('input', {
    class: 'campo-hora',
    type: 'time',
    value: item.hora ?? '',
    'aria-label': 'Horário do item',
  });
  hora.addEventListener('focus', () => registrar(rotina));
  hora.addEventListener('input', () => {
    item.hora = horaValida(hora.value) ? hora.value : null;
    salvarLogo();
  });
  return h(
    'li',
    { class: 'edicao-item', 'data-linha': item.id },
    alca(),
    hora,
    campoDeTexto(rotina, item, aoRemoverItem),
    botaoExcluir(rotina, item, aoRemoverItem),
  );
}

function botaoDeAdicionar(rotina, idDaSecao) {
  return h(
    'li',
    {},
    h(
      'button',
      {
        type: 'button',
        class: 'edicao-adicionar',
        onclick: () =>
          inserir(rotina, novoItem('item'), (itens, novo) => inserirNoFimDoBloco(itens, idDaSecao, novo)),
      },
      icone('mais', { tam: 18 }),
      'Adicionar item',
    ),
  );
}

// ------------------------------------------------------------- arrastar

// Alça de arrastar, no começo de cada linha. Na edição, só ela arrasta, já no primeiro toque: no
// resto da linha o dedo rola a lista e edita os campos.
const alca = () => h('span', { class: 'alca', 'aria-hidden': 'true' }, icone('alca', { tam: 18 }));

// Linhas que vão junto com uma seção: os itens dela e o "Adicionar item" do bloco.
function linhasDoBloco(cabecalho) {
  const linhas = [];
  for (
    let el = cabecalho.nextElementSibling;
    el && !el.classList.contains('edicao-secao');
    el = el.nextElementSibling
  ) {
    if (el === el.parentElement.lastElementChild) break; // "Nova seção"
    linhas.push(el);
  }
  return linhas;
}

// Ao soltar: o item pode ter ido para qualquer lugar (outra seção, ou antes da primeira seção);
// a seção leva o bloco inteiro e só troca de lugar com outras seções.
function aoArrastarNaEdicao(ids, id) {
  const rotina = estado.rotinas.find((r) => r.id === editando);
  if (!rotina) return;
  registrar(rotina);
  const movida = rotina.itens.find((i) => i.id === id);
  if (movida?.tipo === 'secao') {
    const secoes = new Set(rotina.itens.filter((i) => i.tipo === 'secao').map((i) => i.id));
    const de = [...secoes].indexOf(id);
    const para = ids.filter((x) => secoes.has(x)).indexOf(id);
    rotina.itens = moverSecao(rotina.itens, de, para);
  } else {
    rotina.itens = naOrdem(rotina.itens, ids);
  }
  salvar();
  redesenhar();
}

// O arraste mora no #conteudo, que é o mesmo em todas as abas: liga uma vez só.
let arrasteLigado = false;
function ligarArraste() {
  if (arrasteLigado) return;
  arrasteLigado = true;
  reordenavel(document.getElementById('conteudo'), {
    linhas: '.edicao > li[data-linha]',
    pega: '.alca',
    chave: 'linha',
    imediato: true,
    junto: (linha) => (linha.classList.contains('edicao-secao') ? linhasDoBloco(linha) : []),
    alvos: (linha) => (linha.classList.contains('edicao-secao') ? '.edicao-secao' : null),
    fim: () => document.querySelector('.edicao > li:last-child'), // antes de "Nova seção"
    aoSoltar: aoArrastarNaEdicao,
  });
}

// A lista em modo de edição: seções, itens, "Adicionar item" no fim de cada bloco e "Nova seção".
export function listaEmEdicao(rotina, { aoRemoverItem }) {
  const linhas = [];
  for (const bloco of emBlocos(rotina.itens)) {
    if (bloco.secao) {
      linhas.push(
        h(
          'li',
          { class: 'edicao-secao', 'data-linha': bloco.secao.id },
          alca(),
          campoDeTexto(rotina, bloco.secao, aoRemoverItem),
          botaoExcluir(rotina, bloco.secao, aoRemoverItem),
        ),
      );
    }
    for (const item of bloco.itens) linhas.push(linhaDoItem(rotina, item, aoRemoverItem));
    linhas.push(botaoDeAdicionar(rotina, bloco.secao?.id ?? null));
  }
  if (!rotina.itens.length) linhas.push(botaoDeAdicionar(rotina, null));

  const lista = h(
    'ul',
    { class: 'cartao edicao' },
    linhas,
    h(
      'li',
      {},
      h(
        'button',
        {
          type: 'button',
          class: 'edicao-adicionar',
          onclick: () => inserir(rotina, novoItem('secao'), (itens, nova) => [...itens, nova]),
        },
        icone('mais', { tam: 18 }),
        'Nova seção',
      ),
    ),
  );

  // O foco vai para a linha recém-criada assim que a lista estiver na tela.
  if (focarEm) {
    const id = focarEm;
    focarEm = null;
    queueMicrotask(() => lista.querySelector(`.campo-texto[data-id="${CSS.escape(id)}"]`)?.focus());
  }
  return lista;
}

// Nome da rotina, editável no cabeçalho durante a edição.
export function campoDoNome(rotina) {
  const nome = h('input', {
    class: 'entrada campo-nome',
    type: 'text',
    value: rotina.nome,
    maxLength: LIMITES.nomeRotina,
    'aria-label': 'Nome da rotina',
  });
  nome.addEventListener('focus', () => registrar(rotina));
  nome.addEventListener('input', () => {
    rotina.nome = nome.value;
    salvarLogo();
  });
  return nome;
}

// Ao trocar de rotina com uma em edição, a edição dela termina. É também o voltar do Android na
// edição. Se a rotina já não existe, a edição e a guarda do voltar saem do mesmo jeito: guarda
// sem dono prenderia o voltar dentro do app.
export function terminarEdicaoAberta() {
  const aberta = estado.rotinas.find((r) => r.id === editando);
  if (aberta) {
    sairDaEdicao(aberta);
    return;
  }
  editando = null;
  tirarGuarda?.();
  tirarGuarda = null;
}
