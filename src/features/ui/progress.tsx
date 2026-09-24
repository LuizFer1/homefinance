import type { ComponentChildren } from "preact";

export interface ProgressProps {
  steps: readonly string[];
  current: number;
  /** Maior etapa alcançável. Bloqueia avanço enquanto a etapa 1 não é válida. */
  maxReachable: number;
  onGo: (index: number) => void;
  /** Substitui o "Próximo: …" da direita (a edição mostra quem criou). */
  aside?: ComponentChildren;
  /**
   * `detail` mostra a linha "Etapa · passo X de N"; `count` só "X de N" à
   * direita dos segmentos (onboarding).
   */
  variant?: "detail" | "count";
}

/**
 * Barra de progresso do assistente: N segmentos de 3px.
 *
 * Concluídos em `accent-700`, o atual em acento com brilho, os futuros em
 * `neutral-800`. Cada segmento é um botão com o nome da etapa: dá para voltar
 * direto a "Dados" do passo 4, e o alvo de toque tem 44px de altura mesmo com o
 * risco de 3px — a altura mora no botão, não no desenho.
 */
export function Progress({
  steps,
  current,
  maxReachable,
  onGo,
  aside,
  variant = "detail",
}: ProgressProps) {
  const total = steps.length;
  const next = steps[current + 1];

  const bar = (
    <ol aria-label="Etapas" class="flex flex-1 gap-1">
      {steps.map((label, index) => {
        const reachable = index <= maxReachable;
        const done = index < current;
        const active = index === current;

        return (
          <li key={label} class="flex flex-1">
            <button
              type="button"
              aria-label={label}
              aria-current={active ? "step" : undefined}
              disabled={!reachable}
              onClick={() => onGo(index)}
              class="-my-5 flex h-11 flex-1 cursor-pointer items-center disabled:cursor-not-allowed"
            >
              <span
                class={`h-[3px] w-full rounded-sm transition-[background-color,box-shadow]
                  duration-200 ${
                    active
                      ? "bg-accent shadow-[0_0_8px_var(--color-accent)]"
                      : done
                        ? "bg-accent-700"
                        : "bg-neutral-800"
                  }`}
              />
            </button>
          </li>
        );
      })}
    </ol>
  );

  if (variant === "count") {
    return (
      <div class="flex items-center gap-3">
        {bar}
        <span class="hf-num text-xs text-fg/60">
          {current + 1} de {total}
        </span>
      </div>
    );
  }

  return (
    <div>
      <div class="flex">{bar}</div>
      <div class="mt-3 flex items-center justify-between gap-3 text-xs text-fg/60">
        <span class="min-w-0 truncate">
          <span class="font-medium text-fg">{steps[current]}</span> · passo {current + 1} de {total}
        </span>
        <span class="flex min-w-0 shrink-0 items-center gap-1.5">
          {aside ?? (next === undefined ? "Último passo" : `Próximo: ${next}`)}
        </span>
      </div>
    </div>
  );
}
