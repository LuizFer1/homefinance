import { describe, expect, it } from "vitest";
import { BOOKS, bookOf, isBook } from "./book";

describe("bookOf", () => {
  it("devolve a conta gravada na linha", () => {
    expect(bookOf({ book: "business" })).toBe("business");
    expect(bookOf({ book: "personal" })).toBe("personal");
  });

  it("ausente, null e linha inexistente valem pessoal", () => {
    expect(bookOf({})).toBe("personal");
    expect(bookOf({ book: null })).toBe("personal");
    expect(bookOf(undefined)).toBe("personal");
    expect(bookOf(null)).toBe("personal");
  });

  it("valor desconhecido (versão futura via sync) degrada para pessoal, sem lançar", () => {
    expect(bookOf({ book: "franchise" })).toBe("personal");
    expect(bookOf({ book: 7 })).toBe("personal");
    expect(bookOf({ book: "toString" })).toBe("personal");
  });

  it("BOOKS lista as duas contas e isBook só aceita elas", () => {
    expect(BOOKS).toEqual(["personal", "business"]);
    expect(isBook("business")).toBe(true);
    expect(isBook("hasOwnProperty")).toBe(false);
    expect(isBook(null)).toBe(false);
  });
});
