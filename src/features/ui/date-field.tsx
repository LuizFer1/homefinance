import { useEffect, useRef, useState } from "preact/hooks";
import { monthGrid, shiftDay, shiftMonth, WEEKDAYS } from "../../domain/dates/calendar";
import { dayLabel, monthLabelLong, monthOf } from "../../domain/projections/periods";
import { Icon } from "../icons/icon";
import { FIELD_BOX, LABEL } from "./field";

export interface DateFieldProps {
  id: string;
  label: string;
  /** ISO 'YYYY-MM-DD'. Nunca nulo — lançamento sempre tem data. */
  value: string;
  today: string;
  onChange: (date: string) => void;
}

/** 'YYYY-MM-DD' para '10/08/2026', sem `Date` — ver o topo de `periods.ts`. */
function formatBR(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

/** O que o leitor de tela anuncia na célula: "10 de agosto de 2026". */
function fullLabel(date: string): string {
  return `${Number(date.slice(8, 10))} de ${monthLabelLong(date)}`;
}

const NAV =
  "hf-press flex size-8 items-center justify-center rounded-full text-base-content/55 " +
  "transition-colors duration-150 hover:bg-base-300 hover:text-base-content " +
  "focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:outline-none";

const DAY =
  "hf-press hf-num mx-auto flex size-9 items-center justify-center rounded-full text-sm " +
  "transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-primary/45 " +
  "focus-visible:outline-none";

/**
 * Calendário desenhado pelo app, e não o popup do navegador.
 *
 * O popup do `<input type="date">` é desenhado pelo processo do navegador, fora
 * do DOM: nenhum seletor CSS o alcança, e o azul da seleção é o accent do Chrome,
 * que `accent-color` também não atinge. Ou o calendário é nosso, ou ele nunca vai
 * ter a cara do app.
 *
 * Abre **embutido**, empurrando o formulário para baixo, e não flutuando. O
 * conteúdo do modal é um contêiner com `overflow-y-auto`, que recortaria um
 * popover absoluto pela borda de baixo — e no celular a folha embutida é melhor
 * de alcançar com o polegar do que uma camada sobreposta.
 */
export function DateField({ id, label, value, today, onChange }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(() => monthOf(value));
  /** Dia sob o foco do teclado. Nem sempre é o escolhido: setas andam sem escolher. */
  const [cursor, setCursor] = useState(value);
  const gridRef = useRef<HTMLDivElement>(null);

  // Reabrir sempre no mês do valor. Guardar o mês em que o usuário parou de
  // navegar faria o calendário reabrir longe da data que ele acabou de escolher.
  function toggle() {
    if (!open) {
      setVisible(monthOf(value));
      setCursor(value);
    }
    setOpen(!open);
  }

  /*
    Mover o foco é o que faz as setas existirem para quem não enxerga a tela:
    sem isso o estado muda e o leitor não anuncia nada. Só uma célula fica no
    caminho do Tab — 42 paradas seriam uma armadilha de teclado.
  */
  useEffect(() => {
    if (!open) return;
    gridRef.current?.querySelector<HTMLButtonElement>('[data-cursor="true"]')?.focus();
  }, [open, cursor]);

  function choose(date: string) {
    onChange(date);
    setOpen(false);
  }

  function handleKey(event: KeyboardEvent) {
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    const step = steps[event.key];

    if (step !== undefined) {
      event.preventDefault();
      const next = shiftDay(cursor, step);
      setCursor(next);
      setVisible(monthOf(next));
      return;
    }

    // O modal é um `<dialog>` nativo: sem parar o Esc aqui, ele fecharia o
    // lançamento inteiro em vez de só o calendário.
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <>
      <div>
        <label class={LABEL} for={id}>
          {label}
        </label>
        <button
          type="button"
          id={id}
          onClick={toggle}
          aria-expanded={open}
          class={`${FIELD_BOX} mt-1.5 flex items-center gap-2 ${
            open ? "bg-base-100 ring-2 ring-primary/45" : ""
          }`}
        >
          <Icon name="calendar" size={16} class="shrink-0 text-base-content/45" />
          <span class="hf-num flex-1 truncate text-left">{formatBR(value)}</span>
          <Icon
            name="chevron-down"
            size={14}
            class={`shrink-0 text-base-content/35 transition-transform duration-150 ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
        <p class="mt-1.5 truncate text-xs text-base-content/45">{dayLabel(value, today)}</p>
      </div>

      {open && (
        // Entrada a partir do topo (gatilho): `hf-disclose` ancora scale/fade no
        // botao. So entrada — desmontar no fechar e barato o bastante para um
        // disclosure embutido; animar saida exigiria manter o no vivo a toa.
        <div
          class="hf-disclose rounded-box col-span-2 mt-1 border border-base-content/10
            bg-base-100 p-3 shadow-lg shadow-black/5"
        >
          <div class="flex items-center gap-1">
            {/* `aria-live`: trocar de mês pelas setas não move o foco, então sem
                isto a navegação seria silenciosa para o leitor de tela. */}
            <span aria-live="polite" class="flex-1 text-sm font-semibold first-letter:uppercase">
              {monthLabelLong(visible)}
            </span>
            <button
              type="button"
              aria-label="Mês anterior"
              onClick={() => setVisible(shiftMonth(visible, -1))}
              class={NAV}
            >
              {/* O mesmo chevron do gatilho, girado: um segundo desenho de seta
                  na mesma tela seria duas gramaticas para a mesma ideia. */}
              <Icon name="chevron-down" size={16} class="rotate-90" />
            </button>
            <button
              type="button"
              aria-label="Próximo mês"
              onClick={() => setVisible(shiftMonth(visible, 1))}
              class={NAV}
            >
              <Icon name="chevron-down" size={16} class="-rotate-90" />
            </button>
          </div>

          {/*
            `key={visible}` remonta a grade ao trocar de mês e re-dispara a
            entrada: as células não só mudam de número no lugar.
          */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: a grade delega o
              teclado às células, que são botões — ver `handleKey`. */}
          <div
            key={visible}
            ref={gridRef}
            onKeyDown={handleKey}
            class="hf-disclose mt-2 grid grid-cols-7 motion-reduce:animate-none"
          >
            {WEEKDAYS.map((initial, index) => (
              <span
                key={`${initial}-${index}`}
                aria-hidden="true"
                class="hf-caption pb-1.5 text-center text-[0.625rem] font-semibold uppercase
                  text-base-content/35"
              >
                {initial}
              </span>
            ))}

            {monthGrid(visible).map((cell) => {
              const selected = cell.date === value;
              const isToday = cell.date === today;

              return (
                <button
                  key={cell.date}
                  type="button"
                  data-cursor={cell.date === cursor ? "true" : undefined}
                  tabIndex={cell.date === cursor ? 0 : -1}
                  aria-label={fullLabel(cell.date)}
                  aria-current={isToday ? "date" : undefined}
                  aria-pressed={selected}
                  onClick={() => choose(cell.date)}
                  class={`${DAY} ${
                    selected
                      ? "bg-primary font-semibold text-primary-content"
                      : `hover:bg-base-300 ${
                          cell.inMonth ? "text-base-content/85" : "text-base-content/25"
                        }`
                  } ${isToday && !selected ? "ring-1 ring-primary/45" : ""}`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          <div class="mt-2 flex items-center justify-between border-t border-base-content/10 pt-2">
            <button
              type="button"
              onClick={() => choose(today)}
              class="hf-press rounded-field px-3 py-1.5 text-sm font-medium text-primary
                transition-colors duration-150 hover:bg-base-300"
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              class="hf-press rounded-field bg-base-300 px-4 py-1.5 text-sm font-medium
                text-base-content/80 transition-colors duration-150 hover:bg-base-content/20"
            >
              Pronto
            </button>
          </div>
        </div>
      )}
    </>
  );
}
