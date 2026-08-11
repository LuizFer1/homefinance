import { describe, expect, it } from "vitest";
import type { DomainEvent } from "../events/types";
import { fold } from "./apply";

const DEVICE_A = "01J9F3K2M7QX8YB4TVWZ0DCEHA";
const DEVICE_B = "01J9F3K2M7QX8YB4TVWZ0DCEHB";
const TX_1 = "01J9F3K2M7QX8YB4TVWZ0DCE01";
const TX_2 = "01J9F3K2M7QX8YB4TVWZ0DCE02";

function make(
  deviceId: string,
  millis: number,
  entityId: string,
  action: DomainEvent["action"],
  data: Record<string, unknown>,
  entity: DomainEvent["entity"] = "transaction",
): DomainEvent {
  const hlc = `${String(millis).padStart(13, "0")}-0000-${deviceId}`;
  return {
    id: `${deviceId}-${millis}-${entityId}`,
    entity,
    entityId,
    action,
    data,
    deviceId,
    hlc,
    schemaVersion: 1,
  };
}

const BASE = {
  kind: "expense",
  description: "Mercado",
  amountMinor: 12_345,
  currency: "BRL",
  categoryId: null,
  occurredOn: "2026-08-07",
  recurrenceId: null,
  occurrenceKey: null,
};

/** Log do dispositivo A: cria dois lançamentos e edita campos distintos. */
const LOG_A: DomainEvent[] = [
  make(DEVICE_A, 1_754_697_600_000, TX_1, "create", BASE),
  make(DEVICE_A, 1_754_697_600_010, TX_2, "create", { ...BASE, description: "Farmácia" }),
  make(DEVICE_A, 1_754_697_700_000, TX_1, "update", { amountMinor: 500 }),
  make(DEVICE_A, 1_754_697_800_000, TX_2, "update", { description: "Farmácia central" }),
];

/** Log do dispositivo B, offline no mesmo período: edita outro campo, colide num terceiro e apaga um. */
const LOG_B: DomainEvent[] = [
  make(DEVICE_B, 1_754_697_700_500, TX_1, "update", { description: "Feira" }),
  make(DEVICE_B, 1_754_697_900_000, TX_1, "update", { amountMinor: 777 }),
  make(DEVICE_B, 1_754_698_000_000, TX_2, "delete", {}),
  make(DEVICE_B, 1_754_698_100_000, TX_2, "update", { amountMinor: 1 }),
];

/** Permutações determinísticas: rotações do log unido, sem depender de aleatoriedade. */
function rotations(events: DomainEvent[]): DomainEvent[][] {
  return events.map((_, offset) => [...events.slice(offset), ...events.slice(0, offset)]);
}

describe("convergência entre dois dispositivos", () => {
  const merged = [...LOG_A, ...LOG_B];
  const expected = fold(merged);

  it("chega ao mesmo estado em qualquer ordem de merge", () => {
    for (const order of rotations(merged)) {
      expect(fold(order)).toEqual(expected);
    }
    expect(fold([...merged].reverse())).toEqual(expected);
    expect(fold([...LOG_B, ...LOG_A])).toEqual(expected);
  });

  it("é idempotente: receber o mesmo evento duas vezes não muda nada", () => {
    expect(fold([...merged, ...LOG_B])).toEqual(expected);
  });

  it("mantém as duas edições quando os campos são diferentes", () => {
    expect(expected.transactions[TX_1]?.description).toBe("Feira");
  });

  it("faz o maior HLC vencer quando os campos colidem", () => {
    expect(expected.transactions[TX_1]?.amountMinor).toBe(777);
  });

  it("mantém o delete apesar do update posterior", () => {
    expect(expected.transactions[TX_2]?.deleted).toBe(true);
  });
});

