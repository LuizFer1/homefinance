import { describe, expect, it } from "vitest";
import { createDeviceClock, type DeviceClock } from "../../domain/clock/device-clock";
import { compareHlc } from "../../domain/clock/hlc";
import type { UserDraft } from "../../domain/events/user";
import { isValidEvent } from "../../domain/events/validate";
import { LOCAL_USER_ID_KEY } from "../session/session";
import { buildOnboardingBatch } from "./seed";

const DRAFT: UserDraft = { name: "Luiz", color: "teal", avatar: null };

/** Um `now()` só para os cinco eventos: é o caso que o counter do HLC resolve. */
function clockFalso(): DeviceClock {
  return createDeviceClock({
    deviceId: "01J9F3K2M7QX8YB4TVWZ0DCEHR",
    now: () => 1_754_697_600_000,
    randomChunk: (count) => Array.from({ length: count }, (_, i) => i % 32),
  });
}

describe("buildOnboardingBatch", () => {
  it("monta o lote na ordem do spec: user, depois metodos, depois categorias", () => {
    const { events } = buildOnboardingBatch(DRAFT, clockFalso());

    expect(events[0]?.entity).toBe("user");
    // O perfil vem primeiro: um lote interrompido nao pode deixar cadastros
    // existindo sem o perfil que os semeou.
    expect(new Set(events.slice(1).map((e) => e.entity))).toEqual(
      new Set(["paymentMethod", "category"]),
    );
    expect(events.filter((e) => e.entity === "paymentMethod")).toHaveLength(4);
  });

  it("semeia os quatro kinds de pagamento do spec", () => {
    const { events } = buildOnboardingBatch(DRAFT, clockFalso());

    expect(events.filter((e) => e.entity === "paymentMethod").map((e) => e.data.kind)).toEqual([
      "cash",
      "pix",
      "credit",
      "debit",
    ]);
  });

  it("semeia categorias dos dois lados, e nenhuma delas sem tipo", () => {
    const { events } = buildOnboardingBatch(DRAFT, clockFalso());
    const kinds = events.filter((e) => e.entity === "category").map((e) => e.data.kind);

    expect(kinds).toContain("expense");
    expect(kinds).toContain("income");
    // 'both' e a excecao que justifica o valor existir — investimento e
    // transferencia sao genuinamente os dois lados.
    expect(kinds).toContain("both");
    expect(kinds.every((kind) => typeof kind === "string")).toBe(true);
  });

  it("nenhuma categoria padrao repete nome", () => {
    // A tela de cadastro avisa sobre duplicata; semear duplicatas seria o app
    // desrespeitando o proprio aviso na primeira abertura.
    const nomes = buildOnboardingBatch(DRAFT, clockFalso())
      .events.filter((e) => e.entity === "category")
      .map((e) => e.data.name);

    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it("os cadastros padrao sao eventos comuns, nao constantes", () => {
    // Da para renomear "Pix" para "Pix Nubank", trocar a cor e apagar o que nao
    // usa. Constantes embutidas virariam caso especial em toda tela e nao
    // sobreviveriam ao primeiro usuario que quisesse dois cartoes.
    const { events } = buildOnboardingBatch(DRAFT, clockFalso());

    for (const event of events.slice(1)) {
      expect(event.action).toBe("create");
      expect(isValidEvent(event)).toBe(true);
      expect(event.data).toHaveProperty("name");
      expect(event.data).toHaveProperty("icon");
      expect(event.data).toHaveProperty("color");
    }
  });

  it("carrega o perfil no primeiro evento, inclusive sem foto", () => {
    const { events } = buildOnboardingBatch(DRAFT, clockFalso());

    expect(events[0]?.data).toEqual({ name: "Luiz", color: "teal", avatar: null });
  });

  it("carrega a foto no evento de perfil quando ela existe", () => {
    const { events } = buildOnboardingBatch(
      { ...DRAFT, avatar: "data:image/webp;base64,AAAA" },
      clockFalso(),
    );

    expect(events[0]?.data).toMatchObject({ avatar: "data:image/webp;base64,AAAA" });
  });

  it("devolve o localUserId apontando para o user criado", () => {
    const { events, meta } = buildOnboardingBatch(DRAFT, clockFalso());

    expect(meta[LOCAL_USER_ID_KEY]).toBe(events[0]?.entityId);
  });

  it("todo evento do lote tem id e hlc distintos e crescentes", () => {
    // Impede cinco eventos nascerem com o mesmo HLC por compartilharem o mesmo
    // `now()` — e o clock falso deste arquivo devolve mesmo um `now()` fixo, de
    // proposito. O DeviceClock resolve avancando o counter; este teste e a rede
    // que garante que ninguem contorne o relogio montando envelopes na mao.
    const { events } = buildOnboardingBatch(DRAFT, clockFalso());

    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
    for (let i = 1; i < events.length; i += 1) {
      expect(compareHlc(events[i - 1]?.hlc ?? "", events[i]?.hlc ?? "")).toBe(-1);
    }
  });

  it("nao escreve nada: e so a montagem do lote", () => {
    // Quem escreve e a store, com commitBatch. E essa separacao que torna a
    // ordem do lote testavel sem fake-indexeddb.
    const { events, meta } = buildOnboardingBatch(DRAFT, clockFalso());

    expect(events.length).toBeGreaterThan(5);
    expect(Object.keys(meta)).toEqual([LOCAL_USER_ID_KEY]);
  });
});
