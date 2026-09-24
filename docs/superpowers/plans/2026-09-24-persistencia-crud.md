# Persistência CRUD por entidade — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a persistência por event sourcing (tabela `events` + fold) por uma tabela Dexie por entidade, escrita via repositório genérico, com colunas prontas para sync LWW por linha com um hub.

**Architecture:** O código novo nasce **ao lado** do antigo, com prefixo `crud-`, sem ser ligado à UI — cada PR fica verde sozinho. Onda 1 cria a fundação (modelo, banco v2, relógio, repositório, sessão). Onda 2 cria, em paralelo, a store nova de cada entidade. Onda 3 liga tudo na UI, renomeia `crud-*` por cima dos arquivos antigos e apaga o código de eventos.

**Tech Stack:** TypeScript estrito (`noUncheckedIndexedAccess`), Preact + `@preact/signals`, Dexie 4, Vitest + `fake-indexeddb` + happy-dom, Biome.

**Spec:** `docs/superpowers/specs/2026-09-24-persistencia-crud-design.md`

---

## Fluxo de entrega (vale para toda task)

1. Branch a partir do `origin/develop` atualizado: `git fetch origin && git switch -c <branch> origin/develop`.
2. `npm ci` se não houver `node_modules`.
3. TDD: teste falhando → implementação → teste passando → commit.
4. Antes do push, tudo verde:
   ```bash
   npm run format && npm run lint && npm run typecheck && npm test && npm run build
   ```
5. `git push -u origin <branch>` e `gh pr create --base develop` referenciando a issue (`Refs #<issue>`).
6. O controlador faz code review (superpowers:requesting-code-review); correções no mesmo branch.
7. Merge: `gh pr merge <n> --squash --delete-branch`.

Ondas: **T1** → (**T2, T3, T4, T5** em paralelo) → **T6**.

Commits terminam com:
```
Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
```

## Mapa de arquivos

| Arquivo | Task | Responsabilidade |
|---|---|---|
| `src/domain/model/base.ts` | T1 | `BaseRow`, `Draft<T>`, `isAlive` |
| `src/domain/model/tokens.ts` | T1 | `ColorToken`, `COLOR_TOKENS`, `NEUTRAL_TOKEN`, `IconKey` |
| `src/domain/model/{user,category,payment-method,transaction,recurrence}.ts` | T1 | Tipo, draft, constantes e rótulos da entidade |
| `src/domain/model/app-state.ts` | T1 | `RowMap`, `AppState`, `TableName`, `RowOf`, `RowsByTable` |
| `src/domain/clock/row-clock.ts` | T1 | `stamp()` (HLC + ISO) e `newId()` |
| `src/data/crud-db.ts` | T1 | Dexie schema v2 (vira `db.ts` em T6) |
| `src/data/repository.ts` | T1 | `createRepository`, `buildRow` |
| `src/data/test-db.fake.ts` | T1 | `openTestDb`, `testSessionDeps`, `TEST_DEVICE_ID` |
| `src/features/session/crud-session.ts` | T1 | Boot, `mutate`, `putRows`, `clock` (vira `session.ts` em T6) |
| `src/features/registry/crud-store.ts` | T2 | Categoria e forma de pagamento |
| `src/features/transactions/crud-store.ts` | T3 | Lançamento avulso e autoria |
| `src/domain/recurrence/plan.ts` + `src/features/recurrence/crud-store.ts` | T4 | Série e materialização |
| `src/features/onboarding/crud-{seed,store}.ts` + `src/features/profile/crud-store.ts` | T5 | Primeiro uso e perfil |
| UI, selectors, `main.tsx`, remoções | T6 | Ligação e limpeza |

---

## Task 1: Fundação

**Branch:** `refactor/crud-fundacao`

**Files:**
- Create: `src/domain/model/base.ts`, `tokens.ts`, `user.ts`, `category.ts`, `payment-method.ts`, `transaction.ts`, `recurrence.ts`, `app-state.ts`
- Create: `src/domain/clock/row-clock.ts`, `src/domain/clock/row-clock.test.ts`
- Create: `src/data/crud-db.ts`, `src/data/crud-db.test.ts`
- Create: `src/data/repository.ts`, `src/data/repository.test.ts`
- Create: `src/data/test-db.fake.ts`
- Create: `src/features/session/crud-session.ts`, `src/features/session/crud-session.test.ts`

- [ ] **Step 1: Modelo**

`src/domain/model/base.ts`:
```ts
import type { Ulid } from "../ids/ulid";

/**
 * Colunas que toda tabela tem. São elas que o sync com o hub vai usar:
 * `updatedAt` decide o LWW por linha, `deletedAt` propaga a exclusão e `dirty`
 * (indexado) diz o que ainda não foi enviado.
 *
 * `dirty` é `0 | 1` e não boolean porque o IndexedDB não indexa boolean.
 */
export interface BaseRow {
  id: Ulid;
  /** ISO 8601 do aparelho. Só para leitura humana; nunca decide conflito. */
  createdAt: string;
  /** HLC. Um relógio de parede adiantado não pode vencer todo conflito. */
  updatedAt: string;
  /** HLC da exclusão, ou null. A linha nunca sai da tabela. */
  deletedAt: string | null;
  dirty: 0 | 1;
}

export type Draft<T extends BaseRow> = Omit<T, keyof BaseRow>;

export function isAlive<T extends BaseRow>(row: T | undefined): row is T {
  return row !== undefined && row.deletedAt === null;
}
```

`src/domain/model/tokens.ts`:
```ts
/**
 * Paleta fechada, não hex livre: hex livre deixa o usuário escolher cinza sobre
 * cinza e quebra o contraste no tema escuro. O valor persistido é o nome; a
 * resolução para `oklch` vive no `app.css`.
 */
export const COLOR_TOKENS = [
  "slate",
  "rose",
  "red",
  "orange",
  "amber",
  "lime",
  "emerald",
  "teal",
  "sky",
  "indigo",
  "violet",
  "fuchsia",
] as const;

export type ColorToken = (typeof COLOR_TOKENS)[number];

/** Destino de todo token sem cor própria ou desconhecido. */
export const NEUTRAL_TOKEN: ColorToken = "slate";

/** Chave no mapa estático de `features/icons`. Chave desconhecida cai num neutro. */
export type IconKey = string;
```

`src/domain/model/user.ts`:
```ts
import type { BaseRow, Draft } from "./base";
import type { ColorToken } from "./tokens";

/**
 * Rótulo de autoria, não identidade autenticada. Não existe exclusão de perfil:
 * `localUserId` apontaria para uma linha apagada e todo lançamento novo nasceria
 * órfão. Quem quer recomeçar usa "Resetar conta".
 */
export interface User extends BaseRow {
  name: string;
  color: ColorToken;
  /** Data URI da foto, ou null (iniciais sobre a cor). */
  avatar: string | null;
}

export type UserDraft = Draft<User>;
```

`src/domain/model/category.ts`:
```ts
import type { BaseRow, Draft } from "./base";
import type { ColorToken, IconKey } from "./tokens";

/** `both` serve aos dois lados: investimento e transferência são legitimamente os dois. */
export const CATEGORY_KINDS = ["expense", "income", "both"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export interface Category extends BaseRow {
  name: string;
  icon: IconKey;
  color: ColorToken;
  kind: CategoryKind;
}

export type CategoryDraft = Draft<Category>;
```

`src/domain/model/payment-method.ts`:
```ts
import type { BaseRow, Draft } from "./base";
import type { ColorToken, IconKey } from "./tokens";

/**
 * Carrega regra de produto que o nome não carrega: é `credit` que faz o
 * formulário oferecer cashback, e sobrevive a renomear "Pix" para "Pix Nubank".
 */
export const PAYMENT_KINDS = ["cash", "pix", "credit", "debit", "other"] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

export interface PaymentMethod extends BaseRow {
  name: string;
  icon: IconKey;
  color: ColorToken;
  kind: PaymentKind;
}

export type PaymentMethodDraft = Draft<PaymentMethod>;
```

`src/domain/model/transaction.ts`:
```ts
import type { Ulid } from "../ids/ulid";
import type { BaseRow, Draft } from "./base";

export type TransactionKind = "income" | "expense";

export interface Transaction extends BaseRow {
  kind: TransactionKind;
  description: string;
  /** Inteiro na unidade menor: 1234 é R$ 12,34. */
  amountMinor: number;
  currency: "BRL";
  categoryId: Ulid | null;
  paymentMethodId: Ulid | null;
  /** Retorno de cartão em centavos. Não entra no saldo. */
  cashbackMinor: number | null;
  /** Data do fato, 'YYYY-MM-DD'. Não confundir com `updatedAt`. */
  occurredOn: string;
  /** Autor. Decidido pela store no create; nenhum update o reescreve. */
  userId: Ulid | null;
  recurrenceId: Ulid | null;
  /** `${recurrenceId}:${YYYY-MM}`, ou null para lançamento avulso. */
  occurrenceKey: string | null;
}

/**
 * `userId` fica fora do draft: autoria não é campo de formulário. Como `edit`
 * recebe um draft, ele é estruturalmente incapaz de trocar o autor.
 */
export type TransactionDraft = Omit<Draft<Transaction>, "userId">;
```

`src/domain/model/recurrence.ts`:
```ts
import type { Ulid } from "../ids/ulid";
import type { BaseRow, Draft } from "./base";
import type { TransactionKind } from "./transaction";

/** Só frequências alinhadas a mês civil: extrato e dashboard pensam em mês. */
export const RECURRENCE_FREQUENCIES = [
  "monthly",
  "bimonthly",
  "quarterly",
  "semiannual",
  "annual",
] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export const SCHEDULE_TYPES = ["dayOfMonth", "nthBusinessDay"] as const;
export type ScheduleType = (typeof SCHEDULE_TYPES)[number];

/** A regra. As ocorrências são `Transaction` com `recurrenceId` e `occurrenceKey`. */
export interface Recurrence extends BaseRow {
  kind: TransactionKind;
  description: string;
  amountMinor: number;
  currency: "BRL";
  categoryId: Ulid | null;
  paymentMethodId: Ulid | null;
  cashbackMinor: number | null;
  frequency: RecurrenceFrequency;
  scheduleType: ScheduleType;
  /** Dia do mês (1–31) ou N-ésimo dia útil (1–23). */
  scheduleN: number;
  startOn: string;
  endOn: string | null;
  /** `false` pausa a geração sem apagar o que já foi materializado. */
  active: boolean;
}

export type RecurrenceDraft = Draft<Recurrence>;

/** O que o formulário de lançamento acrescenta para virar série. */
export type RecurrenceRule = Pick<Recurrence, "frequency" | "scheduleType" | "scheduleN" | "endOn">;

export const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  monthly: "Mensal",
  bimonthly: "Bimestral",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
};

export const SCHEDULE_TYPE_LABELS: Record<ScheduleType, string> = {
  dayOfMonth: "Dia fixo do mês",
  nthBusinessDay: "Dia útil do mês",
};
```

