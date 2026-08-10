import { describe, expect, it } from "vitest";
import { type FakeEventStore, fakeEventStore } from "../../data/event-store.fake";
import type { DomainEvent } from "../../domain/events/types";
import { userCreated } from "../../domain/events/user";
import { createSession, LOCAL_USER_ID_KEY, type Session } from "./session";

const DEVICE_OUTRO = "01J9F3K2M7QX8YB4TVWZ0DCEHZ";
const USER_LOCAL = "01J9F3K2M7QX8YB4TVWZ0DCEHU";
const USER_OUTRO = "01J9F3K2M7QX8YB4TVWZ0DCEHO";

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

/** Perfil criado noutro aparelho, como chegaria pelo sync. */
const USER_DE_OUTRO_DEVICE: DomainEvent = userCreated({
  eventId: "01J9F3K2M7QX8YB4TVWZ0DCEE1",
  entityId: USER_OUTRO,
  deviceId: DEVICE_OUTRO,
  hlc: `1754697500000-0000-${DEVICE_OUTRO}`,
  draft: { name: "Ana", color: "rose", avatar: null },
});

const LOTE: DomainEvent[] = [
  userCreated({
    eventId: "01J9F3K2M7QX8YB4TVWZ0DCEF1",
    entityId: USER_LOCAL,
    deviceId: "01J9F3K2M7QX8YB4TVWZ0DCEHR",
    hlc: "1754697700000-0000-01J9F3K2M7QX8YB4TVWZ0DCEHR",
    draft: { name: "Luiz", color: "teal", avatar: null },
  }),
];

describe("perfil local do aparelho", () => {
  it("le o localUserId do meta no init", async () => {
    const events = fakeEventStore();
    await events.setMeta(LOCAL_USER_ID_KEY, USER_LOCAL);
    const session = newSession(events);

    await session.init();

    expect(session.localUserId.value).toBe(USER_LOCAL);
  });

  it("localUserId e nulo quando o meta nao tem a chave", async () => {
    const session = newSession(fakeEventStore());

    await session.init();

    expect(session.localUserId.value).toBeNull();
  });

  it("localUserId continua nulo com um user de outro device ja no log", async () => {
    // Decisao transversal 6 do ROADMAP. Derivar de "existe algum user no log"
    // quebraria exatamente no cenario para o qual a cor de autor existe: depois
    // do sync, o perfil da outra pessoa estaria la, este aparelho pularia o
    // cadastro e todo lancamento seguinte sairia sem autor.
    const events = fakeEventStore([USER_DE_OUTRO_DEVICE]);
    const session = newSession(events);

    await session.init();

    expect(session.state.value.users[USER_OUTRO]?.materialized).toBe(true);
    expect(session.localUserId.value).toBeNull();
  });
});

describe("commitBatch", () => {
  it("grava, projeta e publica o localUserId", async () => {
    const events = fakeEventStore();
    const session = newSession(events);
    await session.init();

    await session.commitBatch(LOTE, { [LOCAL_USER_ID_KEY]: USER_LOCAL });

    expect(await events.readAll()).toHaveLength(LOTE.length);
    expect(session.localUserId.value).toBe(USER_LOCAL);
    expect(session.state.value.users[USER_LOCAL]?.name).toBe("Luiz");
  });

  it("falha na escrita nao muda projecao nem localUserId", async () => {
    const events = fakeEventStore();
    const session = newSession(events);
    await session.init();
    events.failNext = true;

    await session.commitBatch(LOTE, { [LOCAL_USER_ID_KEY]: USER_LOCAL });

    expect(session.localUserId.value).toBeNull();
    expect(session.state.value.users[USER_LOCAL]).toBeUndefined();
    expect(session.error.value).toContain("quota");
    expect(await events.readAll()).toHaveLength(0);
  });

  it("lote sem localUserId nao mexe no perfil local", async () => {
    const events = fakeEventStore();
    await events.setMeta(LOCAL_USER_ID_KEY, USER_LOCAL);
    const session = newSession(events);
    await session.init();

    await session.commitBatch(LOTE, {});

    expect(session.localUserId.value).toBe(USER_LOCAL);
  });
});
