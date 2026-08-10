import { Icon } from "../icons/icon";

export type SettingsSection = "category" | "paymentMethod";

export interface SettingsPageProps {
  categoryCount: number;
  paymentMethodCount: number;
  onOpen: (section: SettingsSection) => void;
}

const CAPTION = "hf-caption text-[0.6875rem] font-semibold uppercase text-base-content/45";
const ROW =
  "flex w-full items-center gap-3 border-b border-base-content/10 px-4 py-3.5 text-left " +
  "last:border-b-0";
const ENABLED = `hf-press ${ROW} transition-colors duration-150 hover:bg-base-200/50`;

function Group({ children }: { children: preact.ComponentChildren }) {
  return (
    <div class="rounded-box mt-3 overflow-hidden border border-base-content/10 bg-base-100/60">
      {children}
    </div>
  );
}

/**
 * Entrada desabilitada, com o motivo à vista.
 *
 * Mostrar desabilitado em vez de esconder é deliberado: comunica que a coisa
 * existe no projeto e é opcional. Escondida, o usuário concluiria que o app não
 * a tem — e no caso do hub, a mensagem importante é justamente que sync existe,
 * é opcional, e roda na máquina dele, nunca num servidor de terceiros.
 */
function PendingRow({ icon, label, reason }: { icon: string; label: string; reason: string }) {
  return (
    <div class={`${ROW} opacity-55`} aria-disabled="true">
      <Icon name={icon} size={18} />
      <span class="min-w-0 flex-1">
        <span class="block text-[0.9375rem]">{label}</span>
        <span class="mt-0.5 block text-xs text-base-content/50">{reason}</span>
      </span>
    </div>
  );
}

export function SettingsPage({ categoryCount, paymentMethodCount, onOpen }: SettingsPageProps) {
  return (
    <section aria-label="Configurações">
      <h2 class={`${CAPTION} mt-4`}>Cadastros</h2>
      <Group>
        <button type="button" class={ENABLED} onClick={() => onOpen("category")}>
          <Icon name="tag" size={18} />
          <span class="min-w-0 flex-1 text-[0.9375rem]">Categorias</span>
          <span class="hf-num text-sm text-base-content/45">{categoryCount}</span>
          <span aria-hidden="true" class="text-base-content/30">
            &rsaquo;
          </span>
        </button>

        <button type="button" class={ENABLED} onClick={() => onOpen("paymentMethod")}>
          <Icon name="wallet" size={18} />
          <span class="min-w-0 flex-1 text-[0.9375rem]">Formas de pagamento</span>
          <span class="hf-num text-sm text-base-content/45">{paymentMethodCount}</span>
          <span aria-hidden="true" class="text-base-content/30">
            &rsaquo;
          </span>
        </button>
      </Group>

      <h2 class={`${CAPTION} mt-6`}>Perfil</h2>
      <Group>
        <PendingRow
          icon="baby"
          label="Seu perfil"
          reason="Nome e cor do autor dos lançamentos. Ainda não construído."
        />
      </Group>

      <h2 class={`${CAPTION} mt-6`}>Sincronização</h2>
      <Group>
        <PendingRow
          icon="landmark"
          label="Hub de sincronização"
          reason="O hub é um programa que roda no seu computador, nunca um servidor de terceiros. Ainda não construído."
        />
      </Group>

      <p class="mt-4 px-1 text-xs text-base-content/40">
        Seus dados ficam neste aparelho. O app funciona sem internet e não depende de nenhuma conta.
      </p>
    </section>
  );
}
