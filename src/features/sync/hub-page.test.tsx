import { signal } from "@preact/signals";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HubLink } from "../../data/hub-link";
import type { SyncSummary } from "../../sync/engine";
import type { HubDeepLink } from "./deep-link";
import { HubPage } from "./hub-page";
import type { SyncFailure, SyncStatus } from "./status";
import type { SyncStore } from "./store";

afterEach(cleanup);

const LINK: HubLink = {
  address: "192.168.0.5:7777",
  name: "HubFinance",
  key: "k",
  epoch: "E",
  deviceName: "Pixel",
  cursor: 3,
  tables: "",
  lastSyncAt: "2026-10-01T18:42:00.000Z",
  revoked: false,
};

interface Over {
  link?: HubLink | null;
  status?: SyncStatus;
  revoked?: boolean;
  lastError?: SyncFailure | null;
  lastSummary?: SyncSummary | null;
  deepLink?: HubDeepLink | null;
}

function fakeStore(over: Over = {}) {
  const store = {
    link: signal<HubLink | null>(over.link ?? null),
    status: signal<SyncStatus>(over.status ?? "idle"),
    revoked: signal(over.revoked ?? false),
    lastSyncAt: signal<string | null>(over.link?.lastSyncAt ?? null),
    lastError: signal<SyncFailure | null>(over.lastError ?? null),
    lastSummary: signal<SyncSummary | null>(over.lastSummary ?? null),
    pendingDeepLink: signal<HubDeepLink | null>(over.deepLink ?? null),
    init: vi.fn(async () => {}),
    pair: vi.fn(async () => {}),
    sync: vi.fn(async () => null),
    unpair: vi.fn(async () => {}),
  };
  return store as unknown as SyncStore & typeof store;
}

function montar(store: SyncStore) {
  const onBack = vi.fn();
  render(<HubPage sync={store} deviceNameGuess="Android" onBack={onBack} />);
  return onBack;
}

function preencher(address: string, token: string) {
  fireEvent.input(screen.getByLabelText("Endereço do hub"), { target: { value: address } });
  fireEvent.input(screen.getByLabelText("Código"), { target: { value: token } });
}

