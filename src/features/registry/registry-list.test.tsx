import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Category } from "../../domain/model/category";
import type { PaymentMethod } from "../../domain/model/payment-method";
import { ALIVE } from "../../domain/model/row.fake";
import type { ColorToken } from "../../domain/model/tokens";
import { RegistryList } from "./registry-list";

afterEach(cleanup);

function categoria(overrides: Partial<Category> & { id: string }): Category {
  return {
    name: "Mercado",
    icon: "utensils",
    color: "emerald",
    kind: "expense",
    ...ALIVE,
    ...overrides,
  };
}

const NOOP = { onEdit: () => {}, emptyHint: "Nada aqui ainda." };

describe("RegistryList", () => {
  it("mostra nome, ícone e cor de cada item", () => {
    render(<RegistryList {...NOOP} items={[categoria({ id: "a" })]} />);

    const item = screen.getByRole("listitem");
    expect(within(item).getByText("Mercado")).toBeDefined();
    expect(within(item).getByTestId("icon-utensils")).toBeDefined();
    expect(item.innerHTML).toContain("--color-tag-emerald");
  });

  it("cai no ícone e na cor neutros para valores de uma versão futura", () => {
    render(
      <RegistryList
        {...NOOP}
        // O cast simula uma linha vinda do sync com um token que esta versão
        // não conhece: o tipo proíbe, mas o dado em runtime não é obrigado.
        items={[categoria({ id: "a", icon: "futuro", color: "chartreuse" as ColorToken })]}
      />,
    );

    const item = screen.getByRole("listitem");
    expect(within(item).getByTestId("icon-fallback")).toBeDefined();
    expect(item.innerHTML).toContain("--color-tag-slate");
  });

  it("mostra a dica quando não há nada", () => {
    render(<RegistryList {...NOOP} items={[]} />);

    expect(screen.getByText("Nada aqui ainda.")).toBeDefined();
    expect(screen.queryByRole("listitem")).toBeNull();
  });

  it("a linha inteira abre a edicao do item certo, sem botao de excluir", () => {
    const onEdit = vi.fn();
    const itens = [categoria({ id: "a" }), categoria({ id: "b", name: "Farmacia" })];
    render(<RegistryList {...NOOP} onEdit={onEdit} items={itens} />);

    const segundo = screen.getAllByRole("listitem")[1] as HTMLElement;
    fireEvent.click(within(segundo).getByRole("button", { name: /editar farmacia/i }));

    expect(onEdit).toHaveBeenCalledWith(itens[1]);
    expect(screen.queryByRole("button", { name: /excluir/i })).toBeNull();
  });
});

describe("RegistryList: cartão de crédito", () => {
  const forma = (over: Partial<PaymentMethod> & { id: string }): PaymentMethod => ({
    name: "Nubank",
    icon: "credit-card",
    color: "violet",
    kind: "credit",
    ...ALIVE,
    ...over,
  });

  it("cartão aparece só pela cor; as outras formas mantêm o tile de ícone", () => {
    render(
      <RegistryList
        {...NOOP}
        items={[forma({ id: "a" }), forma({ id: "b", name: "Pix", kind: "pix", icon: "zap" })]}
      />,
    );

    const [cartao, pix] = screen.getAllByRole("listitem") as HTMLElement[];
    expect(within(cartao as HTMLElement).getByTestId("card-mark")).toBeDefined();
    expect(within(cartao as HTMLElement).queryByTestId("icon-credit-card")).toBeNull();
    expect((cartao as HTMLElement).innerHTML).toContain("--color-tag-violet");
    expect(within(pix as HTMLElement).getByTestId("icon-zap")).toBeDefined();
  });

  it("cor desconhecida degrada para o cinza neutro", () => {
    render(
      <RegistryList {...NOOP} items={[forma({ id: "a", color: "chartreuse" as ColorToken })]} />,
    );

    expect(screen.getByRole("listitem").innerHTML).toContain("--color-tag-slate");
  });
});
