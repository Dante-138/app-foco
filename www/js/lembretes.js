// Notificações do app: locais do Android, pelo plugin do Capacitor. Lembretes das tarefas e
// avisos do dia (resumo da manhã, revisão da noite, rotina no relógio, lembrete dos hábitos).
// No navegador o plugin não existe e este módulo não faz nada.
//
// O que deve estar agendado sai dos planos em nucleo/lembretes.js e nucleo/avisos-do-dia.js.
// Aqui o trabalho é deixar o sistema igual ao plano, mexendo só no que mudou
// (nucleo/sincronia.js), e avisar o app quando a pessoa toca numa notificação.

import { estado, marcasDeHoje } from './store.js';
import { agoraLocal } from './nucleo/datas.js';
import { valeNoDia } from './nucleo/habito-calculo.js';
import { MAXIMO_DE_LEMBRETES, planejar } from './nucleo/lembretes.js';
import { planejarDoDia } from './nucleo/avisos-do-dia.js';
import { mudancas } from './nucleo/sincronia.js';

// Tipo de notificação com o botão "Feito" (o lembrete de um hábito de sim ou não).
const TIPO_COM_FEITO = 'habito-feito';
const ACAO_FEITO = 'feito';

const plugin = () => window.Capacitor?.Plugins?.LocalNotifications ?? null;

export const lembretesDisponiveis = () => plugin() !== null;

// 'granted', 'denied' ou 'prompt' (ainda não foi perguntado). null sem o plugin.
export async function permissaoDeLembretes() {
  try {
    return (await plugin()?.checkPermissions())?.display ?? null;
  } catch {
    return null;
  }
}

export async function pedirPermissaoDeLembretes() {
  try {
    return (await plugin()?.requestPermissions())?.display ?? null;
  } catch {
    return null;
  }
}

// Pergunta pela permissão só quando ela ainda não foi respondida. Chamado quando a
// pessoa salva algo que avisa (tarefa com data, hábito com lembrete): é a hora em que o
// pedido faz sentido para ela.
export async function pedirPermissaoSeFaltar() {
  if (!estado.lembretes || !lembretesDisponiveis()) return;
  const atual = await permissaoDeLembretes();
  if (atual === 'prompt' || atual === 'prompt-with-rationale') await pedirPermissaoDeLembretes();
  agendarSincronia();
}

// O plano inteiro: tarefas e avisos do dia, sem número de notificação repetido. Os dois
// momentos são separados para dar também o plano "sem olhar o relógio" (ver aplicarPlano), e
// esse sai sem limite de quantidade: o limite é do que fica agendado, não do que continua valendo.
function planoEm(agoraDasTarefas, agoraDoDia, { semLimite = false } = {}) {
  if (!estado.lembretes) return [];
  const rotina = estado.rotinas.find((r) => r.id === estado.rotinaAtiva) ?? null;
  const maximo = semLimite ? Infinity : MAXIMO_DE_LEMBRETES;
  const dasTarefas = planejar(estado.tarefas, estado.listas, agoraDasTarefas, maximo).map((lembrete) => ({
    ...lembrete,
    tipo: 'tarefa',
    dia: lembrete.quando.slice(0, 10),
    habitoId: null,
    comFeito: false,
  }));
  const doDia = planejarDoDia(
    {
      rotinaDe: () => rotina,
      marcadas: new Set(rotina ? (marcasDeHoje()[rotina.id] ?? []) : []),
      habitos: estado.habitos,
      registros: estado.registros,
      tarefas: estado.tarefas,
      habitoVale: valeNoDia,
    },
    estado.avisosDoDia,
    agoraDoDia,
    { semLimite },
  );
  const vistos = new Set();
  return [...dasTarefas, ...doDia].filter((aviso) => {
    if (vistos.has(aviso.id)) return false;
    vistos.add(aviso.id);
    return true;
  });
}

