import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UserRecord } from "../../domain/projections/apply";
import { ProfilePage } from "./profile-page";
import type { ProfileStore } from "./store";

afterEach(cleanup);

const PERFIL: UserRecord = {
  id: "cat-user-1",
  name: "Luiz",
  color: "teal",
  avatar: null,
  deleted: false,
  materialized: true,
  fieldHlc: {},
};

const FOTO = "data:image/webp;base64,AAAA";
const ARQUIVO = new File(["x"], "eu.jpg", { type: "image/jpeg" });

function fakeStore(): ProfileStore {
  return {
    editProfile: vi.fn(async () => {}),
  };
}

function montar(
  over: {
    profile?: UserRecord;
    store?: ProfileStore;
    processFile?: (file: Blob) => Promise<string>;
    onBack?: () => void;
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
    />,
  );
  return { store, onBack, processFile };
}

describe("ProfilePage", () => {
  it("preenche com o perfil atual", () => {
    montar();

    expect(screen.getByRole("region", { name: "Seu perfil" })).toBeDefined();
    expect(screen.getByLabelText<HTMLInputElement>(/seu nome/i).value).toBe("Luiz");
    expect((screen.getByRole("radio", { name: "teal" }) as HTMLInputElement).checked).toBe(true);
  });

  it("salva so o patch do que mudou", async () => {
    const { store, onBack } = montar();

    fireEvent.input(screen.getByLabelText(/seu nome/i), { target: { value: "Luís" } });
    fireEvent.click(screen.getByRole("radio", { name: "rose" }));
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() =>
      expect(store.editProfile).toHaveBeenCalledWith("cat-user-1", {
        name: "Luís",
        color: "rose",
      }),
    );
    expect(onBack).toHaveBeenCalled();
  });

  it("sem mudanca nao chama a store e volta", async () => {
    const { store, onBack } = montar();

    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() => expect(onBack).toHaveBeenCalled());
    expect(store.editProfile).not.toHaveBeenCalled();
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

    // Removeu o que nunca foi salvo: avatar continua null e o patch nao inclui foto.
    await waitFor(() => expect(store.editProfile).not.toHaveBeenCalled());
  });

  it("grava remocao de foto existente como avatar null", async () => {
    const { store } = montar({
      profile: { ...PERFIL, avatar: FOTO },
    });

    fireEvent.click(screen.getByRole("button", { name: /remover foto/i }));
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() =>
      expect(store.editProfile).toHaveBeenCalledWith("cat-user-1", { avatar: null }),
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
