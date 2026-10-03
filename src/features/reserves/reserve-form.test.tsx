import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Category } from "../../domain/model/category";
import { ALIVE } from "../../domain/model/row.fake";
import { essentialCost } from "../../domain/reserves/essential";
import { reserve, stateOf, tx } from "../../domain/reserves/fixtures.fake";
import { ReserveForm, type ReserveFormProps } from "./reserve-form";

afterEach(cleanup);

const EMERGENCY = reserve("01J9F3K2M7QX8YB4TVWZ0DCEH1", {
  kind: "emergency",
  // Como a store grava: a emergência não tem nome.
  name: "",
  icon: "lifebuoy",
  color: "violet",
  multiple: 6,
  essentialOverrideMinor: 400_000,
  recurring: { amountMinor: 50_000, day: 6, since: "2026-05" },
});
const MOR = "01J9F3K2M7QX8YB4TVWZ0DCEH3";
const MORADIA: Category = {
  ...ALIVE,
  id: MOR,
  name: "Moradia",
  icon: "house",
  color: "sky",
  kind: "expense",
};
const HISTORY = ["03", "04", "05", "06", "07", "08"].map((m) =>
  tx(`h${m}`, "expense", 395_000, `2026-${m}-05`, MOR),
);
const WITH_HISTORY = { ...stateOf({ transactions: HISTORY }), categories: { [MOR]: MORADIA } };
const WITH_EMERGENCY = stateOf({ reserves: [EMERGENCY] });

const GOAL = reserve("01J9F3K2M7QX8YB4TVWZ0DCEH2", {
  name: "Viagem",
  icon: "car",
  color: "amber",
  recurring: { amountMinor: 30_000, day: 6, since: "2026-10" },
});
const goalState = stateOf({ reserves: [GOAL] });

