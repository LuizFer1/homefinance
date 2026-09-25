import { useMemo, useState } from "preact/hooks";
import type { Ulid } from "../../domain/ids/ulid";
import { groupLines } from "../../domain/import/lines";
import { type DocumentKind, detectReferenceMonth, parseStatement } from "../../domain/import/parse";
import {
  type ImportContext,
  identify,
  planImport,
  type ReviewedEntry,
} from "../../domain/import/plan";
import { buildCategoryIndex, suggestCategory } from "../../domain/import/suggest-category";
import type { AppState } from "../../domain/model/app-state";
import { listCategoriesFor, listPaymentMethods } from "../../domain/projections/selectors";
import { Icon } from "../icons/icon";
import { describeError } from "../session/session";
import { Button, SECONDARY } from "../ui/button";
import { RadioChip } from "../ui/chip";
import { FIELD_SHEET, HINT, LABEL } from "../ui/field";
import { signedBRL } from "../ui/money";
import { Segmented } from "../ui/segmented";
import { PdfPasswordError, PdfReaderUnavailableError, type ReadPdf } from "./read-pdf";
import type { ImportResult } from "./store";

export interface ImportSheetProps {
  state: AppState;
  /** 'YYYY-MM-DD', injetado como no resto do app. */
  today: string;
  readPdf: ReadPdf;
  onImport: (plan: ReturnType<typeof planImport>) => Promise<ImportResult>;
  onClose: () => void;
}

interface Row extends ReviewedEntry {
  /** Id já está no banco (importado antes, ou apagado depois): não entra de novo. */
  existing: boolean;
}

type Step =
  | { step: "choose" }
  | { step: "reading" }
  | { step: "password"; file: Blob; wrong: boolean }
  | { step: "review" }
  | { step: "done"; result: ImportResult };

const DOC_OPTIONS = [
  { value: "card", label: "Fatura de cartão", icon: "credit-card" },
  { value: "account", label: "Extrato", icon: "bank" },
] as const;

