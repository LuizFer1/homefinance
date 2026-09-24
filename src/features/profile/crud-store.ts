import type { Ulid } from "../../domain/ids/ulid";
import type { User, UserDraft } from "../../domain/model/user";
import type { CrudSession } from "../session/crud-session";

/**
 * Só edita. O perfil nasce no primeiro uso e some só com "Resetar conta".
 */
export interface ProfileStore {
  editProfile: (id: Ulid, draft: UserDraft) => Promise<User>;
}

export function createProfileStore(session: CrudSession): ProfileStore {
  return {
    editProfile: (id, draft) => session.mutate("users", (repo) => repo.update(id, draft)),
  };
}
