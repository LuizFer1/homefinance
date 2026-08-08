import { cleanup, render, screen } from "@testing-library/preact";
import { afterEach, expect, test } from "vitest";
import { App } from "./app";

afterEach(cleanup);

test("renderiza o nome do app como cabecalho", () => {
  render(<App />);

  const heading = screen.getByRole("heading", { name: "HomeFinance" });

  expect(heading).toBeDefined();
});
