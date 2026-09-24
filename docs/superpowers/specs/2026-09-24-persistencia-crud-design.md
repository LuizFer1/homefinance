# Persistência CRUD por entidade — design

Data: 2026-09-24
Status: aprovado

## Contexto

Hoje toda entidade é salva como evento numa tabela única `events` (append-only) do
IndexedDB, e o estado é reconstruído em memória por `fold` a cada boot, com LWW por
campo (`fieldHlc`). Isso gera:

- cada campo declarado em 5–7 lugares (tipo, `XLike`, `XRecord`, spec, validador,
  shell, `diffX`);
- construtores de envelope e `isEmpty` copiados entre módulos;
- `session.commit` engolindo falha de escrita (quem chama não sabe que não salvou);
- log que cresce para sempre (foto de perfil ~6kb por troca) e fold completo no boot.

## Objetivo

Trocar para o modelo tradicional: **uma tabela por entidade**, linha = estado atual,
escrita por repositório. Deixar as colunas prontas para o sync futuro com um hub.

## Decisões

| Tema | Decisão |
|---|---|
| Sync | Futuro, via **hub**: um PC pessoal na rede local, ligado de forma intermitente. Os 2 celulares sincronizam com ele quando estão na mesma rede. **Fora do escopo desta spec.** |
| Conflito | **LWW por linha**: `updatedAt` mais recente vence a linha inteira. |
| Relógio de `updatedAt` | O **HLC** existente (`domain/clock`), não `Date.now()` cru: um celular com relógio adiantado venceria sempre. |
| Exclusão | Lógica: `deletedAt`. O hub precisa propagar a exclusão. |
| Dados existentes | **Zerar.** Não há migração do log; o upgrade apaga `events`. |
| Leitura na UI | Cache em memória num signal, carregado das tabelas no boot (abordagem A). Sem `liveQuery`. |

## Banco (Dexie, schema v2)

```ts
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
```

- `localUserId` precisa sair no upgrade: sobreviveria apontando para um usuário que
  não existe mais, e o wizard de primeiro uso seria pulado.
- `deviceId` fica em `meta` (o HLC depende dele).
- `dirty` é `0 | 1` porque IndexedDB não indexa boolean. É o índice que o sync usará
  para achar o que falta enviar.

## Modelo — `src/domain/model/`

Substitui `src/domain/events/`. Um tipo por entidade, sem `XLike`/`XRecord`.

```ts
interface BaseRow {
  id: Ulid;
  createdAt: string;        // ISO 8601
  updatedAt: string;        // HLC
  deletedAt: string | null; // HLC da exclusão
  dirty: 0 | 1;
}
```

- `User`: `name`, `color`, `avatar`
- `Category`: `name`, `icon`, `color`, `kind` (`expense | income | both`)
- `PaymentMethod`: `name`, `icon`, `color`, `kind` (`cash | pix | credit | debit | other`)
- `Transaction`: `kind`, `description`, `amountMinor`, `currency`, `categoryId`,
  `paymentMethodId`, `cashbackMinor`, `occurredOn`, `userId`, `recurrenceId`,
  `occurrenceKey`
- `Recurrence`: `kind`, `description`, `amountMinor`, `currency`, `categoryId`,
  `paymentMethodId`, `cashbackMinor`, `frequency`, `scheduleType`, `scheduleN`,
  `startOn`, `endOn`, `active`

Cada entidade exporta `XDraft = Omit<X, keyof BaseRow>`. Constantes (`COLOR_TOKENS`,
`NEUTRAL_TOKEN`, `PAYMENT_KINDS`, `CATEGORY_KINDS`, `RECURRENCE_FREQUENCIES`,
`SCHEDULE_TYPES`, rótulos) têm **uma** cópia, junto do tipo.

Regras que continuam valendo:

- autoria (`Transaction.userId`) é decidida pela store a partir de `localUserId`, só
  no create; `update` nunca a reescreve;
