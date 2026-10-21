import { isValidCardDay, MAX_CARD_DAY, MIN_CARD_DAY } from "../../domain/cards/card";
import { onlyDigits } from "../../domain/money/mask";
import { FIELD_SHEET, HINT, LABEL } from "../ui/field";

export interface CardFieldsValue {
  bank: string;
  /** Texto do campo: o número só existe depois de validar. */
  closingDay: string;
  dueDay: string;
}

/** Texto de dia → número, ou nulo se vazio, fora de 1–31 ou não inteiro. */
export function parseCardDay(text: string): number | null {
  const digits = onlyDigits(text);
  if (digits === "") return null;
  const day = Number(digits);
  return isValidCardDay(day) ? day : null;
}

/** Nulo se os três campos servem; senão a mensagem do primeiro que não serve. */
export function cardFieldsProblem(value: CardFieldsValue): string | null {
  if (value.bank.trim() === "") return "Informe o banco do cartão.";
  if (parseCardDay(value.closingDay) === null) {
    return `Informe o dia de fechamento, de ${MIN_CARD_DAY} a ${MAX_CARD_DAY}.`;
  }
  if (parseCardDay(value.dueDay) === null) {
    return `Informe o dia de vencimento, de ${MIN_CARD_DAY} a ${MAX_CARD_DAY}.`;
  }
  return null;
}

export function cardFieldsOf(row: {
  bank?: string | null;
  closingDay?: number | null;
  dueDay?: number | null;
}): CardFieldsValue {
  return {
    bank: row.bank ?? "",
    closingDay: row.closingDay == null ? "" : String(row.closingDay),
    dueDay: row.dueDay == null ? "" : String(row.dueDay),
  };
}

export interface CardFieldsProps {
  value: CardFieldsValue;
  onChange: (next: CardFieldsValue) => void;
  /** Prefixo dos ids, para duas instâncias na mesma tela não dividirem `for`. */
  idPrefix?: string;
}

/**
 * Banco, fechamento e vencimento: o que define a fatura de um cartão. Os dias
 * aceitam só dígitos (o `inputmode` abre o teclado numérico, e o filtro cobre
 * colar texto); 1–31 é validado por quem usa, na hora de avançar.
 */
export function CardFields({ value, onChange, idPrefix = "card" }: CardFieldsProps) {
  const day = (field: "closingDay" | "dueDay") => (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const digits = onlyDigits(input.value).slice(0, 2);
    // Regrava o campo: uma letra não muda o estado, e o Preact não re-renderiza.
    input.value = digits;
    onChange({ ...value, [field]: digits });
  };

  return (
    <>
      <label class={LABEL} for={`${idPrefix}-bank`}>
        Banco
      </label>
      <input
        id={`${idPrefix}-bank`}
        type="text"
        autocomplete="off"
        placeholder="Nubank, Itaú, Inter…"
        class={`${FIELD_SHEET} mt-2`}
        value={value.bank}
        onInput={(event) => onChange({ ...value, bank: event.currentTarget.value })}
      />

      <div class="mt-5 grid grid-cols-2 gap-3">
        <div>
          <label class={LABEL} for={`${idPrefix}-closing`}>
            Fechamento
          </label>
          <input
            id={`${idPrefix}-closing`}
            type="text"
            inputmode="numeric"
            autocomplete="off"
            placeholder="Dia"
            class={`${FIELD_SHEET} hf-num mt-2`}
            value={value.closingDay}
            onInput={day("closingDay")}
          />
        </div>
        <div>
          <label class={LABEL} for={`${idPrefix}-due`}>
            Vencimento
          </label>
          <input
            id={`${idPrefix}-due`}
            type="text"
            inputmode="numeric"
            autocomplete="off"
            placeholder="Dia"
            class={`${FIELD_SHEET} hf-num mt-2`}
            value={value.dueDay}
            onInput={day("dueDay")}
          />
        </div>
      </div>
      <p class={HINT}>
        Compra até o dia do fechamento entra na fatura que fecha neste mês; depois dele, na do mês
        seguinte. Em mês curto vale o último dia.
      </p>
    </>
  );
}
