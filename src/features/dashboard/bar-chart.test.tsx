import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import type { MonthTotals } from "../../domain/projections/breakdown";
import { BarChart } from "./bar-chart";

afterEach(cleanup);

function month(month: string, incomeMinor: number, expenseMinor: number): MonthTotals {
  return { month, incomeMinor, expenseMinor };
}

function heightOf(testId: string): string {
  return screen.getByTestId(testId).style.height;
}

describe("BarChart", () => {
  it("escala as duas séries pelo mesmo pico", () => {
    // Escalas independentes fariam uma despesa de R$ 100 desenhar do tamanho
    // de uma receita de R$ 10.000.
    render(<BarChart data={[month("2026-07", 10_000, 5000), month("2026-08", 2500, 0)]} />);

    expect(heightOf("bar-income-2026-07")).toBe("100%");
    expect(heightOf("bar-expense-2026-07")).toBe("50%");
    expect(heightOf("bar-income-2026-08")).toBe("25%");
    expect(heightOf("bar-expense-2026-08")).toBe("0%");
  });

  it("mostra o rótulo abreviado de cada mês", () => {
    render(<BarChart data={[month("2026-07", 100, 0), month("2026-08", 200, 0)]} />);

    expect(screen.getByText("jul")).toBeDefined();
    expect(screen.getByText("ago")).toBeDefined();
  });

  it("não renderiza nada quando a série inteira é zero", () => {
    // Verifica que o componente devolve null, e não que as barras sumiram:
    // um placeholder qualquer passaria na consulta por data-testid.
    const { container } = render(<BarChart data={[month("2026-07", 0, 0)]} />);

    expect(container.firstChild).toBeNull();
  });

  it("não renderiza nada com a série vazia", () => {
    const { container } = render(<BarChart data={[]} />);

    expect(container.firstChild).toBeNull();
  });
});
