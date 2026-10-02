import { beforeEach, describe, expect, it } from "vitest";
import { ALIVE } from "../domain/model/row.fake";
import { createFakeHub, type FakeHub } from "./fake-hub.fake";

const DEVICE_A = "01J9F3K2M7QX8YB4TVWZ0DCEHA";
const DEVICE_B = "01J9F3K2M7QX8YB4TVWZ0DCEHB";
const HLC_1 = `1759344000000-0000-${DEVICE_A}`;
const HLC_2 = `1759344000001-0000-${DEVICE_B}`;
const ROW = { ...ALIVE, id: "01J9F3K2M7QX8YB4TVWZ0DCEC1", updatedAt: HLC_1, name: "Mercado" };

let hub: FakeHub;

async function call(method: string, path: string, body?: unknown, key?: string) {
  const response = await hub.fetch(`https://192.168.0.5:7777${path}`, {
    method,
    headers: key === undefined ? {} : { authorization: `Bearer ${key}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text === "" ? null : (JSON.parse(text) as Record<string, unknown>),
  };
}

async function pair(deviceId: string): Promise<string> {
  const { status, body } = await call("POST", "/v1/pair", {
    token: hub.issueToken(),
    deviceId,
    name: "Teste",
    userId: null,
  });
  expect(status).toBe(201);
  return body?.key as string;
}

beforeEach(() => {
  hub = createFakeHub();
});

describe("fake hub", () => {
  it("pareia com token de uso único e recusa token errado", async () => {
    const token = hub.issueToken();
    const ok = await call("POST", "/v1/pair", {
      token: token.toLowerCase(),
      deviceId: DEVICE_A,
      name: "A",
    });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ deviceId: DEVICE_A, epoch: hub.epoch, hubName: "HubFinance" });
    expect(String(ok.body?.key)).toMatch(/^[0-9a-f]{64}$/);

    const again = await call("POST", "/v1/pair", { token, deviceId: DEVICE_B, name: "B" });
    expect(again.status).toBe(401);
    expect(again.body).toMatchObject({ error: "invalid_token" });
  });

  it("sem Bearer é 401 unauthorized; revogado também", async () => {
    expect((await call("POST", "/v1/push", { epoch: hub.epoch, rows: [] })).status).toBe(401);
    const key = await pair(DEVICE_A);
    hub.revoke(DEVICE_A);
    const { status, body } = await call(
      "GET",
      `/v1/pull?epoch=${hub.epoch}&cursor=0`,
      undefined,
      key,
    );
    expect(status).toBe(401);
    expect(body).toMatchObject({ error: "unauthorized" });
  });

  it("push aplica LWW, atribui seq, remove dirty e rejeita linha inválida sem derrubar o lote", async () => {
    const key = await pair(DEVICE_A);
    const first = await call(
      "POST",
      "/v1/push",
      {
        epoch: hub.epoch,
        rows: [
          { table: "categories", row: { ...ROW, dirty: 1 } },
          { table: "categories", row: { id: "abc", updatedAt: "x", deletedAt: null } },
        ],
      },
      key,
    );
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      accepted: [{ table: "categories", id: ROW.id, seq: 1 }],
      ignored: [],
      seq: 1,
    });
    expect(((first.body?.rejected ?? []) as unknown[]).length).toBe(1);
    expect(hub.rows()[0]?.row).not.toHaveProperty("dirty");

    const same = await call(
      "POST",
      "/v1/push",
      { epoch: hub.epoch, rows: [{ table: "categories", row: ROW }] },
      key,
    );
    expect(same.body).toMatchObject({ accepted: [], ignored: [{ reason: "same" }], seq: 1 });

    const newer = await call(
      "POST",
      "/v1/push",
      {
        epoch: hub.epoch,
        rows: [{ table: "categories", row: { ...ROW, updatedAt: HLC_2, deletedAt: HLC_2 } }],
      },
      key,
    );
    expect(newer.body).toMatchObject({ accepted: [{ seq: 2 }], seq: 2 });

    const older = await call(
      "POST",
      "/v1/push",
      { epoch: hub.epoch, rows: [{ table: "categories", row: ROW }] },
      key,
    );
    expect(older.body).toMatchObject({ ignored: [{ reason: "older" }] });
  });

  it("pull exclui a própria origem, pagina com limit+1 e avança o cursor", async () => {
    const keyA = await pair(DEVICE_A);
    const keyB = await pair(DEVICE_B);
    const rows = [1, 2, 3].map((n) => ({
      table: "categories",
      row: { ...ROW, id: `01J9F3K2M7QX8YB4TVWZ0DCEC${n}` },
    }));
    await call("POST", "/v1/push", { epoch: hub.epoch, rows }, keyA);

    const own = await call("GET", `/v1/pull?epoch=${hub.epoch}&cursor=0`, undefined, keyA);
    expect(own.body).toMatchObject({ rows: [], cursor: 3, hasMore: false });

    const page1 = await call(
      "GET",
      `/v1/pull?epoch=${hub.epoch}&cursor=0&limit=2`,
      undefined,
      keyB,
    );
    expect(page1.body).toMatchObject({ cursor: 2, hasMore: true });
    expect(((page1.body?.rows ?? []) as { seq: number }[]).map((r) => r.seq)).toEqual([1, 2]);
    const page2 = await call(
      "GET",
      `/v1/pull?epoch=${hub.epoch}&cursor=2&limit=2`,
      undefined,
      keyB,
    );
    expect(page2.body).toMatchObject({ cursor: 3, hasMore: false });
    expect(((page2.body?.rows ?? []) as { seq: number }[]).map((r) => r.seq)).toEqual([3]);
  });

  it("epoch errada é 409 com a epoch atual; recreate troca a epoch", async () => {
    const key = await pair(DEVICE_A);
    const before = hub.epoch;
    hub.recreate(true);
    expect(hub.epoch).not.toBe(before);
    const { status, body } = await call("POST", "/v1/push", { epoch: before, rows: [] }, key);
    expect(status).toBe(409);
    expect(body).toEqual({
      error: "epoch_mismatch",
      message: expect.any(String),
      epoch: hub.epoch,
    });
  });

  it("failNext simula rede, timeout, 408 sem corpo e 500", async () => {
    hub.failNext("network");
    await expect(call("GET", "/v1/info")).rejects.toBeInstanceOf(TypeError);
    hub.failNext("timeout");
    await expect(call("GET", "/v1/info")).rejects.toMatchObject({ name: "TimeoutError" });
    hub.failNext("empty408");
    expect(await call("GET", "/v1/info")).toEqual({ status: 408, body: null });
    hub.failNext("internal");
    expect((await call("GET", "/v1/info")).status).toBe(500);
    expect((await call("GET", "/v1/info")).status).toBe(200);
  });
});
