import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ALIVE } from "../../domain/model/row.fake";
import type { User, UserDraft } from "../../domain/model/user";
import { ProfilePage } from "./profile-page";
import type { ProfileStore } from "./store";

afterEach(cleanup);

const PERFIL: User = {
  id: "cat-user-1",
  name: "Luiz",
  color: "teal",
  avatar: null,
  ...ALIVE,
};

const FOTO = "data:image/webp;base64,AAAA";
const ARQUIVO = new File(["x"], "eu.jpg", { type: "image/jpeg" });

function fakeStore(): ProfileStore {
  return {
    editProfile: vi.fn(
      async (_id: string, draft: UserDraft): Promise<User> => ({
        ...PERFIL,
        ...draft,
      }),
    ),
  };
}

function montar(
  over: {
    profile?: User;
    store?: ProfileStore;
    processFile?: (file: Blob) => Promise<string>;
    onBack?: () => void;
    onDismissGlobalError?: () => void;
  } = {},
) {
  const store = over.store ?? fakeStore();
  const onBack = over.onBack ?? vi.fn();
  const processFile = over.processFile ?? vi.fn(async () => FOTO);
  render(
    <ProfilePage
      profile={over.profile ?? PERFIL}
      store={store}
      processFile={processFile}
      onBack={onBack}
      onDismissGlobalError={over.onDismissGlobalError}
    />,
  );
  return { store, onBack, processFile };
}

describe("ProfilePage", () => {
  it("preenche com o perfil atual", () => {
    montar();

    expect(screen.getByRole("region", { name: "Seu perfil" })).toBeDefined();
    expect(screen.getByLabelText<HTMLInputElement>(/seu nome/i).value).toBe("Luiz");
    expect((screen.getByRole("radio", { name: "Turquesa" }) as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it("salva o draft completo, nao um patch", async () => {
    const { store, onBack } = montar();

    fireEvent.input(screen.getByLabelText(/seu nome/i), { target: { value: "Luís" } });
    fireEvent.click(screen.getByRole("radio", { name: "Rosa" }));
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() =>
      expect(store.editProfile).toHaveBeenCalledWith("cat-user-1", {
        name: "Luís",
        color: "rose",
        avatar: null,
      }),
    );
    expect(onBack).toHaveBeenCalled();
  });

  it("sem mudanca ainda volta; quem ignora a escrita e o repositorio", async () => {
    const { store, onBack } = montar();

    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() => expect(onBack).toHaveBeenCalled());
    expect(store.editProfile).toHaveBeenCalledWith("cat-user-1", {
      name: "Luiz",
      color: "teal",
      avatar: null,
    });
  });

  it("falha ao salvar mostra o erro, fica na tela e limpa o alerta global", async () => {
    const store: ProfileStore = {
      editProfile: vi.fn(async (): Promise<User> => {
        throw new Error("disco cheio");
      }),
    };
    const onDismissGlobalError = vi.fn();
    const { onBack } = montar({ store, onDismissGlobalError });

    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/disco cheio/);
    expect(onBack).not.toHaveBeenCalled();
    expect(onDismissGlobalError).toHaveBeenCalledTimes(1);
  });

  it("nome vazio bloqueia e nao grava", async () => {
    const { store, onBack } = montar();

    fireEvent.input(screen.getByLabelText(/seu nome/i), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));

    expect(screen.getByRole("alert").textContent).toMatch(/informe seu nome/i);
    expect(store.editProfile).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it("troca e remove a foto", async () => {
    const { store, processFile } = montar();

    fireEvent.change(screen.getByLabelText(/escolher foto/i), {
      target: { files: [ARQUIVO] },
    });
    await waitFor(() => expect(processFile).toHaveBeenCalledWith(ARQUIVO));
    expect(screen.getByRole("button", { name: /remover foto/i })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /remover foto/i }));
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));

    // Removeu o que nunca foi salvo: o draft sai com avatar null, igual ao perfil.
    await waitFor(() =>
      expect(store.editProfile).toHaveBeenCalledWith("cat-user-1", {
        name: "Luiz",
        color: "teal",
        avatar: null,
      }),
    );
  });

  it("grava remocao de foto existente como avatar null", async () => {
    const { store } = montar({
      profile: { ...PERFIL, avatar: FOTO },
    });

    fireEvent.click(screen.getByRole("button", { name: /remover foto/i }));
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() =>
      expect(store.editProfile).toHaveBeenCalledWith("cat-user-1", {
        name: "Luiz",
        color: "teal",
        avatar: null,
      }),
    );
  });

  it("cancelar volta sem gravar", () => {
    const { store, onBack } = montar();

    fireEvent.input(screen.getByLabelText(/seu nome/i), { target: { value: "Outro" } });
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(onBack).toHaveBeenCalled();
    expect(store.editProfile).not.toHaveBeenCalled();
  });
});
