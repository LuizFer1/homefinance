import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import type { User } from "../../domain/model/user";
import { colorName, cssVarForToken } from "../colors/color-token";
import { Icon } from "../icons/icon";
import { Avatar } from "../profile/avatar-view";
import { ThemeToggle, type ThemeToggleProps } from "../theme/theme-toggle";
import { Modal, SheetHeader } from "../ui/modal";
import { PageHeader } from "../ui/page-header";
import { IconTile } from "../ui/tile";
import { ResetSection } from "./reset-section";

export type SettingsSection = "category" | "paymentMethod" | "profile";

export interface SettingsPageProps {
  categoryCount: number;
  paymentMethodCount: number;
  /** Perfil local, ou null enquanto ele não existe. */
  profile: User | null;
  theme: ThemeToggleProps;
  onOpen: (section: SettingsSection) => void;
  onReset: () => Promise<void>;
}

const ROW = "relative flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left";
const TAPPABLE = `hf-press ${ROW} hover:bg-fg/[0.04]`;

function Group({
  label,
  danger = false,
  children,
}: {
  label: string;
  /** Zona de risco: rótulo e card na cor de despesa. */
  danger?: boolean;
  children: ComponentChildren;
}) {
  return (
    <section aria-label={label} class="mt-6">
      <h2 class={`hf-label ${danger ? "text-expense-fg!" : ""}`}>{label}</h2>
      <div
        class={`mt-2.5 overflow-hidden rounded-lg ${
          danger
            ? "bg-expense/[0.06] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--color-expense)_35%,transparent)]"
            : "bg-surface"
        }`}
      >
        {children}
      </div>
    </section>
  );
}

/** Régua entre linhas do card, recuada até o texto e esmaecendo à direita. */
function Divider() {
  return <span aria-hidden="true" class="hf-rule absolute top-0 right-0 left-[64px]" />;
}

function Chevron() {
  return <Icon name="caret-right" size={16} class="text-fg/40" />;
}

/**
 * Ajustes sem cara de tela de desenvolvedor: cada linha diz o que é e o que
 * faz, com a contagem e o chevron do que abre algo.
 *
 * O hub aparece "Em breve", esmaecido, e não escondido: comunica que sync existe
 * no projeto, é opcional e roda na máquina da pessoa — nunca num servidor de
 * terceiros. Escondido, a conclusão seria "este app não tem".
 */
export function SettingsPage({
  categoryCount,
  paymentMethodCount,
  profile,
  theme,
  onOpen,
  onReset,
}: SettingsPageProps) {
  const [resetting, setResetting] = useState(false);

  return (
    <section aria-label="Configurações">
      <PageHeader title="Ajustes" />

      {profile !== null && (
        <button
          type="button"
          onClick={() => onOpen("profile")}
          class="hf-press mt-6 flex w-full items-center gap-3.5 rounded-lg bg-surface p-4 text-left
            hover:bg-fg/[0.04]"
        >
          <Avatar name={profile.name} color={profile.color} avatar={profile.avatar} size={48} />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-base font-medium">{profile.name}</span>
            <span class="mt-0.5 flex items-center gap-1.5 text-xs text-fg/55">
              <span
                aria-hidden="true"
                class="size-1.5 rounded-full"
                style={{ backgroundColor: cssVarForToken(profile.color) }}
              />
              {colorName(profile.color)} · nome, cor e foto
            </span>
          </span>
          <Chevron />
        </button>
      )}

      <Group label="Cadastros">
        <button type="button" class={TAPPABLE} onClick={() => onOpen("category")}>
          <IconTile icon="tag" color={null} size={36} iconSize={18} />
          <span class="min-w-0 flex-1 text-[15px]">Categorias</span>
          <span class="hf-num text-sm text-fg/50">{categoryCount}</span>
          <Chevron />
        </button>
        <button type="button" class={TAPPABLE} onClick={() => onOpen("paymentMethod")}>
          <Divider />
          <IconTile icon="wallet" color={null} size={36} iconSize={18} />
          <span class="min-w-0 flex-1 text-[15px]">Formas de pagamento</span>
          <span class="hf-num text-sm text-fg/50">{paymentMethodCount}</span>
          <Chevron />
        </button>
      </Group>

      <section aria-label="Aparência" class="mt-6">
        <h2 class="hf-label">Aparência</h2>
        <div class="mt-2.5">
          <ThemeToggle storage={theme.storage} doc={theme.doc} />
        </div>
      </section>

      <Group label="Seus dados">
        <div class={ROW}>
          <span
            aria-hidden="true"
            class="grid size-9 shrink-0 place-items-center rounded-lg text-accent-300
              shadow-[inset_0_0_0_1px_var(--color-accent)]"
          >
            <Icon name="device-mobile" size={18} />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-[15px]">Guardados neste aparelho</span>
            <span class="mt-0.5 block text-xs leading-snug text-fg/55">
              Funciona sem internet e não depende de nenhuma conta.
            </span>
          </span>
        </div>
        <div class={`${ROW} opacity-70`} aria-disabled="true">
          <Divider />
          <IconTile icon="arrows-clockwise" color={null} size={36} iconSize={18} />
          <span class="min-w-0 flex-1">
            <span class="flex items-center gap-2 text-[15px]">
              Hub de sincronização
              <span class="rounded bg-fg/[0.08] px-1.5 py-0.5 text-[10px] font-medium">
                Em breve
              </span>
            </span>
            <span class="mt-0.5 block text-xs leading-snug text-fg/55">
              Um programa que roda no seu computador — nunca num servidor de terceiros.
            </span>
          </span>
        </div>
      </Group>

      {/*
        Por último e visualmente separada: é a única ação sem desfazer do app, e
        ela não pode dividir peso com "Categorias". A confirmação mora num sheet
        próprio, a um toque a mais de distância.
      */}
      <Group label="Zona de risco" danger>
        <button type="button" class={TAPPABLE} onClick={() => setResetting(true)}>
          <span
            aria-hidden="true"
            class="grid size-9 shrink-0 place-items-center rounded-lg bg-expense/[0.12] text-expense-fg"
          >
            <Icon name="warning" size={18} />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-[15px] text-expense-fg">Resetar conta</span>
            <span class="mt-0.5 block text-xs text-fg/55">
              Apaga tudo deste aparelho. Pede confirmação.
            </span>
          </span>
          <Chevron />
        </button>
      </Group>

      <Modal open={resetting} title="Resetar conta" onClose={() => setResetting(false)}>
        {resetting && (
          <>
            <SheetHeader title="Resetar conta" onClose={() => setResetting(false)} />
            <ResetSection onReset={onReset} />
          </>
        )}
      </Modal>
    </section>
  );
}
