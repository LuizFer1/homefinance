import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { card, legacyCard, purchase, series, world } from "../../domain/cards/fixtures.fake";
import { StaleRowsError } from "../session/session";
import { MigrationSheet, type MigrationSheetProps } from "./migration-sheet";

afterEach(cleanup);

const STATE = world({
  methods: [
    legacyCard("generico", { name: "Cartão de crédito" }),
    legacyCard("velho", { name: "Itaú antigo" }),
    card("nu", { name: "Nubank", bank: "Nubank", closingDay: 5, dueDay: 12 }),
  ],
  transactions: [
    purchase("a", "generico", "2026-10-02", 10_000),
    purchase("b", "generico", "2026-10-03", 2_000),
    purchase("c", "velho", "2026-10-03", 500),
  ],
  recurrences: [series("assinatura", "generico")],
});

function montar(over: Partial<MigrationSheetProps> = {}) {
  const props = {
    state: STATE,
    onMigrate: vi.fn().mockResolvedValue(3),
    onDefer: vi.fn(),
    onExport: vi.fn().mockResolvedValue(undefined),
    onReload: vi.fn().mockResolvedValue(undefined),
    onDone: vi.fn(),
    ...over,
  };
  render(<MigrationSheet {...props} />);
  return props;
}

const continuar = () => fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

/** Escolhe o cartão `Nubank` nos dois grupos e chega à prévia. */
function escolherNubankNosDois() {
  continuar();
  fireEvent.click(screen.getByRole("radio", { name: /^Nubank/ }));
  continuar();
  fireEvent.click(screen.getByRole("radio", { name: /^Nubank/ }));
  continuar();
}

describe("MigrationSheet", () => {
  it("o resumo lista cada cartão por completar com a contagem de lançamentos", () => {
    montar();

    const list = screen.getByRole("list", { name: "Cartões por completar" });
    expect(list.textContent).toContain("Cartão de crédito");
    expect(list.textContent).toContain("2 lançamentos");
    expect(list.textContent).toContain("Itaú antigo");
    expect(list.textContent).toContain("1 lançamento");
  });

  it("oferece exportar dados antes e avisa quando o arquivo saiu", async () => {
    const { onExport } = montar();

    fireEvent.click(screen.getByRole("button", { name: "Exportar dados antes" }));

    await screen.findByText(/arquivo gerado/i);
    expect(onExport).toHaveBeenCalledOnce();
  });

  it("falha na exportação aparece e não impede a migração", async () => {
    montar({ onExport: vi.fn().mockRejectedValue(new Error("disco cheio")) });

    fireEvent.click(screen.getByRole("button", { name: "Exportar dados antes" }));

    expect((await screen.findByRole("alert")).textContent).toContain("disco cheio");
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDefined();
  });

  it("'Depois' adia sem gravar nada", () => {
    const { onDefer, onMigrate } = montar();

    fireEvent.click(screen.getByRole("button", { name: "Depois" }));

    expect(onDefer).toHaveBeenCalledOnce();
    expect(onMigrate).not.toHaveBeenCalled();
  });

  it("não deixa avançar até escolher um destino", () => {
    montar();
    continuar();

    expect((screen.getByRole("button", { name: "Continuar" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole("radio", { name: /^Nubank/ }));
    expect((screen.getByRole("button", { name: "Continuar" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("a prévia mostra de onde para onde, e o botão nomeia a ação", () => {
    montar();
    escolherNubankNosDois();

    const preview = screen.getByRole("list", { name: "Prévia" });
    expect(preview.textContent).toContain("Cartão de crédito → Nubank");
    expect(preview.textContent).toContain("Itaú antigo → Nubank");
    expect(preview.textContent).toContain("1 série acompanha");
    expect(screen.getByRole("button", { name: "Mover 3 lançamentos" })).toBeDefined();
  });

  it("confirma com um destino por grupo e fecha", async () => {
    const { onMigrate, onDone } = montar();
    continuar();
    fireEvent.click(screen.getByRole("radio", { name: /^Nubank/ }));
    continuar();
    fireEvent.click(screen.getByRole("radio", { name: "Criar cartão novo" }));
    fireEvent.input(screen.getByLabelText("Banco"), { target: { value: "Itaú" } });
    fireEvent.input(screen.getByLabelText("Fechamento"), { target: { value: "20" } });
    fireEvent.input(screen.getByLabelText("Vencimento"), { target: { value: "28" } });
    continuar();

    fireEvent.click(screen.getByRole("button", { name: "Mover 3 lançamentos" }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(onMigrate).toHaveBeenCalledWith({
      generico: { kind: "existing", cardId: "nu" },
      velho: {
        kind: "new",
        card: { bank: "Itaú", name: "", closingDay: 20, dueDay: 28, color: "violet" },
      },
    });
  });

  it("cartão novo exige banco e dias de 1 a 31 antes de avançar", () => {
    montar();
    continuar();
    fireEvent.click(screen.getByRole("radio", { name: "Criar cartão novo" }));
    const next = () => screen.getByRole("button", { name: "Continuar" }) as HTMLButtonElement;

    expect(next().disabled).toBe(true);
    fireEvent.input(screen.getByLabelText("Banco"), { target: { value: "Inter" } });
    fireEvent.input(screen.getByLabelText("Fechamento"), { target: { value: "40" } });
    fireEvent.input(screen.getByLabelText("Vencimento"), { target: { value: "10" } });
    expect(next().disabled).toBe(true);
    fireEvent.input(screen.getByLabelText("Fechamento"), { target: { value: "15" } });
    expect(next().disabled).toBe(false);
  });

  it("recusa por versão velha: recarrega, avisa e recomeça do resumo", async () => {
    const { onReload, onDone } = montar({
      onMigrate: vi.fn().mockRejectedValue(new StaleRowsError()),
    });
    escolherNubankNosDois();

    fireEvent.click(screen.getByRole("button", { name: "Mover 3 lançamentos" }));

    await screen.findByText(/outro aparelho mexeu/i);
    expect(onReload).toHaveBeenCalledOnce();
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByRole("list", { name: "Cartões por completar" })).toBeDefined();
  });

  it("outra falha mostra o motivo e deixa tentar de novo", async () => {
    const onMigrate = vi.fn().mockRejectedValueOnce(new Error("disco cheio")).mockResolvedValue(3);
    const { onDone } = montar({ onMigrate });
    escolherNubankNosDois();

    fireEvent.click(screen.getByRole("button", { name: "Mover 3 lançamentos" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Nada foi alterado");

    fireEvent.click(screen.getByRole("button", { name: "Mover 3 lançamentos" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("sem nada pendente diz que está tudo certo", () => {
    const { onDone } = montar({ state: world({ methods: [card("nu")] }) });

    expect(screen.getByText("Tudo certo")).toBeDefined();
    fireEvent.click(screen.getAllByRole("button", { name: "Fechar" }).at(-1) as HTMLElement);
    expect(onDone).toHaveBeenCalledOnce();
  });
});