function shortDate(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(2, 4)}`;
}

/** O pdf.js desce sob demanda, e o `import()` falha por dois motivos distintos. */
function readError(cause: unknown): string {
  if (cause instanceof PdfReaderUnavailableError) {
    return cause.offline
      ? "O leitor de PDF ainda não foi baixado. Conecte-se à internet uma vez e tente de novo."
      : "O app foi atualizado e esta tela ainda é da versão anterior. Toque em “Atualizar” no aviso do início, ou feche e abra o app.";
  }
  return `Não foi possível ler o PDF: ${describeError(cause)}`;
}

/**
 * Importar fatura ou extrato: escolher o tipo e a forma de pagamento, ler o
 * PDF, revisar linha a linha e gravar.
 *
 * A revisão não é opcional. O parser é genérico e erra; é a revisão que
 * transforma "o que o parser achou" em "o que o usuário confirmou".
 */
export function ImportSheet({ state, today, readPdf, onImport, onClose }: ImportSheetProps) {
  const methods = listPaymentMethods(state);
  const cards = methods.filter((method) => method.kind === "credit");

  const [doc, setDoc] = useState<DocumentKind>("card");
  const [methodId, setMethodId] = useState<Ulid | null>(cards[0]?.id ?? null);
  const [phase, setPhase] = useState<Step>({ step: "choose" });
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [referenceMonth, setReferenceMonth] = useState(today.slice(0, 7));
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);

  const categoryIndex = useMemo(() => buildCategoryIndex(state), [state]);
  const needsCard = doc === "card" && methodId === null;

  function buildRows(source: string[], month: string): Row[] {
    const entries = parseStatement(source, doc, month);
    const ctx: ImportContext = { paymentMethodId: methodId, referenceMonth: month };
    const ids = identify(entries, ctx);
    return entries.map((entry, index) => {
      const id = ids[index] ?? "";
      const existing = state.transactions[id] !== undefined || state.recurrences[id] !== undefined;
      return {
        ...entry,
        categoryId: suggestCategory(categoryIndex, entry.rawDescription, entry.kind),
        selected: entry.selected && !existing,
        note: existing ? "Já importado" : entry.note,
        existing,
      };
    });
  }

  function chooseDoc(next: DocumentKind) {
    setDoc(next);
    // Fatura exige cartão; no extrato, a forma é opcional e começa vazia.
    setMethodId(next === "card" ? (cards[0]?.id ?? null) : null);
  }

  async function read(file: Blob, password?: string) {
    setError(null);
    setPhase({ step: "reading" });
    try {
      const found = groupLines(await readPdf(file, password));
      if (found.length === 0) {
        setError("Este PDF não tem texto — parece escaneado. Use o PDF baixado do banco.");
        setPhase({ step: "choose" });
        return;
      }
      const fallback = today.slice(0, 7);
      const month = doc === "card" ? detectReferenceMonth(found, fallback) : fallback;
      const built = buildRows(found, month);
      if (built.length === 0) {
        setError("Nenhum lançamento reconhecido neste PDF.");
        setPhase({ step: "choose" });
        return;
      }
      setLines(found);
      setReferenceMonth(month);
      setRows(built);
      setPhase({ step: "review" });
    } catch (cause) {
      if (cause instanceof PdfPasswordError) {
        setPhase({ step: "password", file, wrong: cause.wrong });
        return;
      }
      setError(readError(cause));
      setPhase({ step: "choose" });
    }
  }

  function changeMonth(month: string) {
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    setReferenceMonth(month);
    // O ano de cada linha e a âncora das parcelas dependem do mês: reparseia.
    setRows(buildRows(lines, month));
  }

  function patch(index: number, changes: Partial<Row>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...changes } : row)));
  }

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      const plan = planImport(rows, { paymentMethodId: methodId, referenceMonth });
      const result = await onImport(plan);
      setPhase({ step: "done", result });
    } catch (cause) {
      setError(`Não foi possível gravar: ${describeError(cause)}`);
    } finally {
      setSaving(false);
    }
  }

  const alert =
    error === null ? null : (
      <p role="alert" class="mt-4 rounded-lg bg-expense/10 p-3 text-sm text-expense-fg">
        {error}
      </p>
    );

  if (phase.step === "reading") {
    return (
      <p class="py-10 text-center text-fg/65" role="status">
        Lendo o PDF...
      </p>
    );
  }

  if (phase.step === "password") {
    const file = phase.file;
    return (
      <form
        class="mt-2 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const input = event.currentTarget.elements.namedItem("pdf-password");
          void read(file, input instanceof HTMLInputElement ? input.value : "");
        }}
      >
        <div>
          <label class={LABEL} for="pdf-password">
            Senha do PDF
          </label>
          <input id="pdf-password" type="password" class={`${FIELD_SHEET} mt-2`} />
          <p class={HINT}>
            {phase.wrong
              ? "Senha incorreta. Tente de novo."
              : "Muitos bancos protegem a fatura com parte do CPF. A senha não é guardada."}
          </p>
        </div>
        <div class="flex gap-2">
          <Button variant="secondary" onClick={() => setPhase({ step: "choose" })}>
            Voltar
          </Button>
          <Button type="submit" icon="lock-simple" class="flex-1">
            Abrir
          </Button>
        </div>
      </form>
    );
  }

  if (phase.step === "done") {
    const { transactions, series } = phase.result;
    return (
      <div class="py-6 text-center">
        <p class="text-lg font-medium" role="status">
          {transactions === 0
            ? "Nada novo para importar"
            : `${transactions} ${transactions === 1 ? "lançamento importado" : "lançamentos importados"}`}
        </p>
        {series > 0 && (
          <p class={HINT}>
            {series} {series === 1 ? "parcelamento virou série" : "parcelamentos viraram séries"}:
            as próximas parcelas aparecem nos meses seguintes.
          </p>
        )}
        <Button class="mt-6 w-full" icon="check" onClick={onClose}>
          Fechar
        </Button>
      </div>
    );
  }

  if (phase.step === "review") {
    const selected = rows.filter((row) => row.selected).length;
    return (
      <div class="mt-2">
        {doc === "card" && (
          <div>
            <label class={LABEL} for="import-month">
              Mês da fatura (vencimento)
            </label>
            <input
              id="import-month"
              type="month"
              class={`${FIELD_SHEET} mt-2`}
              value={referenceMonth}
              onChange={(event) => changeMonth(event.currentTarget.value)}
            />
            <p class={HINT}>Define o ano das compras. Mudar refaz a leitura.</p>
          </div>
        )}

        <ul class="mt-4 divide-y divide-divider" aria-label="Lançamentos encontrados">
          {rows.map((row, index) => {
            const categories = listCategoriesFor(state, row.kind);
            const minor = row.kind === "income" ? row.amountMinor : -row.amountMinor;
            return (
              <li
                key={`${index}-${row.rawDescription}`}
                class={`py-3 ${row.selected ? "" : "opacity-55"}`}
              >
                <div class="flex items-center gap-3">
                  <input
                    type="checkbox"
                    aria-label={`Importar ${row.description}`}
                    checked={row.selected}
                    disabled={row.existing}
                    onChange={(event) => patch(index, { selected: event.currentTarget.checked })}
                    class="size-5 shrink-0 accent-[var(--color-accent)]"
                  />
                  <span class="hf-num w-[4.25rem] shrink-0 text-[13px] text-fg/60">
                    {shortDate(row.date)}
                  </span>
                  <input
                    type="text"
                    aria-label="Descrição"
                    value={row.description}
                    disabled={row.existing}
                    onInput={(event) => patch(index, { description: event.currentTarget.value })}
                    class="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5
                      py-1 text-[15px] text-fg outline-none focus:border-accent"
                  />
                  <span
                    class={`hf-num shrink-0 text-sm font-medium ${
                      row.kind === "income" ? "text-income-fg" : "text-expense-fg"
                    }`}
                  >
                    {signedBRL(minor, "always")}
                  </span>
                </div>
                <div class="mt-2 flex flex-wrap items-center gap-2 pl-8">
                  <select
                    aria-label={`Categoria de ${row.description}`}
                    value={row.categoryId ?? ""}
                    disabled={row.existing}
                    onChange={(event) =>
                      patch(index, { categoryId: event.currentTarget.value || null })
                    }
                    class="h-8 max-w-[11rem] rounded-md border border-divider bg-bg px-2 text-[13px]
                      text-fg"
                  >
                    <option value="">Sem categoria</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  {row.installment !== null && (
                    <span class="inline-flex items-center gap-1 rounded-md bg-accent-900 px-2 py-1 text-xs text-accent-200">
                      <Icon name="repeat" size={12} />
                      {row.installment.k}/{row.installment.n}
                    </span>
                  )}
                  {row.note !== null && <span class="text-xs text-fg/55">{row.note}</span>}
                </div>
              </li>
            );
          })}
        </ul>

        {rows.some((row) => row.installment !== null && row.selected) && (
          <p class={HINT}>
            Parcelas viram uma série mensal: as já vencidas entram agora, as próximas nos meses
            seguintes, e a fatura do mês que vem não as duplica.
          </p>
        )}

        {alert}

        <div class="sticky bottom-0 mt-4 flex gap-2 bg-surface pt-2">
          <Button variant="secondary" onClick={() => setPhase({ step: "choose" })}>
            Voltar
          </Button>
          <Button
            icon="check"
            class="flex-1"
            disabled={selected === 0 || saving}
            onClick={() => void confirm()}
          >
            {saving ? "Importando..." : `Importar ${selected}`}
          </Button>
        </div>
      </div>
    );
  }

  const offered = doc === "card" ? cards : methods;
  return (
    <div class="mt-2 space-y-5">
      <Segmented
        name="import-doc"
        legend="Tipo de documento"
        variant="pill"
        options={DOC_OPTIONS}
        value={doc}
        onChange={chooseDoc}
      />

      <div>
        <p class={LABEL}>{doc === "card" ? "Cartão" : "Forma de pagamento (opcional)"}</p>
        {offered.length === 0 && doc === "card" ? (
          <p class={HINT}>
            Cadastre um cartão de crédito em Ajustes → Formas de pagamento para importar faturas.
          </p>
        ) : (
          <div class="mt-2 flex flex-wrap gap-2">
            {doc === "account" && (
              <RadioChip
                name="import-method"
                value=""
                checked={methodId === null}
                onSelect={() => setMethodId(null)}
              >
                Nenhuma
              </RadioChip>
            )}
            {offered.map((method) => (
              <RadioChip
                key={method.id}
                name="import-method"
                value={method.id}
                checked={methodId === method.id}
                onSelect={() => setMethodId(method.id)}
              >
                {method.name}
              </RadioChip>
            ))}
          </div>
        )}
      </div>

      <div>
        <label
          class={`${SECONDARY} w-full cursor-pointer has-[:focus-visible]:outline-2
            has-[:focus-visible]:outline-accent ${needsCard ? "pointer-events-none opacity-45" : ""}`}
        >
          <Icon name="file-pdf" size={18} />
          Escolher PDF
          <input
            type="file"
            accept="application/pdf,.pdf"
            aria-label="Escolher PDF"
            disabled={needsCard}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file !== undefined) void read(file);
            }}
            class="sr-only"
          />
        </label>
        <p class={HINT}>
          Use o PDF baixado do app ou do site do banco. O arquivo é lido aqui no aparelho e não sai
          dele. Você revisa tudo antes de salvar.
        </p>
      </div>

      {alert}
    </div>
  );
}
