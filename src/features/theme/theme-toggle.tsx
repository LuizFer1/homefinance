import { useLayoutEffect, useState } from "preact/hooks";
import {
  applyPreference,
  readPreference,
  syncThemeColor,
  type ThemePreference,
  type ThemeStorage,
  writePreference,
} from "./theme";

export interface ThemeToggleProps {
  storage: ThemeStorage;
  doc: Document;
}

/**
 * Três estados, não dois.
 *
 * Um botão de duas posições obriga quem nunca mexeu nisso a ficar preso a um
 * tema fixo: no momento em que ele grava "claro", o app para de acompanhar o
 * sistema para sempre. 'Sistema' é o padrão e precisa ser um destino de volta.
 */
const OPTIONS = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
  { value: "system", label: "Sistema" },
] as const satisfies ReadonlyArray<{ value: ThemePreference; label: string }>;

const SEGMENT =
  "hf-press hf-tap rounded-selector flex h-8 w-11 cursor-pointer items-center justify-center " +
  "transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/45";

const ICON = {
  viewBox: "0 0 16 16",
  class: "size-4",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": 1.5,
  "stroke-linecap": "round",
} as const;

function Icon({ preference }: { preference: ThemePreference }) {
  if (preference === "light") {
    return (
      <svg {...ICON} aria-hidden="true">
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1v1.5M8 13.5V15M15 8h-1.5M2.5 8H1M12.95 3.05l-1.06 1.06M4.11 11.89l-1.06 1.06M12.95 12.95l-1.06-1.06M4.11 4.11L3.05 3.05" />
      </svg>
    );
  }

  if (preference === "dark") {
    return (
      <svg {...ICON} aria-hidden="true">
        <path d="M13.5 9.7A5.8 5.8 0 0 1 6.3 2.5a5.8 5.8 0 1 0 7.2 7.2Z" />
      </svg>
    );
  }

  // 'Sistema': metade clara, metade escura — o icone diz que a decisao e de fora.
  return (
    <svg {...ICON} aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 2.5a5.5 5.5 0 0 1 0 11Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ThemeToggle({ storage, doc }: ThemeToggleProps) {
  const [preference, setPreference] = useState<ThemePreference>(() => readPreference(storage));

  /*
   * `useLayoutEffect` e não `useEffect`: aplicar depois do paint deixaria um
   * quadro com o tema antigo, que num app inteiro é um flash de tela branca.
   * Aplicar aqui (e não no clique) também cobre o primeiro render, caso o
   * script inline do index.html não tenha rodado.
   */
  useLayoutEffect(() => {
    applyPreference(doc.documentElement, preference);
    syncThemeColor(doc, preference === "system" ? null : preference);
  }, [doc, preference]);

  function choose(next: ThemePreference) {
    setPreference(next);
    writePreference(storage, next);
  }

  return (
    <fieldset class="rounded-field flex gap-0.5 bg-base-200/70 p-0.5">
      <legend class="sr-only">Tema</legend>
      {OPTIONS.map(({ value, label }) => (
        <label
          key={value}
          class={`${SEGMENT} ${
            preference === value
              ? "bg-base-100 text-base-content shadow-sm"
              : "text-base-content/40"
          }`}
        >
          <input
            type="radio"
            name="theme"
            value={value}
            checked={preference === value}
            onChange={() => choose(value)}
            class="sr-only"
          />
          <Icon preference={value} />
          <span class="sr-only">{label}</span>
        </label>
      ))}
    </fieldset>
  );
}
