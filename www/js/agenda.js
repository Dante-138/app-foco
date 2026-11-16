// Agenda (iCal) e clima do Painel.
//
// A rede passa só pelo plugin nativo de HTTP do Capacitor (CapacitorHttp), nunca por fetch: os
// calendários não mandam cabeçalho de CORS, e a política de segurança da página continua sem
// nenhuma conexão liberada. No navegador o plugin não existe e este módulo não pede nada.
//
// Toda chamada confere antes a lista de destinos (nucleo/rede.js). O plugin não segue
// redirecionamento sozinho: cada endereço novo passa pela mesma lista. O endereço de um
// calendário é segredo, então nunca vai para o console nem volta para a tela.
//
// O que fica guardado (links, interruptor do clima e cache) está numa chave própria do
// armazenamento, com o formato descrito em nucleo/rede.js.

import { estado, gravarRede, lerRede } from './store.js';
import { hoje } from './nucleo/datas.js';
import { uid } from './nucleo/ids.js';
import {
  VALIDADE_DA_AGENDA_MS,
  VALIDADE_DO_CLIMA_MS,
  conferirCalendario,
  destinoDoRedirecionamento,
  destinoPermitido,
  hostDe,
  vencido,
} from './nucleo/rede.js';
import { lerClima, linhaDoClima, urlDoClima } from './nucleo/clima.js';
import { agendaDoDia, eventosDoCalendario, trocarEventos } from './nucleo/agenda.js';
import { redesenhar } from './ui.js';

const ESPERA_MS = 15_000; // para conectar e para cada trecho da resposta
const SALTOS = 3; // redirecionamentos seguidos, no máximo
const TAMANHO_MAXIMO = 5_000_000; // caracteres de um calendário; acima disso não é lido
// A temperatura "agora" só aparece enquanto a leitura é recente; a previsão do dia vale o dia todo.
const ATUAL_VALE_MS = 2 * VALIDADE_DO_CLIMA_MS;

const plugin = () => window.Capacitor?.Plugins?.CapacitorHttp ?? null;

export const redeDisponivel = () => plugin() !== null;

const rede = lerRede();

const redesenharPainel = () => {
  if (estado.aba === 'painel') redesenhar();
};

// ------------------------------------------------------------------- rede

// GET em um destino da lista. Devolve o corpo: texto, ou objeto quando a resposta é JSON
// (o plugin já entrega o JSON lido). Qualquer outra coisa que não seja resposta 200 é erro.
async function buscar(url) {
  let destino = url;
  for (let salto = 0; salto <= SALTOS; salto += 1) {
    if (!destinoPermitido(destino)) throw new Error('destino fora da lista');
    const resposta = await plugin().get({
      url: destino,
      responseType: 'text',
      disableRedirects: true,
      connectTimeout: ESPERA_MS,
      readTimeout: ESPERA_MS,
    });
    if (resposta?.status === 200) return resposta.data;
    destino = destinoDoRedirecionamento(resposta, destino);
  }
  throw new Error('redirecionamentos demais');
}

// Os eventos da semana de um calendário, ou null quando não deu para ler (sem rede, resposta
// que não é calendário): aí continua valendo o que já estava guardado.
async function lerCalendario({ id, url }, dia) {
  try {
    const texto = await buscar(url);
    if (typeof texto === 'string' && texto.length > TAMANHO_MAXIMO) return null;
    return eventosDoCalendario(texto, id, dia);
  } catch {
    return null;
  }
}

async function lerClimaDaRede() {
  try {
    return lerClima(await buscar(urlDoClima()));
  } catch {
    return null;
  }
}

