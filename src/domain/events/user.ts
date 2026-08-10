import type { Ulid } from "../ids/ulid";
import type { ColorToken, Envelope } from "./reference";
import { referenceEvent } from "./reference";
import type { DomainEvent } from "./types";

/**
 * Sem e-mail, sem senha, sem conta. O README é explícito: nenhum serviço externo,
 * nenhuma conta obrigatória. Perfil aqui é rótulo de autoria, não identidade
 * autenticada — a cor existe para diferenciar quem lançou depois que o sync
 * existir e duas pessoas dividirem a mesma base.
 */
export interface UserProfile {
  id: Ulid;
  name: string;
  color: ColorToken;
  /**
   * Data URI da foto, ou `null`. Nulo é valor de primeira classe, não estado
   * transitório: sem foto o avatar são as iniciais sobre a cor, e esse é o
   * fallback permanente do produto.
   *
   * A foto mora **no evento** porque o perfil precisa sincronizar: ela chega ao
   * aparelho da outra pessoa sem uma linha de sync a mais e sobrevive ao backup.
   * O preço, aceito conscientemente, é que cada troca acrescenta ~6kb ao log
   * para sempre — o `create` original continua lá, como todo evento. O teto de
   * bytes vive em `features/profile/avatar.ts`, e é o que torna esse preço
   * limitado.
   */
  avatar: string | null;
}

/**
 * Forma alargada do agregado, para leitura.
 *
 * Existe pelo mesmo motivo que `CategoryLike`: a projeção guarda `color` como
 * `string` de propósito, para que um token desconhecido vindo de uma versão mais
 * nova sobreviva ao fold. Estreitar aqui obrigaria um cast em toda leitura da
 * projeção.
 */
export interface UserLike {
  name: string;
  color: string;
  avatar: string | null;
}

export type UserDraft = Omit<UserProfile, "id">;
export type UserPatch = Partial<UserDraft>;

export function userCreated(args: Envelope & { draft: UserDraft }): DomainEvent {
  return referenceEvent(args, "user", "create", {
    name: args.draft.name,
    color: args.draft.color,
    avatar: args.draft.avatar,
  });
}

export function userUpdated(args: Envelope & { patch: UserPatch }): DomainEvent {
  return referenceEvent(args, "user", "update", { ...args.patch });
}

/**
 * Não existe `userDeleted`. Apagar o próprio perfil não é oferecido em lugar
 * nenhum do produto: `localUserId` apontaria para um registro deletado e todo
 * lançamento novo nasceria órfão. Quem quer recomeçar usa "Resetar conta", que
 * apaga o aparelho inteiro. Um construtor sem chamador seria um convite.
 */
export function diffUser(current: UserLike, next: UserDraft): UserPatch {
  const patch: UserPatch = {};
  if (current.name !== next.name) patch.name = next.name;
  if (current.color !== next.color) patch.color = next.color;
  // Precisa estar aqui para a remoção da foto chegar ao log. `mergeFields` usa
  // `field in data`, então `null` explícito é aplicado e ausente é ignorado:
  // sem esta comparação, remover a foto não sairia daqui e ela voltaria no
  // próximo boot.
  if (current.avatar !== next.avatar) patch.avatar = next.avatar;
  return patch;
}
