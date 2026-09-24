import Dexie, { type Table } from "dexie";
import type { Category } from "../domain/model/category";
import type { PaymentMethod } from "../domain/model/payment-method";
import type { Recurrence } from "../domain/model/recurrence";
import type { Transaction } from "../domain/model/transaction";
import type { User } from "../domain/model/user";

export interface MetaRow {
  key: string;
  value: string;
}

/**
 * Uma tabela por entidade; a linha é o estado atual.
 *
 * A versão 1 continua declarada para o Dexie saber de onde está subindo. O
 * upgrade para a 2 descarta o log de eventos (decisão da spec: zerar) e o
 * `localUserId`, que sobreviveria apontando para um perfil que não existe mais
 * e faria o wizard de primeiro uso ser pulado. `deviceId` fica.
 *
 * O construtor nunca lança; a falha de IndexedDB aparece na primeira operação.
 */
export class HomeFinanceDb extends Dexie {
  readonly users: Table<User, string>;
  readonly categories: Table<Category, string>;
  readonly paymentMethods: Table<PaymentMethod, string>;
  readonly transactions: Table<Transaction, string>;
  readonly recurrences: Table<Recurrence, string>;
  readonly meta: Table<MetaRow, string>;

  constructor(name = "homefinance") {
    super(name);
    this.version(1).stores({ events: "id, hlc", meta: "key" });
    this.version(2)
      .stores({
        events: null,
        users: "id, dirty",
        categories: "id, dirty",
        paymentMethods: "id, dirty",
        transactions: "id, occurredOn, recurrenceId, dirty",
        recurrences: "id, dirty",
        meta: "key",
      })
      .upgrade((tx) => tx.table("meta").delete("localUserId"));
    this.users = this.table("users");
    this.categories = this.table("categories");
    this.paymentMethods = this.table("paymentMethods");
    this.transactions = this.table("transactions");
    this.recurrences = this.table("recurrences");
    this.meta = this.table("meta");
  }
}