describe("HubPage — não pareado", () => {
  it("formulário desabilitado até endereço e código válidos; pareia normalizado", async () => {
    const store = fakeStore();
    montar(store);
    const parear = screen.getByRole("button", { name: "Parear" }) as HTMLButtonElement;
    expect(parear.disabled).toBe(true);
    expect((screen.getByLabelText("Nome deste aparelho") as HTMLInputElement).value).toBe(
      "Android",
    );

    preencher("192.168.0.5", "abc-def");
    expect(parear.disabled).toBe(false);
    fireEvent.click(parear);

    await waitFor(() =>
      expect(store.pair).toHaveBeenCalledWith({
        address: "192.168.0.5:7777",
        token: "ABCDEF",
        deviceName: "Android",
      }),
    );
  });

  it("endereço fora da rede de casa explica o motivo e não deixa parear", () => {
    montar(fakeStore());
    preencher("evil.example:443", "ABCDEF");

    expect(screen.getByText(/Endereços da internet são recusados/)).toBeDefined();
    expect((screen.getByRole("button", { name: "Parear" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("deep link preenche os campos e é consumido", () => {
    const store = fakeStore({ deepLink: { address: "10.0.0.2:7777", token: "QWERTY" } });
    montar(store);

    expect((screen.getByLabelText("Endereço do hub") as HTMLInputElement).value).toBe(
      "10.0.0.2:7777",
    );
    expect((screen.getByLabelText("Código") as HTMLInputElement).value).toBe("QWERTY");
    expect(store.pendingDeepLink.value).toBeNull();
  });

  it("o guia do certificado aponta para a porta 7778 do endereço digitado", () => {
    montar(fakeStore());
    preencher("192.168.0.5:7777", "");
    const guia = screen.getByRole("link", {
      name: "Abrir o guia do certificado",
    }) as HTMLAnchorElement;
    expect(guia.href).toBe("http://192.168.0.5:7778/");
    expect(guia.target).toBe("_blank");
  });

  it("falha ao parear mostra a mensagem; fora de alcance repete o link do guia", async () => {
    const store = fakeStore();
    store.pair.mockImplementation(async () => {
      store.lastError.value = { kind: "unreachable", message: "Não foi possível falar com o hub." };
      throw new Error("x");
    });
    montar(store);
    preencher("192.168.0.5", "ABCDEF");
    fireEvent.click(screen.getByRole("button", { name: "Parear" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Não foi possível"),
    );
    expect(screen.getAllByRole("link", { name: "Abrir o guia do certificado" }).length).toBe(2);
  });
});

describe("HubPage — pareado", () => {
  it("mostra o hub, o estado e sincroniza agora", async () => {
    const store = fakeStore({
      link: LINK,
      lastSummary: {
        pushed: 2,
        ignored: 0,
        rejected: [],
        pulled: 5,
        invalid: 0,
        unknownTables: [],
        epochReset: false,
      },
    });
    montar(store);

    expect(screen.getByText("HubFinance")).toBeDefined();
    expect(screen.getByText("192.168.0.5:7777")).toBeDefined();
    expect(screen.getByText(/Este aparelho: Pixel/)).toBeDefined();
    expect(screen.getByRole("status").textContent).toMatch(/^Último sync: /);
    expect(screen.getByText(/Enviados 2 · Recebidos 5/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Sincronizar agora" }));
    await waitFor(() => expect(store.sync).toHaveBeenCalledTimes(1));
  });

  it("hub fora de alcance no sincronizar agora repete o link do guia", async () => {
    const store = fakeStore({ link: LINK });
    store.sync.mockImplementation(async () => {
      store.lastError.value = { kind: "unreachable", message: "Não foi possível falar com o hub." };
      throw new Error("x");
    });
    montar(store);

    fireEvent.click(screen.getByRole("button", { name: "Sincronizar agora" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Não foi possível"),
    );
    const guia = screen.getByRole("link", {
      name: "Abrir o guia do certificado",
    }) as HTMLAnchorElement;
    expect(guia.href).toBe("http://192.168.0.5:7778/");
  });

  it("sincronizando desabilita o botão", () => {
    montar(fakeStore({ link: LINK, status: "syncing" }));
    expect(
      (screen.getByRole("button", { name: "Sincronizando…" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    // Desconectar no meio da rodada deixaria a rodada gravar sobre a ligação apagada.
    expect(
      (screen.getByRole("button", { name: "Desconectar deste aparelho" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("desconectar pede confirmação", () => {
    const store = fakeStore({ link: LINK });
    montar(store);

    fireEvent.click(screen.getByRole("button", { name: "Desconectar deste aparelho" }));
    expect(store.unpair).not.toHaveBeenCalled();
    expect(screen.getByText(/Os seus dados ficam no celular/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Desconectar" }));
    expect(store.unpair).toHaveBeenCalledTimes(1);
  });

  it("recusadas pelo hub aparecem no resumo", () => {
    montar(
      fakeStore({
        link: LINK,
        lastSummary: {
          pushed: 0,
          ignored: 0,
          rejected: [{ table: "transactions", id: "X", error: "row_too_large", message: "grande" }],
          pulled: 0,
          invalid: 0,
          unknownTables: [],
          epochReset: false,
        },
      }),
    );
    expect(screen.getByText(/1 recusada pelo hub/)).toBeDefined();
  });
});

describe("HubPage — desconectado", () => {
  it("avisa, oferece parear de novo com o endereço preenchido e esquecer o hub", () => {
    const store = fakeStore({ link: LINK, revoked: true });
    montar(store);

    expect(screen.getByRole("alert").textContent).toContain("removido do hub");
    expect((screen.getByLabelText("Endereço do hub") as HTMLInputElement).value).toBe(
      "192.168.0.5:7777",
    );
    expect((screen.getByLabelText("Nome deste aparelho") as HTMLInputElement).value).toBe("Pixel");

    fireEvent.click(screen.getByRole("button", { name: "Esquecer este hub" }));
    expect(store.unpair).toHaveBeenCalledTimes(1);
  });
});
