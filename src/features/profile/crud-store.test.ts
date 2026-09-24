import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CrudDb } from "../../data/crud-db";
import { openTestDb, testSessionDeps } from "../../data/test-db.fake";
import { createOnboardingStore } from "../onboarding/crud-store";
import { type CrudSession, createCrudSession } from "../session/crud-session";
import { createProfileStore } from "./crud-store";

const LUIZ = { name: "Luiz", color: "teal", avatar: "data:image/webp;base64,AAAA" } as const;

let db: CrudDb;
let session: CrudSession;
let userId: string;

beforeEach(async () => {
  db = openTestDb();
  session = createCrudSession(testSessionDeps(db));
  await session.init();
  await createOnboardingStore(session).complete(LUIZ);
  userId = session.localUserId.value ?? "";
});

afterEach(async () => {
  await db.delete();
});

describe("createProfileStore (CRUD)", () => {
  it("editProfile troca nome e cor", async () => {
    await createProfileStore(session).editProfile(userId, {
      ...LUIZ,
      name: "Luiz F",
      color: "sky",
    });
    expect(session.state.value.users[userId]).toMatchObject({ name: "Luiz F", color: "sky" });
    expect((await db.users.get(userId))?.name).toBe("Luiz F");
  });

  it("editProfile com avatar null remove a foto", async () => {
    await createProfileStore(session).editProfile(userId, { ...LUIZ, avatar: null });
    expect((await db.users.get(userId))?.avatar).toBeNull();
  });
});