// Guarda o que uma rodada leu. calendarios: [{ id, eventos | null }]; clima: dados | null.
function guardarLeitura({ calendarios, clima }, agora) {
  const lidos = new Map(calendarios.map(({ id, eventos }) => [id, eventos]));
  let mudou = false;

  // Os calendários de agora: um pode ter entrado ou saído enquanto a leitura corria.
  for (const { id } of rede.calendarios) {
    const eventos = lidos.get(id);
    if (!eventos) continue;
    rede.cache.agenda.eventos = trocarEventos(rede.cache.agenda.eventos, id, eventos);
    mudou = true;
  }
  // A leitura só conta como completa com todos os calendários lidos; faltando algum, a
  // próxima abertura do app tenta de novo.
  if (mudou && rede.calendarios.every(({ id }) => lidos.get(id))) rede.cache.agenda.em = agora;

  if (clima && rede.clima) {
    rede.cache.clima = { em: agora, dados: clima };
    mudou = true;
  }

  if (!mudou) return;
  gravarRede(rede);
  redesenharPainel();
}

// Uma rodada: lê de novo o que venceu (agenda, 30 minutos; clima, 60). Sem clima ligado e
// sem calendário, não pede nada à rede.
async function rodada() {
  if (!redeDisponivel()) return;
  const agora = Date.now();
  const querAgenda =
    rede.calendarios.length > 0 && vencido(rede.cache.agenda.em, agora, VALIDADE_DA_AGENDA_MS);
  const querClima = rede.clima && vencido(rede.cache.clima.em, agora, VALIDADE_DO_CLIMA_MS);
  if (!querAgenda && !querClima) return;

  const dia = hoje();
  const lerTodos = () =>
    Promise.all(
      rede.calendarios.map(async ({ id, url }) => ({ id, eventos: await lerCalendario({ id, url }, dia) })),
    );
  const [calendarios, clima] = await Promise.all([
    querAgenda ? lerTodos() : [],
    querClima ? lerClimaDaRede() : null,
  ]);

  // Falha de rede não é erro do app: o cache continua valendo. O aviso não leva o endereço.
  if (calendarios.some(({ eventos }) => !eventos)) console.warn('Agenda: não foi possível ler um calendário');
  if (querClima && !clima) console.warn('Clima: não foi possível atualizar');
  guardarLeitura({ calendarios, clima }, agora);
}

// As rodadas correm uma de cada vez. Chamado ao abrir o app, ao voltar para ele e quando
// algo muda em Ajustes; quando nada venceu, a rodada termina sem pedir nada.
let fila = Promise.resolve();
export function atualizarAgendaEClima() {
  fila = fila.then(rodada).catch((erro) => console.warn('Agenda e clima: falha inesperada', erro?.name));
  return fila;
}

// ---------------------------------------------------------------- ajustes

export const climaLigado = () => rede.clima;

// Para a tela: do endereço, só o host.
export const calendarios = () =>
  rede.calendarios.map(({ id, nome, url }) => ({ id, nome, host: hostDe(url) }));

export function definirClima(ligado) {
  rede.clima = ligado;
  if (!ligado) rede.cache.clima = { em: 0, dados: null };
  gravarRede(rede);
  redesenharPainel();
  atualizarAgendaEClima();
}

// Devolve null quando o calendário entrou, ou o motivo da recusa (RECUSA, em nucleo/rede.js).
export function adicionarCalendario(nome, url) {
  const { calendario, recusa } = conferirCalendario(rede.calendarios, nome, url);
  if (recusa) return recusa;
  rede.calendarios.push({ id: uid(), ...calendario });
  rede.cache.agenda.em = 0; // vencido: a próxima rodada lê de novo, agora com o calendário novo
  gravarRede(rede);
  atualizarAgendaEClima();
  return null;
}

export function removerCalendario(id) {
  rede.calendarios = rede.calendarios.filter((calendario) => calendario.id !== id);
  rede.cache.agenda.eventos = trocarEventos(rede.cache.agenda.eventos, id, []);
  if (!rede.calendarios.length) rede.cache.agenda.em = 0;
  gravarRede(rede);
  redesenharPainel();
}

// ----------------------------------------------------------------- painel

// O que o Painel mostra: a linha do clima (ou null) e a agenda de hoje e de amanhã.
export function agendaEClimaDoDia() {
  const dia = hoje();
  const { em, dados } = rede.cache.clima;
  return {
    clima: rede.clima ? linhaDoClima(dados, dia, !vencido(em, Date.now(), ATUAL_VALE_MS)) : null,
    agenda: agendaDoDia(rede.cache.agenda.eventos, rede.calendarios, dia),
  };
}
