// Junção de duas cópias dos dados (o celular e o PC) que mudaram cada uma do seu lado, para a
// sincronia. Lógica pura, sem rede e sem relógio: quem envia, recebe e lê a hora é outra camada.
//
// O estado vira "pedaços" independentes, cada um com um caminho (texto JSON de uma lista) e o
// conteúdo em texto JSON:
//   ["item", coleção, id]          um item inteiro de rotinas, hábitos, pausas, listas ou tarefas
//   ["ordem", coleção]             a ordem dos ids da coleção (arrastar muda só este pedaço)
//   ["celula", mapa, hábito, dia]  um dia de registros ou de notasHabito
//   ["pref", chave]                cada preferência que vale nos dois aparelhos
// Cada pedaço tem um carimbo: o instante (ms) da última mudança, que o app grava ao salvar,
// comparando os pedaços de antes e de depois. Pedaço apagado some dos pedaços e fica só o
// carimbo (a lápide), para a exclusão também chegar ao outro aparelho. Na junção, por caminho,
// vence o carimbo mais novo.
//
// O que é só da tela deste aparelho (aba aberta, lista e rotina abertas) não viaja.

export const SO_DESTE_APARELHO = Object.freeze([
  'versao',
  'aba',
  'listaAtiva',
  'rotinaAtiva',
  'rotinaDoDiaEm',
]);
const COLECOES = Object.freeze(['rotinas', 'habitos', 'pausas', 'listas', 'tarefas']);
const MAPAS = Object.freeze(['registros', 'notasHabito']);
const caminho = (...partes) => JSON.stringify(partes);

// O estado (já validado) em pedaços: Map caminho -> texto JSON.
export function pedacos(estado) {
  const saida = new Map();
  for (const [chave, valor] of Object.entries(estado)) {
    if (SO_DESTE_APARELHO.includes(chave)) continue;
    if (COLECOES.includes(chave)) {
      for (const item of valor) saida.set(caminho('item', chave, item.id), JSON.stringify(item));
      saida.set(caminho('ordem', chave), JSON.stringify(valor.map((item) => item.id)));
    } else if (MAPAS.includes(chave)) {
      const celulas = Object.entries(valor).flatMap(([dono, porDia]) =>
        Object.entries(porDia).map(([dia, celula]) => [
          caminho('celula', chave, dono, dia),
          JSON.stringify(celula),
        ]),
      );
      for (const [c, conteudo] of celulas) saida.set(c, conteudo);
    } else {
      saida.set(caminho('pref', chave), JSON.stringify(valor));
    }
  }
  return saida;
}

// Carimbos depois de salvar: o pedaço que mudou, apareceu ou sumiu ganha "agora". Se o relógio do
// aparelho voltou no tempo, o carimbo novo ainda fica acima do anterior: a mudança daqui vence a
// versão que ela substituiu. "agora" fora do contrato (NaN, fração) conta como 0, como todo carimbo.
// Devolve um objeto novo.
export function carimbar(carimbos, antes, depois, agora) {
  const novos = { ...carimbos };
  const marcar = (c) => {
    novos[c] = Math.max(carimboDe(agora), carimboDe(carimbos[c]) + 1);
  };
  for (const [c, texto] of depois) if (antes.get(c) !== texto) marcar(c);
  for (const c of antes.keys()) if (!depois.has(c)) marcar(c);
  return novos;
}

// Carimbo vindo de fora: só vale inteiro seguro e não negativo; o resto conta como 0. Assim a
// comparação nunca fica indecidida (NaN não é maior nem menor que nada) nem vira texto ("5" + 1).
function carimboDe(valor) {
  return Number.isSafeInteger(valor) && valor >= 0 ? valor : 0;
}

const texto = (valor) => typeof valor === 'string' && valor !== '';

// Texto JSON lido, ou NADA se não for texto JSON (dado de fora nunca derruba a junção).
const NADA = Symbol('nada');
function lerJson(t) {
  if (typeof t !== 'string') return NADA;
  let valor = NADA;
  try {
    valor = JSON.parse(t);
  } catch {
    // não é JSON: fica NADA
  }
  return valor;
}

// Lê um caminho; devolve a lista de partes, ou null para caminho desconhecido ou malformado (dado
// de fora nunca derruba a junção).
export function lerCaminho(c) {
  const partes = lerJson(c);
  if (!Array.isArray(partes) || !partes.every(texto)) return null;
  const [tipo, nome] = partes;
  const valido =
    (tipo === 'item' && partes.length === 3 && COLECOES.includes(nome)) ||
    (tipo === 'ordem' && partes.length === 2 && COLECOES.includes(nome)) ||
    (tipo === 'celula' && partes.length === 4 && MAPAS.includes(nome)) ||
    (tipo === 'pref' && partes.length === 2 && ![...SO_DESTE_APARELHO, ...COLECOES, ...MAPAS].includes(nome));
  return valido ? partes : null;
}

