import { stableEntityIdV1 } from "./stable-id";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Um id de 26 caracteres, com o `prefix` de 23, cuja semente colide na v1 com a
 * de `other` (spec do id estável, §1: 256 ids por comprimento de semente; os 3
 * últimos caracteres variando cobrem os 256). Para testes montarem duas séries ou duas
 * categorias que disputam o mesmo lugar v1, como acontece em produção.
 */
export function collidingId(prefix: string, other: string, seedOf: (id: string) => string): string {
  if (prefix.length !== 23) throw new Error("prefixo precisa de 23 caracteres");
  const target = stableEntityIdV1(seedOf(other));
  for (const a of CROCKFORD) {
    for (const b of CROCKFORD) {
      for (const c of CROCKFORD) {
        const id = `${prefix}${a}${b}${c}`;
        if (id !== other && stableEntityIdV1(seedOf(id)) === target) return id;
      }
    }
  }
  throw new Error("nenhuma colisão v1 encontrada");
}
