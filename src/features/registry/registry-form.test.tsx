import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PaymentMethodRecord } from "../../domain/projections/apply";
import { RegistryForm } from "./registry-form";

afterEach(cleanup);

const NOOP = { onSubmit: () => {}, onCancel: () => {}, existingNames: [] };

function type(label: RegExp | string, value: string) {
  fireEvent.input(screen.getByLabelText(label), { target: { value } });
}

function submit() {
  fireEvent.submit(
    screen.getByRole("button", { name: /adicionar|salvar/i }).closest("form") as HTMLFormElement,
  );
}

describe("RegistryForm de categoria", () => {
  it("submete nome, ícone e cor", () => {
    const onSubmit = vi.fn();
    render(<RegistryForm entity="category" editing={null} {...NOOP} onSubmit={onSubmit} />);

    type(/nome/i, "Mercado");
    fireEvent.click(screen.getByRole("radio", { name: /utensils/i }));
    fireEvent.click(screen.getByRole("radio", { name: /emerald/i }));
    submit();

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Mercado",
      icon: "utensils",
      color: "emerald",
    });
  });

  it("bloqueia nome vazio com mensagem", () => {
    const onSubmit = vi.fn();
    render(<RegistryForm entity="category" editing={null} {...NOOP} onSubmit={onSubmit} />);

    submit();

    expect(screen.getByRole("alert").textContent).toBe("Informe um nome.");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("bloqueia nome só com espaços", () => {
    const onSubmit = vi.fn();
    render(<RegistryForm entity="category" editing={null} {...NOOP} onSubmit={onSubmit} />);

    type(/nome/i, "   ");
    submit();

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("bloqueia nome duplicado com mensagem", () => {
    // Validacao de produto, no formulario e nao no dominio: depois do sync duas
    // pessoas podem criar "Mercado" ao mesmo tempo legitimamente, e o log aceita
    // as duas. A tela avisa; o dominio nao rejeita.
    const onSubmit = vi.fn();
    render(
      <RegistryForm
        entity="category"
        editing={null}
        {...NOOP}
        existingNames={["Mercado"]}
        onSubmit={onSubmit}
      />,
    );

    type(/nome/i, "  mercado ");
    submit();

    expect(screen.getByRole("alert").textContent).toBe("Ja existe um item com esse nome.");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("deixa salvar o proprio nome ao editar", () => {
    // Sem isto, abrir a edicao e salvar sem mudar nada acusaria duplicata.
    const onSubmit = vi.fn();
    render(
      <RegistryForm
        entity="category"
        editing={{
          id: "cat-1",
          name: "Mercado",
          icon: "tag",
          color: "slate",
          deleted: false,
          materialized: true,
          fieldHlc: {},
        }}
        {...NOOP}
        existingNames={["Mercado"]}
        onSubmit={onSubmit}
      />,
    );

    submit();

    expect(onSubmit).toHaveBeenCalled();
  });

  it("preenche os campos com o registro em edicao", () => {
    render(
      <RegistryForm
        entity="category"
        editing={{
          id: "cat-1",
          name: "Farmacia",
          icon: "pill",
          color: "rose",
          deleted: false,
          materialized: true,
          fieldHlc: {},
        }}
        {...NOOP}
      />,
    );

    expect((screen.getByLabelText(/nome/i) as HTMLInputElement).value).toBe("Farmacia");
    expect((screen.getByRole("radio", { name: /pill/i }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: /rose/i }) as HTMLInputElement).checked).toBe(true);
  });

  it("nao oferece seletor de kind", () => {
    render(<RegistryForm entity="category" editing={null} {...NOOP} />);

    expect(screen.queryByLabelText(/tipo de pagamento/i)).toBeNull();
  });

  it("cancelar nao emite nada", () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(
      <RegistryForm
        entity="category"
        editing={{
          id: "cat-1",
          name: "Mercado",
          icon: "tag",
          color: "slate",
          deleted: false,
          materialized: true,
          fieldHlc: {},
        }}
        {...NOOP}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(onCancel).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("RegistryForm de forma de pagamento", () => {
  it("oferece o seletor de kind e o inclui no draft", () => {
    const onSubmit = vi.fn();
    render(<RegistryForm entity="paymentMethod" editing={null} {...NOOP} onSubmit={onSubmit} />);

    type(/nome/i, "Nubank");
    fireEvent.change(screen.getByLabelText(/tipo de pagamento/i), { target: { value: "credit" } });
    submit();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Nubank", kind: "credit" }),
    );
  });

  it("nasce com kind 'other', nao com cartao", () => {
    // 'other' e o unico default que nao afirma nada errado sobre a forma. Nascer
    // 'credit' faria o formulario da fatia 3 oferecer cashback sem motivo.
    const onSubmit = vi.fn();
    render(<RegistryForm entity="paymentMethod" editing={null} {...NOOP} onSubmit={onSubmit} />);

    type(/nome/i, "Vale refeicao");
    submit();

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ kind: "other" }));
  });

  it("preenche o kind do registro em edicao", () => {
    const editing: PaymentMethodRecord = {
      id: "pm-1",
      name: "Nubank",
      icon: "credit-card",
      color: "violet",
      kind: "credit",
      deleted: false,
      materialized: true,
      fieldHlc: {},
    };
    render(<RegistryForm entity="paymentMethod" editing={editing} {...NOOP} />);

    expect((screen.getByLabelText(/tipo de pagamento/i) as HTMLSelectElement).value).toBe("credit");
  });
});