// Conteúdo que não é texto conta como lápide.
function lado(copia, c) {
  const conteudo = copia.pedacos.get(c);
  return {
    carimbo: carimboDe(copia.carimbos[c]),
    texto: typeof conteudo === 'string' ? conteudo : undefined,
  };
}

// Carimbo maior vence. No empate, a lápide perde e, entre dois conteúdos, vence o maior em ordem
// de texto: os dois aparelhos chegam ao mesmo resultado sem combinar nada.
function vencedor(x, y) {
  if (x.carimbo > y.carimbo) return x;
  if (y.carimbo > x.carimbo) return y;
  if (x.texto === undefined) return y;
  if (y.texto === undefined) return x;
  return x.texto < y.texto ? y : x;
}

// Cópia vinda de fora com pedaços ou carimbos de tipo errado vale como vazia nessa parte.
const ehObjeto = (valor) => valor !== null && typeof valor === 'object';
const segura = (copia) => ({
  pedacos: copia?.pedacos instanceof Map ? copia.pedacos : new Map(),
  carimbos: ehObjeto(copia?.carimbos) ? copia.carimbos : {},
});

// Junta duas cópias { pedacos: Map, carimbos: {caminho: ms} } e devolve a cópia junta. A ordem
// dos argumentos não muda o resultado, e juntar de novo com qualquer uma das duas não muda nada.
export function mesclar(copiaA, copiaB) {
  const a = segura(copiaA);
  const b = segura(copiaB);
  const caminhos = new Set([
    ...Object.keys(a.carimbos),
    ...Object.keys(b.carimbos),
    ...a.pedacos.keys(),
    ...b.pedacos.keys(),
  ]);
  const juntos = { pedacos: new Map(), carimbos: {} };
  for (const c of [...caminhos].sort()) {
    if (!lerCaminho(c)) continue;
    const v = vencedor(lado(a, c), lado(b, c));
    juntos.carimbos[c] = v.carimbo;
    if (v.texto !== undefined) juntos.pedacos.set(c, v.texto);
  }
  return juntos;
}

// Ids na ordem guardada; os que não estão nela (item novo do outro aparelho) vão para o fim.
function emOrdem(porId, ordem) {
  const ids = Array.isArray(ordem) ? [...new Set(ordem)].filter((id) => porId.has(id)) : [];
  const naOrdem = new Set(ids);
  const fora = [...porId.keys()].filter((id) => !naOrdem.has(id)).sort();
  return [...ids, ...fora].map((id) => porId.get(id));
}

// Grava um campo cujo nome vem de fora (id, dia, preferência) como propriedade própria, mesmo
// que o nome seja "__proto__" ou "toString": nunca mexe no protótipo e nada se perde.
function por(objeto, chave, valor) {
  Object.defineProperty(objeto, chave, {
    value: valor,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

// O id do item é o do caminho, mesmo que o conteúdo diga outro.
const comId = (valor, id) => (ehObjeto(valor) && !Array.isArray(valor) ? { ...valor, id } : valor);

// Remonta o estado a partir dos pedaços; as chaves só deste aparelho vêm de "local". O resultado
// é dado de fora: passa pela validação (sanear) antes de entrar no app.
export function remontar(juntos, local) {
  const estado = {};
  const daqui = ehObjeto(local) ? local : {};
  for (const chave of SO_DESTE_APARELHO) if (Object.hasOwn(daqui, chave)) estado[chave] = daqui[chave];
  const itens = new Map(COLECOES.map((colecao) => [colecao, new Map()]));
  const ordens = new Map();
  for (const mapa of MAPAS) estado[mapa] = {};

  const fonte = juntos instanceof Map ? juntos : new Map();
  for (const [c, t] of fonte) {
    const partes = lerCaminho(c);
    const valor = partes ? lerJson(t) : NADA;
    if (valor === NADA) continue;
    const [tipo, nome, ...resto] = partes;
    if (tipo === 'item') itens.get(nome).set(resto[0], comId(valor, resto[0]));
    else if (tipo === 'ordem') ordens.set(nome, valor);
    else if (tipo === 'celula') {
      const [dono, dia] = resto;
      if (!Object.hasOwn(estado[nome], dono)) por(estado[nome], dono, {});
      por(estado[nome][dono], dia, valor);
    } else por(estado, nome, valor);
  }
  for (const colecao of COLECOES) estado[colecao] = emOrdem(itens.get(colecao), ordens.get(colecao));
  return estado;
}
