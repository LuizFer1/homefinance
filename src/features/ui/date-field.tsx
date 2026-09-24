import { useEffect, useRef, useState } from "preact/hooks";
import { monthGrid, shiftDay, shiftMonth, WEEKDAYS } from "../../domain/dates/calendar";
import { monthLabelLong, monthOf, shortDate } from "../../domain/projections/periods";
import { Icon } from "../icons/icon";
import { chipClass } from "./chip";
import { LABEL } from "./field";

/** O que o leitor de tela anuncia na célula: "10 de agosto de 2026". */
function fullLabel(date: string): string {
  return `${Number(date.slice(8, 10))} de ${monthLabelLong(date)}`;
}

/** "Ter, 22 set" — a data escolhida no lugar do chip "Outra data". */
export function chipDate(date: string, today: string): string {
  const text = shortDate(date, today);
  return text.charAt(0).toLocaleUpperCase("pt-BR") + text.slice(1);
}

export interface CalendarProps {
  /** ISO 'YYYY-MM-DD'. */
  value: string;
  today: string;
  onChange: (date: string) => void;
  /** Esc dentro da grade. O `<dialog>` fecharia o sheet inteiro sem isto. */
  onDismiss: () => void;
}

/**
 * Calendário desenhado pelo app, embutido no sheet.
 *
 * O popup do `<input type="date">` é desenhado pelo navegador, fora do DOM:
 * nenhum seletor o alcança. E embutido (empurrando o formulário) em vez de
 * flutuar, porque o conteúdo do sheet rola e recortaria um popover absoluto.
 *
 * Handoff: fundo `bg`, células 36×36 raio 8; hoje com contorno `neutral-700`;
 * selecionado com fundo `accent-900`, contorno de acento e texto `accent-200`.
 */
