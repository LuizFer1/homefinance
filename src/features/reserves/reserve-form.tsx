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
import { formatBRL } from "../../domain/money/money";
import { monthOf } from "../../domain/projections/periods";
import { emergencyOf, isDuplicateEmergency, reserveBalance } from "../../domain/reserves/balances";
import { essentialCost, findEssentialCategoryIds } from "../../domain/reserves/essential";
import { suggestedMonthly } from "../../domain/reserves/goals";
import { Icon } from "../icons/icon";
import { PICKABLE_ICONS } from "../icons/icon-set";
import { Button } from "../ui/button";
import { FIELD_SHEET, HINT, LABEL } from "../ui/field";
import { HoldToDelete } from "../ui/hold-button";
import { SheetHeader } from "../ui/modal";
import { compactBRL, wholeBRL } from "../ui/money";
import { Progress } from "../ui/progress";
import { SummaryChip } from "../ui/summary-chip";
import { Swatches } from "../ui/swatches";
import { IconTile } from "../ui/tile";
import { Toggle } from "../ui/toggle";
import { AccentIconBox } from "./accent-icon-box";
import { EmergencyGoalCard } from "./emergency-goal-card";
import { dayOfDate, deadlineLabel, monthName } from "./format";
import type { ReserveInput } from "./store";

export interface ReserveFormProps {
  state: AppState;
  today: string;
  /** null = criar. Montado com `key` pelo app, então as props só são lidas na montagem. */
  editing: Reserve | null;
  initialKind: ReserveKind;
  onSubmit: (input: ReserveInput) => void;
  onDelete: () => void;
  onCancel: () => void;
}

type StepId = "Nome" | "Tipo" | "Ícone" | "Cor" | "Meta" | "Meses" | "Depósito";

const GOAL_STEPS: readonly StepId[] = ["Nome", "Ícone", "Cor", "Meta"];
const EMERGENCY_CREATE_STEPS: readonly StepId[] = ["Tipo", "Meses", "Depósito"];
const EMERGENCY_EDIT_STEPS: readonly StepId[] = ["Meses", "Depósito"];

/**
 * Invólucro de um campo com algo antes do `<input>` ("R$", ícone de calendário).
 * A borda de foco fica aqui e não no input: o input é transparente e o prefixo
 * faz parte do campo aos olhos de quem digita. Fundo `bg` porque mora no sheet.
 */
