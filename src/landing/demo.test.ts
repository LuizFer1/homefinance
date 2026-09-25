import { describe, expect, it } from "vitest";
import { demoFrame, LOOP_MS, moneyParts, STILL_T } from "./demo";

describe("demoFrame", () => {
  it("comeca e termina com a tela apagada, para o corte do loop nao aparecer", () => {
    expect(demoFrame(0).screenVisible).toBe(false);
    expect(demoFrame(1000).screenVisible).toBe(true);
    expect(demoFrame(14_800).screenVisible).toBe(false);
  });

  it("segue o roteiro: inicio, os quatro passos e o salvo", () => {
    expect(demoFrame(1000).step).toBe(0);
    expect(demoFrame(3000).step).toBe(1);
    expect(demoFrame(5000).step).toBe(2);
    expect(demoFrame(7000).step).toBe(3);
    expect(demoFrame(9000).step).toBe(4);
    expect(demoFrame(11_000).step).toBe(5);
    expect(demoFrame(9000).wizardOpen).toBe(true);
    expect(demoFrame(11_000).wizardOpen).toBe(false);
  });

  it("o valor e digitado tecla a tecla ate R$ 38,90", () => {
    expect(demoFrame(4600).cents).toBe(0);
    expect(demoFrame(4900).cents).toBe(3);
    expect(demoFrame(5300).cents).toBe(38);
    expect(demoFrame(5700).cents).toBe(389);
    expect(demoFrame(6100).cents).toBe(3890);
  });

  it("afunda a tecla certa no toque", () => {
    expect(demoFrame(4700).pressedKey).toBe("3");
    expect(demoFrame(5100).pressedKey).toBe("8");
    expect(demoFrame(5000).pressedKey).toBeNull();
  });

  it("o saldo desce 38,90 depois de salvar, e so depois", () => {
    expect(demoFrame(10_000).balance).toBeCloseTo(2988, 2);
    expect(demoFrame(12_000).balance).toBeCloseTo(2949.1, 2);
    expect(demoFrame(12_000).spent).toBeCloseTo(2250.9, 2);
    expect(demoFrame(12_000).barPct).toBeCloseTo(75, 2);
  });

  it("o toque do + aparece e some em volta do instante marcado", () => {
    expect(demoFrame(1500).taps.plus.o).toBe(0);
    expect(demoFrame(2200).taps.plus.o).toBeGreaterThan(0.5);
    expect(demoFrame(3000).taps.plus.o).toBe(0);
  });

  it("e periodico: t e t + LOOP_MS dao a mesma tela", () => {
    expect(demoFrame(5123 + LOOP_MS)).toEqual(demoFrame(5123));
    expect(demoFrame(-LOOP_MS + 5123)).toEqual(demoFrame(5123));
  });

  it("a tela parada de movimento reduzido e o inicio, sem assistente", () => {
    const still = demoFrame(STILL_T);
    expect(still.screenVisible).toBe(true);
    expect(still.wizardOpen).toBe(false);
    expect(still.newRow).toBe(false);
  });
});

describe("moneyParts", () => {
  it("formata no padrao brasileiro em pt", () => {
    expect(moneyParts(2988, "pt")).toEqual({ int: "2.988", dec: ",00" });
    expect(moneyParts(2949.1, "pt")).toEqual({ int: "2.949", dec: ",10" });
  });

  it("formata no padrao americano em en", () => {
    expect(moneyParts(2988, "en")).toEqual({ int: "2,988", dec: ".00" });
    expect(moneyParts(38.9, "en")).toEqual({ int: "38", dec: ".90" });
  });
});
