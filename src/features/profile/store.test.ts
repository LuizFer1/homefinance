import { describe, expect, it } from "vitest";
import { type FakeEventStore, fakeEventStore } from "../../data/event-store.fake";
import { userCreated } from "../../domain/events/user";
import { findUser } from "../../domain/projections/selectors";
import { createSession, type Session } from "../session/session";
import { createProfileStore } from "./store";

const USER_ID = "01J9F3K2M7QX8YB4TVWZ0DCEHU";
const DEVICE = "01J9F3K2M7QX8YB4TVWZ0DCEHZ";
const FOTO = "data:image/webp;base64,AAAA";

function seedUser(draft: { name: string; color: "teal" | "rose"; avatar: string | null }) {
  return fakeEventStore([
    userCreated({
      eventId: "01J9F3K2M7QX8YB4TVWZ0DCEE1",
      entityId: USER_ID,
      deviceId: DEVICE,
      hlc: `1754697500000-0000-${DEVICE}`,
      draft,
    }),
  ]);
}

function newSession(events: FakeEventStore): Session {
  let millis = 1_754_697_600_000;
  return createSession({
    events,
    now: () => {
      millis += 1;
      return millis;
    },
    randomChunk: (count) => Array.from({ length: count }, (_, i) => i % 32),
  });
}

async function ready(
  events: FakeEventStore = seedUser({ name: "Luiz", color: "teal", avatar: null }),
) {
  const session = newSession(events);
  await session.init();
  return { session, profile: createProfileStore(session), events };
}

describe("createProfileStore", () => {
  it("emite user.update com o patch e atualiza a projeção", async () => {
    const { session, profile, events } = await ready();

    await profile.editProfile(USER_ID, { name: "Luís" });

    expect(events.events.at(-1)).toMatchObject({
      entity: "user",
      action: "update",
      entityId: USER_ID,
      data: { name: "Luís" },
    });
    expect(findUser(session.state.value, USER_ID)?.name).toBe("Luís");
  });

  it("patch vazio nao grava evento", async () => {
    const { profile, events } = await ready();
    const antes = events.events.length;

    await profile.editProfile(USER_ID, {});

    expect(events.events).toHaveLength(antes);
  });

  it("remocao de foto chega ao log como avatar null", async () => {
    // Sem null explicito o merge ignora o campo e a foto voltaria no proximo boot.
    const { profile, events, session } = await ready(
      seedUser({ name: "Luiz", color: "teal", avatar: FOTO }),
    );

    await profile.editProfile(USER_ID, { avatar: null });

    expect(events.events.at(-1)?.data).toEqual({ avatar: null });
    expect(findUser(session.state.value, USER_ID)?.avatar).toBeNull();
  });
});