function FieldShell({ children }: { children: ComponentChildren }) {
  return (
    <div
      class="mt-2 flex h-12 items-center gap-2 rounded-lg border border-divider bg-bg px-3.5
        text-base transition-[border-color] duration-150 focus-within:border-accent"
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
  hint,
}: {
  id: string;
  label: string;
  digits: string;
  onDigits: (digits: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <label for={id} class={LABEL}>
        {label}
      </label>
      <FieldShell>
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
            : "bg-bg"
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

/**
 * 2e: criar uma caixinha (ou a emergência), ou editar qualquer reserva, num
 * sheet em etapas como o cadastro de categoria.
 *
 * A caixinha segue a mesma divisão do cadastro — identidade (tipo e nome),
 * depois aparência (ícone, cor) — e ganha uma última etapa para o dinheiro:
 * meta, prazo e o depósito sugerido. O dinheiro vem por último porque a
 * sugestão depende dos dois campos juntos, e numa etapa só ela aparece à vista
 * de quem acabou de digitá-los.
 *
 * A emergência não tem nome, ícone nem cor (são fixos), então suas etapas são
 * outras: quantos meses guardar e quanto depositar. Separadas porque o
 * depósito só faz sentido com a meta já decidida. A lista de etapas muda com o
 * tipo escolhido na primeira, e por isso o tipo só é escolhido lá.
 */
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

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<"next" | "back">("next");
  const [problem, setProblem] = useState<string | null>(null);

  const [name, setName] = useState(editing?.name ?? "");
  const [icon, setIcon] = useState<IconKey>(editing?.icon ?? "laptop");
  // "sky" é só o ponto de partida da caixinha; "violet" é o token da emergência, não um padrão.
  const [color, setColor] = useState<ColorToken>(editing?.color ?? "sky");
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

  const trimmed = name.trim();
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

  const steps = !emergency
    ? GOAL_STEPS
    : editing === null
      ? EMERGENCY_CREATE_STEPS
      : EMERGENCY_EDIT_STEPS;
  const current = steps[step] ?? steps[0];
  const isLast = step === steps.length - 1;

  /** O problema que impede sair da etapa, ou null. Ícone, cor, tipo e meta nunca bloqueiam. */
  function problemOf(id: StepId | undefined): string | null {
    if (id === "Nome" && trimmed === "") return "Informe um nome.";
    if (id === "Meses" && showCost && computedCost === null && overrideMinor <= 0) {
      return "Informe o custo essencial por mês.";
    }
    if (id === "Depósito" && recurringOn && monthlyMinor <= 0) return "Informe o valor por mês.";
    return null;
  }

  /** Primeira etapa (até `until`, exclusiva) com problema; -1 quando todas passam. */
  function firstBlocked(until: number): number {
    for (let index = 0; index < until; index++) {
      if (problemOf(steps[index]) !== null) return index;
    }
    return -1;
  }

  // A barra só deixa pular até a primeira etapa que ainda bloqueia.
  const blocked = firstBlocked(steps.length - 1);
  const maxReachable = blocked === -1 ? steps.length - 1 : blocked;

  function goTo(index: number) {
    // Avançar valida no caminho, com o erro junto do campo que o causa; voltar nunca.
    if (index > step) {
      for (let at = step; at < index; at++) {
        const reason = problemOf(steps[at]);
        if (reason !== null) {
          setProblem(reason);
          if (at !== step) {
            setDir("back");
            setStep(at);
          }
          return;
        }
      }
    }
    setProblem(null);
    setDir(index < step ? "back" : "next");
    setStep(index);
  }

  function submit() {
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
      name: trimmed,
      icon,
      color,
      targetMinor: target > 0 ? target : null,
      multiple: null,
      essentialOverrideMinor: null,
      deadline: deadline === "" ? null : deadline,
      recurringAmountMinor,
    });
  }

  function handleSubmit(event: Event) {
    event.preventDefault();
    // Enter num campo de etapa intermediária envia o form implicitamente: vale
    // como "Continuar", não como criar a reserva pela metade.
    if (!isLast) {
      goTo(step + 1);
      return;
    }
    const at = firstBlocked(steps.length);
    if (at !== -1) {
      setProblem(problemOf(steps[at]));
      if (at !== step) {
        setDir("back");
        setStep(at);
      }
      return;
    }
    submit();
  }

  const nextMonth = monthName(shiftMonth(monthOf(today), 1));
  const emergencyHint =
    editing?.recurring && editing.recurring.amountMinor === monthlyMinor
      ? `Todo dia ${editing.recurring.day}`
      : `Começa em ${nextMonth}, todo dia ${dayOfDate(today)}`;
  const deadlineText = deadline === "" ? "" : deadlineLabel(deadline, "0000-01-01");
  const suggestionHint =
    suggestion === null
      ? ""
      : `${
          suggestion.deposits === 1 ? "1 depósito chega" : `${suggestion.deposits} depósitos chegam`
        } lá em ${deadlineText}`;

  const title = editing === null ? "Nova reserva" : "Editar reserva";

  // Emergência duplicada (dois aparelhos offline criaram uma cada): o form de
  // emergência editaria uma segunda meta da casa, e o de caixinha mudaria o que
  // a linha é. O único conserto coerente é excluir uma delas — sem etapas.
  if (editing !== null && isDuplicateEmergency(state, editing)) {
    return (
      <div class="flex flex-col">
        <SheetHeader
          title={title}
          onClose={onCancel}
          actions={<HoldToDelete label={`Excluir ${editing.name}`} onConfirm={onDelete} />}
        />
        <p class="mt-5 flex gap-2 text-sm leading-normal text-fg/75 text-pretty">
          <Icon name="info" size={16} class="mt-0.5 shrink-0 text-tag-amber" />
          Reserva de emergência duplicada (criada em outro aparelho). Exclua uma delas.
        </p>
        <p class={HINT}>Segure a lixeira para excluir. O saldo volta para o mês atual.</p>
        <div class="mt-6 flex">
          <Button variant="secondary" class="flex-1" onClick={onCancel}>
            Fechar
          </Button>
        </div>
      </div>
    );
  }

  const goalContext =
    target > 0
      ? `meta ${wholeBRL(target)}${deadline === "" ? "" : ` até ${deadlineText}`}`
      : "caixinha";
  const emergencyCost = showCost ? overrideMinor : (computedCost ?? 0);
  const summary = emergency ? (
    <SummaryChip
      leading={<IconTile icon={EMERGENCY_ICON} color={EMERGENCY_COLOR} size={26} iconSize={14} />}
      title="Reserva de emergência"
      context={`${multiple} meses do custo essencial`}
      trailing={emergencyCost > 0 ? wholeBRL(emergencyCost * multiple) : undefined}
    />
  ) : (
    <SummaryChip
      leading={<IconTile icon={icon} color={color} size={26} iconSize={14} />}
      title={trimmed}
      context={goalContext}
    />
  );

  // A mesma linha da meta na lista de Reservas, para a prévia mostrar a caixinha como ela vai ficar.
  const previewMeta =
    target <= 0
      ? "Sem meta"
      : balance >= target
        ? "Meta atingida"
        : `Faltam ${wholeBRL(target - balance)}${deadline === "" ? "" : ` · até ${deadlineLabel(deadline, today)}`}`;

  return (
    <form
      // O próprio `problemOf` decide o envio; a validação nativa (ex.: `min` do
      // mês) bloquearia o Salvar em silêncio, sem mensagem nenhuma na tela.
      noValidate
      onSubmit={handleSubmit}
      class="flex flex-col"
    >
      <SheetHeader
        title={title}
        onClose={onCancel}
        actions={
          editing !== null ? (
            <HoldToDelete
              label={`Excluir ${emergency ? "reserva de emergência" : editing.name}`}
              onConfirm={onDelete}
            />
          ) : undefined
        }
      />

      <div class="mt-5">
        <Progress steps={steps} current={step} maxReachable={maxReachable} onGo={goTo} />
      </div>

      {/*
        `key` só pela etapa: trocar o tipo na primeira não pode remontar os cards
        e tirar o foco do rádio que acabou de ser marcado.
      */}
      <div key={step} data-dir={dir} class="hf-step mt-5">
        {step > 0 && <div class="mb-5">{summary}</div>}

        {(current === "Nome" || current === "Tipo") && (
          <>
            {editing === null && (
              <fieldset class="grid grid-cols-2 gap-2.5">
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
                    setProblem(null);
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
                    setProblem(null);
                  }}
                />
              </fieldset>
            )}

            {emergency ? (
              <p class={HINT}>
                A meta são alguns meses do que você gasta com o essencial; quantos, você escolhe na
                próxima etapa.
              </p>
            ) : (
              <>
                <label for="reserve-name" class={`${LABEL} ${editing === null ? "mt-5" : ""}`}>
                  Nome
                </label>
                <input
                  id="reserve-name"
                  type="text"
                  autocomplete="off"
                  placeholder="Notebook novo"
                  value={name}
                  onInput={(event) => setName(event.currentTarget.value)}
                  class={`${FIELD_SHEET} mt-2`}
                />
              </>
            )}
          </>
        )}

        {current === "Ícone" && (
          <fieldset>
            <legend class="sr-only">Ícone</legend>
            <div class="grid grid-cols-7 gap-1.5">
              {PICKABLE_ICONS.map((key) => {
                const on = icon === key;
                return (
                  <label
                    key={key}
                    class={`hf-press grid aspect-square cursor-pointer place-items-center rounded-lg
                      has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                        on ? "hf-selected text-accent-200" : "bg-bg text-fg/80 hover:bg-fg/[0.06]"
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
                    <Icon name={key} size={21} />
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        {current === "Cor" && (
          <>
            <Swatches
              name="color"
              legend="Cor"
              value={color}
              onChange={setColor}
              surface="surface"
            />

            {/* Prévia: é a primeira vez que ícone e cor aparecem juntos, onde vão morar. */}
            <p class={`${LABEL} mt-7`}>Prévia</p>
            <div class="mt-2 flex h-16 items-center gap-3 rounded-lg bg-bg px-3.5">
              <IconTile icon={icon} color={color} size={38} iconSize={20} />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[15px] font-medium">{trimmed}</span>
                <span class="mt-0.5 block truncate text-xs text-fg/55">{previewMeta}</span>
              </span>
              <span class="hf-num text-[15px] font-medium">{formatBRL(balance)}</span>
            </div>
          </>
        )}

        {current === "Meta" && (
          <>
            <div class="grid grid-cols-2 gap-2.5">
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
                <FieldShell>
                  <Icon name="calendar" size={16} class="shrink-0 text-fg/60" />
                  <input
                    id="reserve-deadline"
                    type="month"
                    // Só ao criar: um prazo que já chegou é estado válido, e na edição o
                    // `min` travaria o Salvar de quem só quer renomear a caixinha.
                    min={editing === null ? shiftMonth(monthOf(today), 1) : undefined}
                    value={deadline}
                    onInput={(event) => setDeadline(event.currentTarget.value)}
                    class="min-w-0 flex-1 bg-transparent text-base outline-none"
                  />
                </FieldShell>
              </div>
            </div>
            <p class={HINT}>Os dois são opcionais: sem eles a caixinha só guarda.</p>

            {(suggestion !== null || saved !== null) && (
              <div class="mt-4 flex items-center gap-3 rounded-lg bg-bg px-3.5 py-3">
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

        {current === "Meses" && (
          <EmergencyGoalCard
            flat
            costMinor={showCost ? null : computedCost}
            digits={overrideDigits}
            onDigits={setOverrideDigits}
            costLabel="Custo essencial por mês"
            multiple={multiple}
            onMultiple={setMultiple}
          />
        )}

        {current === "Depósito" && (
          <>
            <Toggle
              checked={recurringOn}
              onChange={setRecurringOn}
              label="Guardar todo mês"
              hint={emergencyHint}
            />
            {recurringOn && (
              <div class="mt-3">
                <MoneyField
                  id="reserve-monthly"
                  label="Valor por mês"
                  digits={monthlyDigits}
                  onDigits={setMonthlyDigits}
                  hint={monthlyMinor <= 0 ? "Digite o valor por mês" : undefined}
                />
              </div>
            )}
          </>
        )}

        {/* A lixeira mora no cabeçalho; o que ela faz com o dinheiro fica dito perto do Salvar. */}
        {editing !== null && isLast && (
          <p class={`${HINT} mt-5`}>Excluir pela lixeira: o saldo volta para o mês atual.</p>
        )}
      </div>

      {problem !== null && (
        <p role="alert" class="mt-4 text-sm text-expense-fg">
          {problem}
        </p>
      )}

      {/*
        As `key` distintas não são decoração: sem elas os dois botões ocupam a
        mesma posição no JSX, o Preact reaproveita o nó e só troca o atributo
        `type`. O navegador executa a activation behavior do botão **depois**
        do handler — então o clique em "Continuar" avançava a etapa, o nó virava
        `submit`, e o formulário era submetido, criando a reserva antes da hora.
      */}
      <div class="sticky bottom-0 -mx-5 mt-6 flex gap-2.5 bg-surface px-5 pt-2">
        {step > 0 && (
          <Button key="voltar" variant="secondary" onClick={() => goTo(step - 1)}>
            Voltar
          </Button>
        )}
        {isLast ? (
          <Button key="enviar" type="submit" icon="check" iconSide="left" class="flex-1">
            {editing === null ? "Criar reserva" : "Salvar"}
          </Button>
        ) : (
          <Button key="avancar" icon="arrow-right" class="flex-1" onClick={() => goTo(step + 1)}>
            Continuar
          </Button>
        )}
      </div>
    </form>
  );
}
