import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import type { AppState } from "../../domain/model/app-state";
import {
  EMERGENCY_COLOR,
  EMERGENCY_ICON,
  EMERGENCY_MULTIPLES,
  type EmergencyMultiple,
  type Reserve,
  type ReserveKind,
} from "../../domain/model/reserve";
import type { ColorToken, IconKey } from "../../domain/model/tokens";
import { MAX_MINOR, maskDigits, minorOf, onlyDigits } from "../../domain/money/mask";
import { emergencyOf, reserveBalance } from "../../domain/reserves/balances";
import { emergencyTarget } from "../../domain/reserves/essential";
import { suggestedMonthly } from "../../domain/reserves/goals";
import { Icon } from "../icons/icon";
import { PICKABLE_ICONS } from "../icons/icon-set";
import { Button } from "../ui/button";
import { FIELD_PAGE, LABEL } from "../ui/field";
import { HoldToDelete } from "../ui/hold-button";
import { wholeBRL } from "../ui/money";
import { Segmented } from "../ui/segmented";
import { Swatches } from "../ui/swatches";
import { Toggle } from "../ui/toggle";
import { deadlineLabel } from "./format";
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

const MULTIPLE_OPTIONS = EMERGENCY_MULTIPLES.map((m) => ({
  value: String(m),
  label: `${m} meses`,
}));

/**
 * Invólucro de um campo com algo antes do `<input>` ("R$", ícone de calendário).
 * A borda de foco fica aqui e não no input: o input é transparente e o prefixo
 * faz parte do campo aos olhos de quem digita.
 */
function FieldShell({ tone, children }: { tone: "surface" | "bg"; children: ComponentChildren }) {
  return (
    <div
      class={`mt-2 flex h-12 items-center gap-2 rounded-lg border border-divider px-3.5 text-[15px]
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
}: {
  id: string;
  label: string;
  digits: string;
  onDigits: (digits: string) => void;
  tone?: "surface" | "bg";
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
          class="hf-num min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg/40"
        />
      </FieldShell>
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
  const kind = editing?.kind ?? pickedKind;
  const emergency = kind === "emergency";
  const existing = emergencyOf(state);
  const emergencyTaken = existing !== null && existing.id !== editing?.id;

  const [name, setName] = useState(editing?.name ?? "");
  const [icon, setIcon] = useState<IconKey>(editing?.icon ?? "laptop");
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

  // A emergência deriva a meta do histórico; sem histórico utilizável (ou com
  // um custo digitado antes) o campo precisa existir, senão a meta fica sem conta.
  const showCost =
    emergency &&
    (editing === null ||
      editing.essentialOverrideMinor !== null ||
      emergencyTarget(state, editing, today) === null);
  const overrideMinor = minorOf(overrideDigits);
  const monthlyMinor = minorOf(monthlyDigits);

  let recurringAmountMinor: number | null = null;
  if (emergency) {
    recurringAmountMinor = recurringOn && monthlyMinor > 0 ? monthlyMinor : null;
  } else if (recurringOn && suggestion !== null) {
    // Regra já gravada e toggle intocado: reenviar a sugestão nova reescreveria
    // o valor do usuário só porque a meta ou o saldo andaram.
    recurringAmountMinor =
      editing?.recurring && !recurringTouched
        ? editing.recurring.amountMinor
        : suggestion.monthlyMinor;
  }

  const valid = emergency
    ? !(recurringOn && monthlyMinor <= 0)
    : name.trim() !== "" && target <= MAX_MINOR;

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
        essentialOverrideMinor: showCost
          ? overrideMinor > 0
            ? overrideMinor
            : null
          : (editing?.essentialOverrideMinor ?? null),
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

  const icons = allIcons ? PICKABLE_ICONS : SHORT_ICONS;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <button
        type="button"
        onClick={onCancel}
        class="hf-press -ml-1.5 flex h-9 items-center gap-1 pr-2 text-sm text-fg/65"
      >
        <Icon name="caret-left" size={18} />
        Reservas
      </button>
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
        <section class="mt-[18px] rounded-lg bg-surface p-4">
          <Segmented
            name="emergency-multiple"
            legend="Meses de cobertura"
            onSurface
            variant="pill"
            options={MULTIPLE_OPTIONS}
            value={String(multiple)}
            onChange={(value) => setMultiple(Number(value) as EmergencyMultiple)}
          />
          {showCost && (
            <div class="mt-3.5">
              <MoneyField
                id="reserve-cost"
                label="Custo essencial por mês"
                digits={overrideDigits}
                onDigits={setOverrideDigits}
                tone="bg"
              />
            </div>
          )}
          <Toggle
            class="mt-2"
            checked={recurringOn}
            onChange={setRecurringOn}
            label="Guardar todo mês"
            hint="Começa no mês que vem"
          />
          {recurringOn && (
            <div class="mt-2">
              <MoneyField
                id="reserve-monthly"
                label="Valor por mês"
                digits={monthlyDigits}
                onDigits={setMonthlyDigits}
                tone="bg"
              />
            </div>
          )}
        </section>
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
                        on ? "hf-selected text-accent-200" : "bg-surface text-fg/80"
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
            {!allIcons && (
              <button
                type="button"
                onClick={() => setAllIcons(true)}
                class="hf-press mt-1 h-9 text-[13px] font-medium text-accent-300"
              >
                Mais ícones
              </button>
            )}
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
                  value={deadline}
                  onInput={(event) => setDeadline(event.currentTarget.value)}
                  class="min-w-0 flex-1 bg-transparent outline-none"
                />
              </FieldShell>
            </div>
          </div>

          {suggestion !== null && (
            <div class="mt-3 flex items-center gap-3 rounded-lg bg-surface px-3.5 py-3">
              <span
                aria-hidden="true"
                class="grid size-8 shrink-0 place-items-center rounded-lg border border-accent text-accent-300 shadow-[0_0_16px_-4px_color-mix(in_srgb,var(--color-accent)_60%,transparent)]"
              >
                <Icon name="calculator" size={16} />
              </span>
              <Toggle
                class="min-w-0 flex-1"
                checked={recurringOn}
                onChange={(on) => {
                  setRecurringOn(on);
                  setRecurringTouched(true);
                }}
                label={`Guardar ${wholeBRL(suggestion.monthlyMinor)} todo mês`}
                hint={`${suggestion.deposits} depósitos chegam lá em ${deadlineLabel(deadline, "0000-01-01")}`}
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
