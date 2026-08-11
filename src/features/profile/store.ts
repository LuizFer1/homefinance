import { type UserPatch, userUpdated } from "../../domain/events/user";
import type { Ulid } from "../../domain/ids/ulid";
import type { Session } from "../session/session";

export interface ProfileStore {
  editProfile: (entityId: Ulid, patch: UserPatch) => Promise<void>;
}

/** Patch vazio não vira evento: um log append-only não merece lixo permanente. */
function isEmpty(patch: object): boolean {
  return Object.keys(patch).length === 0;
}

/**
 * Porta de escrita do perfil local.
 *
 * Não cria nem apaga: o perfil nasce no wizard de primeiro uso e some só com
 * "Resetar conta". Um `user.delete` deixaria `localUserId` apontando para um
 * registro morto e todo lançamento novo nasceria órfão.
 */
export function createProfileStore(session: Session): ProfileStore {
  return {
    async editProfile(entityId: Ulid, patch: UserPatch): Promise<void> {
      if (isEmpty(patch)) return;
      await session.commit(userUpdated({ ...session.clock().envelope(entityId), patch }));
    },
  };
}
