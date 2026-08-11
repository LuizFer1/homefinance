import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./app";
import type { EventStore } from "./data/event-store";
import { fakeEventStore } from "./data/event-store.fake";
import { userCreated } from "./domain/events/user";
import { createOnboardingStore } from "./features/onboarding/store";
import { createProfileStore } from "./features/profile/store";
import { createRecurrenceStore } from "./features/recurrence/store";
import { createRegistryStore } from "./features/registry/store";
import { createSession, LOCAL_USER_ID_KEY } from "./features/session/session";
import { createTransactionsStore } from "./features/transactions/store";
import { HOLD_MS } from "./features/transactions/transaction-list";

afterEach(cleanup);

const PERFIL_LOCAL = "01J9F3K2M7QX8YB4TVWZ0DCEHU";
const DEVICE_LOCAL = "01J9F3K2M7QX8YB4TVWZ0DCEHZ";

/**
 * Duplo de aparelho **já cadastrado**: o meta traz `localUserId` e o log o
 * `user.create` correspondente. Sem o evento, a linha de perfil em Ajustes
 * ficaria desabilitada (perfil nulo) e os testes de edição não teriam o que
 * abrir.
 */
function fakeCadastrado(seed: Parameters<typeof fakeEventStore>[0] = []) {
  const comPerfil =
    seed.length > 0
      ? seed
      : [
          userCreated({
            eventId: "01J9F3K2M7QX8YB4TVWZ0DCEE1",
            entityId: PERFIL_LOCAL,
            deviceId: DEVICE_LOCAL,
            hlc: `1754697500000-0000-${DEVICE_LOCAL}`,
            draft: { name: "Luiz", color: "teal", avatar: null },
          }),
        ];
  return fakeEventStore(comPerfil, { [LOCAL_USER_ID_KEY]: PERFIL_LOCAL });
}

/** As stores partilham a mesma sessao, como em producao. */
function buildStores(events: EventStore) {
  let millis = 1_754_697_600_000;
  const session = createSession({
    events,
    now: () => {
      millis += 1;
      return millis;
    },
    randomChunk: (count: number) => Array.from({ length: count }, (_, index) => index % 32),
  });
  return {
    store: createTransactionsStore(session),
    registry: createRegistryStore(session),
    profileStore: createProfileStore(session),
    recurrence: createRecurrenceStore(session),
    onboarding: createOnboardingStore(session),
    localUserId: session.localUserId,
    processFile: () => Promise.resolve("data:image/webp;base64,AAAA"),
    onReset: () => {},
  };
}

/** O tema escreve num documento à parte para não sujar o do testing-library. */
function fakeTheme() {
  const map = new Map<string, string>();
  return {
    storage: {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
    },
    doc: document.implementation.createHTMLDocument("tema"),
  };
}

/**
 * O mesmo destino existe na fila de acoes e na barra inferior. As consultas
 * precisam dizer qual, senao ficam ambiguas.
 */
function naBarra() {
  return within(screen.getByRole("navigation", { name: "Seções" }));
}

function naFila() {
  return within(screen.getByRole("navigation", { name: "Ações rápidas" }));
}

/** Abre o modal pela acao rapida de despesa e espera a primeira etapa. */
async function abrirModal() {
  fireEvent.click(naFila().getByRole("button", { name: "Despesa" }));
  await waitFor(() => expect(screen.getByLabelText("Descrição")).toBeDefined());
}

/** Navega ate Ajustes e entra na sub-tela pedida. */
function irParaCadastro(nome: RegExp) {
  fireEvent.click(naBarra().getByRole("button", { name: "Ajustes" }));
  fireEvent.click(screen.getByRole("button", { name: nome }));
}

/** Avanca todas as etapas da wizard (3 na edicao, 4 na criacao) e salva. */
function concluirWizard() {
  for (let i = 0; i < 6 && screen.queryByRole("button", { name: "Continuar" }); i += 1) {
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  }
  fireEvent.click(screen.getByRole("button", { name: /adicionar|salvar/i }));
}

