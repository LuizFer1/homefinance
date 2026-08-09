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
): DomainEvent {
  const hlc = `${String(millis).padStart(13, "0")}-0000-${deviceId}`;
  return {
    id: `${deviceId}-${millis}-${entityId}`,
    entity: "transaction",
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
