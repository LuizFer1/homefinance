import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BUSINESS_ICONS } from "../icons/icon-set";
import { BusinessWizard } from "./business-wizard";

afterEach(cleanup);

function renderWizard(onCreate = vi.fn().mockResolvedValue(undefined)) {
  const onClose = vi.fn();
  render(<BusinessWizard onCreate={onCreate} onClose={onClose} />);
  return { onCreate, onClose };
}

const next = () => fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
const typeName = (value: string) =>
  fireEvent.input(screen.getByLabelText("Nome do negócio"), { target: { value } });
const stepNow = () => screen.getByRole("button", { current: "step" }).getAttribute("aria-label");

describe("BusinessWizard", () => {
  it("tem três etapas: negócio, aparência e prévia", () => {
    renderWizard();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(3);
    expect(["Negócio", "Aparência", "Prévia"].map((n) => screen.getByLabelText(n))).toHaveLength(3);
    expect(stepNow()).toBe("Negócio");
  });

  it("sem nome não avança nem deixa pular para as etapas seguintes", () => {
    renderWizard();

    next();
    expect(screen.getByRole("alert").textContent).toBe("Informe o nome do negócio.");
    expect(stepNow()).toBe("Negócio");

    typeName("   ");
    fireEvent.click(screen.getByRole("button", { name: "Próxima etapa" }));
    expect(stepNow()).toBe("Negócio");
    expect((screen.getByRole("button", { name: "Prévia" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("Enter no campo de nome avança para a aparência", () => {
    renderWizard();
    typeName("Padaria");
    fireEvent.submit(screen.getByLabelText("Nome do negócio").closest("form") as HTMLFormElement);
    expect(stepNow()).toBe("Aparência");
  });

  it("na aparência oferece a paleta fechada e os ícones do negócio", () => {
    renderWizard();
    typeName("Padaria");
    next();

    expect(screen.getAllByRole("radio", { name: /^(Cinza|Violeta|Céu|Magenta)$/ })).toHaveLength(4);
    for (const key of BUSINESS_ICONS) {
      expect(screen.getByRole("radio", { name: key })).toBeDefined();
    }
  });

  it("os botões de etapa voltam e avançam, e o nome digitado sobrevive", () => {
    renderWizard();
    typeName("Padaria");
    fireEvent.click(screen.getByRole("button", { name: "Próxima etapa" }));
    expect(stepNow()).toBe("Aparência");

    fireEvent.click(screen.getByRole("button", { name: "Etapa anterior" }));
    expect(stepNow()).toBe("Negócio");
    expect((screen.getByLabelText("Nome do negócio") as HTMLInputElement).value).toBe("Padaria");
  });

  it("a prévia mostra o negócio e só ali o botão se chama Criar conta comercial", () => {
    renderWizard();
    typeName("  Padaria do Zé ");
    next();
    expect(screen.queryByRole("button", { name: "Criar conta comercial" })).toBeNull();
    next();

    expect(screen.getByTestId("business-preview-name").textContent).toBe("Padaria do Zé");
    expect(screen.getByText(/10 categorias de comércio/)).toBeDefined();
    expect(screen.getByText(/5 formas de pagamento/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Criar conta comercial" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Continuar" })).toBeNull();
  });

  it("criar entrega o nome sem espaços, a cor e o ícone escolhidos e fecha", async () => {
    const { onCreate, onClose } = renderWizard();
    typeName("  Padaria do Zé ");
    next();
    fireEvent.click(screen.getByRole("radio", { name: "Magenta" }));
    fireEvent.click(screen.getByRole("radio", { name: "coffee" }));
    next();
    fireEvent.click(screen.getByRole("button", { name: "Criar conta comercial" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith({
      name: "Padaria do Zé",
      color: "fuchsia",
      icon: "coffee",
    });
  });

  it("o padrão é a loja numa cor da paleta", async () => {
    const { onCreate } = renderWizard();
    typeName("Studio");
    next();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Criar conta comercial" }));

    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(onCreate).toHaveBeenCalledWith({ name: "Studio", color: "sky", icon: "store" });
  });

  it("falha na gravação mostra o motivo, não fecha e dá para tentar de novo", async () => {
    const onCreate = vi
      .fn()
      .mockRejectedValueOnce(new Error("sem espaço"))
      .mockResolvedValue(undefined);
    const { onClose } = renderWizard(onCreate);
    typeName("Padaria");
    next();
    next();

    fireEvent.click(screen.getByRole("button", { name: "Criar conta comercial" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Nada foi criado. sem espaço");
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Criar conta comercial" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onCreate).toHaveBeenCalledTimes(2);
  });

  it("toque duplo em Criar grava uma vez só", async () => {
    let resolve: () => void = () => {};
    const onCreate = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const { onClose } = renderWizard(onCreate);
    typeName("Padaria");
    next();
    next();

    const create = screen.getByRole("button", { name: "Criar conta comercial" });
    fireEvent.click(create);
    fireEvent.click(create);
    expect(onCreate).toHaveBeenCalledTimes(1);

    resolve();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