async function addTransaction(description: string, amount: string) {
  await abrirModal();
  fireEvent.input(screen.getByLabelText("Descrição"), { target: { value: description } });
  fireEvent.input(screen.getByLabelText("Valor"), { target: { value: amount } });
  concluirWizard();
  await waitFor(() => expect(screen.getByText(description)).toBeDefined());
}

/** Abre a edicao tocando no lancamento e espera o modal. */
async function abrirEdicao(description: string) {
  fireEvent.click(screen.getByRole("button", { name: `Editar ${description}` }));
  await waitFor(() => expect(screen.getByLabelText("Descrição")).toBeDefined());
}

describe("App", () => {
  it("mostra saudacao e saldo no cabecalho", async () => {
    render(
      <App {...buildStores(fakeCadastrado())} today="2026-08-08" hour={9} theme={fakeTheme()} />,
    );

    await waitFor(() => expect(screen.getByRole("heading", { name: /Bom dia/i })).toBeDefined());
    expect(screen.getByTestId("total-balance")).toBeDefined();
    expect(screen.getByText("Saldo total")).toBeDefined();
  });

  it("adiciona um lançamento e atualiza os totais", async () => {
    render(
      <App {...buildStores(fakeCadastrado())} today="2026-08-08" hour={9} theme={fakeTheme()} />,
    );
    await waitFor(() =>
      expect(screen.getByRole("navigation", { name: "Ações rápidas" })).toBeDefined(),
    );

    await addTransaction("Mercado", "12,34");

    // Os totais moraram no Inicio ate a reestruturacao; agora sao do Dashboard.
    fireEvent.click(naBarra().getByRole("button", { name: "Dashboard" }));
    expect(screen.getByTestId("total-expense").textContent).toContain("12,34");
  });

  it("edita emitindo patch apenas do campo alterado", async () => {
    const events = fakeCadastrado();
    render(<App {...buildStores(events)} today="2026-08-08" hour={9} theme={fakeTheme()} />);
    await waitFor(() =>
      expect(screen.getByRole("navigation", { name: "Ações rápidas" })).toBeDefined(),
    );
    await addTransaction("Mercado", "12,34");

    await abrirEdicao("Mercado");
    fireEvent.input(screen.getByLabelText("Valor"), { target: { value: "5,00" } });
    concluirWizard();

    await waitFor(() =>
      expect(events.events.some((event) => event.action === "update")).toBe(true),
    );
    const update = events.events.find((event) => event.action === "update");
    expect(update?.data).toEqual({ amountMinor: 500 });
  });

  it("não emite evento quando nada mudou na edição", async () => {
    const events = fakeCadastrado();
    render(<App {...buildStores(events)} today="2026-08-08" hour={9} theme={fakeTheme()} />);
    await waitFor(() =>
      expect(screen.getByRole("navigation", { name: "Ações rápidas" })).toBeDefined(),
    );
    await addTransaction("Mercado", "12,34");

    await abrirEdicao("Mercado");
    concluirWizard();

    // Modal fecha sem emitir: o patch sai vazio e um log append-only nao merece
    // lixo permanente.
    await waitFor(() => expect(screen.queryByLabelText("Descrição")).toBeNull());
    expect(events.events.filter((event) => event.action === "update")).toHaveLength(0);
  });

  it("remove o lançamento da lista", async () => {
    render(
      <App {...buildStores(fakeCadastrado())} today="2026-08-08" hour={9} theme={fakeTheme()} />,
    );
    await waitFor(() =>
      expect(screen.getByRole("navigation", { name: "Ações rápidas" })).toBeDefined(),
    );
    await addTransaction("Mercado", "12,34");

    /*
      `shouldAdvanceTime` porque o `waitFor` logo abaixo depende do relógio
      andar: com timers falsos parados ele esgotaria o tempo sem nunca reavaliar.
    */
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Excluir Mercado (segure para confirmar)" }),
    );
    await act(async () => {
      vi.advanceTimersByTime(HOLD_MS);
    });
    vi.useRealTimers();

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Nenhum lançamento ainda/i })).toBeDefined(),
    );
  });

  it("mostra erro quando o armazenamento não abre", async () => {
    const broken = fakeEventStore();
    broken.readAll = async () => {
      throw new Error("IndexedDB indisponível");
    };
    render(<App {...buildStores(broken)} today="2026-08-08" hour={9} theme={fakeTheme()} />);

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("IndexedDB indisponível"),
    );
  });
});

