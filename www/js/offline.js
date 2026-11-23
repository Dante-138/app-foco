// O app publicado no navegador (GitHub Pages) guarda os próprios arquivos para abrir sem rede,
// pelo service worker www/sw.js. Só o build carimbado registra: no servidor de desenvolvimento o
// código muda a toda hora, e no APK os arquivos já estão dentro do app.

import { BUILD } from './build-info.js';

// O APK serve o app em https://localhost (padrão do Capacitor no Android).
const noApk = () =>
  window.Capacitor?.isNativePlatform?.() === true || location.origin === 'https://localhost';

// Sem service worker o app funciona igual, só não abre sem rede: nenhuma falha daqui (política
// recusada, registro negado) interrompe a abertura do app.
export function registrarOffline() {
  if (!BUILD.commit || noApk() || !('serviceWorker' in navigator)) return;
  try {
    // A política de segurança (Trusted Types) só aceita o endereço do service worker por esta
    // política, e ela só aceita o arquivo do próprio app.
    const politica = window.trustedTypes?.createPolicy('foco-sw', {
      createScriptURL: (endereco) => {
        if (endereco !== 'sw.js') throw new TypeError(`Service worker inesperado: ${endereco}`);
        return endereco;
      },
    });
    navigator.serviceWorker.register(politica?.createScriptURL('sw.js') ?? 'sw.js').catch(() => {});
  } catch {
    // segue sem abrir offline
  }
}