`src/domain/model/app-state.ts`:
```ts
import type { Ulid } from "../ids/ulid";
import type { Category } from "./category";
import type { PaymentMethod } from "./payment-method";
import type { Recurrence } from "./recurrence";
import type { Transaction } from "./transaction";
import type { User } from "./user";

/** Nome da tabela → tipo da linha. Fonte única de verdade para o resto. */
export interface RowMap {
  users: User;
  categories: Category;
  paymentMethods: PaymentMethod;
  transactions: Transaction;
  recurrences: Recurrence;
}

export type TableName = keyof RowMap;
export type RowOf<K extends TableName> = RowMap[K];

/** Espelho em memória das tabelas, inclusive linhas apagadas. */
export type AppState = { [K in TableName]: Record<Ulid, RowMap[K]> };

export type RowsByTable = { [K in TableName]?: RowMap[K][] };

export const TABLE_NAMES: readonly TableName[] = [
  "users",
  "categories",
  "paymentMethods",
  "transactions",
  "recurrences",
];

export const EMPTY_APP_STATE: AppState = {
  users: {},
  categories: {},
  paymentMethods: {},
  transactions: {},
  recurrences: {},
};
```

Run: `npm run typecheck` → sem erros.

- [ ] **Step 2: Commit do modelo**

```bash
git add src/domain/model
git commit -m "feat(model): tipos de linha por entidade para a persistencia CRUD"
```

- [ ] **Step 3: Teste do relógio de linha (falhando)**

`src/domain/clock/row-clock.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { compareHlc } from "./hlc";
import { createRowClock } from "./row-clock";

const DEVICE = "01J9F3K2M7QX8YB4TVWZ0DCEHZ";

describe("createRowClock", () => {
  it("stamp devolve HLC crescente mesmo no mesmo milissegundo", () => {
    const clock = createRowClock({
      deviceId: DEVICE,
      now: () => 1_754_697_600_000,
      randomChunk: (count) => Array.from({ length: count }, () => 0),
    });
    const a = clock.stamp();
    const b = clock.stamp();
    expect(compareHlc(b.hlc, a.hlc)).toBe(1);
    expect(a.iso).toBe("2025-08-09T00:00:00.000Z");
  });

  it("não regride abaixo do initialHlc", () => {
    const initial = `1754697700000-0000-${DEVICE}`;
    const clock = createRowClock({
      deviceId: DEVICE,
      initialHlc: initial,
      now: () => 1_754_697_600_000,
      randomChunk: (count) => Array.from({ length: count }, () => 0),
    });
    expect(compareHlc(clock.stamp().hlc, initial)).toBe(1);
  });

  it("newId gera ids distintos", () => {
    let millis = 1_754_697_600_000;
    const clock = createRowClock({
      deviceId: DEVICE,
      now: () => {
        millis += 1;
        return millis;
      },
      randomChunk: (count) => Array.from({ length: count }, () => 0),
    });
    expect(clock.newId()).not.toBe(clock.newId());
  });
});
```

Run: `npx vitest run src/domain/clock/row-clock.test.ts` → FAIL, `Cannot find module './row-clock'`.

- [ ] **Step 4: Implementar o relógio de linha**

`src/domain/clock/row-clock.ts`:
```ts
import { createUlidFactory, type RandomChunk, type Ulid } from "../ids/ulid";
import { createHlcClock } from "./hlc";

export interface RowClockDeps {
  deviceId: Ulid;
  /** Maior HLC já gravado, para o relógio não regredir depois de um reboot. */
  initialHlc?: string | null;
  now: () => number;
  randomChunk: RandomChunk;
}

export interface Stamp {
  hlc: string;
  iso: string;
}

/**
 * Um relógio por aparelho, compartilhado por todas as escritas. `updatedAt` sai
 * do HLC e não de `Date.now()` cru: no LWW por linha do hub, um celular com a
 * hora adiantada venceria todo conflito.
 */
export interface RowClock {
  readonly deviceId: Ulid;
  /** Um `now()` só alimenta o HLC e o ISO, para os dois falarem do mesmo instante. */
  stamp: () => Stamp;
  newId: () => Ulid;
}

export function createRowClock(deps: RowClockDeps): RowClock {
  const nextUlid = createUlidFactory(deps.randomChunk);
  const hlc = createHlcClock(deps.deviceId, deps.initialHlc ?? null);

  return {
    deviceId: deps.deviceId,
    stamp() {
      const millis = deps.now();
      return { hlc: hlc.tick(millis), iso: new Date(millis).toISOString() };
    },
    newId: () => nextUlid(deps.now()),
  };
}
```

Run: `npx vitest run src/domain/clock/row-clock.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/clock/row-clock.ts src/domain/clock/row-clock.test.ts
git commit -m "feat(clock): relogio de linha com HLC para updatedAt"
```

- [ ] **Step 6: Banco v2 e helpers de teste**

`src/data/crud-db.ts`:
```ts
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
export class CrudDb extends Dexie {
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
```

`src/data/test-db.fake.ts`:
```ts
import "fake-indexeddb/auto";
import type { RandomChunk } from "../domain/ids/ulid";
import { CrudDb } from "./crud-db";

/**
 * Banco real sobre `fake-indexeddb`, um nome por chamada para as suítes não se
 * enxergarem. O sufixo `.fake` o mantém fora do `include` do Vitest.
 */
let counter = 0;

export function openTestDb(): CrudDb {
  counter += 1;
  return new CrudDb(`homefinance-test-${counter}-${Date.now()}`);
}

export const TEST_DEVICE_ID = "01J9F3K2M7QX8YB4TVWZ0DCEHZ";

/** Relógio que anda 1ms por chamada e aleatoriedade fixa: ids e HLCs reprodutíveis. */
export function testSessionDeps(db: CrudDb): {
  db: CrudDb;
  now: () => number;
  randomChunk: RandomChunk;
} {
  let millis = 1_754_697_600_000;
  return {
    db,
    now: () => {
      millis += 1;
      return millis;
    },
    randomChunk: (count) => Array.from({ length: count }, (_, i) => i % 32),
  };
}
```

`src/data/crud-db.test.ts`:
```ts
import "fake-indexeddb/auto";
import Dexie from "dexie";
import { describe, expect, it } from "vitest";
import { CrudDb } from "./crud-db";

describe("CrudDb", () => {
  it("upgrade da v1 descarta events e localUserId e mantém deviceId", async () => {
    const name = `homefinance-upgrade-${Date.now()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({ events: "id, hlc", meta: "key" });
    await v1.table("events").put({ id: "E1", hlc: "x" });
    await v1.table("meta").bulkPut([
      { key: "deviceId", value: "D1" },
      { key: "localUserId", value: "U1" },
    ]);
    v1.close();

    const db = new CrudDb(name);
    await db.open();

    expect(db.tables.map((t) => t.name)).not.toContain("events");
    expect(await db.meta.get("deviceId")).toEqual({ key: "deviceId", value: "D1" });
    expect(await db.meta.get("localUserId")).toBeUndefined();
    await db.delete();
  });

  it("banco novo abre com as cinco tabelas vazias", async () => {
    const db = new CrudDb(`homefinance-novo-${Date.now()}`);
    expect(await db.users.count()).toBe(0);
    expect(await db.transactions.count()).toBe(0);
    await db.delete();
  });
});
```

Run: `npx vitest run src/data/crud-db.test.ts` → PASS.

```bash
git add src/data/crud-db.ts src/data/crud-db.test.ts src/data/test-db.fake.ts
git commit -m "feat(data): schema v2 com uma tabela por entidade"
```

- [ ] **Step 7: Teste do repositório (falhando)**

`src/data/repository.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compareHlc } from "../domain/clock/hlc";
import { createRowClock, type RowClock } from "../domain/clock/row-clock";
import type { Category } from "../domain/model/category";
import type { CrudDb } from "./crud-db";
import { buildRow, createRepository, type Repository } from "./repository";
import { openTestDb, TEST_DEVICE_ID, testSessionDeps } from "./test-db.fake";

const MERCADO = { name: "Mercado", icon: "utensils", color: "emerald", kind: "expense" } as const;

let db: CrudDb;
let clock: RowClock;
let repo: Repository<Category>;

beforeEach(() => {
  db = openTestDb();
  const deps = testSessionDeps(db);
  clock = createRowClock({ deviceId: TEST_DEVICE_ID, now: deps.now, randomChunk: deps.randomChunk });
  repo = createRepository(db.categories, clock);
});

afterEach(async () => {
  await db.delete();
});

