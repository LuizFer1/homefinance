import { useState } from "preact/hooks";
import type { ColorToken } from "../../domain/events/reference";
import { diffUser, type UserDraft } from "../../domain/events/user";
import type { UserRecord } from "../../domain/projections/apply";
import { COLOR_TOKENS } from "../colors/color-token";
import { Icon } from "../icons/icon";
import { Button, SECONDARY } from "../ui/button";
import { FIELD_PAGE, LABEL } from "../ui/field";
import { PageHeader } from "../ui/page-header";
import { Swatches } from "../ui/swatches";
import { Avatar } from "./avatar-view";
import type { ProfileStore } from "./store";

export interface ProfilePageProps {
  profile: UserRecord;
  store: ProfileStore;
  /** Pipeline da foto, injetado: `happy-dom` não tem canvas. */
  processFile: (file: Blob) => Promise<string>;
  onBack: () => void;
  /** Avisa a cor em escolha, para o brilho do topo acompanhar antes de salvar. */
  onColorPreview?: (token: string) => void;
}

function describeError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Token da paleta fechada, ou o padrão do wizard.
 *
 * A projeção guarda `color` como string de propósito (sync com versão mais nova).
 * No formulário só a paleta conhecida é selecionável; token desconhecido cai no
 * padrão em vez de travar o rádio sem opção marcada.
 */
function asColorToken(value: string): ColorToken {
  return (COLOR_TOKENS as readonly string[]).includes(value) ? (value as ColorToken) : "slate";
}

/**
 * Edição do perfil local: nome, cor e foto numa tela só.
 *
 * Diferente do wizard (três etapas obrigatórias na primeira vez), aqui a pessoa
 * já tem perfil e só quer ajustar um campo. Patch parcial via `diffUser` evita
 * lixo no log quando nada mudou.
 */
export function ProfilePage({
  profile,
  store,
  processFile,
  onBack,
  onColorPreview,
}: ProfilePageProps) {
  const [name, setName] = useState(profile.name);
  const [color, setColor] = useState<ColorToken>(() => asColorToken(profile.color));
  const [avatar, setAvatar] = useState<string | null>(profile.avatar);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const trimmed = name.trim();

  function chooseColor(token: ColorToken) {
    setColor(token);
    onColorPreview?.(token);
  }

  async function handleFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file === undefined) return;

    try {
      setAvatar(await processFile(file));
      setProblem(null);
    } catch (cause) {
      // A foto anterior fica: uma tentativa falha não pode apagar o que já valia.
      setProblem(describeError(cause));
    } finally {
      // Sem isto, escolher o mesmo arquivo de novo não dispara `change`.
      input.value = "";
    }
  }

  async function handleSubmit(event: Event) {
    event.preventDefault();
    if (trimmed === "") {
      setProblem("Informe seu nome.");
      return;
    }

    const next: UserDraft = { name: trimmed, color, avatar };
    const patch = diffUser(profile, next);
    // Patch vazio: o botão "Salvar" ainda fecha, porque o usuário pediu para
    // sair com o que está na tela e nada precisa ir pro log.
    if (Object.keys(patch).length === 0) {
      onBack();
      return;
    }

    setSaving(true);
    setProblem(null);
    try {
      await store.editProfile(profile.id, patch);
      onBack();
    } catch (cause) {
      setProblem(describeError(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label="Seu perfil">
      <PageHeader title="Seu perfil" onBack={onBack} />

      <form onSubmit={handleSubmit} class="mt-6">
        <div class="flex items-center gap-5">
          <span class="relative shrink-0">
            <Avatar name={trimmed || profile.name} color={color} avatar={avatar} size={88} />
            <span
              aria-hidden="true"
              class="absolute right-0 bottom-0 grid size-8 place-items-center rounded-full
                bg-surface text-fg/85 shadow-[0_0_0_3px_var(--color-bg)]"
            >
              <Icon name="camera" size={16} />
            </span>
          </span>
          <div class="min-w-0">
            <div class="flex flex-wrap gap-2">
              <label
                class={`${SECONDARY} h-11 cursor-pointer px-4 text-sm has-[:focus-visible]:outline-2
                  has-[:focus-visible]:outline-accent`}
              >
                <Icon name="image" size={16} />
                {avatar === null ? "Escolher foto" : "Trocar foto"}
                <input
                  type="file"
                  accept="image/*"
                  aria-label="Escolher foto"
                  onChange={handleFile}
                  class="sr-only"
                />
              </label>
              {avatar !== null && (
                <Button
                  variant="secondary"
                  class="h-11 px-4 text-sm"
                  onClick={() => setAvatar(null)}
                >
                  Remover foto
                </Button>
              )}
            </div>
            <p class="mt-2 text-xs text-fg/55">Sem foto, usamos a inicial.</p>
          </div>
        </div>

        <div class="mt-8">
          <label class={LABEL} for="profile-name">
            Seu nome
          </label>
          <input
            id="profile-name"
            name="name"
            type="text"
            autocomplete="off"
            class={`${FIELD_PAGE} mt-2`}
            value={name}
            onInput={(event) => setName(event.currentTarget.value)}
          />
        </div>

        <div class="mt-7">
          <p class={LABEL}>Sua cor</p>
          <p class="mt-1.5 text-[13px] text-fg/55">Marca os lançamentos que você criar.</p>
          <Swatches
            name="color"
            legend="Sua cor"
            value={color}
            onChange={chooseColor}
            surface="bg"
            class="mt-4"
          />
        </div>

        {problem !== null && (
          <p role="alert" class="mt-5 text-sm text-expense-fg">
            {problem}
          </p>
        )}

        <div class="mt-8 flex gap-2.5">
          <Button variant="secondary" onClick={onBack}>
            Cancelar
          </Button>
          <Button type="submit" icon="check" iconSide="left" disabled={saving} class="flex-1">
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </form>
    </section>
  );
}
