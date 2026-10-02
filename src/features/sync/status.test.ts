import { describe, expect, it } from "vitest";
import type { HubLink } from "../../data/hub-link";
import { describeFailure, describeHubStatus } from "./status";

const LINK: HubLink = {
  address: "192.168.0.5:7777",
  name: "HubFinance",
  key: "k",
  epoch: "E",
  deviceName: "Pixel",
  cursor: 0,
  tables: "",
  lastSyncAt: null,
  revoked: false,
};

function syncError(kind: string, message = "do hub") {
  return Object.assign(new Error(message), { name: "SyncError", kind });
}

describe("describeFailure", () => {
  it("traduz os kinds do SyncError sem importar a classe", () => {
    expect(describeFailure(syncError("unreachable"))).toMatchObject({
      kind: "unreachable",
      message: expect.stringContaining("certificado"),
    });
    expect(describeFailure(syncError("unauthorized"))).toMatchObject({
      kind: "unauthorized",
      message: expect.stringContaining("Pareie"),
    });
    expect(describeFailure(syncError("invalid_token"))).toMatchObject({ kind: "invalid_token" });
    expect(describeFailure(syncError("hub", "Mais de 1000 linhas num envio."))).toEqual({
      kind: "hub",
      message: "Mais de 1000 linhas num envio.",
    });
  });

  it("módulo não baixado × versão velha", () => {
    const offline = Object.assign(new Error("x"), {
      name: "SyncModuleUnavailableError",
      offline: true,
    });
    const stale = Object.assign(new Error("x"), {
      name: "SyncModuleUnavailableError",
      offline: false,
    });
    expect(describeFailure(offline).message).toContain("internet");
    expect(describeFailure(stale).message).toContain("Atualize");
  });

  it("qualquer outra coisa vira unknown com a mensagem", () => {
    expect(describeFailure(new Error("quota"))).toEqual({ kind: "unknown", message: "quota" });
  });
});

describe("describeHubStatus", () => {
  const base = {
    link: LINK,
    status: "idle" as const,
    revoked: false,
    lastError: null,
    lastSyncAt: null,
  };

  it("cobre os seis estados da spec", () => {
    expect(describeHubStatus({ ...base, link: null })).toContain("nunca um servidor");
    expect(describeHubStatus({ ...base, status: "syncing" })).toBe("Sincronizando…");
    expect(describeHubStatus({ ...base, revoked: true })).toContain("Desconectado");
    expect(describeHubStatus({ ...base, lastError: { kind: "timeout", message: "x" } })).toBe(
      "Hub fora de alcance na última tentativa.",
    );
    expect(
      describeHubStatus({ ...base, lastError: { kind: "hub", message: "Erro interno do hub." } }),
    ).toBe("Erro interno do hub.");
    expect(describeHubStatus({ ...base, lastSyncAt: "2026-10-01T18:42:00.000Z" })).toMatch(
      /^Último sync: /,
    );
    expect(describeHubStatus(base)).toBe("Pareado. Ainda não sincronizou.");
  });
});
