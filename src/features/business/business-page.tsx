import type { AppState } from "../../domain/model/app-state";
import { ASSET_KINDS, type Asset } from "../../domain/model/asset";
import type { Debt } from "../../domain/model/debt";
import { capitalByKind, debtTotal, listAssets, listDebts } from "../../domain/projections/business";
import { dayMonth } from "../../domain/projections/periods";
import { Icon } from "../icons/icon";
import { brl, Money, wholeBRL } from "../ui/money";
import { PageHeader } from "../ui/page-header";
import { IconTile } from "../ui/tile";
import { assetKindMeta, isAssetKind } from "./kinds";

export interface BusinessPageProps {
  /** A visão da conta comercial (a sessão já filtra pela conta ativa). */
  state: AppState;
  today: string;
  onNewAsset: () => void;
  onEditAsset: (asset: Asset) => void;
  onNewDebt: () => void;
  onEditDebt: (debt: Debt) => void;
}

/** "24 out", com o ano só quando difere do corrente. */
export function shortDay(date: string, today: string): string {
  const base = dayMonth(date);
  return date.slice(0, 4) === today.slice(0, 4) ? base : `${base} ${date.slice(0, 4)}`;
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      class="hf-press flex h-[38px] items-center gap-1.5 rounded-lg border border-accent px-3.5 text-sm font-medium text-accent-300"
    >
      <Icon name="plus" size={16} />
      {label}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <p class="rounded-lg bg-surface px-4 py-5 text-sm text-fg/55 text-pretty">{text}</p>;
}

function AssetRow({
  asset,
  today,
  first,
  onEdit,
}: {
  asset: Asset;
  today: string;
  first: boolean;
  onEdit: (asset: Asset) => void;
}) {
  const meta = assetKindMeta(asset.kind);
  return (
    <li class="relative">
      {!first && <span aria-hidden="true" class="hf-rule absolute top-0 right-0 left-[50px]" />}
      <button
        type="button"
        onClick={() => onEdit(asset)}
        class="hf-press flex w-full items-center gap-3 py-3 text-left"
      >
        <IconTile icon={meta.icon} color={meta.color} size={38} iconSize={20} />
        <span class="min-w-0 flex-1">
          <span class="flex items-baseline justify-between gap-3">
            <span class="truncate text-[15px] font-medium">{asset.name}</span>
            <span class="hf-num text-[15px] font-medium">{brl(asset.valueMinor)}</span>
          </span>
          <span class="mt-0.5 block text-xs text-fg/55">
            {meta.label} · {shortDay(asset.acquiredOn, today)}
          </span>
        </span>
      </button>
    </li>
  );
}

function DebtRow({
  debt,
  today,
  first,
  onEdit,
}: {
  debt: Debt;
  today: string;
  first: boolean;
  onEdit: (debt: Debt) => void;
}) {
  const settled = debt.balanceMinor === 0;
  const due = debt.dueOn ?? null;
  const overdue = !settled && due !== null && due < today;
  const creditor = debt.creditor ?? null;
  return (
    <li class="relative">
      {!first && <span aria-hidden="true" class="hf-rule absolute top-0 right-0 left-[50px]" />}
      <button
        type="button"
        onClick={() => onEdit(debt)}
        class="hf-press flex w-full items-center gap-3 py-3 text-left"
      >
        <IconTile icon="bank" color={settled ? "slate" : "rose"} size={38} iconSize={20} />
        <span class="min-w-0 flex-1">
          <span class="flex items-baseline justify-between gap-3">
            <span class="truncate text-[15px] font-medium">{debt.name}</span>
            <span class="hf-num text-[15px] font-medium">{brl(debt.balanceMinor)}</span>
          </span>
          <span class="mt-0.5 flex items-baseline justify-between gap-3 text-xs text-fg/55">
            <span class="truncate">
              {[
                creditor,
                settled ? "Quitada" : null,
                due === null || settled
                  ? null
                  : `${overdue ? "venceu" : "vence"} ${shortDay(due, today)}`,
              ]
                .filter((part) => part !== null)
                .join(" · ") || "Sem credor nem vencimento"}
            </span>
            <span class="hf-num shrink-0">de {wholeBRL(debt.principalMinor)}</span>
          </span>
        </span>
      </button>
    </li>
  );
}

/**
 * Aba Negócio (só na conta comercial): o que o negócio tem (bens) e o que deve
 * (dívidas). Nada daqui é receita nem despesa: são os mesmos números que o bloco
 * "Negócio" do Resumo e o painel do hub mostram, lidos de `domain/projections/business`.
 */
