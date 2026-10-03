import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { shiftMonth } from "../../domain/dates/calendar";
import type { AppState } from "../../domain/model/app-state";
import {
  EMERGENCY_COLOR,
  EMERGENCY_ICON,
  type EmergencyMultiple,
  type Reserve,
  type ReserveKind,
} from "../../domain/model/reserve";
import type { ColorToken, IconKey } from "../../domain/model/tokens";
import { maskDigits, minorOf, onlyDigits } from "../../domain/money/mask";
import { monthOf } from "../../domain/projections/periods";
import { emergencyOf, isDuplicateEmergency, reserveBalance } from "../../domain/reserves/balances";
import { essentialCost, findEssentialCategoryIds } from "../../domain/reserves/essential";
import { suggestedMonthly } from "../../domain/reserves/goals";
import { Icon } from "../icons/icon";
import { PICKABLE_ICONS } from "../icons/icon-set";
import { Button } from "../ui/button";
import { FIELD_PAGE, HINT, LABEL } from "../ui/field";
import { HoldToDelete } from "../ui/hold-button";
import { compactBRL, wholeBRL } from "../ui/money";
import { Swatches } from "../ui/swatches";
import { Toggle } from "../ui/toggle";
import { AccentIconBox } from "./accent-icon-box";
import { BackLink } from "./back-link";
import { EmergencyGoalCard } from "./emergency-goal-card";
import { dayOfDate, deadlineLabel, monthName } from "./format";
import type { ReserveInput } from "./store";

export interface ReserveFormProps {
  state: AppState;
  today: string;
  /** null = criar. */
  editing: Reserve | null;
  initialKind: ReserveKind;
  onSubmit: (input: ReserveInput) => void;
  onDelete: () => void;
  onCancel: () => void;
}

/** A versão curta da grade (2e); o resto do catálogo abre em "Mais ícones". */
const SHORT_ICONS: readonly IconKey[] = [
  "laptop",
  "plane-tilt",
  "car",
  "gift",
  "house",
  "graduation",
];

/**
 * Invólucro de um campo com algo antes do `<input>` ("R$", ícone de calendário).
 * A borda de foco fica aqui e não no input: o input é transparente e o prefixo
 * faz parte do campo aos olhos de quem digita.
 */
function FieldShell({ tone, children }: { tone: "surface" | "bg"; children: ComponentChildren }) {
  return (
    <div
      class={`mt-2 flex h-12 items-center gap-2 rounded-lg border border-divider px-3.5 text-base
        transition-[border-color] duration-150 focus-within:border-accent ${
          tone === "bg" ? "bg-bg" : "bg-surface"
        }`}
    >
      {children}
    </div>
  );
}

function MoneyField({
  id,
  label,
  digits,
  onDigits,
  tone = "surface",
  hint,
}: {
  id: string;
  label: string;
  digits: string;
  onDigits: (digits: string) => void;
  tone?: "surface" | "bg";
  hint?: string;
}) {
  return (
    <div>
      <label for={id} class={LABEL}>
        {label}
      </label>
      <FieldShell tone={tone}>
        <span class="text-fg/60">R$</span>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autocomplete="off"
          placeholder="0,00"
          value={maskDigits(digits)}
          onInput={(event) => onDigits(onlyDigits(event.currentTarget.value))}
          aria-describedby={hint === undefined ? undefined : `${id}-hint`}
          class="hf-num min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-fg/40"
        />
      </FieldShell>
      {hint !== undefined && (
        <p id={`${id}-hint`} class={HINT}>
          {hint}
        </p>
      )}
    </div>
  );
}

/** Um dos dois cards do seletor de tipo; o rádio é nativo e o card é o `<label>`. */
function KindCard({
  kind,
  selected,
  disabled,
  title,
  sub,
  icon,
  onSelect,
}: {
  kind: ReserveKind;
  selected: boolean;
  disabled: boolean;
  title: string;
  sub: string;
  icon: string;
  onSelect: () => void;
}) {
  return (
    <label
      class={`hf-press block rounded-lg p-3 has-[:focus-visible]:outline-2
        has-[:focus-visible]:outline-accent ${
          disabled ? "pointer-events-none opacity-50" : "cursor-pointer"
        } ${
          selected
            ? "bg-accent-900 shadow-[inset_0_0_0_1px_var(--color-accent),0_0_18px_-6px_var(--color-accent)]"
            : "bg-surface"
        }`}
    >
      <input
        type="radio"
        name="kind"
        value={kind}
        checked={selected}
        disabled={disabled}
        onChange={onSelect}
        class="sr-only"
      />
      <Icon name={icon} size={20} class={selected ? "text-accent-200" : undefined} />
      <span class={`mt-2 block text-sm font-medium ${selected ? "text-accent-200" : ""}`}>
        {title}
      </span>
      <span class={`block text-xs ${selected ? "text-accent-300" : "text-fg/60"}`}>{sub}</span>
    </label>
  );
}