export function Calendar({ value, today, onChange, onDismiss }: CalendarProps) {
  const [visible, setVisible] = useState(() => monthOf(value));
  /** Dia sob o foco do teclado. Nem sempre é o escolhido: setas andam sem escolher. */
  const [cursor, setCursor] = useState(value);
  const [keyboard, setKeyboard] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  /*
    Mover o foco é o que faz as setas existirem para quem não enxerga a tela.
    Só depois de uma seta: focar no mount roubaria o foco de quem abriu com o
    dedo e faria o teclado virtual sumir e voltar.
  */
  useEffect(() => {
    if (!keyboard) return;
    gridRef.current?.querySelector<HTMLButtonElement>('[data-cursor="true"]')?.focus();
  }, [cursor, keyboard]);

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
      setKeyboard(true);
      setCursor(next);
      setVisible(monthOf(next));
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onDismiss();
    }
  }

  const label = monthLabelLong(visible);

  return (
    <div class="hf-disclose rounded-lg bg-bg p-3">
      <div class="flex items-center gap-1">
        {/* `aria-live`: trocar de mês pelas setas não move o foco. */}
        <span aria-live="polite" class="flex-1 pl-1 text-[15px] font-medium">
          {label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1)}
        </span>
        <button
          type="button"
          aria-label="Mês anterior"
          onClick={() => setVisible(shiftMonth(visible, -1))}
          class="hf-press grid size-8 place-items-center rounded-lg text-fg/70 hover:bg-fg/[0.07]"
        >
          <Icon name="caret-left" size={16} />
        </button>
        <button
          type="button"
          aria-label="Próximo mês"
          onClick={() => setVisible(shiftMonth(visible, 1))}
          class="hf-press grid size-8 place-items-center rounded-lg text-fg/70 hover:bg-fg/[0.07]"
        >
          <Icon name="caret-right" size={16} />
        </button>
      </div>

      {/* biome-ignore lint/a11y/noStaticElementInteractions: a grade delega o
          teclado às células, que são botões — ver `handleKey`. */}
      <div
        ref={gridRef}
        onKeyDown={handleKey}
        class="mt-2 grid grid-cols-7 justify-items-center gap-y-0.5"
      >
        {WEEKDAYS.map((initial, index) => (
          <span key={`${initial}-${index}`} aria-hidden="true" class="pb-1 text-[11px] text-fg/50">
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
              onClick={() => onChange(cell.date)}
              class={`hf-press hf-num grid size-9 place-items-center rounded-lg text-sm ${
                selected
                  ? "bg-accent-900 font-medium text-accent-200 shadow-[inset_0_0_0_1px_var(--color-accent)]"
                  : `hover:bg-fg/[0.07] ${cell.inMonth ? "text-fg/90" : "text-fg/25"} ${
                      isToday ? "shadow-[inset_0_0_0_1px_var(--color-neutral-700)]" : ""
                    }`
              }`}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface DateChipsProps {
  value: string;
  today: string;
  onChange: (date: string) => void;
  /** Avisa o assistente para encolher valor e descrição enquanto o calendário abre. */
  onCalendarToggle?: (open: boolean) => void;
}

/**
 * Data como atalhos: **Hoje** (padrão), **Ontem** e **Outra data**.
 *
 * Quase todo lançamento é de hoje ou de ontem; o calendário é a exceção, e
 * abri-lo para os dois casos comuns era um toque a mais em todo lançamento.
 * Escolhida outra data, o terceiro chip passa a mostrá-la ("Ter, 22 set").
 */
export function DateChips({ value, today, onChange, onCalendarToggle }: DateChipsProps) {
  const [open, setOpen] = useState(false);
  const yesterday = shiftDay(today, -1);
  const other = value !== today && value !== yesterday;

  function setCalendar(next: boolean) {
    setOpen(next);
    onCalendarToggle?.(next);
  }

  return (
    <div>
      <span class={LABEL} id="date-label">
        Data
      </span>
      {/* biome-ignore lint/a11y/useSemanticElements: fieldset quebraria o flex dos chips no Safari */}
      <div role="group" aria-labelledby="date-label" class="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={value === today}
          class={chipClass(value === today)}
          onClick={() => {
            onChange(today);
            setCalendar(false);
          }}
        >
          Hoje
        </button>
        <button
          type="button"
          aria-pressed={value === yesterday}
          class={chipClass(value === yesterday)}
          onClick={() => {
            onChange(yesterday);
            setCalendar(false);
          }}
        >
          Ontem
        </button>
        <button
          type="button"
          aria-pressed={other}
          aria-expanded={open}
          class={chipClass(other || open)}
          onClick={() => setCalendar(!open)}
        >
          <Icon name={other ? "calendar-check" : "calendar-blank"} size={16} />
          {other ? chipDate(value, today) : "Outra data"}
        </button>
      </div>

      {open && (
        <div class="mt-3">
          <Calendar
            value={value}
            today={today}
            onChange={(date) => {
              onChange(date);
              setCalendar(false);
            }}
            onDismiss={() => setCalendar(false)}
          />
        </div>
      )}
    </div>
  );
}

export interface DateButtonProps {
  id: string;
  label: string;
  value: string;
  today: string;
  onChange: (date: string) => void;
}

/** Campo de data avulso (fim da recorrência): gatilho de 48px + calendário. */
export function DateButton({ id, label, value, today, onChange }: DateButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <label class={LABEL} for={id}>
        {label}
      </label>
      <button
        type="button"
        id={id}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        class={`hf-press mt-2 flex h-12 w-full items-center gap-2.5 rounded-lg border bg-bg px-3.5
          text-left text-base ${open ? "border-accent" : "border-divider"}`}
      >
        <Icon name="calendar-blank" size={18} class="text-fg/55" />
        <span class="hf-num flex-1 truncate">{chipDate(value, today)}</span>
        <Icon name="caret-down" size={16} class="text-fg/45" />
      </button>
      {open && (
        <div class="mt-2">
          <Calendar
            value={value}
            today={today}
            onChange={(date) => {
              onChange(date);
              setOpen(false);
            }}
            onDismiss={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
