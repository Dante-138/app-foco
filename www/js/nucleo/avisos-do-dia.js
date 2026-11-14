// Avisos do dia: as notificações que não são de tarefa. Resumo da manhã, revisão da noite,
// a rotina no relógio (cada item com horário avisa na hora dele) e o lembrete dos hábitos.
// Lógica pura: devolve o plano; quem fala com o sistema de notificações é js/lembretes.js.
// O plano é refeito a cada gravação, então o que já foi marcado sai dele antes de avisar.

import { somaDias } from './datas.js';
import { resolvido } from './habito-calculo.js';
import { idDaNotificacao } from './lembretes.js';
import { rotuloData } from './prazos.js';

export const HORA_DA_MANHA = '07:00';
export const HORA_DA_NOITE = '22:00';

// Resumo e revisão ficam agendados para vários dias: se o app passar dias fechado, os
// avisos continuam chegando. Rotina e hábitos, só hoje e amanhã (mudam mais).
export const DIAS_DE_RESUMO = 7;
export const MAXIMO_DA_ROTINA = 40;
export const MAXIMO_DE_HABITOS = 30;

// Quais avisos estão ligados (estado.avisosDoDia). O resumo, a revisão e o lembrete dos
// hábitos nascem ligados. A rotina no relógio nasce desligada: uma rotina com muitos horários
// vira muitas notificações por dia, então quem quer liga em Ajustes.
export const AVISOS_DO_DIA = Object.freeze(['manha', 'noite', 'rotina', 'habitos']);
export const AVISOS_PADRAO = Object.freeze({ manha: true, noite: true, rotina: false, habitos: true });

// Só verdadeiro ou falso explícito muda o padrão; qualquer outra coisa fica com ele.
export function avisosDoDiaValidos(valor) {
  const origem = valor !== null && typeof valor === 'object' ? valor : {};
  return Object.fromEntries(
    AVISOS_DO_DIA.map((chave) => [
      chave,
      typeof origem[chave] === 'boolean' ? origem[chave] : AVISOS_PADRAO[chave],
    ]),
  );
}

const contar = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// "a", "a e b", "a, b e c".
const enumerar = (partes) =>
  partes.length <= 1 ? partes.join('') : `${partes.slice(0, -1).join(', ')} e ${partes.at(-1)}`;

const itensDe = (rotina) => (rotina ? rotina.itens.filter((item) => item.tipo === 'item') : []);

// chave: o que distingue o aviso entre os do mesmo tipo e dia (o id do item ou do hábito).
function aviso({ tipo, dia, chave, hora, titulo, corpo, habitoId = null, comFeito = false }) {
  return {
    id: idDaNotificacao(`${tipo}:${dia}:${chave}`),
    tipo,
    dia,
    titulo,
    corpo,
    quando: `${dia}T${hora}`,
    habitoId,
    comFeito,
  };
}

// O que o dia pede, para o resumo da manhã: rotina, hábitos e tarefas com prazo até o dia.
function resumoDaManha({ rotinaDe, habitos, habitoVale, tarefas }, dia) {
  const rotina = rotinaDe(dia);
  const quantosHabitos = habitos.filter((x) => !x.arquivado && habitoVale(x, dia)).length;
  const comPrazo = tarefas.filter((t) => !t.feita && t.prazo && t.prazo <= dia);
  const atrasadas = comPrazo.filter((t) => t.prazo < dia).length;
  const partes = [
    rotina ? `Rotina ${rotina.nome}` : null,
    quantosHabitos ? contar(quantosHabitos, 'hábito', 'hábitos') : null,
    comPrazo.length
      ? `${contar(comPrazo.length, 'tarefa', 'tarefas')}${atrasadas ? ` (${contar(atrasadas, 'atrasada', 'atrasadas')})` : ''}`
      : null,
  ].filter(Boolean);
  if (!partes.length) return null;
  return aviso({
    tipo: 'manha',
    dia,
    chave: 'resumo',
    hora: HORA_DA_MANHA,
    titulo: `Hoje, ${rotuloData(dia, dia)}`,
    corpo: partes.join(' · '),
  });
}

// O que ainda falta hoje, para a revisão da noite.
function oQueFalta({ rotinaDe, marcadas, habitos, habitoVale, registros, tarefas }, dia) {
  const semMarca = itensDe(rotinaDe(dia)).filter((item) => !marcadas.has(item.id)).length;
  const emAberto = habitos.filter(
    (x) => !x.arquivado && habitoVale(x, dia) && !resolvido(x, registros[x.id]?.[dia]),
  ).length;
  const pendentes = tarefas.filter((t) => !t.feita && t.prazo && t.prazo <= dia).length;
  return [
    emAberto ? contar(emAberto, 'hábito', 'hábitos') : null,
    semMarca ? contar(semMarca, 'item da rotina', 'itens da rotina') : null,
    pendentes ? contar(pendentes, 'tarefa', 'tarefas') : null,
  ].filter(Boolean);
}

