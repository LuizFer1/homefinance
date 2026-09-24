import type { BaseRow, Draft } from "./base";
import type { ColorToken } from "./tokens";

/**
 * Rótulo de autoria, não identidade autenticada. Não existe exclusão de perfil:
 * `localUserId` apontaria para uma linha apagada e todo lançamento novo nasceria
 * órfão. Quem quer recomeçar usa "Resetar conta".
 */
export interface User extends BaseRow {
  name: string;
  color: ColorToken;
  /** Data URI da foto, ou null (iniciais sobre a cor). */
  avatar: string | null;
}

export type UserDraft = Draft<User>;