describe("createRepository", () => {
  it("create grava a linha com timestamps, deletedAt nulo e dirty", async () => {
    const row = await repo.create(MERCADO);

    expect(row).toMatchObject({ ...MERCADO, deletedAt: null, dirty: 1 });
    expect(row.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(await db.categories.get(row.id)).toEqual(row);
  });

  it("create respeita o id recebido", async () => {
    const row = await repo.create(MERCADO, "ID-FIXO");
    expect(row.id).toBe("ID-FIXO");
  });

  it("update grava a linha inteira com updatedAt novo", async () => {
    const created = await repo.create(MERCADO);
    await db.categories.update(created.id, { dirty: 0 });

    const updated = await repo.update(created.id, { ...MERCADO, color: "red" });

    expect(updated.color).toBe("red");
    expect(updated.name).toBe("Mercado");
    expect(updated.dirty).toBe(1);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(compareHlc(updated.updatedAt, created.updatedAt)).toBe(1);
    expect(await db.categories.get(created.id)).toEqual(updated);
  });

  it("update sem mudança não escreve", async () => {
    const created = await repo.create(MERCADO);
    const same = await repo.update(created.id, { ...MERCADO });
    expect(same).toEqual(created);
  });

  it("update de id inexistente rejeita", async () => {
    await expect(repo.update("NAO-EXISTE", { name: "x" })).rejects.toThrow();
  });

  it("update de linha apagada rejeita", async () => {
    const created = await repo.create(MERCADO);
    await repo.remove(created.id);
    await expect(repo.update(created.id, { name: "x" })).rejects.toThrow();
  });

  it("remove marca deletedAt e mantém a linha", async () => {
    const created = await repo.create(MERCADO);
    const removed = await repo.remove(created.id);

    expect(removed.deletedAt).toBe(removed.updatedAt);
    expect(removed.dirty).toBe(1);
    expect(await db.categories.get(created.id)).toEqual(removed);
  });

  it("listAll devolve vivas e apagadas", async () => {
    const a = await repo.create(MERCADO);
    await repo.create({ ...MERCADO, name: "Farmácia" });
    await repo.remove(a.id);
    expect(await repo.listAll()).toHaveLength(2);
  });

  it("buildRow monta a linha sem gravar", async () => {
    const row = buildRow<Category>(clock, MERCADO);
    expect(row).toMatchObject({ ...MERCADO, deletedAt: null, dirty: 1 });
    expect(await db.categories.count()).toBe(0);
  });
});
```

Run: `npx vitest run src/data/repository.test.ts` → FAIL, `Cannot find module './repository'`.

- [ ] **Step 8: Implementar o repositório**

`src/data/repository.ts`:
```ts
import type { Table } from "dexie";
import type { RowClock } from "../domain/clock/row-clock";
import type { Ulid } from "../domain/ids/ulid";
import type { BaseRow, Draft } from "../domain/model/base";

/**
 * Porta de escrita única de todas as tabelas. Toda falha rejeita — quem chama
 * precisa saber que não salvou.
 */
export interface Repository<T extends BaseRow> {
  listAll: () => Promise<T[]>;
  /** `id` explícito só para identidade determinística (materialização). */
  create: (draft: Draft<T>, id?: Ulid) => Promise<T>;
  /** LWW por linha: grava a linha inteira. Sem mudança real, não escreve. */
  update: (id: Ulid, changes: Partial<Draft<T>>) => Promise<T>;
  /** Exclusão lógica: a linha fica, com `deletedAt`, para o hub propagar. */
  remove: (id: Ulid) => Promise<T>;
}

/**
 * Monta uma linha nova sem gravar — para lotes que precisam de uma transação
 * só (primeiro uso, materialização).
 *
 * O duplo cast é o preço do genérico: `Draft<T> & BaseRow` é `T` por
 * construção, mas o TypeScript não prova isso para um `T` aberto.
 */
export function buildRow<T extends BaseRow>(clock: RowClock, draft: Draft<T>, id?: Ulid): T {
  const { hlc, iso } = clock.stamp();
  const base: BaseRow = {
    id: id ?? clock.newId(),
    createdAt: iso,
    updatedAt: hlc,
    deletedAt: null,
    dirty: 1,
  };
  return { ...draft, ...base } as unknown as T;
}

function hasChanges(current: object, changes: object): boolean {
  const record = current as Record<string, unknown>;
  return Object.entries(changes).some(([field, value]) => record[field] !== value);
}

export function createRepository<T extends BaseRow>(
  table: Table<T, string>,
  clock: RowClock,
): Repository<T> {
  async function load(id: Ulid): Promise<T> {
    const current = await table.get(id);
    if (current === undefined) throw new Error(`Registro ${id} não existe`);
    return current;
  }

  return {
    listAll: () => table.toArray(),

    async create(draft, id) {
      const row = buildRow<T>(clock, draft, id);
      await table.put(row);
      return row;
    },

    async update(id, changes) {
      const current = await load(id);
      if (current.deletedAt !== null) throw new Error(`Registro ${id} foi removido`);
      if (!hasChanges(current, changes)) return current;

      const next: T = { ...current, ...changes, updatedAt: clock.stamp().hlc, dirty: 1 };
      await table.put(next);
      return next;
    },

    async remove(id) {
      const current = await load(id);
      if (current.deletedAt !== null) return current;

      const { hlc } = clock.stamp();
      const next: T = { ...current, deletedAt: hlc, updatedAt: hlc, dirty: 1 };
      await table.put(next);
      return next;
    },
  };
}
```

Run: `npx vitest run src/data/repository.test.ts` → PASS.

```bash
git add src/data/repository.ts src/data/repository.test.ts
git commit -m "feat(data): repositorio generico com LWW por linha e exclusao logica"
```

- [ ] **Step 9: Teste da sessão (falhando)**

`src/features/session/crud-session.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CrudDb } from "../../data/crud-db";
import { buildRow } from "../../data/repository";
import { openTestDb, testSessionDeps } from "../../data/test-db.fake";
import type { Category } from "../../domain/model/category";
import type { User } from "../../domain/model/user";
import { createCrudSession, LOCAL_USER_ID_KEY } from "./crud-session";

const MERCADO = { name: "Mercado", icon: "utensils", color: "emerald", kind: "expense" } as const;
const LUIZ = { name: "Luiz", color: "teal", avatar: null } as const;

let db: CrudDb;

beforeEach(() => {
  db = openTestDb();
});

afterEach(async () => {
  await db.delete();
});

describe("createCrudSession", () => {
  it("boot cria deviceId e fica pronto com estado vazio", async () => {
    const session = createCrudSession(testSessionDeps(db));
    await session.init();

    expect(session.status.value).toBe("ready");
    expect(session.state.value.categories).toEqual({});
    expect((await db.meta.get("deviceId"))?.value).toBe(session.clock().deviceId);
  });

  it("boot carrega as linhas das tabelas e o localUserId", async () => {
    const primeira = createCrudSession(testSessionDeps(db));
    await primeira.init();
    const row = await primeira.mutate("categories", (repo) => repo.create(MERCADO));
    await db.meta.put({ key: LOCAL_USER_ID_KEY, value: "U1" });

    const segunda = createCrudSession(testSessionDeps(db));
    await segunda.init();

    expect(segunda.state.value.categories[row.id]).toEqual(row);
    expect(segunda.localUserId.value).toBe("U1");
  });

  it("mutate grava e publica a linha", async () => {
    const session = createCrudSession(testSessionDeps(db));
    await session.init();

    const row = await session.mutate("categories", (repo) => repo.create(MERCADO));

    expect(session.state.value.categories[row.id]).toEqual(row);
    expect(await db.categories.get(row.id)).toEqual(row);
  });

  it("mutate que falha não muda o estado, preenche error e relança", async () => {
    const session = createCrudSession(testSessionDeps(db));
    await session.init();
    vi.spyOn(db.categories, "put").mockRejectedValueOnce(new Error("quota exceeded"));

    await expect(session.mutate("categories", (repo) => repo.create(MERCADO))).rejects.toThrow(
      "quota exceeded",
    );
    expect(session.state.value.categories).toEqual({});
    expect(session.error.value).toBe("quota exceeded");
  });

  it("putRows grava tudo numa transação e publica localUserId", async () => {
    const session = createCrudSession(testSessionDeps(db));
    await session.init();
    const user = buildRow<User>(session.clock(), LUIZ);
    const category = buildRow<Category>(session.clock(), MERCADO);

    await session.putRows(
      { users: [user], categories: [category] },
      { [LOCAL_USER_ID_KEY]: user.id },
    );

    expect(session.state.value.users[user.id]).toEqual(user);
    expect(session.state.value.categories[category.id]).toEqual(category);
    expect(session.localUserId.value).toBe(user.id);
    expect((await db.meta.get(LOCAL_USER_ID_KEY))?.value).toBe(user.id);
  });

  it("putRows que falha no meio não grava nada", async () => {
    const session = createCrudSession(testSessionDeps(db));
    await session.init();
    const user = buildRow<User>(session.clock(), LUIZ);
    const category = buildRow<Category>(session.clock(), MERCADO);
    vi.spyOn(db.categories, "bulkPut").mockRejectedValueOnce(new Error("quota exceeded"));

    await expect(
      session.putRows({ users: [user], categories: [category] }, { [LOCAL_USER_ID_KEY]: user.id }),
    ).rejects.toThrow("quota exceeded");

    expect(await db.users.count()).toBe(0);
    expect(await db.meta.get(LOCAL_USER_ID_KEY)).toBeUndefined();
    expect(session.localUserId.value).toBeNull();
    expect(session.state.value.users).toEqual({});
  });

  it("clock antes do init lança", () => {
    const session = createCrudSession(testSessionDeps(db));
    expect(() => session.clock()).toThrow("Sessão não inicializada");
  });
});
```

Run: `npx vitest run src/features/session/crud-session.test.ts` → FAIL, módulo inexistente.

- [ ] **Step 10: Implementar a sessão**

`src/features/session/crud-session.ts`:
```ts
import { batch, type Signal, signal } from "@preact/signals";
import type { Table } from "dexie";
import type { CrudDb } from "../../data/crud-db";
import { createRepository, type Repository } from "../../data/repository";
import { compareHlc } from "../../domain/clock/hlc";
import { createRowClock, type RowClock } from "../../domain/clock/row-clock";
import { createUlidFactory, type RandomChunk, type Ulid } from "../../domain/ids/ulid";
import {
  type AppState,
  EMPTY_APP_STATE,
  type RowOf,
  type RowsByTable,
  TABLE_NAMES,
  type TableName,
} from "../../domain/model/app-state";
import type { BaseRow } from "../../domain/model/base";

const DEVICE_ID_KEY = "deviceId";

/**
 * Qual perfil sou **eu** neste aparelho. Estado de dispositivo, nunca
 * sincronizado: depois do sync o perfil da outra pessoa estará na tabela, e
 * derivar o primeiro uso de "existe algum user" pularia o cadastro.
 */
export const LOCAL_USER_ID_KEY = "localUserId";

export type SessionStatus = "loading" | "ready" | "error";

export interface CrudSessionDeps {
  db: CrudDb;
  now: () => number;
  randomChunk: RandomChunk;
}

/**
 * Estado em memória e porta de escrita compartilhados por todas as stores.
 * Grava primeiro, publica depois: se o banco rejeitar, a tela não muda.
 */
