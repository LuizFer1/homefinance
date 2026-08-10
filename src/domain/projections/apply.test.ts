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

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];

  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 1) {
    const head = items[i];
    if (head === undefined) continue;
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) out.push([head, ...tail]);
  }
  return out;
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

  it("ignora occurredOn que não é data real", () => {
    const state = fold([
      CREATE,
      event({ hlc: `1754697600010-0000-${DEVICE_A}`, data: { occurredOn: "2026-13-45" } }),
      event({ hlc: `1754697600011-0000-${DEVICE_A}`, data: { occurredOn: "2026-02-30" } }),
    ]);

    expect(state.transactions[ENTITY]?.occurredOn).toBe("2026-08-07");
  });

  it("aceita 29 de fevereiro em ano bissexto", () => {
    const state = fold([
      CREATE,
      event({ hlc: `1754697600010-0000-${DEVICE_A}`, data: { occurredOn: "2028-02-29" } }),
    ]);

    expect(state.transactions[ENTITY]?.occurredOn).toBe("2028-02-29");
  });

  it("resolve create duplicado por LWW por campo, independente da ordem", () => {
    const antigo = event({
      hlc: `1754697600000-0000-${DEVICE_A}`,
      id: "create-antigo",
      action: "create",
      data: { ...CREATE.data, description: "Antigo", amountMinor: 100 },
    });
    // Create que carrega só parte dos campos: modela evento de outra versão de
    // schema, ou de um dispositivo que ainda não conhecia o campo.
    const parcial = event({
      hlc: `1754697600010-0000-${DEVICE_A}`,
      id: "create-parcial",
      action: "create",
      data: { description: "Novo" },
    });

    const canonico = fold([antigo, parcial]);

    // Campo tocado pelos dois: vence o de maior HLC.
    expect(canonico.transactions[ENTITY]?.description).toBe("Novo");
    // Campo que só o mais antigo tocou: sobrevive. Um create mais novo não apaga
    // o que ele não menciona — é o que faz `create` ser LWW por campo, e não
    // substituição de documento inteiro.
    expect(canonico.transactions[ENTITY]?.amountMinor).toBe(100);
    expect(canonico.transactions[ENTITY]?.materialized).toBe(true);
    expect(fold([parcial, antigo])).toEqual(canonico);
  });

  it("faz o create mais novo vencer todos os campos que ele tambem carrega", () => {
    const antigo = event({
      hlc: `1754697600000-0000-${DEVICE_A}`,
      id: "create-antigo",
      action: "create",
      data: { ...CREATE.data, description: "Antigo", amountMinor: 100 },
    });
    const novo = event({
      hlc: `1754697600010-0000-${DEVICE_A}`,
      id: "create-novo",
      action: "create",
      data: { ...CREATE.data, description: "Novo" },
    });

    const canonico = fold([antigo, novo]);

    expect(canonico.transactions[ENTITY]?.description).toBe("Novo");
    expect(canonico.transactions[ENTITY]?.amountMinor).toBe(12_345);
    expect(fold([novo, antigo])).toEqual(canonico);
  });
});

describe("fold", () => {
  it("ordena por HLC antes de aplicar, independente da ordem recebida", () => {
    const a = event({ hlc: `1754697600010-0000-${DEVICE_A}`, data: { description: "A" } });
    const b = event({ hlc: `1754697600020-0000-${DEVICE_A}`, data: { description: "B" } });

    expect(fold([b, a, CREATE])).toEqual(fold([CREATE, a, b]));
    expect(fold([b, a, CREATE]).transactions[ENTITY]?.description).toBe("B");
  });

  it("converge em qualquer ordem, inclusive com HLC empatado", () => {
    const empatado = `1754697600010-0000-${DEVICE_A}`;
    const eventos = [
      CREATE,
      event({ id: "evt-a", hlc: empatado, data: { description: "PRIMEIRO" } }),
      event({ id: "evt-b", hlc: empatado, data: { description: "SEGUNDO" } }),
      event({ hlc: `1754697600020-0000-${DEVICE_A}`, action: "delete" }),
    ];
    const canonico = fold(eventos);

    for (const ordem of permutations(eventos)) {
      expect(fold(ordem)).toEqual(canonico);
    }
  });
});

const CAT = "01J9F3K2M7QX8YB4TVWZ0DCEC1";

function categoryEvent(overrides: Partial<DomainEvent> & { hlc: string }): DomainEvent {
  return event({ entity: "category", entityId: CAT, ...overrides });
}

const CAT_CREATE = categoryEvent({
  hlc: `1754697600000-0000-${DEVICE_A}`,
  action: "create",
  data: { name: "Mercado", icon: "utensils", color: "emerald" },
});

