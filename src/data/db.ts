import Dexie, { type Table } from "dexie";
import type { DomainEvent } from "../domain/events/types";

export interface MetaRow {
  key: string;
  value: string;
}

/**
 * `events` é a única tabela durável: append-only, nunca atualizada nem removida
 * fora de compactação explícita. `meta` guarda o `deviceId` — a projeção vive em
 * memória e é refeita a cada boot.
 */
export class HomeFinanceDb extends Dexie {
  readonly events: Table<DomainEvent, string>;
  readonly meta: Table<MetaRow, string>;

  constructor(name = "homefinance") {
    super(name);
    this.version(1).stores({ events: "id, hlc", meta: "key" });
    this.events = this.table("events");
    this.meta = this.table("meta");
  }
}
