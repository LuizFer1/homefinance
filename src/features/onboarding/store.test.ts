import { describe, expect, it } from "vitest";
import { type FakeEventStore, fakeEventStore } from "../../data/event-store.fake";
import type { UserDraft } from "../../domain/events/user";
import { userCreated } from "../../domain/events/user";
import {
  listCategories,
  listCategoriesFor,
  listPaymentMethods,
} from "../../domain/projections/selectors";
import { createSession, LOCAL_USER_ID_KEY, type Session } from "../session/session";
import { createOnboardingStore, type OnboardingStore } from "./store";

const DRAFT: UserDraft = { name: "Luiz", color: "teal", avatar: null };
const OUTRO_DEVICE = "01J9F3K2M7QX8YB4TVWZ0DCEHZ";

function newSession(events: FakeEventStore): Session {
  let millis = 1_754_697_600_000;
  return createSession({
    events,
    now: () => {
      millis += 1;
      return millis;
    },
    randomChunk: (count) => Array.from({ length: count }, (_, i) => i % 32),
  });
}

function build(events: FakeEventStore): { session: Session; onboarding: OnboardingStore } {
  const session = newSession(events);
  return { session, onboarding: createOnboardingStore(session) };
}

describe("primeiro uso", () => {
  it("nao pede onboarding enquanto a sessao esta carregando", () => {
    // Sem isto o wizard pisca antes de o disco responder, e quem ja se cadastrou
    // ve a tela de boas-vindas por um frame.
    const { onboarding } = build(fakeEventStore());

    expect(onboarding.needsOnboarding.value).toBe(false);
  });

  it("pede onboarding quando localUserId esta vazio", async () => {
    const { session, onboarding } = build(fakeEventStore());

    await session.init();

    expect(onboarding.needsOnboarding.value).toBe(true);
  });

  it("nao pede onboarding na segunda abertura", async () => {
    const events = fakeEventStore();
    await events.setMeta(LOCAL_USER_ID_KEY, "01J9F3K2M7QX8YB4TVWZ0DCEHU");
    const { session, onboarding } = build(events);

    await session.init();

    expect(onboarding.needsOnboarding.value).toBe(false);
  });

  it("pede onboarding mesmo com um user de outro device ja no log", async () => {
    // Decisao transversal 6 do ROADMAP: derivar de "existe algum user no log"
    // quebraria depois do sync, e todo lancamento seguinte sairia sem autor.
    const events = fakeEventStore([
      userCreated({
        eventId: "01J9F3K2M7QX8YB4TVWZ0DCEE1",
        entityId: "01J9F3K2M7QX8YB4TVWZ0DCEHO",
        deviceId: OUTRO_DEVICE,
        hlc: `1754697500000-0000-${OUTRO_DEVICE}`,
        draft: { name: "Ana", color: "rose", avatar: null },
      }),
    ]);
    const { session, onboarding } = build(events);

    await session.init();

    expect(onboarding.needsOnboarding.value).toBe(true);
  });
});

describe("conclusao do wizard", () => {
  it("grava o lote, semeia metodos e categorias, e para de pedir", async () => {
    const events = fakeEventStore();
    const { session, onboarding } = build(events);
    await session.init();

    await onboarding.complete(DRAFT);

    expect(onboarding.needsOnboarding.value).toBe(false);
    expect(await events.getMeta(LOCAL_USER_ID_KEY)).not.toBeNull();
    expect(listPaymentMethods(session.state.value).map((m) => m.name)).toEqual([
      "Cartão de crédito",
      "Cartão de débito",
      "Dinheiro",
      "Pix",
    ]);
    expect(listCategories(session.state.value).length).toBeGreaterThan(0);
  });

  it("as categorias semeadas ja chegam filtradas por lado do lancamento", async () => {
    // "Salario" oferecido ao lancar uma despesa e a razao de `kind` existir na
    // categoria.
    const { session, onboarding } = build(fakeEventStore());
    await session.init();
    await onboarding.complete(DRAFT);

    const despesas = listCategoriesFor(session.state.value, "expense").map((c) => c.name);
    const receitas = listCategoriesFor(session.state.value, "income").map((c) => c.name);

    expect(despesas).toContain("Alimentação");
    expect(despesas).not.toContain("Salário");
    expect(receitas).toContain("Salário");
    expect(receitas).not.toContain("Alimentação");
    // `both` aparece nas duas listas, e e o caso de investimento.
    expect(despesas).toContain("Investimentos");
    expect(receitas).toContain("Investimentos");
  });

  it("grava a foto quando ela existe", async () => {
    const events = fakeEventStore();
    const { session, onboarding } = build(events);
    await session.init();

    await onboarding.complete({ ...DRAFT, avatar: "data:image/webp;base64,AAAA" });

    const id = session.localUserId.value ?? "";
    expect(session.state.value.users[id]?.avatar).toBe("data:image/webp;base64,AAAA");
  });

  it("falha na escrita do lote nao deixa localUserId nem metodos orfaos", async () => {
    const events = fakeEventStore();
    const { session, onboarding } = build(events);
    await session.init();
    events.failNext = true;

    await onboarding.complete(DRAFT);

    expect(await events.getMeta(LOCAL_USER_ID_KEY)).toBeNull();
    expect(await events.readAll()).toHaveLength(0);
    expect(listPaymentMethods(session.state.value)).toEqual([]);
    expect(onboarding.needsOnboarding.value).toBe(true);
    expect(session.error.value).toContain("quota");
  });
});