export interface CrudSession {
  state: Signal<AppState>;
  status: Signal<SessionStatus>;
  error: Signal<string | null>;
  /** Nulo enquanto o primeiro uso não concluiu **neste** aparelho. */
  localUserId: Signal<Ulid | null>;
  init: () => Promise<void>;
  /** Lança se chamado antes de `init` concluir. */
  clock: () => RowClock;
  /** Uma escrita numa tabela. Falha preenche `error` **e relança**. */
  mutate: <K extends TableName>(
    table: K,
    op: (repo: Repository<RowOf<K>>) => Promise<RowOf<K>>,
  ) => Promise<RowOf<K>>;
  /** Lote atômico de linhas prontas (`buildRow`) mais chaves de `meta`. */
  putRows: (rows: RowsByTable, meta?: Record<string, string>) => Promise<void>;
}

function describeError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function toRecord<T extends BaseRow>(rows: readonly T[]): Record<Ulid, T> {
  return Object.fromEntries(rows.map((row) => [row.id, row]));
}

/** Semente do relógio: o maior HLC já gravado, para ele não regredir. */
function latestHlc(state: AppState): string | null {
  let max: string | null = null;
  for (const table of TABLE_NAMES) {
    for (const row of Object.values(state[table]) as BaseRow[]) {
      for (const hlc of [row.updatedAt, row.deletedAt]) {
        if (hlc !== null && (max === null || compareHlc(hlc, max) > 0)) max = hlc;
      }
    }
  }
  return max;
}

/**
 * Substitui as linhas recebidas no estado. O cast existe porque a chave
 * computada de um `TableName` em união não deixa o TypeScript provar que cada
 * lista cai no bucket certo; `RowsByTable` garante isso por construção.
 */
function withRows(state: AppState, rows: RowsByTable): AppState {
  let next = state;
  for (const table of TABLE_NAMES) {
    const list = rows[table];
    if (list === undefined || list.length === 0) continue;
    next = { ...next, [table]: { ...next[table], ...toRecord<BaseRow>(list) } } as AppState;
  }
  return next;
}

export function createCrudSession(deps: CrudSessionDeps): CrudSession {
  const state = signal<AppState>(EMPTY_APP_STATE);
  const status = signal<SessionStatus>("loading");
  const error = signal<string | null>(null);
  const localUserId = signal<Ulid | null>(null);
  let rowClock: RowClock | null = null;

  function clock(): RowClock {
    if (rowClock === null) throw new Error("Sessão não inicializada");
    return rowClock;
  }

  function tableOf<K extends TableName>(table: K): Table<RowOf<K>, string> {
    return deps.db.table<RowOf<K>, string>(table);
  }

  async function init(): Promise<void> {
    try {
      const stored = await deps.db.meta.get(DEVICE_ID_KEY);
      const deviceId = stored?.value ?? createUlidFactory(deps.randomChunk)(deps.now());
      if (stored === undefined) await deps.db.meta.put({ key: DEVICE_ID_KEY, value: deviceId });

      const perfil = (await deps.db.meta.get(LOCAL_USER_ID_KEY))?.value ?? null;
      const [users, categories, paymentMethods, transactions, recurrences] = await Promise.all([
        deps.db.users.toArray(),
        deps.db.categories.toArray(),
        deps.db.paymentMethods.toArray(),
        deps.db.transactions.toArray(),
        deps.db.recurrences.toArray(),
      ]);
      const loaded: AppState = {
        users: toRecord(users),
        categories: toRecord(categories),
        paymentMethods: toRecord(paymentMethods),
        transactions: toRecord(transactions),
        recurrences: toRecord(recurrences),
      };

      rowClock = createRowClock({
        deviceId,
        initialHlc: latestHlc(loaded),
        now: deps.now,
        randomChunk: deps.randomChunk,
      });

      // Uma atualização só: `ready` com estado vazio faria a tela piscar
      // "Nenhum lançamento ainda" antes dos dados do disco.
      batch(() => {
        state.value = loaded;
        localUserId.value = perfil;
        status.value = "ready";
      });
    } catch (cause) {
      batch(() => {
        status.value = "error";
        error.value = describeError(cause);
      });
    }
  }

  async function mutate<K extends TableName>(
    table: K,
    op: (repo: Repository<RowOf<K>>) => Promise<RowOf<K>>,
  ): Promise<RowOf<K>> {
    const repo = createRepository(tableOf(table), clock());
    let row: RowOf<K>;
    try {
      row = await op(repo);
    } catch (cause) {
      error.value = describeError(cause);
      throw cause;
    }
    batch(() => {
      error.value = null;
      state.value = withRows(state.value, { [table]: [row] } as RowsByTable);
    });
    return row;
  }

  async function putRows(rows: RowsByTable, meta: Record<string, string> = {}): Promise<void> {
    const tables = TABLE_NAMES.filter((table) => (rows[table]?.length ?? 0) > 0);
    try {
      await deps.db.transaction(
        "rw",
        [...tables.map((table) => deps.db.table(table)), deps.db.meta],
        async () => {
          for (const table of tables) await deps.db.table(table).bulkPut(rows[table] ?? []);
          for (const [key, value] of Object.entries(meta)) await deps.db.meta.put({ key, value });
        },
      );
    } catch (cause) {
      error.value = describeError(cause);
      throw cause;
    }

    const perfil = meta[LOCAL_USER_ID_KEY];
    batch(() => {
      error.value = null;
      state.value = withRows(state.value, rows);
      if (perfil !== undefined) localUserId.value = perfil;
    });
  }

  return { state, status, error, localUserId, init, clock, mutate, putRows };
}
```

Nota: `deps.db.table(table)` devolve a mesma instância que `deps.db.categories` (o Dexie guarda as tabelas em cache), por isso o `vi.spyOn(db.categories, ...)` dos testes pega a escrita.

Run: `npx vitest run src/features/session/crud-session.test.ts` → PASS.

- [ ] **Step 11: Verificação completa e commit**

```bash
npm run format && npm run lint && npm run typecheck && npm test && npm run build
git add src/features/session/crud-session.ts src/features/session/crud-session.test.ts
git commit -m "feat(session): sessao CRUD com mutate e lote atomico"
```

Nada disto está ligado à UI; os 578 testes antigos continuam passando.

---

## Task 2: Categoria e forma de pagamento

**Branch:** `refactor/crud-referencia` (a partir do `develop` com T1)

**Files:**
- Create: `src/features/registry/crud-store.ts`
- Test: `src/features/registry/crud-store.test.ts`

- [ ] **Step 1: Teste (falhando)**

`src/features/registry/crud-store.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CrudDb } from "../../data/crud-db";
import { openTestDb, testSessionDeps } from "../../data/test-db.fake";
import { compareHlc } from "../../domain/clock/hlc";
import { type CrudSession, createCrudSession } from "../session/crud-session";
import { createRegistryStore, type RegistryStore } from "./crud-store";

const MERCADO = { name: "Mercado", icon: "utensils", color: "emerald", kind: "expense" } as const;
const NUBANK = { name: "Nubank", icon: "credit-card", color: "violet", kind: "credit" } as const;

let db: CrudDb;
let session: CrudSession;
let store: RegistryStore;

beforeEach(async () => {
  db = openTestDb();
  session = createCrudSession(testSessionDeps(db));
  await session.init();
  store = createRegistryStore(session);
});

afterEach(async () => {
  await db.delete();
});

describe("createRegistryStore (CRUD)", () => {
  it("addCategory grava e publica", async () => {
    const row = await store.addCategory(MERCADO);
    expect(session.state.value.categories[row.id]).toMatchObject(MERCADO);
    expect(await db.categories.get(row.id)).toEqual(row);
  });

  it("editCategory recebe o draft completo e troca a linha", async () => {
    const created = await store.addCategory(MERCADO);
    const edited = await store.editCategory(created.id, { ...MERCADO, name: "Supermercado" });

    expect(edited.name).toBe("Supermercado");
    expect(compareHlc(edited.updatedAt, created.updatedAt)).toBe(1);
    expect(session.state.value.categories[created.id]?.name).toBe("Supermercado");
  });

  it("editCategory sem mudança não avança updatedAt", async () => {
    const created = await store.addCategory(MERCADO);
    const same = await store.editCategory(created.id, { ...MERCADO });
    expect(same.updatedAt).toBe(created.updatedAt);
  });

  it("removeCategory marca deletedAt e mantém a linha", async () => {
    const created = await store.addCategory(MERCADO);
    await store.removeCategory(created.id);

    expect(session.state.value.categories[created.id]?.deletedAt).not.toBeNull();
    expect(await db.categories.count()).toBe(1);
  });

  it("forma de pagamento: add, edit e remove", async () => {
    const created = await store.addPaymentMethod(NUBANK);
    await store.editPaymentMethod(created.id, { ...NUBANK, kind: "debit" });
    expect(session.state.value.paymentMethods[created.id]?.kind).toBe("debit");

    await store.removePaymentMethod(created.id);
    expect(session.state.value.paymentMethods[created.id]?.deletedAt).not.toBeNull();
  });

  it("falha de escrita rejeita e não publica", async () => {
    vi.spyOn(db.categories, "put").mockRejectedValueOnce(new Error("quota exceeded"));
    await expect(store.addCategory(MERCADO)).rejects.toThrow("quota exceeded");
    expect(session.state.value.categories).toEqual({});
  });
});
```

Run: `npx vitest run src/features/registry/crud-store.test.ts` → FAIL, módulo inexistente.

- [ ] **Step 2: Implementar**

`src/features/registry/crud-store.ts`:
```ts
import type { Ulid } from "../../domain/ids/ulid";
import type { Category, CategoryDraft } from "../../domain/model/category";
import type { PaymentMethod, PaymentMethodDraft } from "../../domain/model/payment-method";
import type { CrudSession } from "../session/crud-session";

/**
 * Cadastro de categorias e formas de pagamento. `edit` recebe o draft inteiro:
 * com LWW por linha não existe patch, e o repositório já ignora edição sem
 * mudança.
 */