// A revisão de hoje diz o que falta; a dos outros dias ainda não tem como saber.
function revisaoDaNoite(dados, dia, hoje) {
  const { rotinaDe, habitos, tarefas } = dados;
  if (!rotinaDe(dia) && !habitos.some((x) => !x.arquivado) && !tarefas.some((t) => !t.feita)) return null;
  let corpo = 'Confira o que falta nos hábitos, na rotina e nas tarefas.';
  if (dia === hoje) {
    const falta = oQueFalta(dados, dia);
    corpo = falta.length ? `Faltam: ${enumerar(falta)}.` : 'Tudo feito hoje.';
  }
  return aviso({
    tipo: 'noite',
    dia,
    chave: 'revisao',
    hora: HORA_DA_NOITE,
    titulo: 'Revisão do dia',
    corpo,
  });
}

// Hábito que o item de rotina marca: se já foi resolvido hoje, o item não precisa avisar.
function habitoDoItemResolvido(item, { habitos, registros }, dia) {
  const habito = item.habitoId ? habitos.find((x) => x.id === item.habitoId) : null;
  return Boolean(habito) && resolvido(habito, registros[habito.id]?.[dia]);
}

// A rotina no relógio: cada item com horário avisa na hora dele, se ainda não foi marcado.
function avisosDaRotina(dados, dia, hoje) {
  const rotina = dados.rotinaDe(dia);
  return itensDe(rotina)
    .filter((item) => item.hora)
    .filter(
      (item) => dia !== hoje || (!dados.marcadas.has(item.id) && !habitoDoItemResolvido(item, dados, dia)),
    )
    .map((item) =>
      aviso({
        tipo: 'rotina',
        dia,
        chave: item.id,
        hora: item.hora,
        titulo: item.texto,
        corpo: `${item.hora} · ${rotina.nome}`,
      }),
    );
}

// Lembrete do hábito, na hora que ele guarda (habito.lembrete). Fica de fora o hábito que a
// rotina do dia já avisa: ligado a um item com horário, com a rotina no relógio ligada.
function avisosDosHabitos(dados, dia, hoje, rotinaAvisa) {
  const { habitos, habitoVale, registros } = dados;
  const cobertos = new Set(
    rotinaAvisa
      ? itensDe(dados.rotinaDe(dia))
          .filter((item) => item.hora && item.habitoId)
          .map((item) => item.habitoId)
      : [],
  );
  return habitos
    .filter((x) => x.lembrete && !x.arquivado && habitoVale(x, dia) && !cobertos.has(x.id))
    .filter((x) => dia !== hoje || !resolvido(x, registros[x.id]?.[dia]))
    .map((x) =>
      aviso({
        tipo: 'habito',
        dia,
        chave: x.id,
        hora: x.lembrete,
        titulo: x.nome,
        corpo: 'Hábito de hoje',
        habitoId: x.id,
        comFeito: x.tipo !== 'numero', // o numérico pede a quantidade: abre o app
      }),
    );
}

const porMomento = (a, b) => a.quando.localeCompare(b.quando);

// dados:
//   rotinaDe(dia):          a rotina que vale no dia (ou null)
//   marcadas:               Set com os ids marcados hoje na rotina de hoje
//   habitos, registros, tarefas: do estado
//   habitoVale(habito, dia): o hábito pede algo nesse dia?
// ligados: { manha, noite, rotina, habitos } (estado.avisosDoDia)
// agora: momento atual, "AAAA-MM-DDTHH:MM" local.
// Devolve os avisos que ainda não passaram, do mais próximo para o mais distante:
//   [{ id, tipo: 'manha' | 'noite' | 'rotina' | 'habito', dia, titulo, corpo, quando,
//      habitoId: id | null, comFeito: o aviso leva o botão "Feito" }]
export function planejarDoDia(dados, ligados, agora) {
  const hoje = agora.slice(0, 10);
  const semana = Array.from({ length: DIAS_DE_RESUMO }, (_, i) => somaDias(hoje, i));
  const doisDias = semana.slice(0, 2);
  const futuros = (lista) => lista.filter((x) => x && x.quando > agora).sort(porMomento);

  return [
    ...(ligados.manha ? futuros(semana.map((dia) => resumoDaManha(dados, dia))) : []),
    ...(ligados.noite ? futuros(semana.map((dia) => revisaoDaNoite(dados, dia, hoje))) : []),
    ...(ligados.rotina
      ? futuros(doisDias.flatMap((dia) => avisosDaRotina(dados, dia, hoje))).slice(0, MAXIMO_DA_ROTINA)
      : []),
    ...(ligados.habitos
      ? futuros(doisDias.flatMap((dia) => avisosDosHabitos(dados, dia, hoje, ligados.rotina))).slice(
          0,
          MAXIMO_DE_HABITOS,
        )
      : []),
  ].sort(porMomento);
}
