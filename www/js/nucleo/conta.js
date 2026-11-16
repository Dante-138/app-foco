// Conta mensal: os dados de uma tarefa que vence todo mês no mesmo dia, com aviso antecipado.
// Lógica pura, para a criação rápida na aba Tarefas.

import { deIso, isoLocal } from './datas.js';
import { lerNumero } from './habito-calculo.js';
import { AVISOS_DE_CONTA } from './lembretes.js';

const fmtReais = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const diaDoMesValido = (n) => Number.isInteger(n) && n >= 1 && n <= 31;

// Valor digitado ("89,9", "1.250") no jeito de mostrar: "89,90", "1.250,00". Vazio ou
// texto que não é número dá null.
export function valorEmReais(texto) {
  const numero = lerNumero(texto);
  return numero === null ? null : fmtReais.format(numero);
}

// A próxima data, de "dia" em diante, que cai no dia do mês pedido. Em mês mais curto vale
// o último dia dele: dia 31 em novembro é 30/11.
export function proximoVencimento(diaDoMes, dia) {
  const base = deIso(dia);
  const noMes = (meses) => {
    const ano = base.getFullYear();
    const mes = base.getMonth() + meses;
    const ultimoDia = new Date(ano, mes + 1, 0).getDate();
    return isoLocal(new Date(ano, mes, Math.min(diaDoMes, ultimoDia)));
  };
  const nesteMes = noMes(0);
  return nesteMes >= dia ? nesteMes : noMes(1);
}

// nome: texto já aparado e não vazio; valor: texto digitado (pode ser vazio);
// diaDoMes: 1 a 31; dia: hoje. Devolve os campos da tarefa: o valor vai no título, o
// prazo é o próximo vencimento, repete todo mês e avisa nos dias de AVISOS_DE_CONTA.
export function dadosDaConta({ nome, valor, diaDoMes }, dia) {
  const reais = valorEmReais(valor);
  return {
    titulo: reais ? `${nome} - R$ ${reais}` : nome,
    prazo: proximoVencimento(diaDoMes, dia),
    hora: null,
    repeticao: { cada: 1, unidade: 'mes' },
    avisos: [...AVISOS_DE_CONTA],
  };
}
