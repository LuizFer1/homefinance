import { useState } from "preact/hooks";

export interface ResetSectionProps {
  onReset: () => void;
}

/** Comparação exata, sem `trim` nem `toUpperCase`: o ponto é a deliberação. */
const CONFIRMATION = "APAGAR";

const FIELD =
  "rounded-field mt-2 w-full bg-base-200 px-3.5 py-2.5 text-base outline-none " +
  "transition-[box-shadow,background-color] duration-150 " +
  "focus-visible:bg-base-100 focus-visible:ring-2 focus-visible:ring-error/45";

/**
 * Confirmação por digitação, não por `confirm()`.
 *
 * Duas razões, e nenhuma é estética: um diálogo nativo do navegador bloqueia a
 * thread e não é estilizável dentro do tema, e esta é a ação mais destrutiva do
 * app — a única sem desfazer, porque o log apagado não volta de lugar nenhum.
 *
 * O backup prévio e o relatório CSV chegam com a fatia de configurações. Aqui
 * entra só o caminho de volta ao primeiro uso, que esta fatia tornou necessário:
 * sem ele, concluir o wizard é um estado sem saída.
 */
export function ResetSection({ onReset }: ResetSectionProps) {
  const [typed, setTyped] = useState("");
  const armed = typed === CONFIRMATION;

  return (
    <div class="rounded-box mt-3 border border-error/25 bg-error/5 px-4 py-3.5">
      <p class="font-medium text-error">Resetar conta</p>
      <p class="mt-1 text-xs text-base-content/55">
        Apaga o perfil, os lançamentos, as categorias e as formas de pagamento deste aparelho. Nao
        ha como desfazer.
      </p>

      <label class="mt-3 block text-xs text-base-content/55" for="reset-confirm">
        Digite {CONFIRMATION} para liberar
      </label>
      <input
        id="reset-confirm"
        name="reset-confirm"
        type="text"
        autocomplete="off"
        autocapitalize="characters"
        class={FIELD}
        value={typed}
        onInput={(event) => setTyped(event.currentTarget.value)}
      />

      <button
        type="button"
        disabled={!armed}
        onClick={onReset}
        class="hf-press rounded-field mt-3 w-full bg-error px-4 py-2.5 font-medium text-error-content
          disabled:cursor-not-allowed disabled:opacity-45"
      >
        Resetar conta
      </button>
    </div>
  );
}
