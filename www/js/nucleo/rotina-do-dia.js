// Rotina escolhida pelo dia da semana: cada rotina pode ter os dias em que abre sozinha.
// rotina.diasDaSemana = [0 a 6] (0 = domingo, como Date.getDay); vazio = nunca abre sozinha.
// Lógica pura: quem salva e redesenha é a interface.

import { deIso, diasValidos } from './datas.js';

// A rotina do dia: a primeira, na ordem da faixa, que tem o dia da semana de "dia".
export function rotinaDoDia(rotinas, dia) {
  const semana = deIso(dia).getDay();
  return rotinas.find((rotina) => rotina.diasDaSemana.includes(semana)) ?? null;
}

// Abre a rotina do dia, uma vez por dia: estado.rotinaDoDiaEm guarda o dia em que a escolha
// já foi feita, então trocar de rotina à mão depois disso vale até o dia virar. Sem rotina
// para o dia, a que estava aberta continua. Altera o estado; devolve true se mexeu nele.
export function abrirRotinaDoDia(estado, dia) {
  if (estado.rotinaDoDiaEm === dia) return false;
  estado.rotinaDoDiaEm = dia;
  const rotina = rotinaDoDia(estado.rotinas, dia);
  if (rotina) estado.rotinaAtiva = rotina.id;
  return true;
}

// Define os dias de uma rotina. Cada dia da semana fica com uma rotina só: os dias
// escolhidos saem das outras, para a escolha do dia nunca depender da ordem da faixa.
export function definirDias(rotinas, rotina, dias) {
  const escolhidos = diasValidos(dias);
  for (const outra of rotinas) {
    outra.diasDaSemana =
      outra === rotina ? escolhidos : outra.diasDaSemana.filter((d) => !escolhidos.includes(d));
  }
}

const NOMES = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

// Texto curto dos dias: "todo dia", "seg a sex", "sáb e dom", "seg, qua e sex"; vazio sem dias.
export function descreverDias(dias) {
  if (dias.length === 7) return 'todo dia';
  if (dias.join() === '1,2,3,4,5') return 'seg a sex';
  if (dias.join() === '0,6') return 'sáb e dom';
  const nomes = dias.map((d) => NOMES[d]);
  if (nomes.length <= 1) return nomes.join('');
  return `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`;
}