describe("lançamento anterior à fatia de formulário", () => {
  it("continua válido e materializado, com os campos novos nulos", () => {
    // O CREATE deste arquivo nao carrega paymentMethodId nem cashbackMinor: ele
    // modela exatamente o que ja esta gravado no aparelho do usuario. O log e
    // eterno, entao este caso nunca deixa de existir.
    const state = fold([CREATE]);

    expect(state.transactions[ENTITY]?.materialized).toBe(true);
    expect(state.transactions[ENTITY]?.paymentMethodId).toBeNull();
    expect(state.transactions[ENTITY]?.cashbackMinor).toBeNull();
    expect(state.transactions[ENTITY]?.description).toBe("Mercado");
  });

  it("aceita update que so acrescenta os campos novos", () => {
    const state = fold([
      CREATE,
      event({
        hlc: `1754697600010-0000-${DEVICE_A}`,
        data: { paymentMethodId: "pm-1", cashbackMinor: 250 },
      }),
    ]);

    expect(state.transactions[ENTITY]?.paymentMethodId).toBe("pm-1");
    expect(state.transactions[ENTITY]?.cashbackMinor).toBe(250);
    expect(state.transactions[ENTITY]?.amountMinor).toBe(12_345);
  });

  it("grava a limpeza do cashback como null, nao como ausencia", () => {
    const state = fold([
      CREATE,
      event({ hlc: `1754697600010-0000-${DEVICE_A}`, data: { cashbackMinor: 500 } }),
      event({ hlc: `1754697600020-0000-${DEVICE_A}`, data: { cashbackMinor: null } }),
    ]);

    expect(state.transactions[ENTITY]?.cashbackMinor).toBeNull();
  });
});

describe("apply com múltiplas entidades", () => {
  it("projeta categoria no bucket de categorias", () => {
    const state = apply(EMPTY_STATE, CAT_CREATE);

    expect(state.categories[CAT]?.name).toBe("Mercado");
    expect(state.categories[CAT]?.materialized).toBe(true);
    expect(Object.keys(state.transactions)).toHaveLength(0);
  });

  it("não deixa evento de uma entidade sujar o bucket de outra", () => {
    // Mesmo entityId nas duas entidades: se os buckets se cruzassem, este é o
    // caso em que o dano apareceria.
    const mesmoId = categoryEvent({
      hlc: `1754697600010-0000-${DEVICE_A}`,
      entityId: ENTITY,
      action: "create",
      data: { name: "Mercado", icon: "utensils", color: "emerald" },
    });
    const state = fold([CREATE, mesmoId]);

    expect(state.transactions[ENTITY]?.description).toBe("Mercado");
    expect(state.transactions[ENTITY]).not.toHaveProperty("icon");
    expect(state.categories[ENTITY]?.name).toBe("Mercado");
    expect(state.categories[ENTITY]).not.toHaveProperty("amountMinor");
  });

  it("aplica LWW por campo em categoria, igual a transação", () => {
    const state = fold([
      CAT_CREATE,
      categoryEvent({ hlc: `1754697600020-0000-${DEVICE_A}`, data: { color: "rose" } }),
      categoryEvent({ hlc: `1754697600010-0000-${DEVICE_A}`, data: { color: "sky" } }),
    ]);

    expect(state.categories[CAT]?.color).toBe("rose");
    expect(state.categories[CAT]?.name).toBe("Mercado");
  });

  it("projeta forma de pagamento com o kind validado", () => {
    const state = fold([
      categoryEvent({
        entity: "paymentMethod",
        hlc: `1754697600000-0000-${DEVICE_A}`,
        action: "create",
        data: { name: "Nubank", icon: "credit-card", color: "violet", kind: "credit" },
      }),
      categoryEvent({
        entity: "paymentMethod",
        hlc: `1754697600010-0000-${DEVICE_A}`,
        data: { kind: "cripto" },
      }),
    ]);

    expect(state.paymentMethods[CAT]?.kind).toBe("credit");
  });

  it("ignora entidade fora do registro sem sujar bucket nenhum", () => {
    const hlc = `1754697600010-0000-${DEVICE_A}`;
    const state = apply(
      apply(EMPTY_STATE, CREATE),
      event({ hlc, entity: "investment", action: "create", data: { foo: 1 } }),
    );

    expect(Object.keys(state.transactions)).toHaveLength(1);
    expect(Object.keys(state.categories)).toHaveLength(0);
    expect(Object.keys(state.paymentMethods)).toHaveLength(0);
    expect(Object.keys(state.users)).toHaveLength(0);
    // lastHlc avança mesmo para evento ignorado: errar para o lado do refold.
    expect(state.lastHlc).toBe(hlc);
  });

  it("delete de categoria não apaga a transação que a referencia", () => {
    const state = fold([
      event({
        hlc: `1754697600000-0000-${DEVICE_A}`,
        action: "create",
        data: { ...CREATE.data, categoryId: CAT },
      }),
      CAT_CREATE,
      categoryEvent({ hlc: `1754697600020-0000-${DEVICE_A}`, action: "delete" }),
    ]);

    expect(state.categories[CAT]?.deleted).toBe(true);
    expect(state.transactions[ENTITY]?.deleted).toBe(false);
    expect(state.transactions[ENTITY]?.categoryId).toBe(CAT);
  });

  it("converge em qualquer ordem com as quatro entidades misturadas", () => {
    const eventos = [
      CREATE,
      CAT_CREATE,
      categoryEvent({
        entity: "user",
        hlc: `1754697600005-0000-${DEVICE_A}`,
        action: "create",
        data: { name: "Luiz", color: "sky" },
      }),
      categoryEvent({ hlc: `1754697600030-0000-${DEVICE_A}`, data: { color: "amber" } }),
    ];
    const canonico = fold(eventos);

    for (const ordem of permutations(eventos)) {
      expect(fold(ordem)).toEqual(canonico);
    }
  });
});