describe("convergência com backup restaurado em dois aparelhos", () => {
  // Mesmo deviceId nos dois logs: os aparelhos herdaram o mesmo backup, logo o
  // mesmo relógio, e o próximo evento de cada um nasce com HLC idêntico.
  const CLONE = "01J9F3K2M7QX8YB4TVWZ0DCEHC";
  const colisao = 1_754_698_200_000;

  const doAparelho1 = make(CLONE, colisao, TX_1, "update", { description: "Aparelho 1" });
  const doAparelho2: DomainEvent = {
    ...make(CLONE, colisao, TX_1, "update", { description: "Aparelho 2" }),
    id: "evento-do-aparelho-2",
  };

  const semente = make(CLONE, 1_754_697_600_000, TX_1, "create", BASE);

  it("converge mesmo com HLC idêntico entre eventos distintos", () => {
    const ordem1 = fold([semente, doAparelho1, doAparelho2]);
    const ordem2 = fold([semente, doAparelho2, doAparelho1]);
    const ordem3 = fold([doAparelho2, semente, doAparelho1]);

    expect(ordem1).toEqual(ordem2);
    expect(ordem1).toEqual(ordem3);
  });

  it("desempata de forma estável: no empate de HLC vence o evento de menor id", () => {
    const state = fold([semente, doAparelho1, doAparelho2]);

    // `compareEvents` ordena o de menor `id` primeiro, e `mergeFields` usa `>=`,
    // então o primeiro a ser aplicado grava o campo e o segundo é pulado.
    // Qual dos dois vence é arbitrário; o que importa é que seja sempre o mesmo.
    expect(state.transactions[TX_1]?.description).toBe("Aparelho 1");
    expect(fold([doAparelho2, doAparelho1, semente]).transactions[TX_1]?.description).toBe(
      "Aparelho 1",
    );
  });
});

const CAT_1 = "01J9F3K2M7QX8YB4TVWZ0DCEC1";
const CAT_2 = "01J9F3K2M7QX8YB4TVWZ0DCEC2";
const PM_1 = "01J9F3K2M7QX8YB4TVWZ0DCEP1";

const CAT_BASE = { name: "Mercado", icon: "utensils", color: "emerald" };

/** A cria categorias e uma forma de pagamento, e classifica um lançamento. */
const REF_LOG_A: DomainEvent[] = [
  make(DEVICE_A, 1_754_697_600_000, TX_1, "create", { ...BASE, categoryId: CAT_1 }),
  make(DEVICE_A, 1_754_697_600_020, CAT_1, "create", CAT_BASE, "category"),
  make(DEVICE_A, 1_754_697_600_030, CAT_2, "create", { ...CAT_BASE, name: "Saúde" }, "category"),
  make(
    DEVICE_A,
    1_754_697_600_040,
    PM_1,
    "create",
    { name: "Nubank", icon: "credit-card", color: "violet", kind: "credit" },
    "paymentMethod",
  ),
  // Renomeia CAT_1 — B vai mexer na cor dela no mesmo período.
  make(DEVICE_A, 1_754_697_700_000, CAT_1, "update", { name: "Supermercado" }, "category"),
];

/** B, offline: edita outro campo da mesma categoria e apaga a que A criou depois. */
const REF_LOG_B: DomainEvent[] = [
  make(DEVICE_B, 1_754_697_700_500, CAT_1, "update", { color: "rose" }, "category"),
  make(DEVICE_B, 1_754_697_800_000, CAT_2, "delete", {}, "category"),
  make(DEVICE_B, 1_754_697_900_000, PM_1, "update", { kind: "debit" }, "paymentMethod"),
];

describe("convergência com quatro entidades no mesmo log", () => {
  const merged = [...REF_LOG_A, ...REF_LOG_B];
  const expected = fold(merged);

  it("chega ao mesmo estado em qualquer ordem de merge", () => {
    for (const order of rotations(merged)) {
      expect(fold(order)).toEqual(expected);
    }
    expect(fold([...merged].reverse())).toEqual(expected);
    expect(fold([...REF_LOG_B, ...REF_LOG_A])).toEqual(expected);
  });

  it("preserva edições concorrentes em campos diferentes da mesma categoria", () => {
    expect(expected.categories[CAT_1]?.name).toBe("Supermercado");
    expect(expected.categories[CAT_1]?.color).toBe("rose");
  });

  it("delete de categoria não cascateia para o lançamento", () => {
    // Cascata num log append-only significaria emitir N deletes de transação a
    // partir de um clique — e eles não voltariam.
    const comDelete = fold([
      ...merged,
      make(DEVICE_B, 1_754_698_500_000, CAT_1, "delete", {}, "category"),
    ]);

    expect(comDelete.categories[CAT_1]?.deleted).toBe(true);
    expect(comDelete.transactions[TX_1]?.deleted).toBe(false);
    expect(comDelete.transactions[TX_1]?.categoryId).toBe(CAT_1);
  });

  it("evento de entidade desconhecida não suja nenhum bucket", () => {
    const ruido = make(
      DEVICE_B,
      1_754_698_200_000,
      "01J9F3K2M7QX8YB4TVWZ0DCEZZ",
      "create",
      { qualquer: 1 },
      "investment",
    );
    const comRuido = fold([...merged, ruido]);

    expect(comRuido.transactions).toEqual(expected.transactions);
    expect(comRuido.categories).toEqual(expected.categories);
    expect(comRuido.paymentMethods).toEqual(expected.paymentMethods);
    expect(comRuido.users).toEqual(expected.users);
  });

  it("é idempotente com as quatro entidades", () => {
    expect(fold([...merged, ...REF_LOG_B])).toEqual(expected);
  });
});

