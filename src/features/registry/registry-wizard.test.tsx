import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CategoryRecord, PaymentMethodRecord } from "../../domain/projections/apply";
import { RegistryWizard, type RegistryWizardProps } from "./registry-wizard";

afterEach(cleanup);

const CATEGORIA: CategoryRecord = {
  id: "cat-1",
  name: "Mercado",
  icon: "tag",
  color: "slate",
  kind: "expense",
  deleted: false,
  materialized: true,
  fieldHlc: {},
};

const METODO: PaymentMethodRecord = { ...CATEGORIA, id: "pm-1", name: "Nubank", kind: "credit" };

function montar(over: Partial<RegistryWizardProps> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(
    <RegistryWizard
      entity="category"
      editing={null}
      existingNames={[]}
      onSubmit={onSubmit}
      onCancel={onCancel}
      {...over}
    />,
  );
  return { onSubmit, onCancel };
}

function digitarNome(valor: string) {
  fireEvent.input(screen.getByLabelText(/nome/i), { target: { value: valor } });
}

function continuar() {
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
}

function salvar() {
  fireEvent.click(screen.getByRole("button", { name: /adicionar|salvar/i }));
}

/** Nome preenchido e avanco ate a etapa de cor. */
function ateACor(nome = "Mercado") {
  digitarNome(nome);
  continuar();
  continuar();
}

describe("navegação entre etapas", () => {
  it("começa no nome", () => {
    montar();

    expect(screen.getByLabelText(/nome/i)).toBeDefined();
    expect(screen.queryByRole("radio", { name: "emerald" })).toBeNull();
  });

  it("bloqueia avanço com nome vazio", () => {
    montar();

    continuar();

    expect(screen.getByRole("alert").textContent).toBe("Informe um nome.");
    expect(screen.getByLabelText(/nome/i)).toBeDefined();
  });

  it("bloqueia avanço com nome só de espaços", () => {
    montar();
    digitarNome("   ");

    continuar();

    expect(screen.getByRole("alert").textContent).toBe("Informe um nome.");
  });

  it("bloqueia avanço com nome duplicado", () => {
    // Validacao de produto, no formulario e nao no dominio: depois do sync duas
    // pessoas podem criar "Mercado" ao mesmo tempo legitimamente, e o log aceita
    // as duas. A tela avisa; o fold nao rejeita.
    montar({ existingNames: ["Mercado"] });
    digitarNome("  mercado ");

    continuar();

    expect(screen.getByRole("alert").textContent).toBe("Ja existe um item com esse nome.");
  });

  it("deixa avançar com o próprio nome ao editar", () => {
    // Sem isto, abrir a edicao e salvar sem renomear acusaria duplicata.
    montar({ editing: CATEGORIA, existingNames: ["Mercado"] });

    continuar();

    expect(screen.getByRole("radio", { name: "tag" })).toBeDefined();
  });

  it("avança e volta preservando o que foi escolhido", () => {
    montar();
    digitarNome("Farmacia");
    continuar();
    fireEvent.click(screen.getByRole("radio", { name: "pill" }));
    continuar();

    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect((screen.getByRole("radio", { name: "pill" }) as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Nome/ }));
    expect((screen.getByLabelText(/nome/i) as HTMLInputElement).value).toBe("Farmacia");
  });

  it("o indicador não deixa pular antes do nome válido", () => {
    montar();

    expect(screen.getByRole("button", { name: /Cor/ })).toHaveProperty("disabled", true);

    digitarNome("Mercado");

    expect(screen.getByRole("button", { name: /Cor/ })).toHaveProperty("disabled", false);
  });

  it("só a última etapa oferece o botão de salvar", () => {
    montar();
    digitarNome("Mercado");
    expect(screen.queryByRole("button", { name: "Adicionar" })).toBeNull();

    continuar();
    expect(screen.queryByRole("button", { name: "Adicionar" })).toBeNull();

    continuar();
    expect(screen.getByRole("button", { name: "Adicionar" })).toBeDefined();
  });

  it("fechar não emite nada", () => {
    const { onSubmit, onCancel } = montar();

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    expect(onCancel).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("categoria", () => {
  it("submete nome, ícone e cor", () => {
    const { onSubmit } = montar();

    digitarNome("Mercado");
    continuar();
    fireEvent.click(screen.getByRole("radio", { name: "utensils" }));
    continuar();
    fireEvent.click(screen.getByRole("radio", { name: "emerald" }));
    salvar();

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Mercado",
      icon: "utensils",
      color: "emerald",
      // Padrao 'both': esconder a categoria de um dos formularios por padrao
      // faria ela parecer apagada. Oferecer demais incomoda; sumir parece bug.
      kind: "both",
    });
  });

  it("categoria declara onde aparece, e o padrao serve aos dois lados", () => {
    const { onSubmit } = montar();

    digitarNome("Salario");
    fireEvent.change(screen.getByLabelText(/onde aparece/i), { target: { value: "income" } });
    continuar();
    continuar();
    salvar();

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ kind: "income" }));
  });

  it("forma de pagamento nao ganha o seletor de categoria, e vice-versa", () => {
    // Os dois `kind` tem tipos e significados diferentes: um decide cashback, o
    // outro decide em qual formulario a categoria aparece.
    montar({ entity: "paymentMethod" });
    expect(screen.queryByLabelText(/onde aparece/i)).toBeNull();
    expect(screen.getByLabelText(/tipo de pagamento/i)).toBeDefined();

    cleanup();

    montar();
    expect(screen.getByLabelText(/onde aparece/i)).toBeDefined();
    expect(screen.queryByLabelText(/tipo de pagamento/i)).toBeNull();
  });

  it("descarta espaços em volta do nome", () => {
    const { onSubmit } = montar();

    ateACor("  Mercado  ");
    salvar();

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: "Mercado" }));
  });

  it("não oferece seletor de tipo", () => {
    montar();

    expect(screen.queryByLabelText(/tipo de pagamento/i)).toBeNull();
  });

  it("preenche os campos do registro em edição", () => {
    montar({ editing: { ...CATEGORIA, icon: "pill", color: "rose" } });

    expect((screen.getByLabelText(/nome/i) as HTMLInputElement).value).toBe("Mercado");
    fireEvent.click(screen.getByRole("button", { name: /Ícone/ }));
    expect((screen.getByRole("radio", { name: "pill" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Cor/ }));
    expect((screen.getByRole("radio", { name: "rose" }) as HTMLInputElement).checked).toBe(true);
  });
});

