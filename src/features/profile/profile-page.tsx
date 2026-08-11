import { useState } from "preact/hooks";
import type { ColorToken } from "../../domain/events/reference";
import { diffUser, type UserDraft } from "../../domain/events/user";
import type { UserRecord } from "../../domain/projections/apply";
import { COLOR_TOKENS, cssVarForToken } from "../colors/color-token";
import { FIELD, LABEL } from "../ui/field";
import { Avatar } from "./avatar-view";
import type { ProfileStore } from "./store";

export interface ProfilePageProps {
  profile: UserRecord;
  store: ProfileStore;
  /** Pipeline da foto, injetado: `happy-dom` não tem canvas. */
  processFile: (file: Blob) => Promise<string>;
  onBack: () => void;
}

const ACTION = "hf-press rounded-field px-4 py-2.5 font-medium";
const SWATCH =
  "hf-press flex size-10 cursor-pointer items-center justify-center rounded-full " +
  "transition-transform duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/45";

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
 * já tem perfil e só quer ajustar um campo. Wizard de novo seria atrito; patch
 * parcial via `diffUser` evita lixo no log quando nada mudou.
 */
export function ProfilePage({ profile, store, processFile, onBack }: ProfilePageProps) {
  const [name, setName] = useState(profile.name);
  const [color, setColor] = useState<ColorToken>(() => asColorToken(profile.color));
  const [avatar, setAvatar] = useState<string | null>(profile.avatar);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const trimmed = name.trim();

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
      <div class="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar para configurações"
          class="hf-press rounded-field px-2 py-1 text-base-content/55"
        >
          &lsaquo;
        </button>
        <h2 class="hf-caption text-[0.6875rem] font-semibold uppercase text-base-content/45">
          Seu perfil
        </h2>
      </div>

      <form onSubmit={handleSubmit} class="mt-4">
        <div class="flex flex-col items-center gap-3">
          <Avatar name={trimmed || profile.name} color={color} avatar={avatar} size={80} />
          <div class="flex gap-2">
            <label
              class={`${ACTION} cursor-pointer bg-base-200 text-center text-sm text-base-content/70
                has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/45`}
            >
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
              <button
                type="button"
                onClick={() => setAvatar(null)}
                class={`${ACTION} bg-transparent text-sm text-base-content/45`}
              >
                Remover foto
              </button>
            )}
          </div>
        </div>

        <div class="mt-6">
          <label class={LABEL} for="profile-name">
            Seu nome
          </label>
          <input
            id="profile-name"
            name="name"
            type="text"
            autocomplete="off"
            class={FIELD}
            value={name}
            onInput={(event) => setName(event.currentTarget.value)}
          />
        </div>

        <fieldset class="mt-5">
          <legend class={LABEL}>Sua cor</legend>
          <p class="mt-1.5 text-xs text-base-content/45">
            Marca os lançamentos que você criar. Serve para diferenciar quem lançou quando o app for
            compartilhado.
          </p>
          <div class="mt-3 flex flex-wrap gap-2.5">
            {COLOR_TOKENS.map((token) => (
              <label
                key={token}
                class={`${SWATCH} ${color === token ? "scale-110 ring-2 ring-base-content/35" : ""}`}
                style={{ backgroundColor: cssVarForToken(token) }}
              >
                <input
                  type="radio"
                  name="color"
                  value={token}
                  aria-label={token}
                  checked={color === token}
                  onChange={() => setColor(token)}
                  class="sr-only"
                />
              </label>
            ))}
          </div>
        </fieldset>

        {problem !== null && (
          <p role="alert" class="mt-4 text-sm text-error">
            {problem}
          </p>
        )}

        <div class="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onBack}
            class={`${ACTION} bg-base-200 text-base-content/70`}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            class={`${ACTION} flex-1 bg-primary text-primary-content disabled:opacity-60`}
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </section>
  );
}
