import { computed, type ReadonlySignal } from "@preact/signals";
import type { UserDraft } from "../../domain/model/user";
import type { CrudSession } from "../session/crud-session";
import { buildOnboardingRows } from "./crud-seed";

export interface OnboardingStore {
  needsOnboarding: ReadonlySignal<boolean>;
  complete: (draft: UserDraft) => Promise<void>;
}

/**
 * Primeiro uso é `localUserId` vazio, não "não existe user na tabela": depois
 * do sync o perfil da outra pessoa estará lá. O `ready` evita o wizard piscar
 * antes de o disco responder.
 */
export function createOnboardingStore(session: CrudSession): OnboardingStore {
  // Promise em voo, guardada na closure. Um duplo toque no botão do wizard
  // (ex. o segundo toque chega antes do primeiro `await` devolver) dispara
  // duas chamadas a `complete` antes de `localUserId` ser publicado — checar
  // só `localUserId.value !== null` não pega isso, porque as duas leituras
  // acontecem quando o signal ainda está nulo. Guardando a promise, a segunda
  // chamada devolve a mesma semeadura em vez de rodar `putRows` de novo.
  let inFlight: Promise<void> | null = null;

  async function complete(draft: UserDraft): Promise<void> {
    if (session.localUserId.value !== null) return;
    if (inFlight !== null) return inFlight;

    const { rows, meta } = buildOnboardingRows(draft, session.clock());
    // Uma transação só: falha não deixa app meio semeado, e `localUserId`
    // continua nulo, então o usuário volta ao wizard.
    inFlight = session.putRows(rows, meta).finally(() => {
      // Limpa a referência sempre, sucesso ou falha: em sucesso, `localUserId`
      // já barra uma nova semeadura pelo guard acima; em falha, uma nova
      // tentativa precisa poder rodar `putRows` de novo.
      inFlight = null;
    });
    return inFlight;
  }

  return {
    needsOnboarding: computed(
      () => session.status.value === "ready" && session.localUserId.value === null,
    ),
    complete,
  };
}
