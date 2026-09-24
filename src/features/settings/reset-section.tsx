import { useState } from "preact/hooks";
import { Icon } from "../icons/icon";
import { describeError } from "../session/session";
import { FIELD_SHEET } from "../ui/field";

export interface ResetSectionProps {
  /**
   * Resolve com o reload já pedido; rejeita se o banco não apagou. A falha
   * aparece aqui, no próprio bloco: é o único lugar da tela em que ela faz
   * sentido, e sem o catch a rejeição escaparia sem aviso nenhum.
   */
  onReset: () => Promise<void>;
}

/** Comparação exata, sem `trim` nem `toUpperCase`: o ponto é a deliberação. */
const CONFIRMATION = "APAGAR";

/**
 * Confirmação por digitação, não por `confirm()`.
 *
 * Duas razões, e nenhuma é estética: um diálogo nativo do navegador bloqueia a
 * thread e não é estilizável dentro do tema, e esta é a ação mais destrutiva do
 * app — a única sem desfazer, porque o banco apagado não volta de lugar nenhum.
 */
export function ResetSection({ onReset }: ResetSectionProps) {
  const [typed, setTyped] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const armed = typed === CONFIRMATION;

  async function handleReset() {
    setProblem(null);
    try {
      await onReset();
    } catch (cause) {
      setProblem(describeError(cause));
    }
  }

  return (
    <div class="mt-4">
      <p class="text-[15px] leading-normal text-fg/70 text-pretty">
        Apaga o perfil, os lançamentos, as categorias e as formas de pagamento deste aparelho. Não
        há como desfazer.
      </p>

      <label class="hf-label mt-5 block" for="reset-confirm">
        Digite {CONFIRMATION} para liberar
      </label>
      <input
        id="reset-confirm"
        name="reset-confirm"
        type="text"
        autocomplete="off"
        autocapitalize="characters"
        class={`${FIELD_SHEET} mt-2 focus:border-expense`}
        value={typed}
        onInput={(event) => setTyped(event.currentTarget.value)}
      />

      <button
        type="button"
        disabled={!armed}
        onClick={handleReset}
        class="hf-press mt-5 flex h-[52px] w-full items-center justify-center gap-2 rounded-lg border
          border-expense bg-expense/10 text-[15px] font-medium text-expense-fg hover:bg-expense/20
          disabled:cursor-not-allowed disabled:opacity-45"
      >
        <Icon name="warning" size={18} />
        Resetar conta
      </button>

      {problem !== null && (
        <p role="alert" class="mt-4 rounded-lg bg-expense/10 p-3 text-sm text-expense-fg">
          Não foi possível apagar os dados: {problem}
        </p>
      )}
    </div>
  );
}