describe("forma de pagamento", () => {
  it("oferece o tipo na primeira etapa e o inclui no draft", () => {
    const { onSubmit } = montar({ entity: "paymentMethod" });

    digitarNome("Nubank");
    fireEvent.change(screen.getByLabelText(/tipo de pagamento/i), {
      target: { value: "credit" },
    });
    continuar();
    continuar();
    salvar();

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Nubank", kind: "credit" }),
    );
  });

  it("nasce com tipo 'other', não com cartão", () => {
    // 'other' e o unico default que nao afirma nada errado sobre a forma. Nascer
    // cartao faria o lancamento oferecer cashback sem motivo.
    const { onSubmit } = montar({ entity: "paymentMethod" });

    ateACor("Vale refeicao");
    salvar();

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ kind: "other" }));
  });

  it("preenche o tipo do registro em edição", () => {
    montar({ entity: "paymentMethod", editing: METODO });

    expect((screen.getByLabelText(/tipo de pagamento/i) as HTMLSelectElement).value).toBe("credit");
  });

  it("nasce com o ícone de carteira, e categoria com o de etiqueta", () => {
    const { onSubmit } = montar({ entity: "paymentMethod" });
    ateACor("Vale");
    salvar();
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ icon: "wallet" }));

    cleanup();

    const categoria = montar();
    ateACor("Mercado");
    salvar();
    expect(categoria.onSubmit).toHaveBeenCalledWith(expect.objectContaining({ icon: "tag" }));
  });
});

describe("prévia na etapa de cor", () => {
  it("mostra nome, ícone e cor juntos antes de salvar", () => {
    // E a primeira vez que as tres escolhas aparecem na mesma tela.
    montar();
    digitarNome("Farmacia");
    continuar();
    fireEvent.click(screen.getByRole("radio", { name: "pill" }));
    continuar();

    expect(screen.getByText("Farmacia")).toBeDefined();
    expect(screen.getByTestId("icon-pill")).toBeDefined();
  });
});
