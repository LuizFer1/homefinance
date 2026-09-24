import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingWizard } from "./wizard";

afterEach(cleanup);

const FOTO = "data:image/webp;base64,AAAA";
const ARQUIVO = new File(["x"], "eu.jpg", { type: "image/jpeg" });

function montar(
  over: {
    onComplete?: (draft: unknown) => Promise<void> | void;
    processFile?: (file: Blob) => Promise<string>;
  } = {},
) {
  const onComplete = vi.fn(over.onComplete ?? (() => Promise.resolve()));
  const processFile = vi.fn(over.processFile ?? (() => Promise.resolve(FOTO)));
  render(<OnboardingWizard onComplete={onComplete} processFile={processFile} />);
  return { onComplete, processFile };
}

function digitarNome(valor: string) {
  fireEvent.input(screen.getByLabelText(/seu nome/i), { target: { value: valor } });
}

function continuar() {
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
}

function comecar() {
  fireEvent.click(screen.getByRole("button", { name: /começar/i }));
}

/** Nome preenchido e avanco ate a etapa da foto. */
function ateAFoto(nome = "Luiz") {
  digitarNome(nome);
  continuar();
  continuar();
}

describe("navegacao entre etapas", () => {
  it("comeca no nome e bloqueia avancar vazio", () => {
    montar();

    continuar();

    expect(screen.getByRole("alert").textContent).toMatch(/informe seu nome/i);
    expect(screen.getByLabelText(/seu nome/i)).toBeDefined();
  });

  it("a segunda tela oferece os doze tokens da paleta", () => {
    montar();

    digitarNome("Luiz");
    continuar();

    expect(screen.getAllByRole("radio")).toHaveLength(12);
  });

  it("voltar da cor para o nome preserva o que foi digitado", () => {
    montar();
    digitarNome("Luiz");
    continuar();

    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));

    expect(screen.getByLabelText<HTMLInputElement>(/seu nome/i).value).toBe("Luiz");
  });

  it("nome so com espacos nao passa da primeira etapa", () => {
    montar();

    digitarNome("   ");
    continuar();

    expect(screen.getByRole("alert").textContent).toMatch(/informe seu nome/i);
  });
});

describe("foto", () => {
  it("concluir sem foto chama onComplete com avatar nulo", async () => {
    // Exigir foto para abrir contraria "nenhuma conta obrigatoria" do README e
    // trava quem nao tem foto a mao. As iniciais nao sao degradacao.
    const { onComplete } = montar();
    ateAFoto();

    comecar();

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith({ name: "Luiz", color: "slate", avatar: null }),
    );
  });

  it("a foto escolhida passa pelo pipeline antes de virar rascunho", async () => {
    const { onComplete, processFile } = montar();
    ateAFoto();

    fireEvent.change(screen.getByLabelText(/escolher foto/i), { target: { files: [ARQUIVO] } });
    await waitFor(() => expect(processFile).toHaveBeenCalledWith(ARQUIVO));
    comecar();

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ avatar: FOTO })),
    );
  });

  it("foto grande demais mostra o motivo e nao vira rascunho", async () => {
    // O pipeline recusa em vez de gravar: uma foto gigante incharia a linha
    // do perfil, que viaja inteira em todo sync.
    const { onComplete } = montar({
      processFile: () => Promise.reject(new Error("Essa imagem e grande demais.")),
    });
    ateAFoto();

    fireEvent.change(screen.getByLabelText(/escolher foto/i), { target: { files: [ARQUIVO] } });

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/grande demais/i));
    comecar();
    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ avatar: null })),
    );
  });

  it("remover foto volta o rascunho para nulo", async () => {
    const { onComplete } = montar();
    ateAFoto();
    fireEvent.change(screen.getByLabelText(/escolher foto/i), { target: { files: [ARQUIVO] } });
    await screen.findByRole("button", { name: /remover foto/i });

    fireEvent.click(screen.getByRole("button", { name: /remover foto/i }));
    comecar();

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ avatar: null })),
    );
  });

  it("nao oferece remover foto quando nao ha foto", () => {
    montar();
    ateAFoto();

    expect(screen.queryByRole("button", { name: /remover foto/i })).toBeNull();
  });
});

describe("conclusao", () => {
  it("leva a cor escolhida para o rascunho", async () => {
    const { onComplete } = montar();
    digitarNome("Luiz");
    continuar();
    fireEvent.click(screen.getByRole("radio", { name: "Turquesa" }));
    continuar();

    comecar();

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ color: "teal" })),
    );
  });

  it("apara espacos do nome antes de gravar", async () => {
    const { onComplete } = montar();
    ateAFoto("  Luiz  ");

    comecar();

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ name: "Luiz" })),
    );
  });

  it("erro na conclusao mantem o wizard na tela, com a mensagem visivel", async () => {
    // Avancar deixaria o usuario num app sem perfil. O lote e atomico, entao
    // nada foi gravado pela metade e tentar de novo e seguro.
    montar({ onComplete: () => Promise.reject(new Error("quota excedida")) });
    ateAFoto();

    comecar();

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/quota/i));
    expect(screen.getByLabelText(/escolher foto/i)).toBeDefined();
  });
});

describe("regressao: avancar nao pode virar submit", () => {
  it("ir da cor para a foto nao conclui o cadastro", () => {
    // Era o sintoma mais grave dos tres: a etapa da foto nunca aparecia, porque
    // o no de "Continuar" virava type="submit" sob o proprio clique e o
    // navegador submetia o formulario. Ver o comentario em registry-wizard.tsx.
    montar();
    digitarNome("Luiz");
    continuar();

    const avancar = screen.getByRole("button", { name: "Continuar" });
    fireEvent.click(avancar);

    expect(avancar.getAttribute("type")).toBe("button");
    expect(screen.getByLabelText(/escolher foto/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /começar/i })).not.toBe(avancar);
  });
});
