// Subtarefas: os passos de uma tarefa. subtarefa = { id, titulo, feita }.
// Lógica pura: a lista no formulário fica em js/subtarefas.js.

export const LIMITE_DE_SUBTAREFAS = 30;

// Quantas estão feitas e quantas são.
export function progresso(subtarefas) {
  return { feitas: subtarefas.filter((s) => s.feita).length, total: subtarefas.length };
}

// "2 de 5 subtarefas", para a linha da tarefa; vazio quando a tarefa não tem subtarefas.
export function textoDoProgresso(subtarefas) {
  const { feitas, total } = progresso(subtarefas);
  if (!total) return '';
  return `${feitas} de ${total} ${total === 1 ? 'subtarefa' : 'subtarefas'}`;
}

// A lista como sai do formulário: títulos aparados, linhas em branco fora, no máximo o limite.
export function limparSubtarefas(subtarefas, tamanhoDoTitulo) {
  return subtarefas
    .map((s) => ({ id: s.id, titulo: s.titulo.trim().slice(0, tamanhoDoTitulo).trim(), feita: s.feita }))
    .filter((s) => s.titulo)
    .slice(0, LIMITE_DE_SUBTAREFAS);
}

// Subtarefas da próxima ocorrência de uma tarefa que repete: as mesmas, todas por fazer,
// com ids novos (gerarId devolve um id a cada chamada).
export function paraProximaOcorrencia(subtarefas, gerarId) {
  return subtarefas.map((s) => ({ id: gerarId(), titulo: s.titulo, feita: false }));
}
