import { isIsoDate, isPositiveMinor, MAX_NAME } from "../../domain/business/rules";
import type { Ulid } from "../../domain/ids/ulid";
import { ASSET_KINDS, type Asset, type AssetKind } from "../../domain/model/asset";
import { isAlive } from "../../domain/model/base";
import { describeError, type Session } from "../session/session";

export interface AssetInput {
  kind: AssetKind;
  name: string;
  /** Valor atual em centavos. */
  valueMinor: number;
  /** 'YYYY-MM-DD'. */
  acquiredOn: string;
}

/**
 * Bens do negócio (investimento, estoque, equipamento). Nunca são lançamentos: não
 * entram em receita nem despesa. Só a conta comercial os enxerga e grava.
 */
export interface AssetsStore {
  create: (input: AssetInput) => Promise<Asset>;
  edit: (id: Ulid, input: AssetInput) => Promise<Asset>;
  remove: (id: Ulid) => Promise<Asset>;
}

/** Guarda para qualquer chamador, não só o sheet: o log é eterno e o hub soma o que chegar. */
function cleanInput(input: AssetInput): AssetInput {
  const name = input.name.trim();
  if (name === "") throw new Error("Dê um nome ao bem.");
  if (name.length > MAX_NAME) throw new Error(`O nome aceita até ${MAX_NAME} caracteres.`);
  if (!ASSET_KINDS.includes(input.kind)) throw new Error("Escolha o tipo do bem.");
  if (!isPositiveMinor(input.valueMinor)) throw new Error("Valor inválido.");
  if (!isIsoDate(input.acquiredOn)) throw new Error("Data inválida.");
  return { kind: input.kind, name, valueMinor: input.valueMinor, acquiredOn: input.acquiredOn };
}

export function createAssetsStore(session: Session): AssetsStore {
  /** Toda falha preenche `session.error` e relança, inclusive a validação anterior à escrita. */
  async function guarded<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (cause) {
      session.error.value = describeError(cause);
      throw cause;
    }
  }

  /**
   * `mutate` carimba a conta **ativa**: na pessoal o bem nasceria pessoal, e nenhuma
   * tela o mostraria. Recusar aqui evita a linha órfã.
   */
  function assertBusiness(): void {
    if (session.activeBook.value !== "business") {
      throw new Error("Bens só existem na conta comercial.");
    }
  }

  /** Lido da visão da conta ativa: um id da outra conta não existe para esta store. */
  function aliveAsset(id: Ulid): Asset {
    const asset = session.state.value.assets[id];
    if (!isAlive(asset)) throw new Error("Bem não existe.");
    return asset;
  }

  return {
    create: (input) =>
      guarded(async () => {
        assertBusiness();
        const draft = cleanInput(input);
        return session.mutate("assets", (repo) => repo.create(draft));
      }),

    edit: (id, input) =>
      guarded(async () => {
        assertBusiness();
        aliveAsset(id);
        const draft = cleanInput(input);
        return session.mutate("assets", (repo) => repo.update(id, { ...draft }));
      }),

    remove: (id) =>
      guarded(async () => {
        assertBusiness();
        aliveAsset(id);
        return session.mutate("assets", (repo) => repo.remove(id));
      }),
  };
}
