import { describe, expect, it } from "vitest";
import { DEFAULTS_BY_BOOK } from "../defaults/defaults";
import { stableEntityIdV1, stableEntityIdV2 } from "./stable-id";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** ULIDs realistas e reprodutíveis: tempo plausível + 16 caracteres pseudoaleatórios. */
function fakeUlids(count: number, salt: number): string[] {
  let state = (0x9e3779b9 ^ salt) >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state >>> 27;
  };
  return Array.from({ length: count }, (_, n) => {
    let random = "";
    for (let i = 0; i < 16; i += 1) random += CROCKFORD[next()];
    return `01J${String(n).padStart(7, "0")}${random}`;
  });
}

function months(count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const year = 2020 + Math.floor(i / 12);
    return `${year}-${String((i % 12) + 1).padStart(2, "0")}`;
  });
}

describe("stableEntityIdV1", () => {
  it("e deterministico e de largura fixa", () => {
    const a = stableEntityIdV1("rec:2026-08");
    const b = stableEntityIdV1("rec:2026-08");
    expect(a).toBe(b);
    expect(a).toHaveLength(26);
  });

  it("sementes diferentes produzem ids diferentes", () => {
    expect(stableEntityIdV1("rec:2026-08")).not.toBe(stableEntityIdV1("rec:2026-09"));
  });

  /**
   * O defeito que a v2 corrige, fixado como teste para ninguém "consertar" a v1:
   * ela está congelada (é o id de linhas já gravadas). Os 26 caracteres só
   * dependem dos 5 bits baixos dos dois hashes, e para um mesmo comprimento de
   * semente sobram 256 ids (spec do id estável, §1).
   */
  it("teto documentado: sementes de 34 caracteres caem em no maximo 256 ids", () => {
    const ids = new Set<string>();
    for (const series of fakeUlids(400, 1)) {
      for (const month of months(24)) ids.add(stableEntityIdV1(`${series}:${month}`));
    }
    expect(ids.size).toBeLessThanOrEqual(256);
    // O par verificado da spec (§2), o mesmo que o hub usa nos testes dele.
    expect(stableEntityIdV1("01JC0000000000000000000001:2027-02")).toBe(
      stableEntityIdV1("01JC0000000000000000000002:2027-01"),
    );
    expect(stableEntityIdV1("R2:2026-09")).toBe(stableEntityIdV1("22:2026-09"));
  });

  /**
   * Padrões e conta comercial ficam na v1 para sempre (mudar duplicaria todo
   * padrão em todo aparelho). Lista fechada: só não pode colidir dentro dela.
   * Acrescentar um padrão exige que isto continue passando.
   */
  it("padroes nao colidem entre si", () => {
    const books = Object.values(DEFAULTS_BY_BOOK);
    const categories = books.flatMap((book) => book.categories.map((entry) => entry.id));
    const methods = books.flatMap((book) => book.methods.map((entry) => entry.id));
    expect(new Set(categories).size).toBe(categories.length);
    expect(new Set(methods).size).toBe(methods.length);
  });
});

describe("stableEntityIdV2", () => {
  it("e deterministico, de largura fixa e so com Crockford", () => {
    const id = stableEntityIdV2("rec:2026-08");
    expect(id).toBe(stableEntityIdV2("rec:2026-08"));
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("nunca colide com o par que colide na v1", () => {
    expect(stableEntityIdV2("01JC0000000000000000000001:2027-02")).not.toBe(
      stableEntityIdV2("01JC0000000000000000000002:2027-01"),
    );
  });

  it("sementes realistas distintas dao ids distintos (2 000 series x 120 meses e afins)", () => {
    const series = fakeUlids(2_000, 2);
    const periods = months(120);
    const ids = new Set<string>();
    let seeds = 0;
    const add = (seed: string) => {
      ids.add(stableEntityIdV2(seed));
      seeds += 1;
    };
    for (const id of series) {
      for (const month of periods) add(`${id}:${month}`);
    }
    // Metas de 1 000 categorias, reajustes e depósitos: comprimentos diferentes.
    for (const id of fakeUlids(1_000, 3)) add(`budget:${id}`);
    for (const id of series.slice(0, 200)) {
      for (const month of periods.slice(0, 24)) {
        add(`${id}:adj:${month}`);
        add(`reserve:${id}:${month}`);
      }
    }
    expect(seeds).toBeGreaterThanOrEqual(240_000);
    expect(ids.size).toBe(seeds);
    // ~2 s sozinho; com a suíte inteira em paralelo passa dos 5 s padrão.
  }, 30_000);
});
