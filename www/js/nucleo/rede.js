// Rede do app: para onde ele pode ligar e o que fica guardado da agenda e do clima.
// Lógica pura. Quem faz as chamadas é js/agenda.js; quem lê e grava o texto é js/store.js.
//
// Os dados daqui ficam numa chave própria do armazenamento, fora do estado versionado
// (nucleo/esquema.js) e fora do backup em texto: o link secreto de um calendário dá acesso
// a ele, então nunca sai do aparelho. Formato:
//
// rede = {
//   clima:       verdadeiro busca o clima (padrão: falso; nada é pedido à rede sem ligar)
//   calendarios: [{ id, nome, url }]   (até MAXIMO_DE_CALENDARIOS; url aprovada por destinoPermitido)
//   cache: {
//     agenda: { em: instante da última leitura completa (ms; 0 = nunca),
//               eventos: [{ calendarioId, titulo, dia: 'AAAA-MM-DD', hora: 'HH:MM' | null }] },
//     clima:  { em, dados: formato de nucleo/clima.js | null },
//   },
// }

import { dataValida, horaValida } from './datas.js';
import { ehObjeto } from './esquema.js';
import { sanearClima } from './clima.js';

// ---------------------------------------------------------------- destinos

export const HOSTS_PERMITIDOS = Object.freeze(['api.open-meteo.com', 'calendar.google.com']);
export const SUFIXO_PERMITIDO = '.blackboard.com'; // o Blackboard de cada instituição
const TAMANHO_DA_URL = 2000;

