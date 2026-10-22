import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PaymentMethod, PaymentMethodDraft } from "../../domain/model/payment-method";
import { ALIVE } from "../../domain/model/row.fake";
import { QuickCardSheet } from "./quick-card-sheet";

afterEach(cleanup);

function salvo(draft: PaymentMethodDraft): PaymentMethod {
  return { id: "pm-novo", ...draft, ...ALIVE } as PaymentMethod;
}

function montar(over: { existingNames?: string[]; onCreate?: () => Promise<PaymentMethod> } = {}) {
  const onCreate = vi.fn(over.onCreate ?? (async () => salvo({} as PaymentMethodDraft)));
  const onCreated = vi.fn();
  const onCancel = vi.fn();
  render(
    <QuickCardSheet
      existingNames={over.existingNames ?? []}
      onCreate={onCreate as never}
      onCreated={onCreated}
      onCancel={onCancel}
    />,
  );
  return { onCreate, onCreated, onCancel };
}

function continuar() {
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
}

function preencher(banco: string, fechamento: string, vencimento: string) {
  fireEvent.input(screen.getByLabelText("Banco"), { target: { value: banco } });
  fireEvent.input(screen.getByLabelText("Fechamento"), { target: { value: fechamento } });
  fireEvent.input(screen.getByLabelText("Vencimento"), { target: { value: vencimento } });
}

describe("cadastro rápido de cartão", () => {
  it("tem três etapas, com Progress e caretas, e o botão final nomeia a ação", () => {
    montar();
    expect(screen.getByRole("list", { name: "Etapas" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Etapa anterior" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Próxima etapa" })).toBeDefined();

    preencher("Inter", "10", "20");
    continuar();
    expect(screen.getByLabelText("Nome")).toBeDefined();
    continuar();

    expect(screen.getByRole("button", { name: "Salvar cartão" })).toBeDefined();
  });

  it("valida banco e dias de 1 a 31 como o cadastro completo", () => {
    const { onCreate } = montar();

    continuar();
    expect(screen.getByRole("alert").textContent).toMatch(/banco/i);

    preencher("Inter", "32", "10");
    continuar();
    expect(screen.getByRole("alert").textContent).toMatch(/fechamento/i);

    preencher("Inter", "10", "0");
    continuar();
    expect(screen.getByRole("alert").textContent).toMatch(/vencimento/i);

    expect(screen.getByLabelText("Banco")).toBeDefined();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("o nome sugerido é o banco e a prévia mostra cor e ciclo", () => {
    montar();
    preencher("Nubank", "5", "12");
    continuar();
    expect(screen.getByText(/Em branco, vale o banco \(Nubank\)/)).toBeDefined();
    continuar();

    expect(screen.getByTestId("card-mark")).toBeDefined();
    expect(screen.getByTestId("quick-card-preview").textContent).toContain(
      "Fecha dia 5 · vence dia 12",
    );
  });

  it("salva uma única linha de crédito e devolve o cartão a quem abriu", async () => {
    const { onCreate, onCreated } = montar({
      onCreate: async () => salvo({ name: "Inter" } as never),
    });
    preencher("Inter", "10", "20");
    continuar();
    fireEvent.click(screen.getByRole("radio", { name: "Laranja" }));
    continuar();
    fireEvent.click(screen.getByRole("button", { name: "Salvar cartão" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Inter",
        kind: "credit",
        bank: "Inter",
        closingDay: 10,
        dueDay: 20,
        color: "orange",
        icon: "credit-card",
      }),
    );
  });

  it("nome digitado vale mais que o banco", async () => {
    const { onCreate } = montar();
    preencher("Itaú", "3", "10");
    continuar();
    fireEvent.input(screen.getByLabelText("Nome"), { target: { value: "Itaú Platinum" } });
    continuar();
    fireEvent.click(screen.getByRole("button", { name: "Salvar cartão" }));

    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Itaú Platinum", bank: "Itaú" }),
    );
  });

  it("recusa nome repetido", () => {
    montar({ existingNames: ["Inter"] });
    preencher("inter", "10", "20");
    continuar();
    continuar();

    expect(screen.getByRole("alert").textContent).toMatch(/já existe/i);
    expect(screen.queryByRole("button", { name: "Salvar cartão" })).toBeNull();
  });

  it("cancelar não grava nada", () => {
    const { onCreate, onCreated, onCancel } = montar();
    preencher("Inter", "10", "20");
    continuar();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCreate).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("falha na gravação mantém o sheet aberto, com o erro, sem selecionar nada", async () => {
    const { onCreated } = montar({
      onCreate: async () => {
        throw new Error("disco cheio");
      },
    });
    preencher("Inter", "10", "20");
    continuar();
    continuar();
    fireEvent.click(screen.getByRole("button", { name: "Salvar cartão" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/disco cheio/));
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Salvar cartão" })).toBeDefined();
  });
});