function mount(props: Partial<ReserveFormProps> = {}) {
  const handlers = { onSubmit: vi.fn(), onDelete: vi.fn(), onCancel: vi.fn() };
  render(
    <ReserveForm
      state={WITH_EMERGENCY}
      today="2026-09-20"
      editing={null}
      initialKind="goal"
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

// "Nome" e "Meta" também são rótulos dos segmentos da barra: o papel desambigua.
const nome = () => screen.getByRole("textbox", { name: "Nome" }) as HTMLInputElement;
const meta = () => screen.getByRole("textbox", { name: "Meta" });
const prazo = () => screen.getByLabelText("Até quando") as HTMLInputElement;

function digitarNome(valor: string) {
  fireEvent.input(nome(), { target: { value: valor } });
}

function continuar(vezes = 1) {
  for (let i = 0; i < vezes; i++) {
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  }
}

function enviar(rotulo: "Criar reserva" | "Salvar") {
  fireEvent.click(screen.getByRole("button", { name: rotulo }));
}

function etapas() {
  return within(screen.getByRole("list", { name: "Etapas" }))
    .getAllByRole("button")
    .map((b) => b.getAttribute("aria-label"));
}

const etapaAtual = () =>
  screen
    .getByRole("list", { name: "Etapas" })
    .querySelector("[aria-current='step']")
    ?.getAttribute("aria-label");

const segmento = (nome: string) =>
  within(screen.getByRole("list", { name: "Etapas" })).getByRole("button", {
    name: nome,
  }) as HTMLButtonElement;

/** Nome digitado (na criação) e avanço até a etapa da meta. */
function ateAMeta(valor?: string) {
  if (valor !== undefined) digitarNome(valor);
  continuar(3);
}

describe("ReserveForm: caixinha", () => {
  it("Emergência desativada quando já existe; sem nome não sai da primeira etapa", () => {
    const { onSubmit } = mount();
    const emergencia = screen.getByRole("radio", { name: /Emergência/ }) as HTMLInputElement;
    expect(emergencia.disabled).toBe(true);
    expect(screen.getByText("Você já tem uma")).toBeDefined();
    expect(etapas()).toEqual(["Nome", "Ícone", "Cor", "Meta"]);
    expect(segmento("Ícone").disabled).toBe(true);

    continuar();
    expect(screen.getByRole("alert").textContent).toBe("Informe um nome.");
    expect(etapaAtual()).toBe("Nome");

    digitarNome("Notebook");
    expect(segmento("Meta").disabled).toBe(false);
    continuar();
    expect(etapaAtual()).toBe("Ícone");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("anda Nome → Ícone → Cor → Meta e volta; o resumo mostra o nome", () => {
    mount();
    digitarNome("Notebook novo");
    continuar();
    expect(screen.getByText("Notebook novo")).toBeDefined();
    expect(screen.getByText(/caixinha/)).toBeDefined();
    continuar();
    expect(etapaAtual()).toBe("Cor");
    continuar();
    expect(etapaAtual()).toBe("Meta");
    expect(screen.queryByRole("button", { name: "Continuar" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(etapaAtual()).toBe("Cor");
    fireEvent.click(segmento("Nome"));
    expect(nome().value).toBe("Notebook novo");
    expect(screen.queryByRole("button", { name: "Voltar" })).toBeNull();
  });

  it("Enter numa etapa intermediária avança em vez de criar", () => {
    const { onSubmit } = mount();
    digitarNome("X");
    fireEvent.submit(nome().closest("form") as HTMLFormElement);
    expect(etapaAtual()).toBe("Ícone");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("meta + prazo mostram a sugestão; ligar a sugestão manda recurringAmountMinor", () => {
    const { onSubmit } = mount();
    digitarNome("Notebook novo");
    continuar();
    fireEvent.click(screen.getByRole("radio", { name: "laptop" }));
    continuar(2);
    fireEvent.input(meta(), { target: { value: "500000" } });
    fireEvent.input(prazo(), { target: { value: "2027-06" } });
    expect(screen.getByText(/Guardar R\$\s?556 todo mês/)).toBeDefined();
    expect(screen.getByText("9 depósitos chegam lá em jun 2027")).toBeDefined();
    expect(screen.getByText(/meta R\$\s?5\.000 até jun 2027/)).toBeDefined();
    enviar("Criar reserva");
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "goal",
        name: "Notebook novo",
        icon: "laptop",
        targetMinor: 500_000,
        deadline: "2027-06",
        recurringAmountMinor: 55_600,
      }),
    );
  });

  it("desligar a sugestão manda recurringAmountMinor null", () => {
    const { onSubmit } = mount();
    ateAMeta("X");
    fireEvent.input(meta(), { target: { value: "500000" } });
    fireEvent.input(prazo(), { target: { value: "2027-06" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /todo mês/ }));
    enviar("Criar reserva");
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ recurringAmountMinor: null }));
  });

  it("sem prazo: sem card de sugestão", () => {
    mount();
    ateAMeta("X");
    fireEvent.input(meta(), { target: { value: "500000" } });
    expect(screen.queryByText(/todo mês/)).toBeNull();
  });

  it("um depósito chega lá, no singular", () => {
    mount();
    ateAMeta("X");
    fireEvent.input(meta(), { target: { value: "100000" } });
    fireEvent.input(prazo(), { target: { value: "2026-10" } });
    expect(screen.getByText("1 depósito chega lá em out 2026")).toBeDefined();
  });

  it("a etapa Ícone já mostra o catálogo inteiro, sem 'Mais ícones'", () => {
    const { onSubmit } = mount();
    digitarNome("Férias");
    continuar();
    expect(screen.getByRole("radio", { name: "baby" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "laptop" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Mais ícones" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "plane-tilt" }));
    continuar(2);
    enviar("Criar reserva");
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ icon: "plane-tilt" }));
  });

  it("a prévia da cor mostra a linha como na lista", () => {
    const { onSubmit } = mount();
    digitarNome("Férias");
    continuar(2);
    expect(screen.getByText("Prévia")).toBeDefined();
    expect(screen.getByText("Sem meta")).toBeDefined();
    fireEvent.click(screen.getByRole("radio", { name: "Rosa" }));
    continuar();
    enviar("Criar reserva");
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ color: "rose" }));
  });

  it("criar caixinha: o prazo começa no mês seguinte", () => {
    mount();
    ateAMeta("X");
    expect(prazo().min).toBe("2026-10");
  });

  it("editar caixinha: só o nome na primeira etapa, campos preenchidos, depósito mantido", () => {
    const viagem = { ...GOAL, targetMinor: 500_000, deadline: "2027-06" };
    const { onSubmit } = mount({ editing: viagem, state: stateOf({ reserves: [viagem] }) });
    expect(screen.queryByRole("radio", { name: /Caixinha/ })).toBeNull();
    expect(nome().value).toBe("Viagem");
    continuar(2);
    expect(screen.getByText(/Faltam R\$\s?5\.000 · até jun 2027/)).toBeDefined();
    continuar();
    expect(screen.getByText(/o saldo volta para o mês atual/)).toBeDefined();
    enviar("Salvar");
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Viagem", icon: "car", recurringAmountMinor: 30_000 }),
    );
  });

  it("prazo vencido não trava a edição: sem `min` no mês e o form não valida nativo", () => {
    // happy-dom não roda a validação nativa; o que se prova é que ela não tem com o que travar.
    const late = reserve("01J9F3K2M7QX8YB4TVWZ0DCEH2", { name: "Viagem", deadline: "2026-08" });
    const { onSubmit } = mount({ editing: late, state: stateOf({ reserves: [late] }) });
    ateAMeta();
    expect(prazo().hasAttribute("min")).toBe(false);
    expect(prazo().closest("form")?.noValidate).toBe(true);
    enviar("Salvar");
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ deadline: "2026-08" }));
  });

  it("renomear caixinha com depósito e sem meta nem prazo mantém o depósito", () => {
    const { onSubmit } = mount({ editing: GOAL, state: goalState });
    digitarNome("Viagem longa");
    ateAMeta();
    expect(screen.getByText(/Guardando R\$\s?300 todo mês/)).toBeDefined();
    enviar("Salvar");
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Viagem longa", recurringAmountMinor: 30_000 }),
    );
  });

  it("meta atingida mantém o depósito gravado", () => {
    const reached = { ...GOAL, targetMinor: 100_000, deadline: "2027-06" };
    const { onSubmit } = mount({ editing: reached, state: stateOf({ reserves: [reached] }) });
    ateAMeta();
    enviar("Salvar");
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ recurringAmountMinor: 30_000 }),
    );
  });

  it("limpar o prazo mantém o depósito gravado", () => {
    const withDeadline = { ...GOAL, targetMinor: 500_000, deadline: "2027-06" };
    const { onSubmit } = mount({
      editing: withDeadline,
      state: stateOf({ reserves: [withDeadline] }),
    });
    ateAMeta();
    fireEvent.input(prazo(), { target: { value: "" } });
    enviar("Salvar");
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ recurringAmountMinor: 30_000 }),
    );
  });

  it("desligar o toggle de um depósito gravado manda null", () => {
    const { onSubmit } = mount({ editing: GOAL, state: goalState });
    ateAMeta();
    fireEvent.click(screen.getByRole("checkbox", { name: /todo mês/ }));
    enviar("Salvar");
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ recurringAmountMinor: null }));
  });

  it("o X do cabeçalho chama onCancel; segurar a lixeira chama onDelete", () => {
    const { onCancel, onDelete } = mount({ editing: GOAL, state: goalState });
    expect(screen.queryByRole("button", { name: /Reservas/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    vi.useFakeTimers();
    fireEvent.pointerDown(screen.getByRole("button", { name: /Excluir Viagem/ }));
    vi.advanceTimersByTime(5000);
    vi.useRealTimers();
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("criar não tem lixeira", () => {
    mount();
    expect(screen.queryByRole("button", { name: /Excluir/ })).toBeNull();
  });
});

describe("ReserveForm: emergência", () => {
  it("trocar o tipo na primeira etapa troca as etapas", () => {
    mount({ state: stateOf({}) });
    expect(etapas()).toEqual(["Nome", "Ícone", "Cor", "Meta"]);
    fireEvent.click(screen.getByRole("radio", { name: /Emergência/ }));
    expect(etapas()).toEqual(["Tipo", "Meses", "Depósito"]);
    expect(screen.queryByRole("textbox", { name: "Nome" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /Caixinha/ }));
    expect(etapas()).toEqual(["Nome", "Ícone", "Cor", "Meta"]);
  });

  it("criar emergência com histórico: sem campo de custo, mostra o custo e a meta", () => {
    const { onSubmit } = mount({ state: WITH_HISTORY, initialKind: "emergency" });
    expect(etapas()).toEqual(["Tipo", "Meses", "Depósito"]);
    continuar();
    expect(screen.queryByLabelText("Custo essencial por mês")).toBeNull();
    expect(screen.getByText("Pelos seus lançamentos")).toBeDefined();
    // Em Meses o resumo repetiria o card; ele só aparece em Depósito.
    expect(screen.queryByText(/meses do custo essencial/)).toBeNull();
    continuar();
    expect(screen.getByText(/6 meses do custo essencial/)).toBeDefined();
    expect(screen.getByText(/Começa em outubro, todo dia 20/)).toBeDefined();
    enviar("Criar reserva");
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "emergency", multiple: 6, essentialOverrideMinor: null }),
    );
  });

  it("criar emergência sem histórico: custo obrigatório para sair de Meses", () => {
    const { onSubmit } = mount({ state: stateOf({}), initialKind: "emergency" });
    continuar();
    expect(segmento("Depósito").disabled).toBe(true);
    continuar();
    expect(screen.getByRole("alert").textContent).toBe("Informe o custo essencial por mês.");
    expect(etapaAtual()).toBe("Meses");
    fireEvent.input(screen.getByLabelText("Custo essencial por mês"), {
      target: { value: "400000" },
    });
    expect(segmento("Depósito").disabled).toBe(false);
    continuar();
    enviar("Criar reserva");
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ essentialOverrideMinor: 400_000 }),
    );
  });

  it("editar emergência: só múltiplo e depósito mensal, e excluir com aviso", () => {
    const { onSubmit } = mount({ editing: EMERGENCY, initialKind: "emergency" });
    expect(etapas()).toEqual(["Meses", "Depósito"]);
    expect(screen.queryByLabelText("Nome")).toBeNull();
    expect(screen.queryByRole("radio", { name: /Caixinha/ })).toBeNull();
    // O Segmented é um fieldset (role "group"), não um radiogroup.
    expect(screen.getByRole("group", { name: /meses/i })).toBeDefined();
    expect(screen.getByLabelText("Custo essencial por mês")).toBeDefined();
    expect(screen.getByRole("button", { name: /Excluir reserva de emergência/ })).toBeDefined();
    fireEvent.click(screen.getByRole("radio", { name: "12 meses" }));
    continuar();
    expect(screen.getByLabelText("Valor por mês")).toBeDefined();
    expect(screen.getByText(/12 meses do custo essencial/)).toBeDefined();
    expect(screen.getByText(/o saldo volta para o mês atual/)).toBeDefined();
    enviar("Salvar");
    expect(onSubmit).toHaveBeenCalledWith({
      kind: "emergency",
      name: "",
      icon: "lifebuoy",
      color: "violet",
      targetMinor: null,
      multiple: 12,
      essentialOverrideMinor: 400_000,
      deadline: null,
      recurringAmountMinor: 50_000,
    });
  });

  it("editar emergência sem override e sem histórico: o campo de custo aparece", () => {
    const calc = { ...EMERGENCY, essentialOverrideMinor: null };
    // Sem categorias essenciais o custo não existe e o campo tem de aparecer.
    mount({ editing: calc, initialKind: "emergency", state: stateOf({ reserves: [calc] }) });
    expect(screen.getByLabelText("Custo essencial por mês")).toBeDefined();
  });

  it("editar emergência: o custo digitado não pode ficar vazio sem histórico", () => {
    const { onSubmit } = mount({ editing: EMERGENCY, initialKind: "emergency" });
    fireEvent.input(screen.getByLabelText("Custo essencial por mês"), { target: { value: "" } });
    expect(segmento("Depósito").disabled).toBe(true);
    continuar();
    expect(screen.getByRole("alert").textContent).toBe("Informe o custo essencial por mês.");
    expect(screen.queryByRole("button", { name: "Salvar" })).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("depósito mensal ligado sem valor orienta e não salva", () => {
    const bare = { ...EMERGENCY, recurring: null };
    const { onSubmit } = mount({
      editing: bare,
      initialKind: "emergency",
      state: stateOf({ reserves: [bare] }),
    });
    continuar();
    fireEvent.click(screen.getByRole("checkbox", { name: /Guardar todo mês/ }));
    expect(screen.getByText("Digite o valor por mês")).toBeDefined();
    enviar("Salvar");
    expect(screen.getByRole("alert").textContent).toBe("Informe o valor por mês.");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("com histórico calculável, limpar o custo manual manda override null", () => {
    const withOverride = reserve("01J9F3K2M7QX8YB4TVWZ0DCEH4", {
      kind: "emergency",
      multiple: 6,
      essentialCategoryIds: [MOR],
      essentialOverrideMinor: 400_000,
    });
    const state = { ...WITH_HISTORY, reserves: { [withOverride.id]: withOverride } };
    const { onSubmit } = mount({ editing: withOverride, initialKind: "emergency", state });
    // O texto lido pelo leitor de tela (a primeira parte do Money), só os dígitos: o valor em centavos.
    const alvo = () =>
      screen
        .getByTestId("suggested-target")
        .querySelector(".sr-only")
        ?.textContent?.replace(/\D/g, "");
    expect(alvo()).toBe(String(400_000 * 6));
    fireEvent.input(screen.getByLabelText("Custo essencial por mês"), { target: { value: "" } });
    // O campo continua (dá para digitar de novo), e a meta volta ao custo pelos lançamentos.
    expect(screen.getByLabelText("Custo essencial por mês")).toBeDefined();
    expect(screen.getByText("Vazio usa o custo pelos lançamentos")).toBeDefined();
    const calculado = essentialCost(state, [MOR], "2026-09-20") ?? 0;
    expect(calculado).toBeGreaterThan(0);
    expect(alvo()).toBe(String(calculado * 6));
    continuar();
    enviar("Salvar");
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "emergency", essentialOverrideMinor: null }),
    );
  });

  it("editar emergência duplicada: só o aviso e a exclusão; fecha pelo X", () => {
    const dup = { ...EMERGENCY, id: "01J9F3K2M7QX8YB4TVWZ0DCEH9" };
    const { onCancel } = mount({
      editing: dup,
      initialKind: "emergency",
      state: stateOf({ reserves: [EMERGENCY, dup] }),
    });
    expect(
      screen.getByText(
        "Reserva de emergência duplicada (criada em outro aparelho). Exclua uma delas.",
      ),
    ).toBeDefined();
    expect(screen.queryByRole("list", { name: "Etapas" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Salvar" })).toBeNull();
    expect(screen.queryByText("Custo essencial por mês")).toBeNull();
    expect(screen.getByRole("button", { name: /Excluir reserva de emergência/ })).toBeDefined();
    expect(screen.getAllByRole("button", { name: "Fechar" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
