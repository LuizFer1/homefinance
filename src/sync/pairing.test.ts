import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HomeFinanceDb } from "../data/db";
import { readHubLink } from "../data/hub-link";
import { openTestDb } from "../data/test-db.fake";
import { ALIVE } from "../domain/model/row.fake";
import { createFakeHub, type FakeHub } from "./fake-hub.fake";
import { pairWithHub } from "./pairing";
import { createHubTransport } from "./transport";

const ME = "01J9F3K2M7QX8YB4TVWZ0DCEHA";
const USER = "01J9F3K2M7QX8YB4TVWZ0DCEV1";

let db: HomeFinanceDb;
let hub: FakeHub;

beforeEach(async () => {
  db = openTestDb();
  hub = createFakeHub();
  await db.users.put({ ...ALIVE, id: USER, name: "Ana", color: "teal", avatar: null });
});

afterEach(async () => {
  await db.delete();
});

describe("pairWithHub", () => {
  it("manda deviceId, nome e userId, grava a ligação e marca tudo dirty", async () => {
    const link = await pairWithHub(
      { db, transport: createHubTransport({ fetch: hub.fetch }), deviceId: ME, userId: USER },
      { address: "192.168.0.5:7777", token: hub.issueToken(), deviceName: "Pixel da Ana" },
    );

    expect(hub.calls[0]?.body).toEqual({
      token: expect.any(String),
      deviceId: ME,
      name: "Pixel da Ana",
      userId: USER,
    });
    expect(link).toMatchObject({
      address: "192.168.0.5:7777",
      name: "HubFinance",
      epoch: hub.epoch,
      deviceName: "Pixel da Ana",
      cursor: 0,
      revoked: false,
    });
    expect(await readHubLink(db)).toEqual(link);
    expect((await db.users.get(USER))?.dirty).toBe(1);
    expect(hub.devices()[0]).toMatchObject({ deviceId: ME, name: "Pixel da Ana", userId: USER });
  });

  it("código errado não grava nada", async () => {
    await expect(
      pairWithHub(
        { db, transport: createHubTransport({ fetch: hub.fetch }), deviceId: ME, userId: null },
        { address: "192.168.0.5:7777", token: "ZZZZZZ", deviceName: "X" },
      ),
    ).rejects.toMatchObject({ kind: "invalid_token" });

    expect(await readHubLink(db)).toBeNull();
    expect((await db.users.get(USER))?.dirty).toBe(0);
  });

  it("normaliza endereço e código antes de chamar o hub", async () => {
    const token = hub.issueToken();
    await pairWithHub(
      { db, transport: createHubTransport({ fetch: hub.fetch }), deviceId: ME, userId: null },
      {
        address: "https://192.168.0.5:7777/",
        token: `${token.slice(0, 3)}-${token.slice(3).toLowerCase()}`,
        deviceName: "  X  ",
      },
    );
    expect((await readHubLink(db))?.address).toBe("192.168.0.5:7777");
    expect((await readHubLink(db))?.deviceName).toBe("X");
  });

  it("endereço ou código inválidos nem chegam à rede", async () => {
    const deps = {
      db,
      transport: createHubTransport({ fetch: hub.fetch }),
      deviceId: ME,
      userId: null,
    };
    await expect(
      pairWithHub(deps, { address: "", token: "ABCDEF", deviceName: "X" }),
    ).rejects.toThrow("Endereço");
    await expect(
      pairWithHub(deps, { address: "192.168.0.5", token: "AB", deviceName: "X" }),
    ).rejects.toThrow("Código");
    await expect(
      pairWithHub(deps, { address: "192.168.0.5", token: "ABCDEF", deviceName: " " }),
    ).rejects.toThrow("Nome");
    expect(hub.calls).toEqual([]);
  });
});
