import type { CapitalByKind } from "../../domain/projections/business";
import type { Totals } from "../../domain/projections/selectors";
import { brl, Money } from "../ui/money";
import { Block } from "./parts";

export interface BusinessBlockProps {
  /** Receitas, despesas e resultado do mês: o mesmo `monthComparison` do card do saldo. */
  month: Totals;
  capital: CapitalByKind;
  /** Saldo devedor total das dívidas vivas. */
  debtMinor: number;
}

function Row({
  label,
  minor,
  testId,
  strong = false,
}: {
  label: string;
  minor: number;
  testId: string;
  strong?: boolean;
}) {
  return (
    <div class="flex items-baseline justify-between gap-3">
      <dt class={strong ? "font-medium" : "text-fg/60"}>{label}</dt>
      <dd data-testid={testId} class="hf-num font-medium">
        {brl(minor)}
      </dd>
    </div>
  );
}

/**
 * Título de metade do card com o chip "hoje": capital e dívidas são o saldo de agora,
 * não do mês do seletor. Sem o chip, sob "agosto" eles pareciam valores de agosto
 * (indicadores §4 problema 6).
 */
function SectionTitle({ title, testId }: { title: string; testId: string }) {
  return (
    <h4 class="mt-4 flex items-center gap-2 text-xs text-fg/55">
      {title}
      <span
        data-testid={testId}
        class="rounded-full bg-neutral-800 px-2 py-0.5 text-[11px] font-medium text-fg/70"
      >
        hoje
      </span>
    </h4>
  );
}

/**
 * Bloco "Negócio" do Resumo da conta comercial: o resultado do mês e o patrimônio do
 * negócio num card só. O resultado vem só de lançamentos; o capital e as dívidas vêm
 * de bens e dívidas, que nunca entram em receita nem em despesa — por isso as duas
 * metades são rotuladas à parte, e as de patrimônio dizem "hoje". Mesmos números do
 * painel do hub.
 */
export function BusinessBlock({ month, capital, debtMinor }: BusinessBlockProps) {
  return (
    <Block title="Negócio">
      <section aria-label="Resultado e patrimônio do negócio" class="rounded-lg bg-surface p-4">
        <h3 class="text-sm text-fg/60">Resultado do mês</h3>
        <p class="mt-2">
          <Money
            minor={month.balanceMinor}
            size={36}
            testId="business-result"
            class={month.balanceMinor < 0 ? "text-expense-fg" : ""}
          />
        </p>
        <div class="mt-4 grid grid-cols-2 gap-3">
          <div>
            <p class="flex items-center gap-2 text-xs text-fg/55">
              <span aria-hidden="true" class="size-2 rounded-full bg-income" />
              Receitas
            </p>
            <p data-testid="business-income" class="hf-num mt-1 text-base font-medium">
              {brl(month.incomeMinor)}
            </p>
          </div>
          <div>
            <p class="flex items-center gap-2 text-xs text-fg/55">
              <span aria-hidden="true" class="size-2 rounded-full bg-expense" />
              Despesas
            </p>
            <p data-testid="business-expense" class="hf-num mt-1 text-base font-medium">
              {brl(month.expenseMinor)}
            </p>
          </div>
        </div>

        <div aria-hidden="true" class="hf-rule mt-4" />
        <SectionTitle title="Capital" testId="business-capital-today" />
        <dl class="mt-2 space-y-2 text-sm">
          <Row label="Investimentos" minor={capital.investmentMinor} testId="business-investment" />
          <Row
            label="Capital em estoque"
            minor={capital.inventoryMinor}
            testId="business-inventory"
          />
          <Row
            label="Capital em equipamento"
            minor={capital.equipmentMinor}
            testId="business-equipment"
          />
          <Row
            label="Capital total aplicado"
            minor={capital.totalMinor}
            testId="business-capital"
            strong
          />
        </dl>
        <div aria-hidden="true" class="hf-rule mt-4" />
        <SectionTitle title="Dívidas" testId="business-debt-today" />
        <dl class="mt-2 text-sm">
          <Row label="Dívidas totais" minor={debtMinor} testId="business-debt" strong />
        </dl>
        <p class="mt-3 text-xs leading-normal text-fg/50 text-pretty">
          Investimentos, estoque, equipamentos e dívidas não contam como receita nem despesa.
        </p>
      </section>
    </Block>
  );
}