// Só "https://host" seguido de "/" ou do fim. O host tem apenas letras, números, hífen e ponto;
// o resto, só os caracteres comuns de caminho e consulta. Ficam de fora, por construção:
// usuário e senha ("@"), porta, "#", "\", espaço e caractere de controle. A regra é sobre o
// texto exato que vai para o plugin nativo, que não lê endereços como o navegador: com essa
// forma, os dois enxergam o mesmo host.
const FORMATO_URL = /^https:\/\/([a-z0-9.-]+)(?:\/[a-z0-9\-._~%!$&'()*+,;=:/?]*)?$/i;

// Host do endereço, em minúsculas, ou null quando ele não tem a forma aceita.
export function hostDe(url) {
  if (typeof url !== 'string' || url.length > TAMANHO_DA_URL) return null;
  const host = FORMATO_URL.exec(url)?.[1].toLowerCase();
  if (!host) return null;
  const rotulos = host.split('.');
  return rotulos.every((r) => r !== '' && !r.startsWith('-') && !r.endsWith('-')) ? host : null;
}

// A lista de destinos do app. Toda chamada de rede passa por aqui antes de sair.
export function destinoPermitido(url) {
  const host = hostDe(url);
  return host !== null && (HOSTS_PERMITIDOS.includes(host) || host.endsWith(SUFIXO_PERMITIDO));
}

const REDIRECIONAMENTOS = [301, 302, 303, 307, 308];

// O app não deixa o sistema seguir redirecionamento sozinho: o destino novo também tem de estar
// na lista. Devolve o endereço para onde a resposta manda, se for permitido, ou null.
// Aceita Location completo ("https://...") ou só com o caminho ("/novo"), no mesmo host.
export function destinoDoRedirecionamento(resposta, origem) {
  if (!REDIRECIONAMENTOS.includes(resposta?.status) || !ehObjeto(resposta.headers)) return null;
  const chave = Object.keys(resposta.headers).find((nome) => nome.toLowerCase() === 'location');
  const para = resposta.headers[chave];
  if (typeof para !== 'string') return null;
  const destino = para.startsWith('/') && !para.startsWith('//') ? `https://${hostDe(origem)}${para}` : para;
  return destinoPermitido(destino) ? destino : null;
}

// ----------------------------------------------------------------- formato

export const MAXIMO_DE_CALENDARIOS = 5;
export const EVENTOS_POR_CALENDARIO = 100;
export const LIMITES_DA_REDE = Object.freeze({ id: 64, nomeCalendario: 40, tituloEvento: 200 });

export const VALIDADE_DA_AGENDA_MS = 30 * 60_000;
export const VALIDADE_DO_CLIMA_MS = 60 * 60_000;

export function redeInicial() {
  return {
    clima: false,
    calendarios: [],
    cache: { agenda: { em: 0, eventos: [] }, clima: { em: 0, dados: null } },
  };
}

const textoCurto = (valor, limite) => (typeof valor === 'string' ? valor.trim().slice(0, limite).trim() : '');
const idValido = (valor) =>
  typeof valor === 'string' && valor.length > 0 && valor.length <= LIMITES_DA_REDE.id;
const instante = (valor) => (typeof valor === 'number' && Number.isFinite(valor) && valor > 0 ? valor : 0);

function sanearCalendarios(valor) {
  const vistos = new Set();
  const calendarios = [];
  for (const entrada of Array.isArray(valor) ? valor : []) {
    const nome = textoCurto(entrada?.nome, LIMITES_DA_REDE.nomeCalendario);
    if (!idValido(entrada?.id) || vistos.has(entrada.id) || !nome || !destinoPermitido(entrada.url)) continue;
    vistos.add(entrada.id);
    calendarios.push({ id: entrada.id, nome, url: entrada.url });
  }
  return calendarios.slice(0, MAXIMO_DE_CALENDARIOS);
}

// Evento de calendário que não existe mais é descartado junto com os malformados.
function sanearEventos(valor, calendarios) {
  const ids = new Set(calendarios.map((calendario) => calendario.id));
  const eventos = [];
  for (const entrada of Array.isArray(valor) ? valor : []) {
    const titulo = textoCurto(entrada?.titulo, LIMITES_DA_REDE.tituloEvento);
    const hora = entrada?.hora ?? null;
    if (!ids.has(entrada?.calendarioId) || !titulo || !dataValida(entrada.dia)) continue;
    if (hora !== null && !horaValida(hora)) continue;
    eventos.push({ calendarioId: entrada.calendarioId, titulo, dia: entrada.dia, hora });
  }
  return eventos.slice(0, MAXIMO_DE_CALENDARIOS * EVENTOS_POR_CALENDARIO);
}

// Recebe o que estava guardado (origem não confiável) e devolve sempre o formato acima.
// O que vier inválido é descartado, sem aviso: o cache se refaz na próxima leitura.
export function sanearRede(valor) {
  const dados = ehObjeto(valor) ? valor : {};
  const cache = ehObjeto(dados.cache) ? dados.cache : {};
  const calendarios = sanearCalendarios(dados.calendarios);
  const eventos = sanearEventos(cache.agenda?.eventos, calendarios);
  const clima = sanearClima(cache.clima?.dados);
  return {
    clima: dados.clima === true,
    calendarios,
    cache: {
      agenda: { em: calendarios.length ? instante(cache.agenda?.em) : 0, eventos },
      clima: { em: clima ? instante(cache.clima.em) : 0, dados: clima },
    },
  };
}

// bruto: o texto lido do armazenamento (null quando não há nada).
export function lerRedeSalva(bruto) {
  try {
    return sanearRede(JSON.parse(bruto));
  } catch {
    return redeInicial();
  }
}

// O cache venceu? Também vale como vencido o que nunca foi lido e o instante no futuro
// (o relógio do aparelho foi atrasado depois da leitura).
export const vencido = (em, agora, validade) => em <= 0 || em > agora || agora - em >= validade;

// -------------------------------------------------------------- calendários

export const RECUSA = Object.freeze({
  SEM_NOME: 'sem-nome',
  LINK_RECUSADO: 'link-recusado', // fora da lista de destinos, ou nem é um endereço https
  REPETIDO: 'repetido',
  LIMITE: 'limite',
});

// Confere o que foi digitado no formulário de calendário. Devolve
// { calendario: { nome, url } } pronto para receber um id, ou { recusa: um valor de RECUSA }.
export function conferirCalendario(calendarios, nome, url) {
  const calendario = {
    nome: textoCurto(nome, LIMITES_DA_REDE.nomeCalendario),
    url: typeof url === 'string' ? url.trim() : '',
  };
  if (!calendario.nome) return { recusa: RECUSA.SEM_NOME };
  if (!destinoPermitido(calendario.url)) return { recusa: RECUSA.LINK_RECUSADO };
  if (calendarios.some((existente) => existente.url === calendario.url)) return { recusa: RECUSA.REPETIDO };
  if (calendarios.length >= MAXIMO_DE_CALENDARIOS) return { recusa: RECUSA.LIMITE };
  return { calendario };
}
