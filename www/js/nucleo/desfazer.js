// Desfazer uma exclusão: tirar elementos de uma lista guardando o lugar de cada um, e
// depois pôr de volta nesse lugar. Funções puras; quem chama grava e redesenha.

// Separa os elementos que passam no teste. Devolve a lista sem eles e, para cada
// removido, o elemento e a posição que ele tinha.
export function retirar(lista, teste) {
  const restantes = [];
  const removidos = [];
  lista.forEach((item, indice) => {
    if (teste(item)) removidos.push({ item, indice });
    else restantes.push(item);
  });
  return { restantes, removidos };
}

// Devolve os removidos aos lugares de antes, na ordem em que estavam. Se a lista
// encolheu nesse meio-tempo, o elemento vai para o fim. Elemento com o mesmo id de um
// que já está na lista não entra de novo (desfazer duas vezes não duplica).
export function devolver(lista, removidos) {
  const resultado = [...lista];
  const presentes = new Set(lista.map((x) => x.id));
  for (const { item, indice } of [...removidos].sort((a, b) => a.indice - b.indice)) {
    if (presentes.has(item.id)) continue;
    resultado.splice(Math.min(indice, resultado.length), 0, item);
    presentes.add(item.id);
  }
  return resultado;
}
