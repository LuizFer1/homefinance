export interface StepIndicatorProps {
  steps: readonly string[];
  current: number;
  /** Maior etapa alcançável. Bloqueia avanço enquanto a etapa 1 não é válida. */
  maxReachable: number;
  onGo: (index: number) => void;
}

const DOT = "hf-press flex flex-col items-center gap-1.5 text-[0.6875rem] font-medium";

export function StepIndicator({ steps, current, maxReachable, onGo }: StepIndicatorProps) {
  return (
    <ol aria-label="Etapas" class="flex items-start justify-between gap-2 px-1">
      {steps.map((label, index) => {
        const done = index < current;
        const active = index === current;
        const reachable = index <= maxReachable;

        return (
          <li key={label} class="flex flex-1 flex-col items-center">
            <button
              type="button"
              disabled={!reachable}
              aria-current={active ? "step" : undefined}
              onClick={() => onGo(index)}
              class={`${DOT} ${reachable ? "cursor-pointer" : "cursor-not-allowed opacity-40"}`}
            >
              <span
                aria-hidden="true"
                class={`flex size-7 items-center justify-center rounded-full text-xs transition-colors duration-150 ${
                  active
                    ? "bg-primary text-primary-content"
                    : done
                      ? "bg-primary/15 text-primary"
                      : "bg-base-200 text-base-content/45"
                }`}
              >
                {index + 1}
              </span>
              <span class={active ? "text-base-content" : "text-base-content/45"}>{label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
