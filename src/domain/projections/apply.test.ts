import { describe, expect, it } from "vitest";
import type { DomainEvent } from "../events/types";
import { apply, EMPTY_STATE, fold } from "./apply";

const DEVICE_A = "01J9F3K2M7QX8YB4TVWZ0DCEHR";
const ENTITY = "01J9F3K2M7QX8YB4TVWZ0DCEH2";

function event(overrides: Partial<DomainEvent> & { hlc: string }): DomainEvent {
  return {
    id: `evt-${overrides.hlc}`,
    entity: "transaction",
    entityId: ENTITY,
    action: "update",
    data: {},
    deviceId: DEVICE_A,
    schemaVersion: 1,
    ...overrides,
  };
}

const CREATE = event({
  hlc: `1754697600000-0000-${DEVICE_A}`,
  action: "create",
  data: {
    kind: "expense",
    description: "Mercado",
    amountMinor: 12_345,
    currency: "BRL",
    categoryId: null,
    occurredOn: "2026-08-07",
  },
});

describe("apply", () => {
  it("materializa o agregado no create", () => {
    const state = apply(EMPTY_STATE, CREATE);

    expect(state.transactions[ENTITY]?.description).toBe("Mercado");
    expect(state.transactions[ENTITY]?.materialized).toBe(true);
    expect(state.lastHlc).toBe(CREATE.hlc);
  });

  it("preserva edições concorrentes em campos diferentes", () => {
    const state = fold([
      CREATE,
      event({ hlc: `1754697600010-0000-${DEVICE_A}`, data: { amountMinor: 500 } }),
      event({ hlc: `1754697600011-0000-${DEVICE_A}`, data: { description: "Feira" } }),
    ]);

    expect(state.transactions[ENTITY]?.amountMinor).toBe(500);
    expect(state.transactions[ENTITY]?.description).toBe("Feira");
  });

  it("não deixa update antigo sobrescrever campo mais novo", () => {
    const novo = event({ hlc: `1754697600020-0000-${DEVICE_A}`, data: { description: "Novo" } });
    const antigo = event({
      hlc: `1754697600010-0000-${DEVICE_A}`,
      data: { description: "Antigo" },
    });

    const state = apply(apply(apply(EMPTY_STATE, CREATE), novo), antigo);

    expect(state.transactions[ENTITY]?.description).toBe("Novo");
  });

  it("trata delete como terminal", () => {
    const state = fold([
      CREATE,
      event({ hlc: `1754697600010-0000-${DEVICE_A}`, action: "delete" }),
      event({ hlc: `1754697600020-0000-${DEVICE_A}`, data: { description: "Ressuscitar" } }),
      event({ ...CREATE, id: "outro", hlc: `1754697600030-0000-${DEVICE_A}` }),
    ]);

    expect(state.transactions[ENTITY]?.deleted).toBe(true);
  });

  it("preserva update órfão até o create chegar", () => {
    const orfao = event({ hlc: `1754697600010-0000-${DEVICE_A}`, data: { description: "Feira" } });

    const primeiroOrfao = fold([orfao, CREATE]);
    const primeiroCreate = fold([CREATE, orfao]);

    expect(primeiroOrfao.transactions[ENTITY]?.description).toBe("Feira");
    expect(primeiroOrfao).toEqual(primeiroCreate);
  });

  it("mantém delete órfão como tombstone não materializado", () => {
    const state = apply(
      EMPTY_STATE,
      event({ hlc: `1754697600010-0000-${DEVICE_A}`, action: "delete" }),
    );

    expect(state.transactions[ENTITY]?.deleted).toBe(true);
    expect(state.transactions[ENTITY]?.materialized).toBe(false);
  });

  it("ignora campo com tipo inválido sem descartar o evento", () => {
    const state = fold([
      CREATE,
      event({
        hlc: `1754697600010-0000-${DEVICE_A}`,
        data: { amountMinor: "muito", description: "Feira" },
      }),
    ]);

    expect(state.transactions[ENTITY]?.amountMinor).toBe(12_345);
    expect(state.transactions[ENTITY]?.description).toBe("Feira");
  });

  it("ignora entidade ainda desconhecida mas avança o lastHlc", () => {
    const hlc = `1754697600010-0000-${DEVICE_A}`;
    const state = apply(
      apply(EMPTY_STATE, CREATE),
      event({ hlc, entity: "investment", action: "create" }),
    );

    expect(Object.keys(state.transactions)).toHaveLength(1);
    expect(state.lastHlc).toBe(hlc);
  });

  it("ignora evento com schemaVersion acima do conhecido", () => {
    const state = fold([
      CREATE,
      event({
        hlc: `1754697600010-0000-${DEVICE_A}`,
        schemaVersion: 99,
        data: { description: "Futuro" },
      }),
    ]);

    expect(state.transactions[ENTITY]?.description).toBe("Mercado");
  });
});

describe("fold", () => {
  it("ordena por HLC antes de aplicar, independente da ordem recebida", () => {
    const a = event({ hlc: `1754697600010-0000-${DEVICE_A}`, data: { description: "A" } });
    const b = event({ hlc: `1754697600020-0000-${DEVICE_A}`, data: { description: "B" } });

    expect(fold([b, a, CREATE])).toEqual(fold([CREATE, a, b]));
    expect(fold([b, a, CREATE]).transactions[ENTITY]?.description).toBe("B");
  });
});
