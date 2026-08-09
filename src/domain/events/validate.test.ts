import { describe, expect, it } from "vitest";
import { createHlcClock } from "../clock/hlc";
import { isValidEvent } from "./validate";

const VALID = {
  id: "01J9F3K2M7QX8YB4TVWZ0DCEH1",
  entity: "transaction",
  entityId: "01J9F3K2M7QX8YB4TVWZ0DCEH2",
  action: "create",
  data: {},
  deviceId: "01J9F3K2M7QX8YB4TVWZ0DCEHR",
  hlc: "1754697600000-0000-01J9F3K2M7QX8YB4TVWZ0DCEHR",
  schemaVersion: 1,
};

describe("isValidEvent", () => {
  it("aceita um evento bem formado", () => {
    expect(isValidEvent(VALID)).toBe(true);
  });

  it("rejeita valores que não são objeto", () => {
    expect(isValidEvent(null)).toBe(false);
    expect(isValidEvent("evento")).toBe(false);
    expect(isValidEvent([VALID])).toBe(false);
  });

  it("rejeita entity e action desconhecidos", () => {
    expect(isValidEvent({ ...VALID, entity: "planeta" })).toBe(false);
    expect(isValidEvent({ ...VALID, action: "patch" })).toBe(false);
  });

  it("aceita paymentMethod como entidade conhecida", () => {
    expect(isValidEvent({ ...VALID, entity: "paymentMethod" })).toBe(true);
  });

  it("rejeita hlc fora do formato", () => {
    expect(isValidEvent({ ...VALID, hlc: "ontem" })).toBe(false);
  });

  it("rejeita campos obrigatórios ausentes ou vazios", () => {
    expect(isValidEvent({ ...VALID, id: "" })).toBe(false);
    expect(isValidEvent({ ...VALID, data: null })).toBe(false);
    expect(isValidEvent({ ...VALID, schemaVersion: "1" })).toBe(false);
  });

  it("rejeita data que não seja objeto simples", () => {
    expect(isValidEvent({ ...VALID, data: new Date() })).toBe(false);
    expect(isValidEvent({ ...VALID, data: new Map() })).toBe(false);
    expect(isValidEvent({ ...VALID, data: [] })).toBe(false);
  });

  it("aceita HLC produzido pelo relógio real do projeto", () => {
    const deviceId = "01J9F3K2M7QX8YB4TVWZ0DCEHR";
    const hlc = createHlcClock(deviceId).tick(1_754_697_600_000);

    expect(isValidEvent({ ...VALID, hlc })).toBe(true);
  });

  it("aceita schemaVersion futuro, porque quem descarta e o fold e nao o envelope", () => {
    expect(isValidEvent({ ...VALID, schemaVersion: 99 })).toBe(true);
  });
});
