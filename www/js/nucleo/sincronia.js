// O que mudou entre os avisos já agendados no sistema e o plano novo.
// Lógica pura. Com dezenas de avisos (rotina, hábitos, resumos), cancelar e agendar tudo a
// cada toque custaria caro; aqui sai só a diferença.

const assinatura = (aviso) => JSON.stringify(aviso);

// aplicado: Map id -> assinatura do aviso que esta sessão do app agendou.
// plano:    os avisos que devem estar agendados agora (só os que ainda não passaram).
// vivos:    Set com os ids dos avisos que continuam valendo sem olhar o relógio. Um aviso
//           que saiu do plano mas continua vivo só passou da hora: já foi entregue e fica
//           na tela do celular. O que saiu do plano e não está vivo foi resolvido (tarefa
//           concluída, hábito marcado, aviso desligado): é cancelado, e some da tela.
// Devolve { cancelar: [id], agendar: [aviso], aplicado: Map para a próxima vez }.
export function mudancas(aplicado, plano, vivos) {
  const novo = new Map(plano.map((aviso) => [aviso.id, assinatura(aviso)]));
  const cancelar = [];
  const proximo = new Map(novo);

  for (const [id, antiga] of aplicado) {
    if (novo.has(id)) {
      if (novo.get(id) !== antiga) cancelar.push(id); // mudou: sai o antigo, entra o novo
    } else if (vivos.has(id)) {
      proximo.set(id, antiga); // já entregue: continua conhecido, para cancelar quando for resolvido
    } else {
      cancelar.push(id);
    }
  }
  return {
    cancelar,
    agendar: plano.filter((aviso) => aplicado.get(aviso.id) !== novo.get(aviso.id)),
    aplicado: proximo,
  };
}
