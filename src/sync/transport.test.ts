import { beforeEach, describe, expect, it, vi } from "vitest";
import { ALIVE } from "../domain/model/row.fake";
import { createFakeHub, type FakeHub } from "./fake-hub.fake";
import { createHubTransport, type HubTransport, SyncError } from "./transport";

const ADDRESS = "192.168.0.5:7777";
const DEVICE = "01J9F3K2M7QX8YB4TVWZ0DCEHA";
const ROW = {
  ...ALIVE,
  id: "01J9F3K2M7QX8YB4TVWZ0DCEC1",
  updatedAt: `1759344000000-0000-${DEVICE}`,
};
const PAIR = { token: "A", deviceId: DEVICE, name: "X", userId: null };

let hub: FakeHub;
let transport: HubTransport;

beforeEach(() => {
  hub = createFakeHub();
  transport = createHubTransport({ fetch: hub.fetch });
});

async function paired(): Promise<string> {
  const response = await transport.pair(ADDRESS, {
    ...PAIR,
    token: hub.issueToken(),
    name: "Pixel",
  });
  return response.key;
}

describe("createHubTransport", () => {
  it("pareia na URL https do endereço, com JSON e sem Bearer", async () => {
    const key = await paired();

    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(hub.calls[0]).toMatchObject({ method: "POST", path: "/v1/pair", auth: null });
    expect(hub.calls[0]?.body).toEqual({
      token: expect.any(String),
      deviceId: DEVICE,
      name: "Pixel",
      userId: null,
    });
  });

  it("push e pull levam o Bearer e devolvem o JSON do hub", async () => {
    const key = await paired();

    const pushed = await transport.push(ADDRESS, key, {
      epoch: hub.epoch,
      rows: [{ table: "categories", row: ROW }],
    });
    expect(pushed).toMatchObject({ accepted: [{ id: ROW.id, seq: 1 }], seq: 1 });
    expect(hub.calls[1]?.auth).toBe(`Bearer ${key}`);

    const pulled = await transport.pull(ADDRESS, key, { epoch: hub.epoch, cursor: 0, limit: 500 });
    expect(pulled).toMatchObject({ rows: [], cursor: 1, hasMore: false });
    expect(hub.calls[2]?.path).toBe(`/v1/pull?epoch=${hub.epoch}&cursor=0&limit=500`);
  });

  it("código errado é invalid_token; chave morta é unauthorized", async () => {
    await expect(transport.pair(ADDRESS, { ...PAIR, token: "ZZZZZZ" })).rejects.toMatchObject({
      kind: "invalid_token",
      status: 401,
    });
    await expect(
      transport.pull(ADDRESS, "0".repeat(64), { epoch: hub.epoch, cursor: 0, limit: 500 }),
    ).rejects.toMatchObject({ kind: "unauthorized", message: expect.stringContaining("Pareie") });
  });

  it("409 traz a epoch nova; 409 sem epoch é erro de protocolo", async () => {
    const key = await paired();
    const old = hub.epoch;
    hub.recreate(true);
    await expect(transport.push(ADDRESS, key, { epoch: old, rows: [] })).rejects.toMatchObject({
      kind: "epoch_mismatch",
      epoch: hub.epoch,
    });

    const broken = createHubTransport({
      fetch: async () =>
        new Response(JSON.stringify({ error: "epoch_mismatch", message: "x" }), { status: 409 }),
    });
    await expect(broken.push(ADDRESS, key, { epoch: old, rows: [] })).rejects.toMatchObject({
      kind: "protocol",
    });
  });

  it("status sem JSON (408 do timeout do hub) vira erro hub com o status", async () => {
    const key = await paired();
    hub.failNext("empty408");
    await expect(
      transport.push(ADDRESS, key, { epoch: hub.epoch, rows: [] }),
    ).rejects.toMatchObject({
      kind: "hub",
      status: 408,
      message: "O hub respondeu 408.",
    });
  });

  it("2xx fora do formato é protocolo", async () => {
    const weird = createHubTransport({
      fetch: async () => new Response("<html>", { status: 200 }),
    });
    await expect(
      weird.pull(ADDRESS, "k", { epoch: "E", cursor: 0, limit: 1 }),
    ).rejects.toMatchObject({
      kind: "protocol",
    });
  });

  it("falha de rede é unreachable e timeout é timeout, com a causa", async () => {
    hub.failNext("network");
    const unreachable = await transport.pair(ADDRESS, PAIR).catch((e: unknown) => e);
    expect(unreachable).toBeInstanceOf(SyncError);
    expect(unreachable).toMatchObject({ kind: "unreachable", status: null });
    expect((unreachable as SyncError).cause).toBeInstanceOf(TypeError);

    hub.failNext("timeout");
    await expect(transport.pair(ADDRESS, PAIR)).rejects.toMatchObject({ kind: "timeout" });
  });

  it("pede fetch sem cache nem cookies", async () => {
    const fetchSpy = vi.fn(hub.fetch);
    const spied = createHubTransport({ fetch: fetchSpy });
    await spied.pair(ADDRESS, { ...PAIR, token: hub.issueToken() });
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
    });
  });
});
