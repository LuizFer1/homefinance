/** `beforeinstallprompt` ainda nao esta no lib.dom do TypeScript. */
export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallResult = "accepted" | "dismissed" | "manual";

/**
 * Guarda o `beforeinstallprompt` ate o usuario pedir para instalar.
 *
 * O navegador so aceita `prompt()` dentro de um gesto do usuario e uma unica vez
 * por evento — por isso o evento e descartado ao ser usado. "manual" e a
 * resposta para tudo que nao tem prompt: iPhone (o Safari nunca dispara o
 * evento), Firefox, prompt ja consumido ou recusado pelo navegador. A pagina
 * mostra o passo a passo nesses casos, em vez de um botao que nao faz nada.
 */
export function createInstallFlow() {
  let deferred: InstallPromptEvent | null = null;

  return {
    capture(event: InstallPromptEvent) {
      // Sem isto o Chrome mostra o proprio mini-infobar por cima da landing,
      // antes de a pessoa ver o convite do cafe.
      event.preventDefault();
      deferred = event;
    },

    canPrompt(): boolean {
      return deferred !== null;
    },

    async install(): Promise<InstallResult> {
      const event = deferred;
      if (!event) return "manual";
      deferred = null;
      try {
        await event.prompt();
        const { outcome } = await event.userChoice;
        return outcome;
      } catch {
        return "manual";
      }
    },
  };
}
