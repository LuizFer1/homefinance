import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stateOf } from "../../domain/reserves/fixtures.fake";
import { HomePage } from "../home/home-page";
import { BookSwitchButton } from "./book-switch";

afterEach(cleanup);

const PROFILE = {
  id: "01J9F3K2M7QX8YB4TVWZ0DCEHU",
  name: "Luiz",
  color: "teal",
  avatar: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "1759276800000-0000-01J9F3K2M7QX8YB4TVWZ0DCEHZ",
  deletedAt: null,
  dirty: 0,
} as const;

function renderHome(
  props: Partial<Parameters<typeof HomePage>[0]> & { profile?: typeof PROFILE | null },
) {
  const state = stateOf({});
  return render(
    <HomePage
      items={[]}
      state={state}
      profile={PROFILE}
      today="2026-09-20"
      hour={10}
      onCompose={vi.fn()}
      onImport={vi.fn()}
      onEdit={vi.fn()}
      onConfirm={vi.fn()}
      onOpenProfile={vi.fn()}
      {...props}
    />,
  );
}

describe("BookSwitchButton", () => {
  it("na conta pessoal mostra a loja e leva à comercial", () => {
    const onSwitch = vi.fn();
    render(<BookSwitchButton book="personal" onSwitch={onSwitch} />);

    const button = screen.getByRole("button", { name: "Ir para a conta comercial" });
    expect(within(button).getByTestId("icon-storefront")).toBeDefined();
    fireEvent.click(button);
    expect(onSwitch).toHaveBeenCalledTimes(1);
  });

  it("na conta comercial mostra a pessoa e volta à pessoal", () => {
    const onSwitch = vi.fn();
    render(<BookSwitchButton book="business" onSwitch={onSwitch} />);

    const button = screen.getByRole("button", { name: "Voltar para a conta pessoal" });
    expect(within(button).getByTestId("icon-user")).toBeDefined();
    fireEvent.click(button);
    expect(onSwitch).toHaveBeenCalledTimes(1);
  });

  it("tem alvo de toque de 44px", () => {
    render(<BookSwitchButton book="personal" onSwitch={vi.fn()} />);
    expect(screen.getByRole("button").className).toContain("size-11");
  });
});

describe("cabeçalho da Home", () => {
  it("o botão fica antes do avatar, no mesmo lugar nas duas contas", () => {
    const place = (book: "personal" | "business") => {
      const { container, unmount } = renderHome({
        book,
        businessName: "Padaria",
        onSwitchBook: vi.fn(),
      });
      const header = container.querySelector("header");
      const buttons = [...(header?.querySelectorAll("button") ?? [])].map((b) =>
        b.getAttribute("aria-label"),
      );
      unmount();
      return buttons;
    };

    expect(place("personal")).toEqual(["Ir para a conta comercial", "Editar perfil"]);
    expect(place("business")).toEqual(["Voltar para a conta pessoal", "Editar perfil"]);
  });

  it("sem perfil o botão de troca continua lá", () => {
    renderHome({ profile: null, onSwitchBook: vi.fn() });
    expect(screen.getByRole("button", { name: "Ir para a conta comercial" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Editar perfil" })).toBeNull();
  });

  it("sem onSwitchBook o botão não aparece", () => {
    renderHome({});
    expect(screen.queryByRole("button", { name: /conta (comercial|pessoal)/ })).toBeNull();
  });

  it("tocar no botão chama onSwitchBook", () => {
    const onSwitchBook = vi.fn();
    renderHome({ onSwitchBook });
    fireEvent.click(screen.getByRole("button", { name: "Ir para a conta comercial" }));
    expect(onSwitchBook).toHaveBeenCalledTimes(1);
  });

  it("na comercial o título é o nome do negócio; na pessoal, a saudação", () => {
    const { unmount } = renderHome({ book: "business", businessName: "Padaria do Zé" });
    expect(screen.getByTestId("business-title").textContent).toBe("Padaria do Zé");
    expect(screen.queryByText(/Bom dia/)).toBeNull();
    unmount();

    renderHome({ book: "personal", businessName: "Padaria do Zé" });
    expect(screen.queryByTestId("business-title")).toBeNull();
    expect(screen.getByText(/Bom dia/)).toBeDefined();
  });

  it("comercial sem nome ainda mostra a saudação em vez de um título vazio", () => {
    renderHome({ book: "business", businessName: null });
    expect(screen.getByText(/Bom dia/)).toBeDefined();
  });
});
