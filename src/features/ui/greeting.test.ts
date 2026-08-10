import { describe, expect, it } from "vitest";
import { greetingFor } from "./greeting";

describe("greetingFor", () => {
  it("cobre os quatro períodos do dia", () => {
    expect(greetingFor(3)).toBe("Boa madrugada");
    expect(greetingFor(9)).toBe("Bom dia");
    expect(greetingFor(15)).toBe("Boa tarde");
    expect(greetingFor(21)).toBe("Boa noite");
  });

  it("trata as bordas de cada período", () => {
    expect(greetingFor(0)).toBe("Boa madrugada");
    expect(greetingFor(5)).toBe("Boa madrugada");
    expect(greetingFor(6)).toBe("Bom dia");
    expect(greetingFor(11)).toBe("Bom dia");
    expect(greetingFor(12)).toBe("Boa tarde");
    expect(greetingFor(17)).toBe("Boa tarde");
    expect(greetingFor(18)).toBe("Boa noite");
    expect(greetingFor(23)).toBe("Boa noite");
  });

  it("cai num neutro para hora impossível", () => {
    // A hora vem de fora. Um valor fora de faixa não pode produzir saudação
    // errada nem quebrar o cabeçalho inteiro.
    expect(greetingFor(-1)).toBe("Olá");
    expect(greetingFor(24)).toBe("Olá");
    expect(greetingFor(Number.NaN)).toBe("Olá");
  });

  it("acrescenta o nome quando ele existe", () => {
    expect(greetingFor(9, "Luiz")).toBe("Bom dia, Luiz");
    expect(greetingFor(20, "Luiz")).toBe("Boa noite, Luiz");
  });

  it("continua sem nome quando ele não foi passado", () => {
    // Aparelho sem perfil local é estado legítimo: enquanto o wizard não
    // conclui, o cabeçalho já precisa renderizar.
    expect(greetingFor(9)).toBe("Bom dia");
  });

  it("ignora nome vazio ou só com espaços", () => {
    expect(greetingFor(9, "")).toBe("Bom dia");
    expect(greetingFor(9, "   ")).toBe("Bom dia");
  });

  it("apara espaços do nome", () => {
    expect(greetingFor(9, "  Luiz  ")).toBe("Bom dia, Luiz");
  });
});