export interface RegistryStore {
  addCategory: (draft: CategoryDraft) => Promise<Category>;
  editCategory: (id: Ulid, draft: CategoryDraft) => Promise<Category>;
  removeCategory: (id: Ulid) => Promise<Category>;
  addPaymentMethod: (draft: PaymentMethodDraft) => Promise<PaymentMethod>;
  editPaymentMethod: (id: Ulid, draft: PaymentMethodDraft) => Promise<PaymentMethod>;
  removePaymentMethod: (id: Ulid) => Promise<PaymentMethod>;
}

export function createRegistryStore(session: CrudSession): RegistryStore {
  return {
    addCategory: (draft) => session.mutate("categories", (repo) => repo.create(draft)),
    editCategory: (id, draft) => session.mutate("categories", (repo) => repo.update(id, draft)),
    removeCategory: (id) => session.mutate("categories", (repo) => repo.remove(id)),
    addPaymentMethod: (draft) => session.mutate("paymentMethods", (repo) => repo.create(draft)),
    editPaymentMethod: (id, draft) =>
      session.mutate("paymentMethods", (repo) => repo.update(id, draft)),
    removePaymentMethod: (id) => session.mutate("paymentMethods", (repo) => repo.remove(id)),
  };
}
```

Run: `npx vitest run src/features/registry/crud-store.test.ts` → PASS.

- [ ] **Step 3: Verificação e commit**

```bash
npm run format && npm run lint && npm run typecheck && npm test
git add src/features/registry/crud-store.ts src/features/registry/crud-store.test.ts
git commit -m "feat(registry): store CRUD de categoria e forma de pagamento"
```

---

## Task 3: Lançamento

**Branch:** `refactor/crud-transacao`

**Files:**
- Create: `src/features/transactions/crud-store.ts`
- Test: `src/features/transactions/crud-store.test.ts`

- [ ] **Step 1: Teste (falhando)**

`src/features/transactions/crud-store.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CrudDb } from "../../data/crud-db";
import { openTestDb, testSessionDeps } from "../../data/test-db.fake";
import type { TransactionDraft } from "../../domain/model/transaction";
import { type CrudSession, createCrudSession } from "../session/crud-session";
import { createTransactionsStore, type TransactionsStore } from "./crud-store";

const MERCADO: TransactionDraft = {
  kind: "expense",
  description: "Mercado",
  amountMinor: 15_490,
  currency: "BRL",
  categoryId: null,
  paymentMethodId: null,
  cashbackMinor: null,
  occurredOn: "2026-09-24",
  recurrenceId: null,
  occurrenceKey: null,
};

let db: CrudDb;
let session: CrudSession;
let store: TransactionsStore;

beforeEach(async () => {
  db = openTestDb();
  session = createCrudSession(testSessionDeps(db));
  await session.init();
  session.localUserId.value = "AUTOR-1";
  store = createTransactionsStore(session);
});

afterEach(async () => {
  await db.delete();
});

describe("createTransactionsStore (CRUD)", () => {
  it("add grava com o autor da sessão", async () => {
    const row = await store.add(MERCADO);
    expect(row).toMatchObject({ ...MERCADO, userId: "AUTOR-1", deletedAt: null });
    expect(await db.transactions.get(row.id)).toEqual(row);
  });

  it("add sem perfil local grava userId nulo", async () => {
    session.localUserId.value = null;
    const row = await store.add(MERCADO);
    expect(row.userId).toBeNull();
  });

  it("edit troca os campos e preserva o autor", async () => {
    const created = await store.add(MERCADO);
    session.localUserId.value = "OUTRA-PESSOA";

    const edited = await store.edit(created.id, { ...MERCADO, amountMinor: 20_000 });

    expect(edited.amountMinor).toBe(20_000);
    expect(edited.userId).toBe("AUTOR-1");
  });

  it("edit zera o cashback", async () => {
    const created = await store.add({ ...MERCADO, cashbackMinor: 300 });
    const edited = await store.edit(created.id, { ...MERCADO, cashbackMinor: null });
    expect(edited.cashbackMinor).toBeNull();
  });

  it("remove marca deletedAt e mantém a linha", async () => {
    const created = await store.add(MERCADO);
    await store.remove(created.id);
    expect(session.state.value.transactions[created.id]?.deletedAt).not.toBeNull();
    expect(await db.transactions.count()).toBe(1);
  });

  it("falha de escrita rejeita e não publica", async () => {
    vi.spyOn(db.transactions, "put").mockRejectedValueOnce(new Error("quota exceeded"));
    await expect(store.add(MERCADO)).rejects.toThrow("quota exceeded");
    expect(session.state.value.transactions).toEqual({});
  });
});
```

Run: `npx vitest run src/features/transactions/crud-store.test.ts` → FAIL.

- [ ] **Step 2: Implementar**

`src/features/transactions/crud-store.ts`:
```ts
import type { Ulid } from "../../domain/ids/ulid";
import type { Transaction, TransactionDraft } from "../../domain/model/transaction";
import type { CrudSession } from "../session/crud-session";

/**
 * Lançamentos avulsos. Estado, status e boot moram na sessão, não aqui.
 */
export interface TransactionsStore {
  add: (draft: TransactionDraft) => Promise<Transaction>;
  edit: (id: Ulid, draft: TransactionDraft) => Promise<Transaction>;
  remove: (id: Ulid) => Promise<Transaction>;
}

export function createTransactionsStore(session: CrudSession): TransactionsStore {
  return {
    // Autoria vem da sessão, e só no create. `TransactionDraft` não tem
    // `userId`, então `edit` não consegue trocar o autor: se a outra pessoa
    // corrige o valor de um lançamento seu, ele continua seu.
    add: (draft) =>
      session.mutate("transactions", (repo) =>
        repo.create({ ...draft, userId: session.localUserId.value }),
      ),
    edit: (id, draft) => session.mutate("transactions", (repo) => repo.update(id, draft)),
    remove: (id) => session.mutate("transactions", (repo) => repo.remove(id)),
  };
}
```

Run: `npx vitest run src/features/transactions/crud-store.test.ts` → PASS.

- [ ] **Step 3: Verificação e commit**

```bash
npm run format && npm run lint && npm run typecheck && npm test
git add src/features/transactions/crud-store.ts src/features/transactions/crud-store.test.ts
git commit -m "feat(transactions): store CRUD de lancamento com autoria"
```

---

## Task 4: Recorrência

**Branch:** `refactor/crud-recorrencia`

**Files:**
- Create: `src/domain/recurrence/plan.ts`, `src/domain/recurrence/plan.test.ts`
- Create: `src/features/recurrence/crud-store.ts`, `src/features/recurrence/crud-store.test.ts`
- Read (não modificar): `src/domain/recurrence/schedule.ts`, `src/domain/recurrence/materialize.ts`

- [ ] **Step 1: Teste do plano (falhando)**

`src/domain/recurrence/plan.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { stableEntityId } from "../ids/stable-id";
import { type AppState, EMPTY_APP_STATE } from "../model/app-state";
import type { Recurrence } from "../model/recurrence";
import type { Transaction } from "../model/transaction";
import { planOccurrences } from "./plan";
import { occurrenceKey } from "./schedule";

const BASE = {
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "1754697600000-0000-01J9F3K2M7QX8YB4TVWZ0DCEHZ",
  deletedAt: null,
  dirty: 1,
} as const;

const SALARIO: Recurrence = {
  ...BASE,
  id: "SERIE-1",
  kind: "income",
  description: "Salário",
  amountMinor: 500_000,
  currency: "BRL",
  categoryId: null,
  paymentMethodId: null,
  cashbackMinor: null,
  frequency: "monthly",
  scheduleType: "dayOfMonth",
  scheduleN: 5,
  startOn: "2026-06-05",
  endOn: null,
  active: true,
};

function stateWith(series: Recurrence, transactions: Transaction[] = []): AppState {
  return {
    ...EMPTY_APP_STATE,
    recurrences: { [series.id]: series },
    transactions: Object.fromEntries(transactions.map((t) => [t.id, t])),
  };
}

describe("planOccurrences", () => {
  it("planeja uma ocorrência por competência vencida", () => {
    const plans = planOccurrences(stateWith(SALARIO), "2026-08-10");
    expect(plans.map((p) => p.draft.occurredOn)).toEqual(["2026-06-05", "2026-07-05", "2026-08-05"]);
    expect(plans[0]?.draft).toMatchObject({ recurrenceId: "SERIE-1", amountMinor: 500_000 });
  });

  it("não planeja competência cuja linha já existe, mesmo apagada", () => {
    const period = "2026-06";
    const key = occurrenceKey("SERIE-1", period);
    const apagada: Transaction = {
      ...BASE,
      id: stableEntityId(key),
      deletedAt: BASE.updatedAt,
      kind: "income",
      description: "Salário",
      amountMinor: 500_000,
      currency: "BRL",
      categoryId: null,
      paymentMethodId: null,
      cashbackMinor: null,
      occurredOn: "2026-06-05",
      userId: null,
      recurrenceId: "SERIE-1",
      occurrenceKey: key,
    };
    const plans = planOccurrences(stateWith(SALARIO, [apagada]), "2026-07-10");
    expect(plans.map((p) => p.draft.occurredOn)).toEqual(["2026-07-05"]);
  });

  it("ignora série inativa, apagada ou que ainda não começou", () => {
    expect(planOccurrences(stateWith({ ...SALARIO, active: false }), "2026-08-10")).toEqual([]);
    expect(
      planOccurrences(stateWith({ ...SALARIO, deletedAt: BASE.updatedAt }), "2026-08-10"),
    ).toEqual([]);
    expect(planOccurrences(stateWith(SALARIO), "2026-06-01")).toEqual([]);
  });

  it("respeita endOn", () => {
    const plans = planOccurrences(stateWith({ ...SALARIO, endOn: "2026-07-01" }), "2026-09-10");
    expect(plans.map((p) => p.draft.occurredOn)).toEqual(["2026-06-05"]);
  });
});
```

Run: `npx vitest run src/domain/recurrence/plan.test.ts` → FAIL, módulo inexistente.

- [ ] **Step 2: Implementar o plano**

`src/domain/recurrence/plan.ts`:
```ts
import { stableEntityId } from "../ids/stable-id";
import type { Ulid } from "../ids/ulid";
import type { AppState } from "../model/app-state";
import type { TransactionDraft } from "../model/transaction";
import { eachPeriod, occurrenceKey, occurrenceOn } from "./schedule";

