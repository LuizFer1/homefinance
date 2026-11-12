import { useState } from "preact/hooks";
import { debtAmountsProblem, MAX_NAME } from "../../domain/business/rules";
import type { Debt } from "../../domain/model/debt";
import { minorOf } from "../../domain/money/mask";
import { dayLabel } from "../../domain/projections/periods";
import { MoneyField } from "../business/fields";
import { StepSheet } from "../business/step-sheet";
import { DateButton } from "../ui/date-field";
import { FIELD_SHEET, HINT, LABEL } from "../ui/field";
import { brl } from "../ui/money";
import { SummaryChip } from "../ui/summary-chip";
import { IconTile } from "../ui/tile";
import { Toggle } from "../ui/toggle";
import type { DebtInput } from "./store";

const STEPS = ["Dívida", "Valores", "Vencimento", "Prévia"] as const;

export interface DebtSheetProps {
  /** Dívida em edição, ou nula para uma nova. */
  editing: Debt | null;
  today: string;
  /** Grava; rejeitar mantém o sheet aberto com o motivo. */
  onSubmit: (input: DebtInput) => Promise<unknown>;
  /** Só na edição. */
  onDelete?: () => Promise<unknown>;
  onClose: () => void;
}

/**
 * Cadastro e edição de uma dívida do negócio em quatro etapas: nome e credor, valor
 * original e saldo atual, vencimento (opcional) e a prévia. O saldo não pode passar
 * do valor original — não há juros calculados aqui, então um saldo maior quase
 * sempre é erro de digitação. Zero vale: a dívida quitada fica no cadastro.
 */
export function DebtSheet({ editing, today, onSubmit, onDelete, onClose }: DebtSheetProps) {
  const [name, setName] = useState(editing?.name ?? "");
  const [creditor, setCreditor] = useState(editing?.creditor ?? "");
  const [principalDigits, setPrincipalDigits] = useState(
    editing === null ? "" : String(editing.principalMinor),
  );
  // `null`: dívida nova cujo saldo ainda acompanha o valor original (quem acaba de
  // contrair a dívida deve tudo). Mexer no campo solta o acompanhamento; campo vazio
  // depois disso é saldo zero (quitada) — o campo de dinheiro não digita "0", ele
  // normaliza para vazio, então esta é a única forma de dizer "quitada".
  const [balanceTyped, setBalanceTyped] = useState<string | null>(
    editing === null ? null : editing.balanceMinor === 0 ? "" : String(editing.balanceMinor),
  );
  const [hasDue, setHasDue] = useState(editing?.dueOn != null);
  const [dueOn, setDueOn] = useState(editing?.dueOn ?? today);

  const trimmed = name.trim();
  const trimmedCreditor = creditor.trim();
  const balanceDigits = balanceTyped ?? principalDigits;
  const principalMinor = minorOf(principalDigits);
  const balanceMinor = minorOf(balanceDigits);
  const amountsProblem = debtAmountsProblem(principalMinor, balanceMinor);
  // Aviso enquanto digita só para o erro de ordem: valor original ainda vazio não é erro ainda.
  const orderProblem = principalMinor > 0 && balanceMinor > principalMinor ? amountsProblem : null;

  function validate(index: number): string | null {
    if (index === 0 && trimmed === "") return "Informe o nome da dívida.";
    if (index === 1) return amountsProblem;
    return null;
  }

  const input: DebtInput = {
    name: trimmed,
    creditor: trimmedCreditor === "" ? null : trimmedCreditor,
    principalMinor,
    balanceMinor,
    dueOn: hasDue ? dueOn : null,
  };

  return (
    <StepSheet
      title={editing === null ? "Nova dívida" : "Editar dívida"}
      steps={STEPS}
      validate={validate}
      liveProblem={orderProblem}
      finishLabel="Salvar dívida"
      onFinish={() => onSubmit(input)}
      onDelete={onDelete}
      deleteLabel="Excluir dívida"
      onClose={onClose}
      renderStep={(step) => (
        <>
          {step === "Dívida" && (
            <div class="space-y-5">
              <div>
                <label class={LABEL} for="debt-name">
                  Nome da dívida
                </label>
                <input
                  id="debt-name"
                  name="debt-name"
                  type="text"
                  autocomplete="off"
                  maxLength={MAX_NAME}
                  placeholder="Financiamento do forno, Empréstimo…"
                  class={`${FIELD_SHEET} mt-2`}
                  value={name}
                  onInput={(event) => setName(event.currentTarget.value)}
                />
              </div>
              <div>
                <label class={LABEL} for="debt-creditor">
                  Credor (opcional)
                </label>
                <input
                  id="debt-creditor"
                  name="debt-creditor"
                  type="text"
                  autocomplete="off"
                  maxLength={MAX_NAME}
                  placeholder="Banco, fornecedor, pessoa…"
                  class={`${FIELD_SHEET} mt-2`}
                  value={creditor}
                  onInput={(event) => setCreditor(event.currentTarget.value)}
                />
              </div>
              <p class={HINT}>
                Dívidas ficam à parte: pagar uma não é despesa do mês, a menos que você lance o
                pagamento como despesa.
              </p>
            </div>
          )}

          {step === "Valores" && (
            <div class="space-y-5">
              <MoneyField
                id="debt-principal"
                label="Valor original"
                digits={principalDigits}
                onDigits={setPrincipalDigits}
              />
              <MoneyField
                id="debt-balance"
                label="Saldo atual"
                digits={balanceDigits}
                onDigits={setBalanceTyped}
                invalid={orderProblem !== null}
              />
              <p class={HINT}>
                O saldo é o que ainda falta pagar e começa igual ao valor original. Deixe vazio se a
                dívida já foi quitada.
              </p>
            </div>
          )}

          {step === "Vencimento" && (
            <div class="space-y-4">
              <Toggle
                checked={hasDue}
                onChange={setHasDue}
                label="Tem data de vencimento"
                hint="Opcional: sem data, a dívida aparece no fim da lista."
              />
              {hasDue && (
                <DateButton
                  id="debt-due"
                  label="Vencimento"
                  value={dueOn}
                  today={today}
                  onChange={setDueOn}
                />
              )}
            </div>
          )}

          {step === "Prévia" && (
            <>
              <SummaryChip
                leading={<IconTile icon="bank" color="rose" size={32} iconSize={18} />}
                title={trimmed}
                context={[
                  trimmedCreditor === "" ? null : trimmedCreditor,
                  hasDue ? `vence ${dayLabel(dueOn, today).toLocaleLowerCase("pt-BR")}` : null,
                ]
                  .filter((part) => part !== null)
                  .join(" · ")}
                trailing={brl(balanceMinor)}
              />
              <p class={HINT}>
                Saldo de {brl(balanceMinor)} sobre {brl(principalMinor)} originais. Entra nas
                dívidas totais do negócio e não muda receitas, despesas nem o resultado do mês.
              </p>
            </>
          )}
        </>
      )}
    />
  );
}