- `User` não tem exclusão exposta.

## Repositório — `src/data/repository.ts`

Genérico, uma implementação para as cinco tabelas:

```ts
interface Repository<T extends BaseRow> {
  listAll(): Promise<T[]>;
  create(draft: Omit<T, keyof BaseRow>, id?: Ulid): Promise<T>;
  update(id: Ulid, changes: Partial<Omit<T, keyof BaseRow>>): Promise<T>;
  remove(id: Ulid): Promise<T>;
}
```

- `create`: gera `id` (ou usa o recebido — materialização), `createdAt`, `updatedAt`,
  `deletedAt: null`, `dirty: 1`, `put`.
- `update`: lê a linha, lança se não existir, aplica `changes`, novo `updatedAt`,
  `dirty: 1`, grava a **linha inteira**.
- `remove`: `deletedAt = updatedAt = hlc`, `dirty: 1`. A linha não sai da tabela.
- Toda falha **rejeita** a promise.

Os `diffX` e o patch por campo deixam de existir.

## Sessão — `src/features/session/`

- `state: Signal<AppState>`, com
  `AppState = { users, categories, paymentMethods, transactions, recurrences }`,
  cada um `Record<Ulid, Row>`.
- Boot: garante `deviceId`, cria o relógio HLC (semente = maior `updatedAt` das
  tabelas), lê as cinco tabelas, preenche `state` e `localUserId` num único `batch`.
- Escrita: repositório primeiro; só depois do sucesso, substitui a linha no signal.
- Erro de escrita: preenche `error` **e relança**. Estado em memória não muda.
- Primeiro uso: uma transação Dexie sobre `users`, `paymentMethods`, `categories`,
  `meta`. Falha no meio não deixa nada gravado.

## Stores

Mantêm o papel atual (qual escrita fazer), sobre repositórios:

- **registry**: `add/edit/remove` de categoria e forma de pagamento; `edit` recebe o
  draft completo.
- **transactions**: `add/edit/remove`; `add` carimba `userId`.
- **recurrence**: `createSeries`, `editSeries`, `removeSeries`, `materializeDue`.
  - ocorrências vencidas gravadas num `bulkPut` numa transação;
  - `entityId` determinístico (`stableEntityId`) mantido;
  - **não recria ocorrência cuja linha exista, mesmo com `deletedAt`** — senão o
    salário apagado volta no boot.
- **profile**: `editProfile`.
- **onboarding**: `complete` com o lote atômico (perfil + 4 formas + 12 categorias +
  `localUserId`).

## Leitura

- Filtro de visibilidade passa a ser `deletedAt === null` (sai
  `materialized && !deleted`).
- `selectors`, `breakdown`, `periods`, dashboard e listas passam a ler `AppState`.

## O que sai

- `src/domain/events/*` (construtores, `validate`, `types`, `diffX`)
- `src/domain/projections/apply.ts` e `entities.ts` (fold, `mergeFields`, specs)
- `src/data/event-store.ts` e `event-store.fake.ts`
- testes de convergência e de fold

## O que fica

`domain/clock`, `domain/ids` (`ulid`, `stable-id`), `domain/money`, `domain/dates`,
`domain/recurrence/schedule`, `domain/projections/{selectors,breakdown,periods}`
(adaptados).

## Testes

- Repositório (`fake-indexeddb`): timestamps e `dirty` em create/update/remove;
  remove mantém a linha; update de id inexistente rejeita.
- Sessão: boot carrega tabelas; escrita que falha não muda `state` e relança.
- Onboarding: falha no meio do lote não grava nada.
- Materialização: não duplica; não recria ocorrência apagada.
- Testes existentes de selectors/UI ajustados aos tipos novos.

## Fora de escopo

Serviço do hub no PC, descoberta na rede local, protocolo de sync, validação em
runtime de dado vindo do hub (spec 2).
