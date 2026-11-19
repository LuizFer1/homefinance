import { sha256 } from "./sha256";
import type { Ulid } from "./ulid";

/** Mesmo alfabeto Crockford do ULID — ids determinísticos legíveis e estáveis. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Identidade de agregado derivada só do conteúdo, igual em qualquer aparelho.
 *
 * Materializar a ocorrência de março do mesmo salário em dois telefones offline
 * **tem** que produzir o mesmo `entityId`: se cada um gerasse ULID aleatório,
 * o sync traria dois salários no extrato. Com o mesmo id, as duas linhas são a
 * mesma linha, e o LWW por linha as converge.
 *
 * Há duas versões e nenhum `stableEntityId` sem número, de propósito: todo
 * chamador diz qual usa, e um padrão não migra para a v2 por descuido de import.
 *
 * **v1 — congelada.** Só usa os 5 bits baixos dos dois hashes: no máximo 1024
 * ids, 256 por comprimento de semente (spec do id estável, §1), e por isso fatos
 * diferentes colidem. Não se conserta: é o id de linhas já gravadas em aparelhos
 * e no hub. Padrões e `BUSINESS_BOOK_ID` ficam nela para sempre (lista fechada,
 * verificada sem colisão); fatos derivados a usam enquanto o lugar está livre,
 * para aparelhos velhos e novos concordarem (`pickStableId`).
 */
export function stableEntityIdV1(seed: string): Ulid {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5 ^ 0xdeadbeef;

  for (let i = 0; i < seed.length; i += 1) {
    const code = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193);
    h2 = Math.imul(h2 ^ code, 0x01000193) ^ Math.imul(i + 1, 0x9e3779b9);
  }

  let a = h1 >>> 0;
  let b = h2 >>> 0;
  let out = "";

  for (let i = 0; i < 26; i += 1) {
    out += ALPHABET[(a + b + i * 17) & 31];
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    b = (Math.imul(b ^ a, 22695477) + 1) >>> 0;
  }

  return out;
}

/**
 * **v2:** SHA-256 dos bytes UTF-8 da semente, 130 primeiros bits lidos do bit
 * mais significativo em grupos de 5, no mesmo alfabeto. O primeiro caractere vai
 * de `0` a `Z` — não é ULID estrito; o hub aceita 26 Crockford. Byte a byte igual
 * ao `stable_entity_id_v2` do hub (`Sha256::digest(seed.as_bytes())`); os vetores
 * compartilhados estão em `stable-id.vectors.test.ts`.
 *
 * Só aparece onde o lugar v1 do fato já é de outro fato (`pickStableId`).
 */
export function stableEntityIdV2(seed: string): Ulid {
  const digest = sha256(new TextEncoder().encode(seed));
  let out = "";
  let buffer = 0;
  let bits = 0;
  let index = 0;
  while (out.length < 26) {
    if (bits < 5) {
      buffer = ((buffer << 8) | (digest[index] as number)) & 0xfff;
      index += 1;
      bits += 8;
    }
    bits -= 5;
    out += ALPHABET[(buffer >>> bits) & 31];
  }
  return out;
}