/** Gesto horizontal na `<main>` (arraste entre abas). */
function arrastarHorizontal(main: Element, fromX: number, toX: number) {
  fireEvent.pointerDown(main, {
    pointerId: 1,
    pointerType: "touch",
    isPrimary: true,
    clientX: fromX,
    clientY: 200,
    button: 0,
  });
  // Passo intermédio para travar o eixo horizontal (limiar ~10px).
  fireEvent.pointerMove(main, {
    pointerId: 1,
    pointerType: "touch",
    isPrimary: true,
    clientX: fromX + (toX > fromX ? 20 : -20),
    clientY: 200,
  });
  fireEvent.pointerMove(main, {
    pointerId: 1,
    pointerType: "touch",
    isPrimary: true,
    clientX: toX,
    clientY: 200,
  });
  fireEvent.pointerUp(main, {
    pointerId: 1,
    pointerType: "touch",
    isPrimary: true,
    clientX: toX,
    clientY: 200,
  });
}

describe("navegacao", () => {
  it("arrastar para a esquerda vai de Inicio para Ajustes", async () => {
    render(
      <App {...buildStores(fakeCadastrado())} today="2026-08-08" hour={9} theme={fakeTheme()} />,
    );
    await waitFor(() =>
      expect(screen.getByRole("navigation", { name: "Ações rápidas" })).toBeDefined(),
    );

    const main = document.querySelector("main.hf-swipe");
    expect(main).not.toBeNull();
    arrastarHorizontal(main as Element, 200, 100);

    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Configurações" })).toBeDefined(),
    );
    expect(naBarra().getByRole("button", { name: "Ajustes" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("arrastar para a direita vai de Inicio para Dashboard", async () => {
    render(
      <App {...buildStores(fakeCadastrado())} today="2026-08-08" hour={9} theme={fakeTheme()} />,
    );
    await waitFor(() =>
      expect(screen.getByRole("navigation", { name: "Ações rápidas" })).toBeDefined(),
    );

    const main = document.querySelector("main.hf-swipe");
    expect(main).not.toBeNull();
    arrastarHorizontal(main as Element, 100, 220);

    await waitFor(() => expect(screen.getByRole("region", { name: "Dashboard" })).toBeDefined());
    expect(naBarra().getByRole("button", { name: "Dashboard" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("troca para categorias e volta para lancamentos", async () => {
    render(
      <App {...buildStores(fakeCadastrado())} today="2026-08-08" hour={9} theme={fakeTheme()} />,
    );
    await waitFor(() =>
      expect(screen.getByRole("navigation", { name: "Ações rápidas" })).toBeDefined(),
    );

    irParaCadastro(/^Categorias/);
    expect(screen.getByRole("region", { name: "Categorias" })).toBeDefined();

    fireEvent.click(naBarra().getByRole("button", { name: "Início" }));
    expect(screen.getByRole("navigation", { name: "Ações rápidas" })).toBeDefined();
    expect(screen.queryByRole("region", { name: "Categorias" })).toBeNull();
  });

  it("cadastra categoria e volta com o lancamento intacto", async () => {
    // O ciclo que a fatia inteira existe para permitir: sair da tela de
    // lancamentos, cadastrar, e voltar sem perder nada — as duas telas leem a
    // mesma projecao.
    const events = fakeCadastrado();
    render(<App {...buildStores(events)} today="2026-08-08" hour={9} theme={fakeTheme()} />);
    await waitFor(() =>
      expect(screen.getByRole("navigation", { name: "Ações rápidas" })).toBeDefined(),
    );
    await addTransaction("Mercado", "12,34");

    irParaCadastro(/^Categorias/);
    fireEvent.click(screen.getByRole("button", { name: /\+ Nova categoria/ }));
    fireEvent.input(screen.getByLabelText(/nome/i), { target: { value: "Alimentacao" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    await waitFor(() => expect(screen.getByText("Alimentacao")).toBeDefined());

    fireEvent.click(naBarra().getByRole("button", { name: "Início" }));

    // O lancamento continua la, e os dois eventos foram para o mesmo log.
    expect(screen.getByText("Mercado")).toBeDefined();
    expect(events.events.map((e) => e.entity).sort()).toEqual(["category", "transaction", "user"]);
  });

  it("a tela de pagamentos oferece o tipo e a de categorias nao", async () => {
    render(
      <App {...buildStores(fakeCadastrado())} today="2026-08-08" hour={9} theme={fakeTheme()} />,
    );
    await waitFor(() =>
      expect(screen.getByRole("navigation", { name: "Ações rápidas" })).toBeDefined(),
    );

    irParaCadastro(/^Categorias/);
    fireEvent.click(screen.getByRole("button", { name: /\+ Nova categoria/ }));
    expect(screen.queryByLabelText(/tipo de pagamento/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    irParaCadastro(/^Formas de pagamento/);
    fireEvent.click(screen.getByRole("button", { name: /\+ Nova forma de pagamento/ }));
    expect(screen.getByLabelText(/tipo de pagamento/i)).toBeDefined();
  });
});

describe("modal de lançamento", () => {
  async function pronto() {
    render(
      <App {...buildStores(fakeCadastrado())} today="2026-08-08" hour={9} theme={fakeTheme()} />,
    );
    await waitFor(() =>
      expect(screen.getByRole("navigation", { name: "Ações rápidas" })).toBeDefined(),
    );
  }

  it("o formulário não fica na tela até a ação ser tocada", async () => {
    // A tela principal e a lista. O formulario so aparece quando pedido — e o
    // que libera espaco vertical num celular.
    await pronto();

    expect(screen.queryByLabelText("Descrição")).toBeNull();

    fireEvent.click(naFila().getByRole("button", { name: "Despesa" }));

    expect(screen.getByLabelText("Descrição")).toBeDefined();
  });

  it("fechar descarta o rascunho sem gravar nada", async () => {
    await pronto();
    await abrirModal();
    fireEvent.input(screen.getByLabelText("Descrição"), { target: { value: "Nao vai" } });

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    await waitFor(() => expect(screen.queryByLabelText("Descrição")).toBeNull());
    expect(screen.queryByText("Nao vai")).toBeNull();
  });

  it("reabrir depois de fechar começa limpo", async () => {
    // A wizard e montada so enquanto o modal esta aberto, com key. Sem isso o
    // rascunho abandonado reapareceria no proximo lancamento.
    await pronto();
    await abrirModal();
    fireEvent.input(screen.getByLabelText("Descrição"), { target: { value: "Rascunho" } });
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    await abrirModal();

    expect((screen.getByLabelText("Descrição") as HTMLInputElement).value).toBe("");
  });

  it("salvar fecha o modal e mostra o lançamento na lista", async () => {
    await pronto();

    await addTransaction("Padaria", "9,90");

    expect(screen.queryByLabelText("Descrição")).toBeNull();
    expect(screen.getByText("Padaria")).toBeDefined();
  });
});

describe("fila de ações rápidas", () => {
  async function pronto() {
    render(
      <App {...buildStores(fakeCadastrado())} today="2026-08-08" hour={9} theme={fakeTheme()} />,
    );
    await waitFor(() =>
      expect(screen.getByRole("navigation", { name: "Ações rápidas" })).toBeDefined(),
    );
  }

  it("saúda conforme a hora injetada e o nome do perfil", async () => {
    await pronto();

    expect(screen.getByRole("heading", { name: /bom dia, luiz/i })).toBeDefined();
  });

  it("Despesa abre o modal já em despesa", async () => {
    // Economiza um toque no caso mais comum: o tipo ja vem escolhido.
    await pronto();

    fireEvent.click(naFila().getByRole("button", { name: "Despesa" }));

    await waitFor(() => expect(screen.getByLabelText("Descrição")).toBeDefined());
    expect((screen.getByRole("radio", { name: "Despesa" }) as HTMLInputElement).checked).toBe(true);
  });

  it("Receita abre o modal já em receita", async () => {
    await pronto();

    fireEvent.click(naFila().getByRole("button", { name: "Receita" }));

    await waitFor(() => expect(screen.getByLabelText("Descrição")).toBeDefined());
    expect((screen.getByRole("radio", { name: "Receita" }) as HTMLInputElement).checked).toBe(true);
  });

  it("a fila de Inicio so oferece despesa e receita", async () => {
    // Cadastro de categoria e forma fica em Ajustes: na home competia com o
    // fluxo diario e pedia atalho para uma acao ocasional.
    await pronto();

    expect(naFila().getByRole("button", { name: "Despesa" })).toBeDefined();
    expect(naFila().getByRole("button", { name: "Receita" })).toBeDefined();
    expect(naFila().queryByRole("button", { name: "Nova categoria" })).toBeNull();
    expect(naFila().queryByRole("button", { name: /Nova forma/ })).toBeNull();
  });

  it("a fila some fora da tela de lançamentos", async () => {
    await pronto();

    fireEvent.click(naBarra().getByRole("button", { name: "Ajustes" }));

    expect(screen.queryByRole("navigation", { name: "Ações rápidas" })).toBeNull();
  });

  it("o tipo escolhido na fila não vaza para a próxima abertura", async () => {
    // A wizard e remontada por key a cada abertura. Sem isso, abrir por Receita
    // e depois pelo botao flutuante manteria receita selecionada.
    await pronto();
    fireEvent.click(naFila().getByRole("button", { name: "Receita" }));
    await waitFor(() => expect(screen.getByLabelText("Descrição")).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    fireEvent.click(naFila().getByRole("button", { name: "Despesa" }));

    await waitFor(() => expect(screen.getByLabelText("Descrição")).toBeDefined());
    expect((screen.getByRole("radio", { name: "Despesa" }) as HTMLInputElement).checked).toBe(true);
  });
});

describe("as tres telas", () => {
  async function pronto() {
    render(
      <App {...buildStores(fakeCadastrado())} today="2026-08-08" hour={9} theme={fakeTheme()} />,
    );
    await waitFor(() =>
      expect(screen.getByRole("navigation", { name: "Ações rápidas" })).toBeDefined(),
    );
  }

  it("abre em Início", async () => {
    await pronto();

    expect(naBarra().getByRole("button", { name: "Início" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("o saldo fica visível nas três telas", async () => {
    // E o unico numero que merece estar sempre a vista, entao vive no cabecalho
    // fixo e nao dentro de uma aba.
    await pronto();
    for (const aba of ["Dashboard", "Início", "Ajustes"]) {
      fireEvent.click(naBarra().getByRole("button", { name: aba }));
      expect(screen.getByTestId("total-balance")).toBeDefined();
    }
  });

  it("o Dashboard mostra os totais e diz quando não há nada", async () => {
    await pronto();
    fireEvent.click(naBarra().getByRole("button", { name: "Dashboard" }));
    expect(screen.getByText(/Nenhum lançamento ainda/)).toBeDefined();

    fireEvent.click(naBarra().getByRole("button", { name: "Início" }));
    await addTransaction("Mercado", "12,34");
    fireEvent.click(naBarra().getByRole("button", { name: "Dashboard" }));

    expect(screen.getByTestId("total-expense").textContent).toContain("12,34");
    expect(screen.getByText(/1 lançamento/)).toBeDefined();
  });

  it("Ajustes lista os cadastros com a contagem", async () => {
    await pronto();

    fireEvent.click(naBarra().getByRole("button", { name: "Ajustes" }));

    expect(screen.getByRole("region", { name: "Configurações" })).toBeDefined();
    expect(screen.getByRole("button", { name: /^Categorias/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /^Formas de pagamento/ })).toBeDefined();
  });

  it("hub aparece desabilitado, com o motivo; perfil abre a edicao", async () => {
    // Hub desabilitado comunica que sync existe no projeto e e opcional.
    // Perfil e editavel: o cadastro ja aconteceu no wizard.
    await pronto();

    fireEvent.click(naBarra().getByRole("button", { name: "Ajustes" }));

    expect(screen.getByRole("button", { name: /Luiz/ })).toBeDefined();
    expect(screen.getByText("Hub de sincronização")).toBeDefined();
    expect(
      screen.getByText(/roda no seu computador, nunca um servidor de terceiros/),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: /Hub de sincronização/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Luiz/ }));
    expect(screen.getByRole("region", { name: "Seu perfil" })).toBeDefined();
  });

  it("o avatar do cabecalho abre a edicao de perfil de qualquer tela", async () => {
    // Mudar foto/nome/cor e o que se espera ao tocar no rosto — nao so a
    // entrada em Ajustes. Sem isto o atalho do cabecalho seria so decoracao.
    await pronto();

    fireEvent.click(screen.getByRole("button", { name: "Editar perfil" }));

    expect(screen.getByRole("region", { name: "Seu perfil" })).toBeDefined();
  });

  it("sair de Ajustes e voltar cai na raiz, não na sub-tela", async () => {
    await pronto();
    irParaCadastro(/^Categorias/);
    expect(screen.getByRole("region", { name: "Categorias" })).toBeDefined();

    fireEvent.click(naBarra().getByRole("button", { name: "Início" }));
    fireEvent.click(naBarra().getByRole("button", { name: "Ajustes" }));

    expect(screen.getByRole("region", { name: "Configurações" })).toBeDefined();
  });

  it("o botão voltar sai da sub-tela de cadastro", async () => {
    await pronto();
    irParaCadastro(/^Categorias/);

    fireEvent.click(screen.getByRole("button", { name: "Voltar para configurações" }));

    expect(screen.getByRole("region", { name: "Configurações" })).toBeDefined();
  });

  it("não existe mais botão flutuante em tela nenhuma", async () => {
    await pronto();
    for (const aba of ["Dashboard", "Início", "Ajustes"]) {
      fireEvent.click(naBarra().getByRole("button", { name: aba }));
      expect(screen.queryByRole("button", { name: "Novo lançamento" })).toBeNull();
    }
  });
});

describe("primeiro uso", () => {
  /** Aparelho virgem: sem `localUserId` no meta. */
  function novoAparelho(over: Partial<Parameters<typeof App>[0]> = {}) {
    const events = fakeEventStore();
    render(
      <App {...buildStores(events)} today="2026-08-08" hour={9} theme={fakeTheme()} {...over} />,
    );
    return events;
  }

  it("bloqueia o app com o wizard na primeira abertura", async () => {
    // Renderiza no lugar do app, nao sobre ele: nao ha tela por tras do wizard
    // que faca sentido sem um autor.
    novoAparelho();

    await waitFor(() => expect(screen.getByLabelText(/seu nome/i)).toBeDefined());
    expect(screen.queryByRole("navigation", { name: "Ações rápidas" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Seções" })).toBeNull();
  });

  it("nao pede cadastro quando o aparelho ja tem perfil local", async () => {
    render(
      <App {...buildStores(fakeCadastrado())} today="2026-08-08" hour={9} theme={fakeTheme()} />,
    );

    await waitFor(() =>
      expect(screen.getByRole("navigation", { name: "Ações rápidas" })).toBeDefined(),
    );
    expect(screen.queryByLabelText(/seu nome/i)).toBeNull();
  });

  it("pede cadastro mesmo com um user de outro aparelho ja no log", async () => {
    // Decisao transversal 6: derivar de "existe algum user no log" faria este
    // aparelho pular o cadastro depois do sync, e todo lancamento seguinte
    // sairia sem autor.
    const outro = "01J9F3K2M7QX8YB4TVWZ0DCEHZ";
    render(
      <App
        {...buildStores(
          fakeEventStore([
            userCreated({
              eventId: "01J9F3K2M7QX8YB4TVWZ0DCEE1",
              entityId: "01J9F3K2M7QX8YB4TVWZ0DCEHO",
              deviceId: outro,
              hlc: `1754697500000-0000-${outro}`,
              draft: { name: "Ana", color: "rose", avatar: null },
            }),
          ]),
        )}
        today="2026-08-08"
        hour={9}
        theme={fakeTheme()}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText(/seu nome/i)).toBeDefined());
  });

  it("concluir o wizard abre o app com o nome na saudacao e as formas padrao", async () => {
    const events = novoAparelho();
    await waitFor(() => expect(screen.getByLabelText(/seu nome/i)).toBeDefined());

    fireEvent.input(screen.getByLabelText(/seu nome/i), { target: { value: "Luiz" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("radio", { name: "teal" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: /começar/i }));

    await waitFor(() =>
      expect(screen.getByRole("navigation", { name: "Ações rápidas" })).toBeDefined(),
    );
    expect(screen.getByRole("heading", { name: /bom dia, luiz/i })).toBeDefined();
    // Perfil, as quatro formas padrao e as categorias padrao, numa escrita so.
    expect(events.events[0]?.entity).toBe("user");
    expect(events.events.filter((e) => e.entity === "paymentMethod")).toHaveLength(4);
    expect(events.events.filter((e) => e.entity === "category").length).toBeGreaterThan(0);
    expect(await events.getMeta(LOCAL_USER_ID_KEY)).not.toBeNull();
  });

  it("falha na escrita do lote mantem o wizard na tela, sem estado parcial", async () => {
    const events = fakeEventStore();
    events.failNext = true;
    render(<App {...buildStores(events)} today="2026-08-08" hour={9} theme={fakeTheme()} />);
    await waitFor(() => expect(screen.getByLabelText(/seu nome/i)).toBeDefined());

    fireEvent.input(screen.getByLabelText(/seu nome/i), { target: { value: "Luiz" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(screen.getByRole("button", { name: /começar/i }));

    await waitFor(() => expect(events.failNext).toBe(true));
    expect(screen.getByLabelText(/escolher foto/i)).toBeDefined();
    expect(events.events).toHaveLength(0);
    expect(await events.getMeta(LOCAL_USER_ID_KEY)).toBeNull();
  });
});

describe("perfil e reset nas configuracoes", () => {
  async function emAjustes(onReset = () => {}) {
    const events = fakeCadastrado();
    render(
      <App
        {...buildStores(events)}
        onReset={onReset}
        today="2026-08-08"
        hour={9}
        theme={fakeTheme()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("navigation", { name: "Ações rápidas" })).toBeDefined(),
    );
    fireEvent.click(naBarra().getByRole("button", { name: "Ajustes" }));
    return events;
  }

  it("oferece resetar a conta atras da digitacao exata", async () => {
    const onReset = vi.fn();
    await emAjustes(onReset);

    const botao = screen.getByRole("button", { name: /^resetar conta$/i });
    expect(botao.hasAttribute("disabled")).toBe(true);

    fireEvent.input(screen.getByLabelText(/digite apagar/i), { target: { value: "APAGAR" } });
    fireEvent.click(botao);

    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("edita nome e cor do perfil e volta para Ajustes", async () => {
    const events = await emAjustes();

    fireEvent.click(screen.getByRole("button", { name: /Luiz/ }));
    fireEvent.input(screen.getByLabelText(/seu nome/i), { target: { value: "Ana" } });
    fireEvent.click(screen.getByRole("radio", { name: "rose" }));
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Configurações" })).toBeDefined(),
    );
    expect(screen.getByRole("button", { name: /Ana/ })).toBeDefined();
    expect(events.events.some((e) => e.entity === "user" && e.action === "update")).toBe(true);
  });
});
