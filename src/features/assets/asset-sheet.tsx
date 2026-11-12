import { useState } from "preact/hooks";
import { isPositiveMinor, MAX_NAME } from "../../domain/business/rules";
import { ASSET_KINDS, type Asset, type AssetKind } from "../../domain/model/asset";
import { minorOf } from "../../domain/money/mask";
import { dayLabel } from "../../domain/projections/periods";
import { MoneyField } from "../business/fields";
import { assetKindMeta, isAssetKind } from "../business/kinds";
import { StepSheet } from "../business/step-sheet";
import { DateChips } from "../ui/date-field";
import { FIELD_SHEET, HINT, LABEL } from "../ui/field";
import { brl } from "../ui/money";
import { Segmented } from "../ui/segmented";
import { SummaryChip } from "../ui/summary-chip";
import { IconTile } from "../ui/tile";
import type { AssetInput } from "./store";

const STEPS = ["Nome", "Tipo e valor", "Data", "Prévia"] as const;

export interface AssetSheetProps {
  /** Bem em edição, ou nulo para um novo. */
  editing: Asset | null;
  today: string;
  /** Grava; rejeitar mantém o sheet aberto com o motivo. */
  onSubmit: (input: AssetInput) => Promise<unknown>;
  /** Só na edição. */
  onDelete?: () => Promise<unknown>;
  onClose: () => void;
}

const KIND_OPTIONS = ASSET_KINDS.map((kind) => ({
  value: kind,
  label: assetKindMeta(kind).label,
  icon: assetKindMeta(kind).icon,
}));

/**
 * Cadastro e edição de um bem do negócio em quatro etapas: nome, tipo e valor, data
 * e a prévia do que será salvo. A edição reaproveita o mesmo sheet, com a lixeira
 * que exige segurar.
 */
export function AssetSheet({ editing, today, onSubmit, onDelete, onClose }: AssetSheetProps) {
  const [name, setName] = useState(editing?.name ?? "");
  // Tipo gravado por uma versão futura não existe nas opções: cai no primeiro em vez
  // de deixar o campo sem seleção.
  const [kind, setKind] = useState<AssetKind>(
    editing !== null && isAssetKind(editing.kind) ? editing.kind : (ASSET_KINDS[0] ?? "investment"),
  );
  const [digits, setDigits] = useState(editing === null ? "" : String(editing.valueMinor));
  const [acquiredOn, setAcquiredOn] = useState(editing?.acquiredOn ?? today);

  const trimmed = name.trim();
  const valueMinor = minorOf(digits);
  const meta = assetKindMeta(kind);

  function validate(index: number): string | null {
    if (index === 0 && trimmed === "") return "Informe o nome do bem.";
    if (index === 1 && !isPositiveMinor(valueMinor)) return "Informe o valor do bem.";
    return null;
  }

  return (
    <StepSheet
      title={editing === null ? "Novo bem" : "Editar bem"}
      steps={STEPS}
      validate={validate}
      finishLabel="Salvar bem"
      onFinish={() => onSubmit({ kind, name: trimmed, valueMinor, acquiredOn })}
      onDelete={onDelete}
      deleteLabel="Excluir bem"
      onClose={onClose}
      renderStep={(step) => (
        <>
          {step === "Nome" && (
            <>
              <label class={LABEL} for="asset-name">
                Nome do bem
              </label>
              <input
                id="asset-name"
                name="asset-name"
                type="text"
                autocomplete="off"
                maxLength={MAX_NAME}
                placeholder="Forno industrial, Farinha, CDB…"
                class={`${FIELD_SHEET} mt-2`}
                value={name}
                onInput={(event) => setName(event.currentTarget.value)}
              />
              <p class={HINT}>
                Bens são o que o negócio tem: dinheiro aplicado, mercadoria parada e máquinas. Não
                contam como receita nem como despesa.
              </p>
            </>
          )}

          {step === "Tipo e valor" && (
            <div class="space-y-5">
              <Segmented
                name="asset-kind"
                legend="Tipo do bem"
                options={KIND_OPTIONS}
                value={kind}
                onChange={setKind}
                variant="pill"
                onSurface
                dense
              />
              <MoneyField
                id="asset-value"
                label="Valor atual"
                digits={digits}
                onDigits={setDigits}
              />
            </div>
          )}

          {step === "Data" && (
            <>
              <DateChips value={acquiredOn} today={today} onChange={setAcquiredOn} />
              <p class={HINT}>
                Quando o negócio adquiriu ou aplicou. Serve só para ordenar a lista.
              </p>
            </>
          )}

          {step === "Prévia" && (
            <>
              <SummaryChip
                leading={<IconTile icon={meta.icon} color={meta.color} size={32} iconSize={18} />}
                title={trimmed}
                context={meta.label}
                trailing={brl(valueMinor)}
              />
              <p class={HINT}>
                Data: {dayLabel(acquiredOn, today)}. Entra no capital aplicado do negócio, em{" "}
                {meta.plural.toLocaleLowerCase("pt-BR")}. Não muda receitas, despesas nem o
                resultado do mês.
              </p>
            </>
          )}
        </>
      )}
    />
  );
}
