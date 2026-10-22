import { useState } from "preact/hooks";
import {
  cardCycleText,
  cardDetail,
  isCompleteCard,
  listCreditCards,
} from "../../domain/cards/card";
import { type CardGroup, pendingCardGroups } from "../../domain/cards/migration";
import type { Ulid } from "../../domain/ids/ulid";
import type { AppState } from "../../domain/model/app-state";
import type { ColorToken } from "../../domain/model/tokens";
import { Icon } from "../icons/icon";
import { describeError, StaleRowsError } from "../session/session";
import { MethodRow } from "../transactions/choice-tiles";
import { Button } from "../ui/button";
import { HINT, LABEL } from "../ui/field";
import { SheetHeader } from "../ui/modal";
import { brl } from "../ui/money";
import { Progress } from "../ui/progress";
import { Swatches } from "../ui/swatches";
import { useSwipeNav } from "../ui/use-swipe-nav";
import { CardFields, type CardFieldsValue, cardFieldsProblem, parseCardDay } from "./card-fields";
import type { Destination } from "./plan";

const NEW = "new";

interface GroupChoice {
  /** Id de um cartão completo, ou `NEW`. Vazio = ainda não escolheu. */
  pick: string;
  card: CardFieldsValue;
  color: ColorToken;
}

const EMPTY_CHOICE: GroupChoice = {
  pick: "",
  card: { bank: "", closingDay: "", dueDay: "" },
  color: "violet",
};

export interface MigrationSheetProps {
  state: AppState;
  /** Grava as escolhas de uma vez; rejeita com `StaleRowsError` se outro aparelho mexeu. */
  onMigrate: (choices: Record<Ulid, Destination>) => Promise<number>;
  /** Adia neste aparelho; o aviso volta no próximo boot. */
  onDefer: () => void;
  /** Baixa o arquivo de exportação; rejeita se falhar. */
  onExport: () => Promise<void>;
  /** Relê o banco depois de uma recusa por versão velha. */
  onReload: () => Promise<void>;
  /** Fecha depois de migrar (ou quando não sobrou nada a migrar). */
  onDone: () => void;
}

/** Nulo se a escolha do grupo serve; senão a mensagem. */
function choiceProblem(choice: GroupChoice, state: AppState): string | null {
  if (choice.pick === "") return "Escolha um cartão ou crie um novo.";
  if (choice.pick === NEW) return cardFieldsProblem(choice.card);
  const target = state.paymentMethods[choice.pick];
  return target !== undefined && target.deletedAt === null && isCompleteCard(target)
    ? null
    : "Esse cartão não existe mais. Escolha outro.";
}

function destinationOf(choice: GroupChoice): Destination {
  if (choice.pick === NEW) {
    return {
      kind: "new",
      card: {
        bank: choice.card.bank,
        name: "",
        closingDay: parseCardDay(choice.card.closingDay) as number,
        dueDay: parseCardDay(choice.card.dueDay) as number,
        color: choice.color,
      },
    };
  }
  return { kind: "existing", cardId: choice.pick };
}

function countLabel(count: number): string {
  return count === 1 ? "1 lançamento" : `${count} lançamentos`;
}

/**
 * Migração dos cartões, em etapas: resumo (com a oferta de exportar antes), um
 * destino por grupo de origem e a prévia do que vai mudar.
 *
 * Os grupos vêm do estado, não de um flag: a tela se refaz sozinha se o sync
 * trouxer ou levar um deles. O botão final nomeia a ação ("Mover 12
 * lançamentos") porque ela reescreve o cartão de cada compra.
 */