const USER_A = "01J9F3K2M7QX8YB4TVWZ0DCEUA";
const USER_B = "01J9F3K2M7QX8YB4TVWZ0DCEUB";
const FOTO_A = "data:image/webp;base64,AAAA";
const FOTO_B = "data:image/webp;base64,BBBB";

/** Cada aparelho cadastra o seu perfil e lança marcando a própria autoria. */
const PERFIL_LOG_A: DomainEvent[] = [
  make(
    DEVICE_A,
    1_754_697_500_000,
    USER_A,
    "create",
    { name: "Luiz", color: "teal", avatar: FOTO_A },
    "user",
  ),
  make(DEVICE_A, 1_754_697_600_000, TX_1, "create", { ...BASE, userId: USER_A }),
];

const PERFIL_LOG_B: DomainEvent[] = [
  make(
    DEVICE_B,
    1_754_697_500_500,
    USER_B,
    "create",
    { name: "Ana", color: "rose", avatar: FOTO_B },
    "user",
  ),
  make(DEVICE_B, 1_754_697_600_500, TX_2, "create", {
    ...BASE,
    description: "Farmácia",
    userId: USER_B,
  }),
];

describe("convergência de perfis e autoria", () => {
  const todos = [...PERFIL_LOG_A, ...PERFIL_LOG_B];
  const esperado = fold(todos);

  it("os dois perfis coexistem, cada um com sua cor e sua foto", () => {
    expect(esperado.users[USER_A]).toMatchObject({ name: "Luiz", color: "teal", avatar: FOTO_A });
    expect(esperado.users[USER_B]).toMatchObject({ name: "Ana", color: "rose", avatar: FOTO_B });
  });

  it("cada lançamento mantém seu autor em qualquer ordem de merge", () => {
    // Se a autoria dependesse da ordem de chegada, dois aparelhos que
    // receberam os mesmos eventos em ordens diferentes divergiriam em silêncio.
    for (const ordem of [
      [...PERFIL_LOG_A, ...PERFIL_LOG_B],
      [...PERFIL_LOG_B, ...PERFIL_LOG_A],
      [...todos].reverse(),
    ]) {
      const estado = fold(ordem);

      expect(estado.transactions[TX_1]?.userId).toBe(USER_A);
      expect(estado.transactions[TX_2]?.userId).toBe(USER_B);
      expect(estado).toEqual(esperado);
    }
  });

  it("editar o lançamento do outro não rouba a autoria", () => {
    // A store nunca emite userId num update, mas o fold precisa convergir mesmo
    // que um evento assim chegue de uma versão futura ou de um import corrigido.
    const corrigido = fold([
      ...todos,
      make(DEVICE_B, 1_754_697_900_000, TX_1, "update", { amountMinor: 500 }),
    ]);

    expect(corrigido.transactions[TX_1]?.amountMinor).toBe(500);
    expect(corrigido.transactions[TX_1]?.userId).toBe(USER_A);
  });

  it("trocar a foto é LWW por campo e não mexe no nome nem na cor", () => {
    const trocada = fold([
      ...todos,
      make(DEVICE_A, 1_754_698_000_000, USER_A, "update", { avatar: null }, "user"),
    ]);

    expect(trocada.users[USER_A]?.avatar).toBeNull();
    expect(trocada.users[USER_A]?.name).toBe("Luiz");
    expect(trocada.users[USER_A]?.color).toBe("teal");
  });

  it("é idempotente com perfis e autoria", () => {
    expect(fold([...todos, ...PERFIL_LOG_B])).toEqual(esperado);
  });
});