export interface OccurrencePlan {
  /** Determinístico: dois aparelhos materializam o mesmo mês com o mesmo id. */
  entityId: Ulid;
  draft: TransactionDraft;
}

/**
 * Quais ocorrências vencidas ainda não têm linha. Puro: `today` entra por
 * parâmetro e ninguém grava nada aqui.
 *
 * "Não tem linha" inclui a linha apagada. Com exclusão lógica a ocorrência que
 * o usuário apagou continua na tabela com `deletedAt`; tratá-la como ausente
 * faria o salário apagado voltar no próximo boot.
 */
export function planOccurrences(state: AppState, today: string): OccurrencePlan[] {
  const plans: OccurrencePlan[] = [];

  for (const series of Object.values(state.recurrences)) {
    if (series.deletedAt !== null || !series.active) continue;
    if (series.startOn === "" || series.startOn > today) continue;

    const until = series.endOn !== null && series.endOn < today ? series.endOn : today;

    for (const period of eachPeriod(series.startOn, until, series.frequency)) {
      const occurredOn = occurrenceOn(period, series.scheduleType, series.scheduleN);
      if (occurredOn > today) continue;
      if (series.endOn !== null && occurredOn > series.endOn) continue;

      const key = occurrenceKey(series.id, period);
      const entityId = stableEntityId(key);
      if (state.transactions[entityId] !== undefined) continue;

      plans.push({
        entityId,
        draft: {
          kind: series.kind,
          description: series.description,
          amountMinor: series.amountMinor,
          currency: "BRL",
          categoryId: series.categoryId,
          paymentMethodId: series.paymentMethodId,
          cashbackMinor: series.cashbackMinor,
          occurredOn,
          recurrenceId: series.id,
          occurrenceKey: key,
        },
      });
    }
  }

  return plans;
}
```

Run: `npx vitest run src/domain/recurrence/plan.test.ts` → PASS.

```bash
git add src/domain/recurrence/plan.ts src/domain/recurrence/plan.test.ts
git commit -m "feat(recurrence): plano de ocorrencias sobre AppState"
```

- [ ] **Step 3: Teste da store (falhando)**

`src/features/recurrence/crud-store.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CrudDb } from "../../data/crud-db";
import { openTestDb, testSessionDeps } from "../../data/test-db.fake";
import { isAlive } from "../../domain/model/base";
import type { RecurrenceRule } from "../../domain/model/recurrence";
import type { TransactionDraft } from "../../domain/model/transaction";
import { type CrudSession, createCrudSession } from "../session/crud-session";
import { createRecurrenceStore, type RecurrenceStore } from "./crud-store";

const DRAFT: TransactionDraft = {
  kind: "income",
  description: "Salário",
  amountMinor: 500_000,
  currency: "BRL",
  categoryId: null,
  paymentMethodId: null,
  cashbackMinor: null,
  occurredOn: "2026-06-05",
  recurrenceId: null,
  occurrenceKey: null,
};

const MENSAL: RecurrenceRule = {
  frequency: "monthly",
  scheduleType: "dayOfMonth",
  scheduleN: 5,
  endOn: null,
};

let db: CrudDb;
let session: CrudSession;
let store: RecurrenceStore;

function alive() {
  return Object.values(session.state.value.transactions).filter((t) => isAlive(t));
}

beforeEach(async () => {
  db = openTestDb();
  session = createCrudSession(testSessionDeps(db));
  await session.init();
  session.localUserId.value = "AUTOR-1";
  store = createRecurrenceStore(session);
});

afterEach(async () => {
  await db.delete();
});

describe("createRecurrenceStore (CRUD)", () => {
  it("createSeries grava a série e materializa até hoje", async () => {
    await store.createSeries(DRAFT, MENSAL, "2026-08-10");

    expect(Object.values(session.state.value.recurrences)).toHaveLength(1);
    expect(alive().map((t) => t.occurredOn).sort()).toEqual([
      "2026-06-05",
      "2026-07-05",
      "2026-08-05",
    ]);
    expect(alive().every((t) => t.userId === "AUTOR-1")).toBe(true);
    expect(await db.transactions.count()).toBe(3);
  });

  it("materializeDue repetido não duplica", async () => {
    await store.createSeries(DRAFT, MENSAL, "2026-08-10");
    await store.materializeDue("2026-08-10");
    expect(await db.transactions.count()).toBe(3);
  });

  it("não recria ocorrência apagada", async () => {
    await store.createSeries(DRAFT, MENSAL, "2026-08-10");
    const junho = alive().find((t) => t.occurredOn === "2026-06-05");
    if (junho === undefined) throw new Error("junho não materializado");
    await session.mutate("transactions", (repo) => repo.remove(junho.id));

    await store.materializeDue("2026-08-10");

    expect(session.state.value.transactions[junho.id]?.deletedAt).not.toBeNull();
    expect(alive()).toHaveLength(2);
  });

  it("série pausada não gera novas ocorrências", async () => {
    await store.createSeries(DRAFT, MENSAL, "2026-06-10");
    const [serie] = Object.values(session.state.value.recurrences);
    if (serie === undefined) throw new Error("série não criada");
    const { id, createdAt, updatedAt, deletedAt, dirty, ...draft } = serie;
    await store.editSeries(id, { ...draft, active: false });

    await store.materializeDue("2026-09-10");
    expect(alive()).toHaveLength(1);
  });

  it("removeSeries marca deletedAt e mantém o histórico", async () => {
    await store.createSeries(DRAFT, MENSAL, "2026-07-10");
    const [serie] = Object.values(session.state.value.recurrences);
    if (serie === undefined) throw new Error("série não criada");

    await store.removeSeries(serie.id);

    expect(session.state.value.recurrences[serie.id]?.deletedAt).not.toBeNull();
    expect(alive()).toHaveLength(2);
  });

  it("falha ao criar a série rejeita e não materializa", async () => {
    vi.spyOn(db.recurrences, "put").mockRejectedValueOnce(new Error("quota exceeded"));
    await expect(store.createSeries(DRAFT, MENSAL, "2026-08-10")).rejects.toThrow();
    expect(await db.transactions.count()).toBe(0);
  });
});
```

O destructuring em "série pausada" gera variáveis não usadas (`createdAt`, `updatedAt`, `deletedAt`, `dirty`). Se o Biome acusar, troque por um helper `draftOf(row)` que devolve só os campos de `RecurrenceDraft`.

Run: `npx vitest run src/features/recurrence/crud-store.test.ts` → FAIL.

- [ ] **Step 4: Implementar a store**

`src/features/recurrence/crud-store.ts`:
```ts
import { buildRow } from "../../data/repository";
import type { Ulid } from "../../domain/ids/ulid";
import type { Recurrence, RecurrenceDraft, RecurrenceRule } from "../../domain/model/recurrence";
import type { Transaction, TransactionDraft } from "../../domain/model/transaction";
import { planOccurrences } from "../../domain/recurrence/plan";
import type { CrudSession } from "../session/crud-session";

export interface RecurrenceStore {
  /** Cria a série a partir do lançamento + regra e materializa o que venceu. */
  createSeries: (draft: TransactionDraft, rule: RecurrenceRule, today: string) => Promise<void>;
  /** Gera as ocorrências que faltam (no boot e ao criar série). */
  materializeDue: (today: string) => Promise<void>;
  editSeries: (id: Ulid, draft: RecurrenceDraft) => Promise<Recurrence>;
  removeSeries: (id: Ulid) => Promise<Recurrence>;
}

export function createRecurrenceStore(session: CrudSession): RecurrenceStore {
  async function materializeDue(today: string): Promise<void> {
    const plans = planOccurrences(session.state.value, today);
    if (plans.length === 0) return;

    const clock = session.clock();
    const userId = session.localUserId.value;
    // Um lote só: uma transação Dexie em vez de N escritas soltas, e o id
    // determinístico de cada ocorrência vem do plano.
    const rows = plans.map((plan) =>
      buildRow<Transaction>(clock, { ...plan.draft, userId }, plan.entityId),
    );
    await session.putRows({ transactions: rows });
  }

  return {
    async createSeries(draft, rule, today) {
      const series: RecurrenceDraft = {
        kind: draft.kind,
        description: draft.description,
        amountMinor: draft.amountMinor,
        currency: "BRL",
        categoryId: draft.categoryId,
        paymentMethodId: draft.paymentMethodId,
        cashbackMinor: draft.cashbackMinor,
        frequency: rule.frequency,
        scheduleType: rule.scheduleType,
        scheduleN: rule.scheduleN,
        startOn: draft.occurredOn,
        endOn: rule.endOn,
        active: true,
      };
      // Se a série não gravar, `mutate` rejeita e a materialização nem começa.
      await session.mutate("recurrences", (repo) => repo.create(series));
      await materializeDue(today);
    },

    materializeDue,

    editSeries: (id, draft) => session.mutate("recurrences", (repo) => repo.update(id, draft)),
    removeSeries: (id) => session.mutate("recurrences", (repo) => repo.remove(id)),
  };
}
```

Run: `npx vitest run src/features/recurrence/crud-store.test.ts` → PASS.

- [ ] **Step 5: Verificação e commit**

```bash
npm run format && npm run lint && npm run typecheck && npm test
git add src/features/recurrence/crud-store.ts src/features/recurrence/crud-store.test.ts
git commit -m "feat(recurrence): store CRUD de serie com materializacao em lote"
```

---

## Task 5: Usuário (primeiro uso e perfil)

**Branch:** `refactor/crud-usuario`

**Files:**
- Create: `src/features/onboarding/crud-seed.ts`, `crud-seed.test.ts`
- Create: `src/features/onboarding/crud-store.ts`, `crud-store.test.ts`
- Create: `src/features/profile/crud-store.ts`, `crud-store.test.ts`
- Read: `src/features/onboarding/seed.ts` (listas padrão a copiar literalmente)

- [ ] **Step 1: Teste do seed (falhando)**

`src/features/onboarding/crud-seed.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { createRowClock } from "../../domain/clock/row-clock";
import { LOCAL_USER_ID_KEY } from "../session/crud-session";
import { buildOnboardingRows } from "./crud-seed";

const LUIZ = { name: "Luiz", color: "teal", avatar: null } as const;