export function MigrationSheet({
  state,
  onMigrate,
  onDefer,
  onExport,
  onReload,
  onDone,
}: MigrationSheetProps) {
  const groups = pendingCardGroups(state);
  const cards = listCreditCards(state).filter(isCompleteCard);
  const [choices, setChoices] = useState<Record<Ulid, GroupChoice>>({});
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<"next" | "back">("next");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const choiceOf = (group: CardGroup) => choices[group.source.id] ?? EMPTY_CHOICE;
  const problems = groups.map((group) => choiceProblem(choiceOf(group), state));

  // Etapas: Resumo, um destino por grupo e a Prévia. Nomes únicos (a barra usa o nome como chave).
  const labels = [
    "Resumo",
    ...groups.map((_, i) => (groups.length === 1 ? "Destino" : `Destino ${i + 1}`)),
    "Prévia",
  ];
  const lastIndex = labels.length - 1;
  const firstBlocked = problems.findIndex((item) => item !== null);
  // Destino i só abre se os anteriores servem; a prévia, se todos servem.
  const maxReachable = firstBlocked === -1 ? lastIndex : firstBlocked + 1;
  const current = Math.min(index, maxReachable);
  const step = labels[current] ?? "Resumo";

  function goTo(next: number) {
    const target = Math.max(0, Math.min(next, maxReachable));
    setDir(target < current ? "back" : "next");
    setProblem(null);
    setIndex(target);
  }

  const swipe = useSwipeNav({
    screens: labels,
    screen: step,
    enabled: true,
    onChange: (label) => goTo(labels.indexOf(label)),
  });
  // O arraste do app inteiro mora no <main>: sem parar a propagação, arrastar o
  // sheet trocaria de aba por baixo do modal.
  const stop = (handler: (event: PointerEvent) => void) => (event: PointerEvent) => {
    event.stopPropagation();
    handler(event);
  };

  function update(group: CardGroup, patch: Partial<GroupChoice>) {
    setProblem(null);
    setChoices((now) => ({
      ...now,
      [group.source.id]: { ...(now[group.source.id] ?? EMPTY_CHOICE), ...patch },
    }));
  }

  async function exportFirst() {
    if (exporting) return;
    setExporting(true);
    setProblem(null);
    try {
      await onExport();
      setExported(true);
    } catch (cause) {
      setProblem(`Não foi possível gerar o arquivo. ${describeError(cause)}`);
    } finally {
      setExporting(false);
    }
  }

  async function apply() {
    if (busy || firstBlocked !== -1) return;
    setBusy(true);
    setProblem(null);
    try {
      const picked: Record<Ulid, Destination> = {};
      for (const group of groups) picked[group.source.id] = destinationOf(choiceOf(group));
      await onMigrate(picked);
      onDone();
    } catch (cause) {
      if (cause instanceof StaleRowsError) {
        // Nada foi gravado: outro aparelho (ou aba) mexeu nessas linhas. Recarrega
        // e recomeça do resumo, que se refaz com o que o banco realmente tem.
        try {
          await onReload();
        } catch {
          // A falha de leitura já está em `session.error`.
        }
        setNotice(
          "Outro aparelho mexeu nesses lançamentos. Recarregamos os dados; confira de novo.",
        );
        setIndex(0);
        setChoices({});
      } else {
        setProblem(`Nada foi alterado. ${describeError(cause)}`);
      }
    } finally {
      setBusy(false);
    }
  }

  const total = groups.reduce((sum, group) => sum + group.transactions.length, 0);

  return (
    <div class="flex flex-col">
      <SheetHeader title="Ajustar cartões" onClose={onDefer} />

      {groups.length === 0 ? (
        <div class="mt-6">
          <h3 class="text-lg font-medium">Tudo certo</h3>
          <p class={HINT}>Nenhum lançamento está em cartão por completar.</p>
          <div class="mt-5">
            <Button onClick={onDone}>Fechar</Button>
          </div>
        </div>
      ) : (
        <>
          <div class="mt-5">
            <Progress steps={labels} current={current} maxReachable={maxReachable} onGo={goTo} />
          </div>

          <div class="mt-4 flex items-center justify-between">
            <h3 class={LABEL}>
              {current === 0
                ? "O que mudou"
                : current === lastIndex
                  ? "Prévia"
                  : (groups[current - 1]?.source.name ?? "")}
            </h3>
            <div class="flex gap-1">
              <button
                type="button"
                aria-label="Etapa anterior"
                disabled={current === 0}
                onClick={() => goTo(current - 1)}
                class="hf-press grid size-9 place-items-center rounded-lg text-fg/75 enabled:hover:bg-fg/[0.05] disabled:opacity-30"
              >
                <Icon name="caret-left" size={18} />
              </button>
              <button
                type="button"
                aria-label="Próxima etapa"
                disabled={current >= maxReachable}
                onClick={() => goTo(current + 1)}
                class="hf-press grid size-9 place-items-center rounded-lg text-fg/75 enabled:hover:bg-fg/[0.05] disabled:opacity-30"
              >
                <Icon name="caret-right" size={18} />
              </button>
            </div>
          </div>

          <div
            class="touch-pan-y"
            onPointerDown={stop(swipe.onPointerDown)}
            onPointerMove={stop(swipe.onPointerMove)}
            onPointerUp={stop(swipe.onPointerUp)}
            onPointerCancel={stop(swipe.onPointerCancel)}
            data-swiping={swipe["data-swiping"]}
            style={swipe.style}
          >
            <div key={step} data-dir={dir} class="hf-step mt-2">
              {current === 0 && (
                <>
                  <p class="text-sm leading-normal text-fg/70 text-pretty">
                    Cada cartão de crédito agora tem banco, fechamento e vencimento, e as compras
                    entram na fatura dele. Estes lançamentos estão em cartões sem esses dados: diga
                    a qual cartão eles pertencem.
                  </p>
                  <ul
                    aria-label="Cartões por completar"
                    class="mt-3 overflow-hidden rounded-lg bg-bg"
                  >
                    {groups.map((group) => (
                      <li
                        key={group.source.id}
                        class="flex min-h-12 items-center gap-3 border-b border-divider px-3.5 py-2 last:border-b-0"
                      >
                        <span class="min-w-0 flex-1 truncate text-[15px] font-medium">
                          {group.source.name}
                        </span>
                        <span class="hf-num shrink-0 text-sm text-fg/60">
                          {countLabel(group.transactions.length)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div class="mt-4 rounded-lg bg-bg px-3.5 py-3.5">
                    <p class="text-[15px] font-medium">Quer um arquivo de segurança antes?</p>
                    <p class={HINT}>
                      Baixa uma cópia dos seus dados neste aparelho. Dá para restaurar se algo sair
                      diferente do esperado.
                    </p>
                    <div class="mt-3">
                      <Button
                        variant="secondary"
                        icon="download-simple"
                        iconSide="left"
                        disabled={exporting}
                        onClick={() => void exportFirst()}
                      >
                        {exporting ? "Gerando..." : "Exportar dados antes"}
                      </Button>
                    </div>
                    {exported && (
                      <p role="status" class="mt-3 text-sm text-income-fg">
                        Arquivo gerado. Confira a pasta de downloads.
                      </p>
                    )}
                  </div>
                  {notice !== null && (
                    <p role="status" class="mt-4 text-sm text-tag-amber">
                      {notice}
                    </p>
                  )}
                </>
              )}

              {current >= 1 && current <= groups.length && (
                <GroupStep
                  group={groups[current - 1] as CardGroup}
                  choice={choiceOf(groups[current - 1] as CardGroup)}
                  cards={cards.filter((card) => card.id !== groups[current - 1]?.source.id)}
                  idPrefix={`dest-${current}`}
                  onChange={(patch) => update(groups[current - 1] as CardGroup, patch)}
                />
              )}

              {current === lastIndex && (
                <>
                  <ul aria-label="Prévia" class="overflow-hidden rounded-lg bg-bg">
                    {groups.map((group) => {
                      const choice = choiceOf(group);
                      const target =
                        choice.pick === NEW
                          ? `${choice.card.bank.trim()} (novo cartão)`
                          : (state.paymentMethods[choice.pick]?.name ?? "");
                      return (
                        <li
                          key={group.source.id}
                          class="border-b border-divider px-3.5 py-3 last:border-b-0"
                        >
                          <p class="text-[15px] font-medium">
                            {group.source.name} → {target}
                          </p>
                          <p class="mt-0.5 text-xs text-fg/55">
                            {countLabel(group.transactions.length)} ·{" "}
                            <span class="hf-num">{brl(group.netMinor)}</span>
                            {group.recurrences.length > 0 &&
                              ` · ${group.recurrences.length === 1 ? "1 série" : `${group.recurrences.length} séries`} acompanha`}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                  <p class={HINT}>
                    O cartão antigo deixa de existir depois de mover. Nada é apagado: os lançamentos
                    só passam para o cartão escolhido.
                  </p>
                </>
              )}
            </div>
          </div>

          {problem !== null && (
            <p role="alert" class="mt-4 text-sm text-expense-fg">
              {problem}
            </p>
          )}

          <div class="sticky bottom-0 -mx-5 mt-6 flex gap-2.5 bg-surface px-5 pt-2">
            <Button
              variant="secondary"
              onClick={() => (current === 0 ? onDefer() : goTo(current - 1))}
            >
              {current === 0 ? "Depois" : "Voltar"}
            </Button>
            {current < lastIndex ? (
              <Button
                key="avancar"
                icon="arrow-right"
                class="flex-1"
                disabled={current >= maxReachable}
                onClick={() => goTo(current + 1)}
              >
                Continuar
              </Button>
            ) : (
              <Button
                key="mover"
                icon="check"
                iconSide="left"
                class="flex-1"
                disabled={busy}
                onClick={() => void apply()}
              >
                Mover {countLabel(total)}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function GroupStep({
  group,
  choice,
  cards,
  idPrefix,
  onChange,
}: {
  group: CardGroup;
  choice: GroupChoice;
  cards: ReturnType<typeof listCreditCards>;
  idPrefix: string;
  onChange: (patch: Partial<GroupChoice>) => void;
}) {
  const radios = `dest-${group.source.id}`;
  return (
    <fieldset>
      <legend class="sr-only">Cartão de destino de {group.source.name}</legend>
      <p class="text-sm text-fg/70">
        {countLabel(group.transactions.length)} de “{group.source.name}” ·{" "}
        <span class="hf-num">{brl(group.netMinor)}</span>
      </p>
      <div class="mt-3 overflow-hidden rounded-lg bg-bg">
        {cards.map((card, position) => (
          <MethodRow
            key={card.id}
            first={position === 0}
            group={radios}
            name={card.name}
            icon={card.icon}
            color={card.color}
            credit
            detail={cardDetail(card) ?? cardCycleText(card)}
            checked={choice.pick === card.id}
            onSelect={() => onChange({ pick: card.id })}
          />
        ))}
        <MethodRow
          first={cards.length === 0}
          group={radios}
          name="Criar cartão novo"
          icon="plus"
          color={null}
          checked={choice.pick === NEW}
          onSelect={() => onChange({ pick: NEW })}
        />
      </div>

      {choice.pick === NEW && (
        <div class="mt-5">
          <CardFields
            idPrefix={idPrefix}
            value={choice.card}
            onChange={(card) => onChange({ card })}
          />
          <p class={`${LABEL} mt-5`}>Cor do cartão</p>
          <Swatches
            name={`${idPrefix}-color`}
            legend="Cor do cartão"
            value={choice.color}
            onChange={(color) => onChange({ color })}
            class="mt-3"
            surface="surface"
          />
        </div>
      )}
    </fieldset>
  );
}
