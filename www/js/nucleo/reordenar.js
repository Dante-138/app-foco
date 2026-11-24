// Ordem nova de uma parte da lista, sem mexer no resto. "ids" é a ordem em que os itens à vista
// ficaram depois de arrastar (as tarefas de uma lista, os hábitos que o filtro deixou na grade).
// Esses itens trocam de lugar entre si, nas mesmas posições que já ocupavam; os que não estavam
// à vista (outra lista, concluídas, hábitos ocultos) não saem do lugar. Id que não existe ou
// repetido é ignorado. Devolve uma lista nova; a recebida não muda.
export function reordenar(itens, ids) {
  const porId = new Map(itens.map((item) => [item.id, item]));
  const naOrdem = [...new Set(ids)].filter((id) => porId.has(id)).map((id) => porId.get(id));
  const movidos = new Set(naOrdem);
  const lugares = itens.flatMap((item, i) => (movidos.has(item) ? [i] : []));
  const resultado = [...itens];
  lugares.forEach((lugar, k) => {
    resultado[lugar] = naOrdem[k];
  });
  return resultado;
}
