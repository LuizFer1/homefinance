import { describe, expect, it } from "vitest";
import { stableEntityIdV1, stableEntityIdV2 } from "./stable-id";

/**
 * Vetores colados como constantes no hub (`dashboard/ids.rs`). O hub recalcula
 * o id da ocorrência para saber se ela já foi gravada; se o hash do Rust divergir
 * do daqui em um bit, toda ocorrência gravada parece "por vir" e conta duas
 * vezes na previsão. Mudar um vetor aqui é mudar o id de toda linha derivada já
 * sincronizada: não se muda, se acrescenta.
 *
 * v1: o seed vazio cobre o laço que não roda; o com `ç` cobre unidade UTF-16
 * acima de 0x7F (o Rust tem de iterar `encode_utf16`, não bytes UTF-8).
 */
const V1_VECTORS: ReadonlyArray<readonly [string, string]> = [
  ["book:business", "00BQ84BVG8VF8WV30GB78MBBGR"],
  ["R1:2026-11", "CSS401XM49HM8154WS94G1DMM9"],
  ["R1:2026-11-02", "WAV5RJQN4A35G2FNCAB58J7NMA"],
  ["reserve:RE:2026-11", "W75PCK5AM7XPMKDTC7NPWKNA47"],
  ["", "F4Y17GYDQMP1ZG6DZ4E1QGED7M"],
  ["ç:2026-11", "AN7MTHFGADQCTSFRA574T1F0AX"],
];

/**
 * v2 (spec do id estável, §4.1): SHA-256 dos bytes **UTF-8** da semente — ao
 * contrário do v1, que lê unidades UTF-16 —, 130 primeiros bits em Crockford.
 * No Rust é `Sha256::digest(seed.as_bytes())`. Conferidos contra `node:crypto`;
 * o `😀` (par de surrogates) é onde UTF-8 e UTF-16 mais divergem.
 */
const V2_VECTORS: ReadonlyArray<readonly [string, string]> = [
  ["", "WERC8GMRZGE196QVYK49JVXS4G"],
  ["book:business", "S184YW4WKYZK3EZ8HGCEN5R9M6"],
  ["R1:2026-11", "9Y2G8QBDMN0DS338QZHY34P0VH"],
  ["R1:2026-11-02", "2Q7RY6VP8Y41BD3G9GAN2AZ61B"],
  ["reserve:RE:2026-11", "N6517GVXA4N8KA1SXK97A125NZ"],
  ["ç:2026-11", "TYX61HHBW7FNKTFQ05D8H6JX7H"],
  ["😀", "Y123MD1CBVTMF0X126THQ9BCJE"],
  ["budget:01JB000000000000000000000Z", "K8GMCRD7YPDMR5T04E3BN375M9"],
];

describe("stableEntityIdV1: vetores compartilhados com o hub", () => {
  for (const [seed, id] of V1_VECTORS) {
    it(`"${seed}" vira ${id}`, () => {
      expect(stableEntityIdV1(seed)).toBe(id);
    });
  }
});

describe("stableEntityIdV2: vetores compartilhados com o hub", () => {
  for (const [seed, id] of V2_VECTORS) {
    it(`"${seed}" vira ${id}`, () => {
      expect(stableEntityIdV2(seed)).toBe(id);
    });
  }
});
