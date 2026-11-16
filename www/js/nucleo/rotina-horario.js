// Onde o relógio está na rotina: o item do horário atual e o próximo.
// Lógica pura: recebe os itens, as marcas do dia e a hora; quem desenha é o Painel.

const emMinutos = (hora) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3));

// itens: os da rotina (seções e itens). marcadas: Set com os ids marcados hoje.
// hora: agora, 'HH:MM'. Só os itens com horário entram; rotina sem horário devolve tudo vazio.
//   atual:     o item cujo horário já chegou e é o mais tarde entre os que chegaram (ou null,
//              antes do primeiro horário do dia); atualFeito diz se ele já está marcado
//   proximo:   o item de horário mais cedo entre os que ainda não chegaram (ou null)
//   faltam:    minutos até o horário do próximo (ou null)
//   atrasados: quantos itens de horário anterior ao do atual continuam sem marca
// Com horários iguais, vale a ordem da rotina: o atual é o último deles e o próximo, o primeiro.
export function horarioDaRotina(itens, marcadas, hora) {
  let atual = null;
  let proximo = null;
  for (const item of itens) {
    if (item.tipo !== 'item' || !item.hora) continue;
    if (item.hora <= hora) {
      if (!atual || item.hora >= atual.hora) atual = item;
    } else if (!proximo || item.hora < proximo.hora) proximo = item;
  }
  const atrasados = atual
    ? itens.filter((i) => i.tipo === 'item' && i.hora && i.hora < atual.hora && !marcadas.has(i.id)).length
    : 0;
  return {
    atual,
    atualFeito: atual !== null && marcadas.has(atual.id),
    proximo,
    faltam: proximo ? emMinutos(proximo.hora) - emMinutos(hora) : null,
    atrasados,
  };
}

// "em 40 min", "em 1 h", "em 2 h 05".
export function emQuanto(minutos) {
  if (minutos < 60) return `em ${minutos} min`;
  const resto = minutos % 60;
  return `em ${Math.floor(minutos / 60)} h${resto ? ` ${String(resto).padStart(2, '0')}` : ''}`;
}