export function BusinessPage({
  state,
  today,
  onNewAsset,
  onEditAsset,
  onNewDebt,
  onEditDebt,
}: BusinessPageProps) {
  const assets = listAssets(state);
  const debts = listDebts(state);
  const capital = capitalByKind(assets);
  const owed = debtTotal(debts);

  // Um grupo por tipo conhecido, na ordem do cadastro, e um "Outros" no fim para o
  // tipo que só uma versão futura conhece: a linha nunca some da lista.
  const groups = [
    ...ASSET_KINDS.map((kind) => ({
      key: kind,
      title: assetKindMeta(kind).plural,
      items: assets.filter((a) => a.kind === kind),
    })),
    {
      key: "other",
      title: assetKindMeta(null).plural,
      items: assets.filter((a) => !isAssetKind(a.kind)),
    },
  ].filter((group) => group.items.length > 0);

  const summary: { label: string; minor: number }[] = [
    { label: "Investimentos", minor: capital.investmentMinor },
    { label: "Estoque", minor: capital.inventoryMinor },
    { label: "Equipamentos", minor: capital.equipmentMinor },
  ];

  return (
    <>
      <PageHeader title="Negócio" />

      <section aria-label="Resumo do negócio" class="mt-[18px] rounded-lg bg-surface p-4">
        <h2 class="text-sm text-fg/60">Capital aplicado</h2>
        <p class="mt-2">
          <Money minor={capital.totalMinor} size={36} testId="business-capital-total" />
        </p>
        <dl class="mt-4 space-y-2 text-sm">
          {summary.map((row) => (
            <div key={row.label} class="flex items-baseline justify-between gap-3">
              <dt class="text-fg/60">{row.label}</dt>
              <dd class="hf-num font-medium">{brl(row.minor)}</dd>
            </div>
          ))}
        </dl>
        <div aria-hidden="true" class="hf-rule mt-4" />
        <div class="mt-4 flex items-baseline justify-between gap-3">
          <h2 class="text-sm text-fg/60">Dívidas totais</h2>
          <span
            data-testid="business-debt-total"
            class={`hf-num text-base font-medium ${owed > 0 ? "text-expense-fg" : ""}`}
          >
            {brl(owed)}
          </span>
        </div>
        <p class="mt-3 text-xs leading-normal text-fg/50 text-pretty">
          Bens e dívidas ficam à parte: não entram em receitas, despesas nem no resultado do mês.
        </p>
      </section>

      <section aria-label="Bens" class="mt-[22px]">
        <div class="mb-2 flex items-center justify-between gap-3">
          <h2 class="hf-label">Bens</h2>
          <AddButton label="Novo bem" onClick={onNewAsset} />
        </div>
        {assets.length === 0 ? (
          <Empty text="Nenhum bem ainda. Cadastre o dinheiro aplicado, o estoque e os equipamentos do negócio." />
        ) : (
          <div class="space-y-3.5">
            {groups.map((group) => (
              <section key={group.key} aria-label={group.title}>
                <div class="mb-1.5 flex items-baseline justify-between gap-3 px-0.5">
                  <h3 class="text-sm text-fg/60">{group.title}</h3>
                  <span class="hf-num text-xs text-fg/55">
                    {brl(group.items.reduce((sum, a) => sum + a.valueMinor, 0))}
                  </span>
                </div>
                <ul class="rounded-lg bg-surface px-3.5">
                  {group.items.map((asset, index) => (
                    <AssetRow
                      key={asset.id}
                      asset={asset}
                      today={today}
                      first={index === 0}
                      onEdit={onEditAsset}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>

      <section aria-label="Dívidas" class="mt-[22px]">
        <div class="mb-2 flex items-center justify-between gap-3">
          <h2 class="hf-label">Dívidas</h2>
          <AddButton label="Nova dívida" onClick={onNewDebt} />
        </div>
        {debts.length === 0 ? (
          <Empty text="Nenhuma dívida cadastrada. Financiamentos e empréstimos do negócio entram aqui, com o saldo que ainda falta pagar." />
        ) : (
          <ul class="rounded-lg bg-surface px-3.5">
            {debts.map((debt, index) => (
              <DebtRow
                key={debt.id}
                debt={debt}
                today={today}
                first={index === 0}
                onEdit={onEditDebt}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