function clock() {
  let millis = 1_754_697_600_000;
  return createRowClock({
    deviceId: "01J9F3K2M7QX8YB4TVWZ0DCEHZ",
    now: () => {
      millis += 1;
      return millis;
    },
    randomChunk: (count) => Array.from({ length: count }, (_, i) => i % 32),
  });
}

describe("buildOnboardingRows", () => {
  it("monta perfil, 4 formas, 12 categorias e aponta localUserId", () => {
    const { rows, meta } = buildOnboardingRows(LUIZ, clock());

    expect(rows.users).toHaveLength(1);
    expect(rows.paymentMethods?.map((m) => m.kind)).toEqual(["cash", "pix", "credit", "debit"]);
    expect(rows.categories).toHaveLength(12);
    expect(meta[LOCAL_USER_ID_KEY]).toBe(rows.users?.[0]?.id);
  });

  it("todas as linhas têm id distinto", () => {
    const { rows } = buildOnboardingRows(LUIZ, clock());
    const ids = [...(rows.users ?? []), ...(rows.paymentMethods ?? []), ...(rows.categories ?? [])]
      .map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

Run: `npx vitest run src/features/onboarding/crud-seed.test.ts` → FAIL.

- [ ] **Step 2: Implementar o seed**

`src/features/onboarding/crud-seed.ts` — copie `DEFAULT_METHODS` e `DEFAULT_CATEGORIES` **literalmente** de `src/features/onboarding/seed.ts` (mesmos nomes, ícones, cores e `kind`, mesmos comentários), trocando os tipos importados:

```ts
import { buildRow } from "../../data/repository";
import type { RowClock } from "../../domain/clock/row-clock";
import type { RowsByTable } from "../../domain/model/app-state";
import type { Category, CategoryDraft } from "../../domain/model/category";
import type { PaymentMethod, PaymentMethodDraft } from "../../domain/model/payment-method";
import type { User, UserDraft } from "../../domain/model/user";
import { LOCAL_USER_ID_KEY } from "../session/crud-session";

const DEFAULT_METHODS: readonly PaymentMethodDraft[] = [
  { name: "Dinheiro", icon: "banknote", color: "emerald", kind: "cash" },
  { name: "Pix", icon: "zap", color: "teal", kind: "pix" },
  { name: "Cartão de crédito", icon: "credit-card", color: "violet", kind: "credit" },
  { name: "Cartão de débito", icon: "credit-card", color: "sky", kind: "debit" },
];

const DEFAULT_CATEGORIES: readonly CategoryDraft[] = [
  { name: "Alimentação", icon: "utensils", color: "orange", kind: "expense" },
  { name: "Moradia", icon: "house", color: "amber", kind: "expense" },
  { name: "Transporte", icon: "car", color: "sky", kind: "expense" },
  { name: "Saúde", icon: "health", color: "rose", kind: "expense" },
  { name: "Educação", icon: "graduation", color: "indigo", kind: "expense" },
  { name: "Lazer", icon: "film", color: "violet", kind: "expense" },
  { name: "Compras", icon: "shopping-bag", color: "fuchsia", kind: "expense" },
  { name: "Contas", icon: "receipt", color: "slate", kind: "expense" },
  { name: "Salário", icon: "banknote", color: "emerald", kind: "income" },
  { name: "Renda extra", icon: "briefcase", color: "teal", kind: "income" },
  { name: "Investimentos", icon: "piggy-bank", color: "lime", kind: "both" },
  { name: "Transferência", icon: "landmark", color: "slate", kind: "both" },
];

export interface OnboardingRows {
  rows: RowsByTable;
  meta: Record<string, string>;
}

/** Monta o lote; não grava. Quem grava é a store, numa transação só. */
export function buildOnboardingRows(draft: UserDraft, clock: RowClock): OnboardingRows {
  const user = buildRow<User>(clock, draft);
  return {
    rows: {
      users: [user],
      paymentMethods: DEFAULT_METHODS.map((m) => buildRow<PaymentMethod>(clock, m)),
      categories: DEFAULT_CATEGORIES.map((c) => buildRow<Category>(clock, c)),
    },
    meta: { [LOCAL_USER_ID_KEY]: user.id },
  };
}
```

Run: `npx vitest run src/features/onboarding/crud-seed.test.ts` → PASS.

- [ ] **Step 3: Teste da store de primeiro uso (falhando)**

`src/features/onboarding/crud-store.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CrudDb } from "../../data/crud-db";
import { openTestDb, testSessionDeps } from "../../data/test-db.fake";
import { createCrudSession, LOCAL_USER_ID_KEY } from "../session/crud-session";
import { createOnboardingStore } from "./crud-store";

const LUIZ = { name: "Luiz", color: "teal", avatar: null } as const;

let db: CrudDb;

beforeEach(() => {
  db = openTestDb();
});

afterEach(async () => {
  await db.delete();
});

describe("createOnboardingStore (CRUD)", () => {
  it("precisa de onboarding só depois do boot e sem perfil local", async () => {
    const session = createCrudSession(testSessionDeps(db));
    const store = createOnboardingStore(session);
    expect(store.needsOnboarding.value).toBe(false);

    await session.init();
    expect(store.needsOnboarding.value).toBe(true);
  });

  it("complete grava tudo e sobrevive ao reabrir", async () => {
    const session = createCrudSession(testSessionDeps(db));
    await session.init();
    await createOnboardingStore(session).complete(LUIZ);

    const reaberta = createCrudSession(testSessionDeps(db));
    await reaberta.init();

    expect(createOnboardingStore(reaberta).needsOnboarding.value).toBe(false);
    expect(Object.keys(reaberta.state.value.categories)).toHaveLength(12);
    expect(Object.keys(reaberta.state.value.paymentMethods)).toHaveLength(4);
    expect(reaberta.state.value.users[reaberta.localUserId.value ?? ""]?.name).toBe("Luiz");
  });

  it("falha no meio não grava nada e continua pedindo onboarding", async () => {
    const session = createCrudSession(testSessionDeps(db));
    await session.init();
    const store = createOnboardingStore(session);
    vi.spyOn(db.categories, "bulkPut").mockRejectedValueOnce(new Error("quota exceeded"));

    await expect(store.complete(LUIZ)).rejects.toThrow("quota exceeded");

    expect(store.needsOnboarding.value).toBe(true);
    expect(await db.users.count()).toBe(0);
    expect(await db.meta.get(LOCAL_USER_ID_KEY)).toBeUndefined();
  });
});
```

Run: `npx vitest run src/features/onboarding/crud-store.test.ts` → FAIL.

- [ ] **Step 4: Implementar a store de primeiro uso**

`src/features/onboarding/crud-store.ts`:
```ts
import { computed, type ReadonlySignal } from "@preact/signals";
import type { UserDraft } from "../../domain/model/user";
import type { CrudSession } from "../session/crud-session";
import { buildOnboardingRows } from "./crud-seed";

export interface OnboardingStore {
  needsOnboarding: ReadonlySignal<boolean>;
  complete: (draft: UserDraft) => Promise<void>;
}

/**
 * Primeiro uso é `localUserId` vazio, não "não existe user na tabela": depois
 * do sync o perfil da outra pessoa estará lá. O `ready` evita o wizard piscar
 * antes de o disco responder.
 */
export function createOnboardingStore(session: CrudSession): OnboardingStore {
  return {
    needsOnboarding: computed(
      () => session.status.value === "ready" && session.localUserId.value === null,
    ),
    async complete(draft) {
      const { rows, meta } = buildOnboardingRows(draft, session.clock());
      // Uma transação só: falha não deixa app meio semeado, e `localUserId`
      // continua nulo, então o usuário volta ao wizard.
      await session.putRows(rows, meta);
    },
  };
}
```

Run: `npx vitest run src/features/onboarding/crud-store.test.ts` → PASS.

- [ ] **Step 5: Teste da store de perfil (falhando)**

`src/features/profile/crud-store.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CrudDb } from "../../data/crud-db";
import { openTestDb, testSessionDeps } from "../../data/test-db.fake";
import { createOnboardingStore } from "../onboarding/crud-store";
import { type CrudSession, createCrudSession } from "../session/crud-session";
import { createProfileStore } from "./crud-store";

const LUIZ = { name: "Luiz", color: "teal", avatar: "data:image/webp;base64,AAAA" } as const;

let db: CrudDb;
let session: CrudSession;
let userId: string;

beforeEach(async () => {
  db = openTestDb();
  session = createCrudSession(testSessionDeps(db));
  await session.init();
  await createOnboardingStore(session).complete(LUIZ);
  userId = session.localUserId.value ?? "";
});

afterEach(async () => {
  await db.delete();
});

describe("createProfileStore (CRUD)", () => {
  it("editProfile troca nome e cor", async () => {
    await createProfileStore(session).editProfile(userId, { ...LUIZ, name: "Luiz F", color: "sky" });
    expect(session.state.value.users[userId]).toMatchObject({ name: "Luiz F", color: "sky" });
    expect((await db.users.get(userId))?.name).toBe("Luiz F");
  });

  it("editProfile com avatar null remove a foto", async () => {
    await createProfileStore(session).editProfile(userId, { ...LUIZ, avatar: null });
    expect((await db.users.get(userId))?.avatar).toBeNull();
  });
});
```

Run: `npx vitest run src/features/profile/crud-store.test.ts` → FAIL.

- [ ] **Step 6: Implementar a store de perfil**

`src/features/profile/crud-store.ts`:
```ts
import type { Ulid } from "../../domain/ids/ulid";
import type { User, UserDraft } from "../../domain/model/user";
import type { CrudSession } from "../session/crud-session";

/**
 * Só edita. O perfil nasce no primeiro uso e some só com "Resetar conta".
 */
export interface ProfileStore {
  editProfile: (id: Ulid, draft: UserDraft) => Promise<User>;
}

export function createProfileStore(session: CrudSession): ProfileStore {
  return {
    editProfile: (id, draft) => session.mutate("users", (repo) => repo.update(id, draft)),
  };
}
```

Run: `npx vitest run src/features/profile/crud-store.test.ts` → PASS.

- [ ] **Step 7: Verificação e commit**

```bash
npm run format && npm run lint && npm run typecheck && npm test
git add src/features/onboarding/crud-seed.ts src/features/onboarding/crud-seed.test.ts \
  src/features/onboarding/crud-store.ts src/features/onboarding/crud-store.test.ts \
  src/features/profile/crud-store.ts src/features/profile/crud-store.test.ts
git commit -m "feat(user): stores CRUD de primeiro uso e perfil"
```

---

## Task 6: Integração e remoção do código de eventos

**Branch:** `refactor/crud-integracao` (a partir do `develop` com T1–T5)

Esta task troca a app inteira de uma vez. Um estado intermediário não compila, então os commits são por etapa lógica, mas só o último precisa estar verde.

- [ ] **Step 1: Renomear o código novo por cima do antigo**

```bash
git rm -q src/data/db.ts src/data/event-store.ts src/data/event-store.fake.ts src/data/event-store.test.ts
git mv src/data/crud-db.ts src/data/db.ts
git mv src/data/crud-db.test.ts src/data/db.test.ts
git rm -q src/features/session/session.ts src/features/session/session.test.ts
git mv src/features/session/crud-session.ts src/features/session/session.ts
git mv src/features/session/crud-session.test.ts src/features/session/session.test.ts
for f in registry transactions recurrence onboarding profile; do
  git rm -q src/features/$f/store.ts src/features/$f/store.test.ts
  git rm -q --ignore-unmatch src/features/$f/store.integration.test.ts
  git mv src/features/$f/crud-store.ts src/features/$f/store.ts
  git mv src/features/$f/crud-store.test.ts src/features/$f/store.test.ts
done
git rm -q src/features/onboarding/seed.ts src/features/onboarding/seed.test.ts
git mv src/features/onboarding/crud-seed.ts src/features/onboarding/seed.ts
git mv src/features/onboarding/crud-seed.test.ts src/features/onboarding/seed.test.ts
git rm -q src/domain/recurrence/materialize.ts src/domain/recurrence/materialize.test.ts
git rm -q -r src/domain/events
git rm -q src/domain/projections/apply.ts src/domain/projections/apply.test.ts \
  src/domain/projections/entities.ts src/domain/projections/entities.test.ts \
  src/domain/projections/convergence.test.ts
git rm -q src/domain/clock/device-clock.ts src/domain/clock/device-clock.test.ts
```

Depois, dentro dos arquivos renomeados:
- `CrudDb` → `HomeFinanceDb`; `CrudSession` → `Session`; `CrudSessionDeps` → `SessionDeps`; `createCrudSession` → `createSession`;
- imports `./crud-*`/`../session/crud-session`/`../../data/crud-db` → nomes novos;
- nomes de `describe` sem o sufixo "(CRUD)".

- [ ] **Step 2: Trocar tipos no resto do código**

Substituições em `src/**/*.ts(x)` (use `grep -rl` + edição; confira cada arquivo):

| Antigo | Novo | Import de |
|---|---|---|
| `ProjectionState` | `AppState` | `domain/model/app-state` |
| `TransactionRecord` | `Transaction` | `domain/model/transaction` |
| `CategoryRecord` | `Category` | `domain/model/category` |
| `PaymentMethodRecord` | `PaymentMethod` | `domain/model/payment-method` |
| `UserRecord` | `User` | `domain/model/user` |
| `RecurrenceRecord` | `Recurrence` | `domain/model/recurrence` |
| `ReferenceRecord` | `Category \| PaymentMethod` | os dois acima |
| `EntityRecordBase` | `BaseRow` | `domain/model/base` |
| `ColorToken`, `COLOR_TOKENS`, `NEUTRAL_TOKEN` | iguais | `domain/model/tokens` |
| `CATEGORY_KINDS`, `CategoryDraft` | iguais | `domain/model/category` |
| `PAYMENT_KINDS`, `PaymentMethodDraft` | iguais | `domain/model/payment-method` |
| `TransactionKind`, `TransactionDraft` | iguais | `domain/model/transaction` |
| `RecurrenceFrequency`, `ScheduleType`, `*_LABELS`, `RECURRENCE_FREQUENCIES`, `SCHEDULE_TYPES` | iguais | `domain/model/recurrence` |
| `UserDraft` | igual | `domain/model/user` |
| `RecurrenceInput` (em `transaction-wizard.tsx`) | `RecurrenceRule` | `domain/model/recurrence` |

Arquivos conhecidos: `app.tsx`, `features/colors/color-token.ts`, `features/dashboard/dashboard-page.tsx`, `features/registry/{registry-wizard,registry-page,registry-list,registry-form-modal,entity-picker}.tsx`, `features/profile/profile-page.tsx`, `features/onboarding/wizard.tsx`, `features/settings/settings-page.tsx`, `features/transactions/{transaction-wizard,transaction-list}.tsx`, `domain/recurrence/schedule.ts`, `domain/projections/{selectors,breakdown}.ts`.

Run: `grep -rn "domain/events\|projections/apply\|projections/entities\|device-clock\|materialize\"" src` → nenhum resultado.

- [ ] **Step 3: Visibilidade nos selectors**

Em `src/domain/projections/selectors.ts`:
- `visible(bucket)` passa a ser `Object.values(bucket).filter((row) => isAlive(row))`;
- toda checagem `record === undefined || record.deleted || !record.materialized` vira `!isAlive(record)`;
- `listTransactions` filtra com `isAlive`;
- comentários que falam em "refold do log" passam a falar em "ordem de inserção".

Em `src/domain/projections/breakdown.ts`: `const alive = category?.materialized && !category.deleted;` → `const alive = isAlive(category);` e o `color:` usa `alive ? category.color : NEUTRAL_TOKEN`.

- [ ] **Step 4: Formulários sem diff**

- `app.tsx` (~linha 210): remova `diffTransaction`; a edição vira `store.edit(editing.id, draft)`.
- `registry-form-modal.tsx` (~linhas 69–73): `store.editPaymentMethod(editing.id, draft as PaymentMethodDraft)` e `store.editCategory(editing.id, draft as CategoryDraft)`.
- `profile-page.tsx` (~linhas 79–90): remova `diffUser`; chame `store.editProfile(profile.id, next)`. Se a tela dependia de "patch vazio" para fechar sem salvar, mantenha esse comportamento comparando os campos localmente — o repositório já ignora escrita sem mudança.

- [ ] **Step 5: Erros de escrita na UI**

`mutate`/`putRows` agora **relançam**. O erro já aparece para o usuário pelo `session.error` (alerta em `app.tsx` ~linha 290), então os chamadores fire-and-forget só precisam não deixar a rejeição escapar. Em `src/features/session/session.ts` adicione:

```ts
/**
 * Para chamadas fire-and-forget da UI. A falha já está em `session.error`, que
 * a tela mostra; isto só impede a rejeição de virar "unhandled".
 */
export function ignoreHandled(): void {}
```

e troque cada `void store.x(...)` / `void registry.x(...)` / `void recurrence.x(...)` da UI por `void store.x(...).catch(ignoreHandled)`. Encontre-os com `grep -rn "void \(store\|registry\|recurrence\|profileStore\|onboarding\)\." src --include=*.tsx`. Onde a tela já faz `await` dentro de `try/catch` (perfil, wizard de primeiro uso), mantenha o `try/catch`.

- [ ] **Step 6: Ligação no `App` e no `main.tsx`**

A `TransactionsStore` nova não expõe mais `state`, `status`, `error` e `init`. O `App` passa a receber a sessão:
- em `AppProps`, adicione `session: Session` e remova `localUserId` (vem de `session.localUserId`);
- troque `store.state` / `store.status` / `store.error` / `store.init` por `session.state` / `session.status` / `session.error` / `session.init`;
- o boot (~linha 123) fica `void session.init().then(() => recurrence.materializeDue(today)).catch(ignoreHandled)`.

`src/main.tsx`:
```ts
const session = createSession({
  db,
  now: () => Date.now(),
  randomChunk: cryptoRandomChunk,
});
```
remova o import de `createEventStore`, passe `session={session}` ao `<App>` e remova `localUserId={session.localUserId}`.

- [ ] **Step 7: Portar os testes de UI**

`src/app.test.tsx` e qualquer teste que use `fakeEventStore`, `userCreated` ou `createSession({ events })`:
- troque o duplo por banco real: `const db = openTestDb()`, `createSession(testSessionDeps(db))`;
- "aparelho já cadastrado" = antes do `render`, `await db.users.put(buildRow<User>(clock, {...}, PERFIL_LOCAL))` e `await db.meta.put({ key: LOCAL_USER_ID_KEY, value: PERFIL_LOCAL })`, com `clock = createRowClock({ deviceId: TEST_DEVICE_ID, now: () => 1_754_697_500_000, randomChunk: () => [0] })` ou via `createRowClock` + `testSessionDeps(db)`;
- `afterEach`: `await db.delete()`;
- testes que dependiam de `fieldHlc`, fold ou convergência: apagar (o comportamento não existe mais);
- asserções de "evento emitido" viram asserções sobre a linha em `db.<tabela>` ou em `session.state`.

Run: `npm test` → tudo verde. Se um teste de UI falhar por timing (a sessão agora faz I/O real no `init`), use `await waitFor(...)`/`findBy*` em vez de `getBy*`.

- [ ] **Step 8: Comentários e README**

- `grep -rni "log\b\|append-only\|fold\|evento" src README.md` e atualize os comentários que descrevem o modelo antigo (ex.: `db.ts`, `settings/reset.ts` "o log apagado não volta", `selectors.ts`).
- README: se houver seção de arquitetura/persistência, descreva tabelas por entidade + `updatedAt`/`deletedAt`/`dirty`.

- [ ] **Step 9: Verificação completa**

```bash
npm run format && npm run lint && npm run typecheck && npm test && npm run build && npm run size
```
Esperado: tudo verde, e `grep -rn "DomainEvent\|fieldHlc\|materialized" src` sem resultados (a palavra "materialização" em comentários é ok).

- [ ] **Step 10: Verificação manual**

`npm run dev`, numa aba anônima: primeiro uso → 12 categorias e 4 formas aparecem; criar lançamento; editar; apagar; criar recorrência mensal com início 3 meses atrás → 3–4 ocorrências; recarregar → tudo persiste. DevTools → Application → IndexedDB → `homefinance`: tabelas `users`, `categories`, `paymentMethods`, `transactions`, `recurrences`, `meta`, sem `events`.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "refactor(data): liga a persistencia CRUD e remove o event sourcing"
```
