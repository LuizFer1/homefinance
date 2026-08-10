import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import type { CategorySlice } from "../../domain/projections/breakdown";
import { DonutChart } from "./donut-chart";

afterEach(cleanup);

function slice(key: string, amountMinor: number, color = "rose"): CategorySlice {
  return { key, name: key, color, amountMinor };
}

/** O primeiro número do dasharray é o comprimento da fatia, na escala de 100. */
function dashes(container: Element): number[] {
  return [...container.querySelectorAll("circle")].map((circle) =>
    Number(circle.getAttribute("stroke-dasharray")?.split(" ")[0]),
  );
}

function offsets(container: Element): number[] {
  return [...container.querySelectorAll("circle")].map((circle) =>
    Number(circle.getAttribute("stroke-dashoffset")),
  );
}

describe("DonutChart", () => {
  it("desenha uma fatia por categoria, proporcional ao valor", () => {
    const { container } = render(
      <DonutChart slices={[slice("a", 7500), slice("b", 2500)]} caption="no mês" />,
    );

    // 75% e 25%, cada uma encurtada pelo respiro de 0.8.
    expect(dashes(container)).toEqual([74.2, 24.2]);
  });

  it("empilha as fatias pelo deslocamento acumulado", () => {
    const { container } = render(
      <DonutChart slices={[slice("a", 5000), slice("b", 5000)]} caption="no mês" />,
    );

    // A segunda começa onde a primeira terminou; o sinal negativo desloca o
    // padrão para frente ao longo do traço.
    //
    // O esperado é 0, e não -0: o componente calcula `-0`, mas o atributo do
    // DOM já serializa como "0". Escrever -0 aqui falharia, porque `toEqual`
    // separa os dois zeros e o que chega da leitura é o positivo.
    expect(offsets(container)).toEqual([0, -50]);
  });

  it("acumula o deslocamento ao longo de três fatias", () => {
    // Com duas fatias iguais o segundo offset coincide com a própria fatia, e
    // um erro de acumulação passaria. Com três, cada offset só bate se a soma
    // vier das anteriores.
    const { container } = render(
      <DonutChart
        slices={[slice("a", 5000), slice("b", 3000), slice("c", 2000)]}
        caption="no mês"
      />,
    );

    expect(offsets(container)).toEqual([0, -50, -80]);
  });

  it("não abre respiro quando há uma fatia só", () => {
    // Um talho num anel sem vizinho não separa nada — só parece defeito.
    const { container } = render(<DonutChart slices={[slice("a", 1000)]} caption="no mês" />);

    expect(dashes(container)).toEqual([100]);
  });

  it("não deixa fatia menor que o respiro virar comprimento negativo", () => {
    // Dasharray negativo é desenhado como traço cheio: a menor fatia do mês
    // apareceria como o anel inteiro.
    const { container } = render(
      <DonutChart slices={[slice("a", 9990), slice("b", 10)]} caption="no mês" />,
    );

    expect(dashes(container)[1]).toBe(0);
  });

  it("não renderiza nada quando o total é zero", () => {
    const { container } = render(<DonutChart slices={[slice("a", 0)]} caption="no mês" />);

    expect(container.querySelectorAll("circle")).toHaveLength(0);
  });

  it("lista nome e valor de cada fatia na legenda", () => {
    // A legenda é o conteúdo acessível: o SVG entra aria-hidden.
    //
    // Duas fatias de propósito. Com uma só, o valor da legenda seria idêntico
    // ao total no centro, e o teste passaria sem provar que a legenda tem
    // valor próprio.
    render(<DonutChart slices={[slice("Casa", 66_00), slice("Comida", 12_34)]} caption="no mês" />);

    expect(screen.getByText("Casa")).toBeDefined();
    expect(screen.getByText("Comida")).toBeDefined();
    // Total é R$ 78,34, então "12,34" só pode ter vindo da linha da legenda.
    expect(screen.getByText(/12,34/)).toBeDefined();
  });

  it("esconde o desenho do leitor de tela e começa a primeira fatia no topo", () => {
    // Os dois atributos carregam decisão de projeto: a legenda é o único
    // conteúdo acessível, e sem a rotação a rosca começaria às 3h. Ambos
    // sobreviveriam a uma regressão sem nenhum outro teste acusar.
    const { container } = render(<DonutChart slices={[slice("a", 1000)]} caption="no mês" />);
    const svg = container.querySelector("svg");

    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("class")).toContain("-rotate-90");
  });
});
