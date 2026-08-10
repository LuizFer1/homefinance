import { describe, expect, it } from "vitest";
import { diffUser, type UserLike, userCreated, userUpdated } from "./user";

const ENVELOPE = {
  eventId: "01J9F3K2M7QX8YB4TVWZ0DCEH1",
  entityId: "01J9F3K2M7QX8YB4TVWZ0DCEHU",
  deviceId: "01J9F3K2M7QX8YB4TVWZ0DCEHR",
  hlc: "1754697600000-0000-01J9F3K2M7QX8YB4TVWZ0DCEHR",
};

const FOTO = "data:image/webp;base64,AAAA";

const CURRENT: UserLike = { name: "Luiz", color: "teal", avatar: null };

describe("userCreated", () => {
  it("carrega o agregado inteiro, inclusive avatar nulo", () => {
    const event = userCreated({
      ...ENVELOPE,
      draft: { name: "Luiz", color: "teal", avatar: null },
    });

    expect(event.entity).toBe("user");
    expect(event.action).toBe("create");
    expect(event.entityId).toBe(ENVELOPE.entityId);
    expect(event.schemaVersion).toBe(1);
    expect(event.data).toEqual({ name: "Luiz", color: "teal", avatar: null });
  });

  it("carrega a foto quando ela existe", () => {
    const event = userCreated({
      ...ENVELOPE,
      draft: { name: "Luiz", color: "teal", avatar: FOTO },
    });

    expect(event.data).toEqual({ name: "Luiz", color: "teal", avatar: FOTO });
  });
});

describe("userUpdated", () => {
  it("carrega apenas o patch", () => {
    const event = userUpdated({ ...ENVELOPE, patch: { name: "Luiz Fernando" } });

    expect(event.action).toBe("update");
    expect(event.data).toEqual({ name: "Luiz Fernando" });
  });
});

describe("diffUser", () => {
  it("devolve apenas os campos alterados", () => {
    expect(diffUser(CURRENT, { name: "Luiz", color: "rose", avatar: null })).toEqual({
      color: "rose",
    });
  });

  it("devolve patch vazio quando nada mudou", () => {
    expect(diffUser(CURRENT, { name: "Luiz", color: "teal", avatar: null })).toEqual({});
  });

  it("emite a foto quando ela e adicionada", () => {
    expect(diffUser(CURRENT, { name: "Luiz", color: "teal", avatar: FOTO })).toEqual({
      avatar: FOTO,
    });
  });

  it("emite avatar nulo quando a foto e removida", () => {
    // `mergeFields` usa `field in data`, entao null explicito e aplicado, nao
    // ignorado. Sem esta comparacao, remover a foto nao chegaria ao log e ela
    // voltaria no proximo boot.
    const comFoto: UserLike = { ...CURRENT, avatar: FOTO };

    expect(diffUser(comFoto, { name: "Luiz", color: "teal", avatar: null })).toEqual({
      avatar: null,
    });
  });

  it("devolve todos os campos alterados, nao so o primeiro", () => {
    expect(diffUser(CURRENT, { name: "Ana", color: "rose", avatar: FOTO })).toEqual({
      name: "Ana",
      color: "rose",
      avatar: FOTO,
    });
  });
});
