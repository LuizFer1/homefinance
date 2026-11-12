import type { Book } from "../../domain/model/book";
import { Icon } from "../icons/icon";

export interface BookSwitchButtonProps {
  /** A conta em que a pessoa está agora. O botão mostra a **outra**. */
  book: Book;
  onSwitch: () => void;
}

/**
 * Troca de conta no cabeçalho da Home. Na pessoal mostra a loja (leva à comercial);
 * na comercial, a pessoa (volta à pessoal). Mesmo botão, mesmo lugar, nas duas:
 * quem trocou sem querer acha o caminho de volta onde acabou de tocar.
 *
 * 44px de alvo, bem acima dos 36px do avatar ao lado: o ícone é pequeno e o dedo
 * não.
 */
export function BookSwitchButton({ book, onSwitch }: BookSwitchButtonProps) {
  const toBusiness = book === "personal";
  return (
    <button
      type="button"
      aria-label={toBusiness ? "Ir para a conta comercial" : "Voltar para a conta pessoal"}
      onClick={onSwitch}
      class="hf-press grid size-11 shrink-0 place-items-center rounded-full text-fg/70
        hover:bg-fg/[0.07]"
    >
      <Icon name={toBusiness ? "storefront" : "user"} size={22} />
    </button>
  );
}
