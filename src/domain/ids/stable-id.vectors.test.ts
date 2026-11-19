import { describe, expect, it } from "vitest";
import { stableEntityIdV1 } from "./stable-id";

/**
 * Vetores colados como constantes no hub (`dashboard/ids.rs`). O hub recalcula
 * o id da ocorrência para saber se ela já foi gravada; se o hash do Rust divergir
 * do daqui em um bit, toda ocorrência gravada parece "por vir" e conta duas
 * vezes na previsão. Mudar um vetor aqui é mudar o id de toda linha derivada já
 * sincronizada: não se muda, se acrescenta.
 *
 * O seed vazio cobre o laço que não roda; o com `ç` cobre unidade UTF-16 acima
 * de 0x7F (o Rust tem de iterar `encode_utf16`, não bytes UTF-8).
 */
const VECTORS: ReadonlyArray<readonly [string, string]> = [
  ["book:business", "00BQ84BVG8VF8WV30GB78MBBGR"],
  ["R1:2026-11", "CSS401XM49HM8154WS94G1DMM9"],
  ["R1:2026-11-02", "WAV5RJQN4A35G2FNCAB58J7NMA"],
  ["reserve:RE:2026-11", "W75PCK5AM7XPMKDTC7NPWKNA47"],
  ["", "F4Y17GYDQMP1ZG6DZ4E1QGED7M"],
  ["ç:2026-11", "AN7MTHFGADQCTSFRA574T1F0AX"],
];

describe("stableEntityIdV1: vetores compartilhados com o hub", () => {
  for (const [seed, id] of VECTORS) {
    it(`"${seed}" vira ${id}`, () => {
      expect(stableEntityIdV1(seed)).toBe(id);
    });
  }
});
