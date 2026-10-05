import { buildRow } from "../../data/repository";
import type { RowClock } from "../../domain/clock/row-clock";
import { buildDefaultRows } from "../../domain/defaults/defaults";
import type { RowsByTable } from "../../domain/model/app-state";
import type { User, UserDraft } from "../../domain/model/user";
import { LOCAL_USER_ID_KEY, type SessionMeta } from "../session/session";

export interface OnboardingRows {
  rows: RowsByTable;
  /** Mesmo tipo de `putRows`, reaproveitado para o compilador amarrar os dois. */
  meta: SessionMeta;
}

/** Monta o lote; não grava. Quem grava é a store, numa transação só. */
export function buildOnboardingRows(draft: UserDraft, clock: RowClock): OnboardingRows {
  const user = buildRow<User>(clock, draft);
  return {
    rows: { users: [user], ...buildDefaultRows() },
    meta: { [LOCAL_USER_ID_KEY]: user.id },
  };
}
