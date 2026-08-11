/**
 * As classes que definem "campo de formulário" neste app.
 *
 * Moram fora dos componentes porque o campo de data passou a ser desenhado pelo
 * app: o gatilho do calendário e o campo de valor precisam ser indistinguíveis
 * na mesma linha, e duas cópias da mesma string divergem no primeiro ajuste de
 * altura que alguém fizer num dos dois.
 */

export const LABEL =
  "hf-caption block text-[0.6875rem] font-semibold uppercase text-base-content/45";

/**
 * A caixa sem a margem de cima, para os campos que precisam de um contêiner
 * posicionado entre o rótulo e o controle.
 */
export const FIELD_BOX =
  "rounded-field w-full bg-base-200 px-3.5 py-2.5 text-base outline-none " +
  "transition-[box-shadow,background-color] duration-150 " +
  "focus-visible:bg-base-100 focus-visible:ring-2 focus-visible:ring-primary/45";

export const FIELD = `mt-1.5 ${FIELD_BOX}`;