/** 2e: criar uma caixinha (ou emergência), ou editar qualquer reserva. */
export function ReserveForm({
  state,
  today,
  editing,
  initialKind,
  onSubmit,
  onDelete,
  onCancel,
}: ReserveFormProps) {
  const [pickedKind, setPickedKind] = useState<ReserveKind>(initialKind);
  // O tipo não muda depois de criado: trocar caixinha em emergência
  // reescreveria o que a meta significa, e o saldo ficaria sem explicação.
  const existing = emergencyOf(state);
  const emergencyTaken = existing !== null && existing.id !== editing?.id;
  // `initialKind` pode chegar "emergency" com uma já existente: a store recusaria
  // a segunda, então o formulário cai para caixinha em vez de abrir inválido.
  const kind =
    editing?.kind ?? (pickedKind === "emergency" && emergencyTaken ? "goal" : pickedKind);
  const emergency = kind === "emergency";

  const [name, setName] = useState(editing?.name ?? "");
  const [icon, setIcon] = useState<IconKey>(editing?.icon ?? "laptop");
  // "sky" é só o ponto de partida da caixinha; "violet" é o token da emergência, não um padrão.
  const [color, setColor] = useState<ColorToken>(editing?.color ?? "sky");
  // Ícone fora da versão curta abre a grade completa: senão a seleção atual
  // ficaria escondida atrás de "Mais ícones".
  const [allIcons, setAllIcons] = useState(editing !== null && !SHORT_ICONS.includes(editing.icon));
  const [targetDigits, setTargetDigits] = useState(
    editing?.targetMinor ? String(editing.targetMinor) : "",
  );
  const [deadline, setDeadline] = useState(editing?.deadline ?? "");

  const [multiple, setMultiple] = useState<EmergencyMultiple>(editing?.multiple ?? 6);
  const [overrideDigits, setOverrideDigits] = useState(
    editing?.essentialOverrideMinor ? String(editing.essentialOverrideMinor) : "",
  );
  const [monthlyDigits, setMonthlyDigits] = useState(
    editing?.recurring ? String(editing.recurring.amountMinor) : "",
  );

  // Criar caixinha começa ligado (a sugestão é o ponto do card); a emergência
  // exige um valor digitado, então começa desligada.
  const [recurringOn, setRecurringOn] = useState(
    editing === null ? !emergency : editing.recurring !== null,
  );
  const [recurringTouched, setRecurringTouched] = useState(false);

  const target = minorOf(targetDigits);
  const balance = editing === null ? 0 : reserveBalance(state, editing.id);
  const suggestion =
    !emergency && target > 0 && deadline !== ""
      ? suggestedMonthly(target, balance, deadline, today)
      : null;

  // Mesma regra do estado vazio: com custo pelos lançamentos o campo nem existe;
  // sem ele (ou com um custo digitado antes) o campo é obrigatório, senão a meta
  // fica sem conta. Na edição, o custo vem das categorias gravadas na reserva.
  const computed = essentialCost(
    state,
    editing === null ? findEssentialCategoryIds(state) : (editing.essentialCategoryIds ?? []),
    today,
  );
  const computedCost = computed !== null && computed > 0 ? computed : null;
  const showCost =
    emergency && (computedCost === null || (editing?.essentialOverrideMinor ?? null) !== null);
  const overrideMinor = minorOf(overrideDigits);
  const monthlyMinor = minorOf(monthlyDigits);

  const saved = editing?.recurring?.amountMinor ?? null;
  // Salvar nunca desliga o depósito sozinho: ele pode ter sido ligado no sheet
  // Guardar (sem meta nem prazo) ou a meta já ter sido atingida. O valor gravado
  // só dá lugar à sugestão quando o usuário mexe no toggle com uma sugestão à vista.
  const keepSaved = saved !== null && !(recurringTouched && suggestion !== null);

  let recurringAmountMinor: number | null = null;
  if (emergency) {
    recurringAmountMinor = recurringOn && monthlyMinor > 0 ? monthlyMinor : null;
  } else if (recurringOn) {
    recurringAmountMinor = keepSaved ? saved : (suggestion?.monthlyMinor ?? null);
  }

  const valid = emergency
    ? !(showCost && computedCost === null && overrideMinor <= 0) &&
      !(recurringOn && monthlyMinor <= 0)
    : name.trim() !== "";

  function submit() {
    if (!valid) return;
    if (emergency) {
      onSubmit({
        kind: "emergency",
        name: "",
        icon: EMERGENCY_ICON,
        color: EMERGENCY_COLOR,
        targetMinor: null,
        multiple,
        essentialOverrideMinor: showCost && overrideMinor > 0 ? overrideMinor : null,
        deadline: null,
        recurringAmountMinor,
      });
      return;
    }
    onSubmit({
      kind: "goal",
      name: name.trim(),
      icon,
      color,
      targetMinor: target > 0 ? target : null,
      multiple: null,
      essentialOverrideMinor: null,
      deadline: deadline === "" ? null : deadline,
      recurringAmountMinor,
    });
  }

  const nextMonth = monthName(shiftMonth(monthOf(today), 1));
  const emergencyHint =
    editing?.recurring && editing.recurring.amountMinor === monthlyMinor
      ? `Todo dia ${editing.recurring.day}`
      : `Começa em ${nextMonth}, todo dia ${dayOfDate(today)}`;
  const suggestionHint =
    suggestion === null
      ? ""
      : `${
          suggestion.deposits === 1 ? "1 depósito chega" : `${suggestion.deposits} depósitos chegam`
        } lá em ${deadlineLabel(deadline, "0000-01-01")}`;

  const icons = allIcons ? PICKABLE_ICONS : SHORT_ICONS;

  // Emergência duplicada (dois aparelhos offline criaram uma cada): o form de
  // emergência editaria uma segunda meta da casa, e o de caixinha mudaria o que
  // a linha é. O único conserto coerente é excluir uma delas.
  if (editing !== null && isDuplicateEmergency(state, editing)) {
    return (
      <div>
        <BackLink onClick={onCancel} />
        <h1 class="mt-2.5 text-[28px] leading-tight font-medium tracking-[-0.02em]">
          Editar reserva
        </h1>
        <p class="mt-[18px] flex gap-2 text-sm leading-normal text-fg/75 text-pretty">
          <Icon name="info" size={16} class="mt-0.5 shrink-0 text-tag-amber" />
          Reserva de emergência duplicada (criada em outro aparelho). Exclua uma delas.
        </p>
        <div class="mt-[22px] flex gap-2.5">
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
        <div class="mt-5 flex items-center gap-3">
          <HoldToDelete label={`Excluir ${editing.name}`} onConfirm={onDelete} />
          <span class="text-[13px] text-fg/55">O saldo volta para o mês atual</span>
        </div>
      </div>
    );
  }

  return (
    <form
      // O próprio `valid` decide o envio; a validação nativa (ex.: `min` do mês)
      // bloquearia o Salvar em silêncio, sem mensagem nenhuma na tela.
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <BackLink onClick={onCancel} />
      <h1 class="mt-2.5 text-[28px] leading-tight font-medium tracking-[-0.02em]">
        {editing === null ? "Nova reserva" : "Editar reserva"}
      </h1>

      {editing === null && (
        <fieldset class="mt-[18px] grid grid-cols-2 gap-2.5">
          <legend class="sr-only">Tipo</legend>
          <KindCard
            kind="emergency"
            selected={emergency}
            disabled={emergencyTaken}
            title="Emergência"
            sub={emergencyTaken ? "Você já tem uma" : "Meses do custo essencial"}
            icon="lifebuoy"
            onSelect={() => {
              setPickedKind("emergency");
              setRecurringOn(false);
            }}
          />
          <KindCard
            kind="goal"
            selected={!emergency}
            disabled={false}
            title="Caixinha"
            sub="Para um objetivo"
            icon="target"
            onSelect={() => {
              setPickedKind("goal");
              setRecurringOn(true);
            }}
          />
        </fieldset>
      )}

      {emergency ? (
        <EmergencyGoalCard
          costMinor={showCost ? null : computedCost}
          digits={overrideDigits}
          onDigits={setOverrideDigits}
          costLabel="Custo essencial por mês"
          multiple={multiple}
          onMultiple={setMultiple}
        >
          <Toggle
            class="mt-2"
            checked={recurringOn}
            onChange={setRecurringOn}
            label="Guardar todo mês"
            hint={emergencyHint}
          />
          {recurringOn && (
            <div class="mt-2">
              <MoneyField
                id="reserve-monthly"
                label="Valor por mês"
                digits={monthlyDigits}
                onDigits={setMonthlyDigits}
                tone="bg"
                hint={monthlyMinor <= 0 ? "Digite o valor por mês" : undefined}
              />
            </div>
          )}
        </EmergencyGoalCard>
      ) : (
        <>
          <label for="reserve-name" class={`${LABEL} mt-[18px]`}>
            Nome
          </label>
          <input
            id="reserve-name"
            type="text"
            autocomplete="off"
            placeholder="Notebook novo"
            value={name}
            onInput={(event) => setName(event.currentTarget.value)}
            class={`${FIELD_PAGE} mt-2`}
          />

          <fieldset class="mt-[18px]">
            <legend class={LABEL}>Ícone</legend>
            <div class="mt-2 grid grid-cols-6 gap-2">
              {icons.map((key) => {
                const on = icon === key;
                return (
                  <label
                    key={key}
                    class={`hf-press grid h-12 cursor-pointer place-items-center rounded-lg
                      has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                        on
                          ? "bg-accent-900 text-accent-200 shadow-[inset_0_0_0_1px_var(--color-accent),0_0_16px_-4px_var(--color-accent)]"
                          : "bg-surface text-fg/80"
                      }`}
                  >
                    <input
                      type="radio"
                      name="icon"
                      value={key}
                      aria-label={key}
                      checked={on}
                      onChange={() => setIcon(key)}
                      class="sr-only"
                    />
                    <Icon name={key} size={22} />
                  </label>
                );
              })}
            </div>
            <button
              type="button"
              aria-expanded={allIcons}
              onClick={() => setAllIcons(!allIcons)}
              class="hf-press mt-1 h-9 text-[13px] font-medium text-accent-300"
            >
              {allIcons ? "Menos ícones" : "Mais ícones"}
            </button>
          </fieldset>

          {/* A legenda do grupo de cores é sr-only dentro de Swatches; este rótulo é só visual. */}
          <p aria-hidden="true" class={`${LABEL} mt-[18px]`}>
            Cor
          </p>
          <Swatches name="color" legend="Cor" value={color} onChange={setColor} class="mt-2.5" />

          <div class="mt-[18px] grid grid-cols-2 gap-2.5">
            <MoneyField
              id="reserve-target"
              label="Meta"
              digits={targetDigits}
              onDigits={setTargetDigits}
            />
            <div>
              <label for="reserve-deadline" class={LABEL}>
                Até quando
              </label>
              <FieldShell tone="surface">
                <Icon name="calendar" size={16} class="shrink-0 text-fg/60" />
                <input
                  id="reserve-deadline"
                  type="month"
                  // Só ao criar: um prazo que já chegou é estado válido, e na edição o
                  // `min` travaria o Salvar de quem só quer renomear a caixinha.
                  min={editing === null ? shiftMonth(monthOf(today), 1) : undefined}
                  value={deadline}
                  onInput={(event) => setDeadline(event.currentTarget.value)}
                  class="min-w-0 flex-1 bg-transparent outline-none"
                />
              </FieldShell>
            </div>
          </div>

          {(suggestion !== null || saved !== null) && (
            <div class="mt-3 flex items-center gap-3 rounded-lg bg-surface px-3.5 py-3">
              <AccentIconBox size={32} iconSize={16} icon="calculator" />
              <Toggle
                class="hf-num min-w-0 flex-1"
                checked={recurringOn}
                onChange={(on) => {
                  setRecurringOn(on);
                  setRecurringTouched(true);
                }}
                label={
                  keepSaved
                    ? `Guardando ${compactBRL(saved)} todo mês`
                    : `Guardar ${wholeBRL(suggestion?.monthlyMinor ?? 0)} todo mês`
                }
                hint={
                  keepSaved
                    ? `Todo dia ${editing?.recurring?.day}${
                        suggestion === null
                          ? ""
                          : ` · sugerido ${wholeBRL(suggestion.monthlyMinor)}`
                      }`
                    : suggestionHint
                }
              />
            </div>
          )}
        </>
      )}

      <div class="mt-[22px] flex gap-2.5">
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" icon="check" iconSide="left" class="flex-1" disabled={!valid}>
          {editing === null ? "Criar reserva" : "Salvar"}
        </Button>
      </div>

      {editing !== null && (
        <div class="mt-5 flex items-center gap-3">
          <HoldToDelete
            label={`Excluir ${emergency ? "reserva de emergência" : editing.name}`}
            onConfirm={onDelete}
          />
          <span class="text-[13px] text-fg/55">O saldo volta para o mês atual</span>
        </div>
      )}
    </form>
  );
}
