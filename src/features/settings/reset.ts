export interface ResetDeps {
  /** O `HomeFinanceDb` da aplicação. Só o `delete` importa aqui. */
  db: { delete: () => Promise<void> };
  /** `window.caches`, ausente onde o navegador não o expõe. */
  caches?: { keys: () => Promise<string[]>; delete: (key: string) => Promise<boolean> };
  /** `navigator.serviceWorker`. Ausente hoje: Workbox não está instalado. */
  serviceWorker?: { getRegistrations: () => Promise<readonly { unregister: () => unknown }[]> };
  reload: () => void;
}

/**
 * Ação mais destrutiva do app: a única sem desfazer, porque o log apagado não
 * volta de lugar nenhum.
 *
 * Limpa as **três** camadas que o navegador guarda. Apagar só o IndexedDB
 * deixaria o app carregando de um cache que espera dados que não existem mais.
 * Hoje as duas camadas de service worker são no-op — Workbox não está instalado
 * —, e entram assim mesmo: escritas depois, na fatia de PWA, seriam fáceis de
 * esquecer, e o sintoma não se parece com a causa.
 *
 * A recarga é o que garante que toda store reconstrua de um log vazio. Remendar
 * os sinais em memória para simular o estado inicial seria uma segunda
 * implementação do boot, divergindo da primeira em silêncio. Entra injetada,
 * senão o teste recarrega o runner.
 */
export async function resetDevice(deps: ResetDeps): Promise<void> {
  // Primeiro o que precisa dar certo. Se isto rejeitar, a função rejeita e o
  // usuário vê o erro em vez de um app que diz ter apagado e não apagou.
  await deps.db.delete();

  // Daqui para baixo é melhor esforço: um cache que não limpa é um incômodo;
  // um banco que não apaga seria a ação inteira falhando em silêncio.
  try {
    const caches = deps.caches;
    if (caches !== undefined) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // Sem cache limpo, mas o dado já foi.
  }

  try {
    if (deps.serviceWorker !== undefined) {
      const registrations = await deps.serviceWorker.getRegistrations();
      for (const registration of registrations) registration.unregister();
    }
  } catch {
    // Idem: o registro sobrevive, o dado não.
  }

  deps.reload();
}
