import { signal } from "@preact/signals";
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CheckResult, UpdateStore } from "./store";
import { UpdateSection } from "./update-section";

afterEach(cleanup);

function fakeUpdate(result: CheckResult, version: string | null = null) {
  const ready = signal(false);
  const store = {
    ready,
    version,
    check: vi.fn(async () => {
      if (result === "ready") ready.value = true;
      return result;
    }),
    apply: vi.fn(),
  } satisfies UpdateStore;
  return store;
}

function verificar() {
  fireEvent.click(screen.getByRole("button", { name: /verificar/i }));
}

describe("UpdateSection", () => {
  it("mostra a data do build como versão", () => {
    render(<UpdateSection update={fakeUpdate("current", "2026-10-01T15:00:00.000Z")} />);
    expect(screen.getByText(/2026/)).toBeTruthy();
  });

  it("verificar força a busca, ignorando o intervalo", async () => {
    const update = fakeUpdate("current");
    render(<UpdateSection update={update} />);
    verificar();
    expect(update.check).toHaveBeenCalledWith(true);
    expect(await screen.findByText(/versão mais recente/i)).toBeTruthy();
  });

  it("sem conexão, diz que não conseguiu buscar", async () => {
    render(<UpdateSection update={fakeUpdate("offline")} />);
    verificar();
    expect(await screen.findByText(/sem conexão/i)).toBeTruthy();
  });

  it("sem service worker, diz que este navegador não atualiza por aqui", async () => {
    render(<UpdateSection update={fakeUpdate("unavailable")} />);
    verificar();
    expect(await screen.findByText(/indisponível/i)).toBeTruthy();
  });

  it("versão nova baixando, avisa e espera", async () => {
    render(<UpdateSection update={fakeUpdate("installing")} />);
    verificar();
    expect(await screen.findByText(/baixando/i)).toBeTruthy();
  });

  it("com versão nova pronta, o botão vira atualizar", async () => {
    const update = fakeUpdate("ready");
    render(<UpdateSection update={update} />);
    verificar();
    fireEvent.click(await screen.findByRole("button", { name: /atualizar/i }));
    expect(update.apply).toHaveBeenCalledTimes(1);
  });
});
