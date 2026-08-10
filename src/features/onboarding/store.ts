import { computed, type ReadonlySignal } from "@preact/signals";
import type { UserDraft } from "../../domain/events/user";
import type { Session } from "../session/session";
import { buildOnboardingBatch } from "./seed";

export interface OnboardingStore {
  needsOnboarding: ReadonlySignal<boolean>;
  complete: (draft: UserDraft) => Promise<void>;
}

/**
 * Primeiro uso é `meta.localUserId` vazio — **não** "não existe `user` no log".
 *
 * Depois de sincronizar com outra pessoa, o perfil dela estaria no log e este
 * aparelho pularia o cadastro; todo lançamento seguinte sairia sem autor, que é
 * exatamente o cenário para o qual a cor de autor existe.
 *
 * O `status === "ready"` importa: sem ele o wizard pisca antes de o disco
 * responder, e quem já se cadastrou vê a tela de boas-vindas por um frame.
 */
export function createOnboardingStore(session: Session): OnboardingStore {
  return {
    needsOnboarding: computed(
      () => session.status.value === "ready" && session.localUserId.value === null,
    ),

    async complete(draft: UserDraft): Promise<void> {
      const { events, meta } = buildOnboardingBatch(draft, session.clock());
      // Uma escrita só, atômica. Falha não deixa nada gravado, e
      // `needsOnboarding` continua verdadeiro porque `localUserId` não mudou —
      // o usuário volta ao wizard em vez de cair num app meio semeado.
      await session.commitBatch(events, meta);
    },
  };
}
