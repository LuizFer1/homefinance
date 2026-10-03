import type { Reserve } from "../../domain/model/reserve";
import { maskDigits, onlyDigits } from "../../domain/money/mask";
import { Icon } from "../icons/icon";
import { LABEL } from "../ui/field";

/**
 * Valor do sheet: dígitos grandes (40px) com "R$" e sublinhado de acento.
 *
 * É um `<input>` de verdade e não texto desenhado com cursor falso: o teclado
 * numérico, a seleção e o leitor de tela dependem do campo real. O caret nativo
 * ganha a cor de acento para ficar com a cara do handoff.
 */
export function AmountField({
  id,
  digits,
  onDigits,
  describedBy,
}: {
  id: string;
  digits: string;
  onDigits: (digits: string) => void;
  /** Id do aviso/erro abaixo do campo, para o leitor de tela lê-lo junto do valor. */
  describedBy?: string;
}) {
  return (
    <>
      <label for={id} class={`${LABEL} mt-[18px]`}>
        Valor
      </label>
      <div class="hf-num mt-1 flex items-baseline gap-1.5 border-b border-accent pb-2.5">
        <span class="text-xl text-fg/55">R$</span>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autocomplete="off"
          placeholder="0,00"
          aria-describedby={describedBy}
          value={maskDigits(digits)}
          onInput={(event) => onDigits(onlyDigits(event.currentTarget.value))}
          class="min-w-0 flex-1 bg-transparent text-[40px] leading-[48px] font-medium
            tracking-[-0.02em] caret-accent outline-none placeholder:text-fg/30"
        />
      </div>
    </>
  );
}

/**
 * "Na Reserva de emergência" / "Da …": o ícone é o da identidade da reserva.
 * `isEmergency` vem de quem tem o state (`actsAsEmergency`): o `kind` sozinho
 * trataria a emergência duplicada como a da casa.
 */
export function SheetSubtitle({
  reserve,
  isEmergency,
  prefix,
}: {
  reserve: Reserve;
  isEmergency: boolean;
  prefix: "Na" | "Da";
}) {
  const icon = isEmergency ? "lifebuoy" : reserve.icon;
  return (
    <p class="mt-0.5 flex items-center gap-1.5 text-[13px] text-fg/60">
      <Icon name={icon} size={14} class="text-accent-300" />
      {prefix} {reserve.name}
    </p>
  );
}