function paraOSistema(aviso) {
  return {
    id: aviso.id,
    title: aviso.titulo,
    body: aviso.corpo,
    schedule: { at: new Date(`${aviso.quando}:00`).toISOString(), allowWhileIdle: true },
    // Alarme não exato: pode atrasar alguns minutos, mas não exige a permissão de
    // "Alarmes e lembretes" nem abre a tela dela.
    isExactNotification: false,
    // Volta para o app quando a pessoa toca na notificação (ver ligarNotificacoes).
    extra: { tipo: aviso.tipo, dia: aviso.dia, habitoId: aviso.habitoId },
    ...(aviso.comFeito ? { actionTypeId: TIPO_COM_FEITO } : {}),
  };
}

// O que esta sessão do app agendou no sistema: Map id -> assinatura (nucleo/sincronia.js).
// null enquanto não se sabe (app recém-aberto, permissão negada ou erro): a próxima
// sincronização limpa os pendentes e agenda tudo de novo. Só as duas funções abaixo mexem nele.
let aplicado = null;
const guardarAplicado = (mapa) => {
  aplicado = mapa;
};
const esquecerAplicado = () => {
  aplicado = null;
};

const comoIds = (ids) => ({ notifications: ids.map((id) => ({ id })) });

async function aplicarPlano() {
  const notificacoes = plugin();
  if (!notificacoes) return;
  const agora = agoraLocal();
  const plano = planoEm(agora, agora);
  // O mesmo plano sem olhar o relógio: o aviso que só passou da hora continua na tela do
  // celular; o que foi resolvido (tarefa concluída, hábito marcado) é cancelado e some.
  // Sem limite: com muitas tarefas atrasadas, o corte dos 60 mais antigos tiraria daqui o
  // aviso entregue hoje, e ele seria cancelado sem a tarefa ter sido resolvida.
  const inicioDoDia = `${agora.slice(0, 10)}T00:00`;
  const vivos = new Set(planoEm('', inicioDoDia, { semLimite: true }).map((aviso) => aviso.id));
  try {
    // Sem permissão não agenda, e também não pede: o pedido tem hora certa (ver acima).
    if ((await notificacoes.checkPermissions()).display !== 'granted') {
      esquecerAplicado();
      return;
    }
    let base = aplicado;
    if (!base) {
      const { notifications: pendentes } = await notificacoes.getPending();
      if (pendentes.length) await notificacoes.cancel(comoIds(pendentes.map(({ id }) => id)));
      base = new Map();
    }
    const { cancelar, agendar, aplicado: proximo } = mudancas(base, plano, vivos);
    if (cancelar.length) await notificacoes.cancel(comoIds(cancelar));
    if (agendar.length) await notificacoes.schedule({ notifications: agendar.map(paraOSistema) });
    guardarAplicado(proximo);
  } catch (erro) {
    esquecerAplicado(); // tenta de novo, do zero, na próxima mudança
    console.warn('Lembretes: não foi possível agendar', erro);
  }
}

// Uma sincronização de cada vez: a seguinte espera a anterior terminar.
let fila = Promise.resolve();
export function sincronizarLembretes() {
  fila = fila.then(aplicarPlano);
  return fila;
}

// As mudanças vêm em rajada (cada toque salva): espera um instante e sincroniza uma vez.
let espera = null;
export function agendarSincronia() {
  clearTimeout(espera);
  espera = setTimeout(sincronizarLembretes, 1200);
}

// Registra o botão "Feito" e passa para o app o toque em uma notificação, pelo evento
// 'foco:notificacao': { feito, tipo, dia, habitoId }. Quem decide o que fazer é js/app.js.
// Chamar depois de o app estar ouvindo o evento: o sistema entrega na hora o toque que abriu o app.
export async function ligarNotificacoes() {
  const notificacoes = plugin();
  if (!notificacoes) return;
  try {
    await notificacoes.registerActionTypes({
      types: [{ id: TIPO_COM_FEITO, actions: [{ id: ACAO_FEITO, title: 'Feito' }] }],
    });
    await notificacoes.addListener('localNotificationActionPerformed', ({ actionId, notification }) => {
      const { tipo = 'tarefa', dia = null, habitoId = null } = notification?.extra ?? {};
      document.dispatchEvent(
        new CustomEvent('foco:notificacao', {
          detail: { feito: actionId === ACAO_FEITO, tipo, dia, habitoId },
        }),
      );
    });
  } catch (erro) {
    console.warn('Lembretes: não foi possível ligar as ações das notificações', erro);
  }
}
