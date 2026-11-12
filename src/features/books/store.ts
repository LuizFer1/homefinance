import { computed, type ReadonlySignal } from "@preact/signals";
import type { BookAccount } from "../../domain/model/book-account";
import { findBusinessBook } from "../../domain/model/book-account";
import type { Session } from "../session/session";
import { type BusinessDraft, buildBusinessAccountRows } from "./seed";

export interface BooksStore {
  /** A conta comercial viva, ou nulo: decide se o botão de troca abre o assistente. */
  business: ReadonlySignal<BookAccount | null>;
  /**
   * Cria a conta comercial (linha, categorias e formas de pagamento numa transação
   * só) e a ativa. Idempotente: se a conta já existe (outro aparelho criou, ou um
   * toque duplo), só ativa. Rejeita sem gravar nada se o banco falhar.
   */
  createBusiness: (draft: BusinessDraft) => Promise<void>;
  /**
   * `activeBook` comercial sem linha `books` viva (removida, ou meta de uma conta
   * que este aparelho não tem) volta para a pessoal. Sem isto a tela abriria numa
   * conta vazia, sem botão que explique onde a pessoa está.
   */
  repairActiveBook: () => Promise<void>;
}

export function createBooksStore(session: Session): BooksStore {
  const business = computed(() => findBusinessBook(session.fullState.value));
  // Pelo mesmo motivo do onboarding: dois toques antes de o primeiro gravar não
  // podem rodar `putRows` duas vezes.
  let inFlight: Promise<void> | null = null;

  async function createBusiness(draft: BusinessDraft): Promise<void> {
    if (inFlight !== null) return inFlight;
    if (business.value !== null) return session.setActiveBook("business");
    if (draft.name.trim() === "") throw new Error("Informe o nome do negócio.");

    const rows = buildBusinessAccountRows(draft, session.clock(), session.fullState.value);
    inFlight = session
      .putRows(rows)
      // Só depois de gravar: se a ativação falhar, a conta já existe e o botão
      // de troca a leva para lá. Ativar antes deixaria a pessoa numa conta sem linha.
      .then(() => session.setActiveBook("business"))
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  async function repairActiveBook(): Promise<void> {
    if (session.status.value !== "ready") return;
    if (session.activeBook.value === "business" && business.value === null) {
      await session.setActiveBook("personal");
    }
  }

  return { business, createBusiness, repairActiveBook };
}
