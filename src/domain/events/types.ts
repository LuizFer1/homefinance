import type { Ulid } from "../ids/ulid";

export type EntityKind =
  | "user"
  | "category"
  | "paymentMethod"
  | "transaction"
  | "recurrence"
  | "investment"
  | "reserve";

export type Action = "create" | "update" | "delete";

/** Versão do formato de `data`. Um log append-only é eterno: código futuro lê isto. */
export const CURRENT_SCHEMA_VERSION = 1;

export interface DomainEvent {
  /** Identidade do evento. Garante idempotência na chegada pelo sync. */
  id: Ulid;
  entity: EntityKind;
  /** Qual instância do agregado. Sem isto, update e delete não têm alvo. */
  entityId: Ulid;
  action: Action;
  /** create: agregado completo. update: patch parcial. delete: vazio. */
  data: Record<string, unknown>;
  /** Origem. Necessário para o cursor de sync e para desempate determinístico. */
  deviceId: Ulid;
  hlc: string;
  schemaVersion: number;
}
