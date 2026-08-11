import { describe, expect, it } from "vitest";
import { CELLS, monthGrid, shiftDay, shiftMonth } from "./calendar";

describe("shiftDay", () => {
  it("anda para frente e para trás", () => {
    expect(shiftDay("2026-08-10", 1)).toBe("2026-08-11");
    expect(shiftDay("2026-08-10", -1)).toBe("2026-08-09");
    expect(shiftDay("2026-08-10", 7)).toBe("2026-08-17");
  });

  it("atravessa mês, ano e fevereiro bissexto", () => {
    expect(shiftDay("2026-08-31", 1)).toBe("2026-09-01");
    expect(shiftDay("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDay("2024-02-28", 1)).toBe("2024-02-29");
    expect(shiftDay("2026-02-28", 1)).toBe("2026-03-01");
  });
});

describe("shiftMonth", () => {
  it("anda de mês sem depender do dia", () => {
    expect(shiftMonth("2026-08", 1)).toBe("2026-09");
    expect(shiftMonth("2026-08", -1)).toBe("2026-07");
  });

  it("atravessa a virada do ano", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("monthGrid", () => {
  /*
    Seis semanas sempre. Uma grade que encolhe faz o popover pular de altura ao
    trocar de mês, e o botão que o usuário ia clicar muda de lugar debaixo do
    dedo.
  */
  it("tem sempre seis semanas", () => {
    for (const month of ["2026-02", "2026-08", "2027-01"]) {
      expect(monthGrid(month)).toHaveLength(CELLS);
    }
  });

  it("começa no domingo anterior ao dia 1", () => {
    // 1 de agosto de 2026 é sábado: a grade abre no domingo, 26 de julho.
    const grade = monthGrid("2026-08");

    expect(grade[0]?.date).toBe("2026-07-26");
    expect(grade[0]?.inMonth).toBe(false);
    expect(grade[6]?.date).toBe("2026-08-01");
    expect(grade[6]?.inMonth).toBe(true);
  });

  it("marca os dias de fora para a UI poder apagá-los", () => {
    const grade = monthGrid("2026-08");
    const dentro = grade.filter((cell) => cell.inMonth);

    expect(dentro).toHaveLength(31);
    expect(dentro[0]?.date).toBe("2026-08-01");
    expect(dentro[30]?.date).toBe("2026-08-31");
  });

  it("cobre fevereiro que começa no domingo sem repetir dia", () => {
    // 1 de fevereiro de 2026 é domingo: sem folga na frente, e ainda assim seis
    // semanas — a grade avança até março.
    const grade = monthGrid("2026-02");

    expect(grade[0]?.date).toBe("2026-02-01");
    expect(grade[CELLS - 1]?.date).toBe("2026-03-14");
    expect(new Set(grade.map((cell) => cell.date)).size).toBe(CELLS);
  });
});
