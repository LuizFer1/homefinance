import { describe, expect, it } from "vitest";
import {
  dayHeading,
  dayLabel,
  dayMonth,
  daysBetween,
  lastMonths,
  monthLabelLong,
  monthLabelShort,
  monthOf,
  shortDate,
  weekdayShort,
} from "./periods";

describe("monthOf", () => {
  it("corta a data no mês", () => {
    expect(monthOf("2026-08-10")).toBe("2026-08");
  });

  it("não desloca o mês no primeiro nem no último dia", () => {
    // Este é o teste que justifica não usar Date: `new Date("2026-08-01")` é
    // lido como UTC e no fuso do Brasil vira 31/07 às 21h, jogando todo dia 1º
    // para o mês anterior.
    expect(monthOf("2026-08-01")).toBe("2026-08");
    expect(monthOf("2026-08-31")).toBe("2026-08");
  });
});

describe("lastMonths", () => {
  it("termina no mês corrente e começa pelo mais antigo", () => {
    expect(lastMonths("2026-08-10", 6)).toEqual([
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
  });

  it("atravessa a virada de ano", () => {
    // O decremento ingênuo (mes - 1) quebra aqui: janeiro menos um dá zero, e
    // zero não é mês nenhum.
    expect(lastMonths("2026-01-15", 6)).toEqual([
      "2025-08",
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
    ]);
  });

  it("devolve só o mês corrente quando a janela é de um", () => {
    expect(lastMonths("2026-01-15", 1)).toEqual(["2026-01"]);
  });

  it("devolve lista vazia quando a janela não tem tamanho", () => {
    expect(lastMonths("2026-08-10", 0)).toEqual([]);
  });
});

describe("rótulos", () => {
  it("abrevia em três letras", () => {
    expect(monthLabelShort("2026-08")).toBe("ago");
    expect(monthLabelShort("2026-01")).toBe("jan");
    expect(monthLabelShort("2026-12")).toBe("dez");
  });

  it("escreve por extenso com o ano", () => {
    expect(monthLabelLong("2026-08")).toBe("agosto de 2026");
    expect(monthLabelLong("2025-03")).toBe("março de 2025");
  });

  it("devolve rótulo vazio para mês fora de 1..12", () => {
    // O log é eterno e sincroniza com versões futuras: um mês corrompido tem
    // que degradar para vazio, não quebrar o render inteiro da tela.
    expect(monthLabelShort("2026-13")).toBe("");
    expect(monthLabelShort("2026-00")).toBe("");
    expect(monthLabelLong("2026-13")).toBe("");
  });
});

describe("dayLabel", () => {
  const HOJE = "2026-08-10";

  it("reconhece hoje e ontem", () => {
    // Sao os dois dias que o usuario reconhece sem ler a data.
    expect(dayLabel("2026-08-10", HOJE)).toBe("Hoje");
    expect(dayLabel("2026-08-09", HOJE)).toBe("Ontem");
  });

  it("do antepenultimo em diante volta a data por extenso", () => {
    expect(dayLabel("2026-08-08", HOJE)).toBe("08 de agosto");
  });

  it("omite o ano corrente e mostra o de outro ano", () => {
    // Repetir o ano em toda linha de um extrato do mes seria ruido constante.
    expect(dayLabel("2026-01-03", HOJE)).toBe("03 de janeiro");
    expect(dayLabel("2025-12-31", HOJE)).toBe("31 de dezembro de 2025");
  });

  it("acha o dia anterior na virada de mes, de ano e no bissexto", () => {
    expect(dayLabel("2026-07-31", "2026-08-01")).toBe("Ontem");
    expect(dayLabel("2025-12-31", "2026-01-01")).toBe("Ontem");
    expect(dayLabel("2024-02-29", "2024-03-01")).toBe("Ontem");
    // 2100 nao e bissexto: o dia anterior a 01/03 e 28/02, nao 29/02.
    expect(dayLabel("2100-02-28", "2100-03-01")).toBe("Ontem");
  });

  it("nao confunde o dia seguinte com ontem", () => {
    expect(dayLabel("2026-08-11", HOJE)).toBe("11 de agosto");
  });

  it("data corrompida aparece crua em vez de derrubar o render", () => {
    expect(dayLabel("2026-13-01", HOJE)).toBe("2026-13-01");
  });
});

describe("weekdayShort / shortDate", () => {
  it("abrevia o dia da semana sem depender do fuso", () => {
    expect(weekdayShort("2026-09-24")).toBe("qui");
    expect(weekdayShort("2026-09-20")).toBe("dom");
  });

  it("monta 'qui, 24 set' e só põe o ano quando muda", () => {
    expect(shortDate("2026-09-24", "2026-09-24")).toBe("qui, 24 set");
    expect(shortDate("2025-12-31", "2026-01-02")).toBe("qua, 31 dez 2025");
  });

  it("chip de próximas vezes", () => {
    expect(dayMonth("2026-10-04")).toBe("4 out");
  });
});

describe("dayHeading", () => {
  it("prefixa Hoje e Ontem e capitaliza os demais", () => {
    expect(dayHeading("2026-09-24", "2026-09-24")).toBe("Hoje · qui, 24 set");
    expect(dayHeading("2026-09-23", "2026-09-24")).toBe("Ontem · qua, 23 set");
    expect(dayHeading("2026-09-21", "2026-09-24")).toBe("Seg, 21 set");
  });
});

describe("daysBetween", () => {
  it("conta dias corridos atravessando o mês", () => {
    expect(daysBetween("2026-09-24", "2026-09-30")).toBe(6);
    expect(daysBetween("2026-09-30", "2026-10-01")).toBe(1);
  });
});
