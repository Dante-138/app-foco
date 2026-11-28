// Como os itens de uma rotina aparecem na tela, e o que as ações em bloco mudam:
// marcar ou desmarcar a seção inteira, desfazer e mover uma seção de lugar.

// Agrupa os itens em blocos: cada seção com os itens que vêm depois dela. Os itens
// escritos antes da primeira seção formam um bloco sem seção (secao: null).
export function emBlocos(itens) {
  const blocos = [];
  let atual = null;
  for (const item of itens) {
    if (item.tipo === 'secao') {
      atual = { secao: item, itens: [] };
      blocos.push(atual);
    } else {
      if (!atual) {
        atual = { secao: null, itens: [] };
        blocos.push(atual);
      }
      atual.itens.push(item);
    }
  }
  return blocos;
}

// As duas áreas da tela, como na lista do Google Keep:
//   pendentes: cada bloco com os itens que faltam;
//   marcados:  cada bloco com os itens já marcados (o nome da seção se repete aqui).
// Bloco sem item em uma área não aparece nela; seção que não tem item nenhum fica em
// "pendentes". Com a opção desligada, tudo fica em "pendentes", na ordem escrita.
// marcadas: Set com os ids dos itens marcados hoje.
export function emAreas(itens, marcadas, marcadosNoFim) {
  const blocos = emBlocos(itens);
  if (!marcadosNoFim) return { pendentes: blocos, marcados: [] };

  const pendentes = [];
  const marcados = [];
  for (const { secao, itens: doBloco } of blocos) {
    const faltam = doBloco.filter((item) => !marcadas.has(item.id));
    const feitos = doBloco.filter((item) => marcadas.has(item.id));
    if (faltam.length || !feitos.length) pendentes.push({ secao, itens: faltam });
    if (feitos.length) marcados.push({ secao, itens: feitos });
  }
  return { pendentes, marcados };
}

// As marcas do dia ficam guardadas na ordem em que foram feitas. As três funções abaixo
// devolvem uma lista nova de marcas, sem alterar a recebida.

// Marcar a seção inteira: os itens do bloco que ainda não estavam marcados entram no fim.
export function marcarBloco(marcas, bloco) {
  const jaMarcados = new Set(marcas);
  return [...marcas, ...bloco.itens.map((item) => item.id).filter((id) => !jaMarcados.has(id))];
}

// Desmarcar a seção inteira: saem as marcas de todos os itens do bloco.
export function desmarcarBloco(marcas, bloco) {
  const doBloco = new Set(bloco.itens.map((item) => item.id));
  return marcas.filter((id) => !doBloco.has(id));
}

// Desfazer: saem as últimas marcas. "quantas" é 1 para um item, ou o tamanho do lote
// quando a seção foi marcada de uma vez.
export function semAsUltimas(marcas, quantas = 1) {
  return marcas.slice(0, Math.max(0, marcas.length - quantas));
}

// Itens da rotina com a seção de posição "de" (contando só as seções, a partir de zero)
// levada para a posição "para". O bloco inteiro vai junto. Os itens escritos antes da
// primeira seção ficam onde estão. Posição inválida devolve a lista como veio.
export function moverSecao(itens, de, para) {
  const blocos = emBlocos(itens);
  const soltos = blocos[0]?.secao === null ? blocos.shift().itens : [];
  const valida = (posicao) => Number.isInteger(posicao) && posicao >= 0 && posicao < blocos.length;
  if (!valida(de) || !valida(para) || de === para) return itens;

  const [movido] = blocos.splice(de, 1);
  blocos.splice(para, 0, movido);
  return [...soltos, ...blocos.flatMap((bloco) => [bloco.secao, ...bloco.itens])];
}

// Arrastar na tela de marcar, como no Google Keep. "visiveis" é a ordem em que ficaram as linhas
// à vista (seções e itens que faltam) depois de arrastar a linha "id". Os itens fora da vista (os
// marcados, na área de baixo) continuam na seção em que estavam.
//   Item: fica logo depois da linha que ficou acima dele (no começo da seção, se for o nome dela).
//   Sem linha acima, vai para o começo da rotina, antes da primeira seção.
//   Seção: leva o bloco inteiro para depois do bloco da linha que ficou acima dela. Sem linha
//   acima, ou com um item solto acima, vai para antes das outras seções.
// Ids que a rotina não tem são ignorados. "id" fora da rotina ou da vista devolve a lista como veio.
export function moverNaTela(itens, visiveis, id) {
  const porId = new Map(itens.map((item) => [item.id, item]));
  const conhecidos = visiveis.filter((v) => porId.has(v));
  const posicao = conhecidos.indexOf(id);
  if (posicao < 0) return itens;
  const movido = porId.get(id);
  const acima = porId.get(conhecidos[posicao - 1]) ?? null;

  if (movido.tipo === 'item') {
    const resto = itens.filter((item) => item !== movido);
    const lugar = resto.indexOf(acima) + 1; // sem linha acima: -1 + 1, o começo
    return [...resto.slice(0, lugar), movido, ...resto.slice(lugar)];
  }

  const blocos = emBlocos(itens);
  const soltos = blocos[0].secao === null ? blocos.shift().itens : [];
  const [bloco] = blocos.splice(
    blocos.findIndex((b) => b.secao === movido),
    1,
  );
  const doAcima = blocos.findIndex((b) => b.secao === acima || b.itens.includes(acima));
  blocos.splice(doAcima + 1, 0, bloco); // sem bloco acima: -1 + 1, antes das outras seções
  return [...soltos, ...blocos.flatMap((b) => [b.secao, ...b.itens])];
}
