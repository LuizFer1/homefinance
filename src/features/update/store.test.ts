import { describe, expect, it, vi } from "vitest";
import { CHECK_INTERVAL_MS, createUpdateStore, type SwContainer, type SwWorker } from "./store";

type Listener = () => void;

function fakeWorker(state = "installing") {
  const listeners: Listener[] = [];
  const worker = {
    state,
    postMessage: vi.fn(),
    addEventListener: (_type: "statechange", fn: Listener) => {
      listeners.push(fn);
    },
    /** Simula o navegador trocando o estado do worker. */
    become(next: string) {
      worker.state = next;
      for (const fn of listeners) fn();
    },
  };
  return worker;
}

function fakeContainer({
  waiting = null,
  controlled = true,
}: {
  waiting?: SwWorker | null;
  controlled?: boolean;
} = {}) {
  const found: Listener[] = [];
  const changed: Listener[] = [];
  const registration = {
    waiting,
    installing: null as SwWorker | null,
    update: vi.fn().mockResolvedValue(undefined),
    addEventListener: (_type: "updatefound", fn: Listener) => {
      found.push(fn);
    },
  };
  const container = {
    controller: controlled ? {} : null,
    ready: Promise.resolve(registration),
    addEventListener: (_type: "controllerchange", fn: Listener) => {
      changed.push(fn);
    },
  } satisfies SwContainer;
  return {
    container,
    registration,
    /** Um sw.js novo apareceu no servidor e começou a instalar. */
    startInstall(worker: SwWorker) {
      registration.installing = worker;
      for (const fn of found) fn();
    },
    takeControl() {
      for (const fn of changed) fn();
    },
  };
}

/** Deixa o `ready` resolver e os `.then` encadeados rodarem. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createUpdateStore", () => {
  it("sem service worker, nunca oferece atualização", async () => {
    const store = createUpdateStore({ reload: vi.fn(), now: () => 0 });
    await store.check(true);
    await settle();
    expect(store.ready.value).toBe(false);
  });

  it("oferece a versão que já estava esperando quando o app abriu", async () => {
    const sw = fakeContainer({ waiting: fakeWorker("installed") });
    const store = createUpdateStore({ serviceWorker: sw.container, reload: vi.fn(), now: () => 0 });
    await settle();
    expect(store.ready.value).toBe(true);
  });

  it("oferece a versão que terminou de instalar com o app aberto", async () => {
    const sw = fakeContainer();
    const store = createUpdateStore({ serviceWorker: sw.container, reload: vi.fn(), now: () => 0 });
    await settle();
    expect(store.ready.value).toBe(false);

    const worker = fakeWorker();
    sw.startInstall(worker);
    expect(store.ready.value).toBe(false);
    worker.become("installed");
    expect(store.ready.value).toBe(true);
  });

  it("a primeira instalação não é atualização", async () => {
    // Sem controller, a página ainda não roda sob nenhum SW: o worker que
    // instala agora é o primeiro, e não há versão velha a trocar.
    const sw = fakeContainer({ controlled: false });
    const store = createUpdateStore({ serviceWorker: sw.container, reload: vi.fn(), now: () => 0 });
    await settle();
    const worker = fakeWorker();
    sw.startInstall(worker);
    worker.become("installed");
    expect(store.ready.value).toBe(false);
  });

  it("aplicar pede ao worker novo que assuma e recarrega quando ele assume", async () => {
    const waiting = fakeWorker("installed");
    const sw = fakeContainer({ waiting });
    const reload = vi.fn();
    const store = createUpdateStore({ serviceWorker: sw.container, reload, now: () => 0 });
    await settle();

    store.apply();
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    // Recarregar antes da troca abriria a versão velha de novo, do cache velho.
    expect(reload).not.toHaveBeenCalled();

    sw.takeControl();
    sw.takeControl();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("procura versão nova no máximo uma vez por intervalo", async () => {
    const sw = fakeContainer();
    let clock = 1_000_000;
    const store = createUpdateStore({
      serviceWorker: sw.container,
      reload: vi.fn(),
      now: () => clock,
    });
    await settle();

    await store.check();
    await store.check();
    expect(sw.registration.update).toHaveBeenCalledTimes(1);

    clock += CHECK_INTERVAL_MS;
    await store.check();
    expect(sw.registration.update).toHaveBeenCalledTimes(2);

    await store.check(true);
    expect(sw.registration.update).toHaveBeenCalledTimes(3);
  });

  it("falha de rede ao procurar versão nova não escapa", async () => {
    const sw = fakeContainer();
    sw.registration.update.mockRejectedValue(new TypeError("Failed to fetch"));
    const store = createUpdateStore({ serviceWorker: sw.container, reload: vi.fn(), now: () => 0 });
    await settle();
    await expect(store.check(true)).resolves.toBeUndefined();
  });
});
