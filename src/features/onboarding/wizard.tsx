import { useState } from "preact/hooks";
import type { ColorToken } from "../../domain/events/reference";
import type { UserDraft } from "../../domain/events/user";
import { COLOR_TOKENS, cssVarForToken } from "../colors/color-token";
import { Avatar } from "../profile/avatar-view";
import { StepIndicator } from "../transactions/step-indicator";

export interface OnboardingWizardProps {
  onComplete: (draft: UserDraft) => Promise<void> | void;
  /** Pipeline da foto, injetado: `happy-dom` não tem canvas. */
  processFile: (file: Blob) => Promise<string>;
}

const STEPS = ["Nome", "Cor", "Foto"] as const;

const LABEL = "hf-caption block text-[0.6875rem] font-semibold uppercase text-base-content/45";
const FIELD =
  "rounded-field mt-1.5 w-full bg-base-200 px-3.5 py-2.5 text-base outline-none " +
  "transition-[box-shadow,background-color] duration-150 " +
  "focus-visible:bg-base-100 focus-visible:ring-2 focus-visible:ring-primary/45";
const ACTION = "hf-press rounded-field px-4 py-2.5 font-medium";
const SWATCH =
  "hf-press flex size-10 cursor-pointer items-center justify-center rounded-full " +
  "transition-transform duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/45";

function describeError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Boas-vindas em três decisões: nome, cor, foto.
 *
 * Bloqueia o app enquanto não concluído — não há tela por trás dele que faça
 * sentido sem um autor. A **foto é a única etapa pulável**: exigi-la contraria
 * "nenhuma conta obrigatória" do README e trava quem simplesmente não tem foto à
 * mão no momento do cadastro. Sem foto, o avatar são as iniciais sobre a cor
 * escolhida, e isso é um estado final legítimo, não degradação.
 *
 * A cor tem um propósito só: diferenciar quem lançou. Não é tema, não é acento,
 * não tinge a UI — ela só faz sentido de verdade depois que o sync existir e
 * duas pessoas dividirem a mesma base.
 */
export function OnboardingWizard({ onComplete, processFile }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [color, setColor] = useState<ColorToken>("slate");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const trimmed = name.trim();
  const nameValid = trimmed !== "";
  // Cor já nasce com um padrão e a foto é opcional, então só o nome bloqueia.
  const maxReachable = nameValid ? STEPS.length - 1 : 0;
  const isLast = step === STEPS.length - 1;

  function validateName(): boolean {
    if (!nameValid) {
      setProblem("Informe seu nome.");
      return false;
    }
    setProblem(null);
    return true;
  }

  function goTo(index: number) {
    if (step === 0 && index > 0 && !validateName()) return;
    setProblem(null);
    setStep(index);
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
    if (!validateName()) {
      setStep(0);
      return;
    }

    setSaving(true);
    try {
      await onComplete({ name: trimmed, color, avatar });
    } catch (cause) {
      // Erro mantém o wizard na tela: avançar deixaria o usuário num app sem
      // perfil, e o lote atômico garante que nada foi gravado pela metade.
      setProblem(describeError(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} class="py-2">
      <h1 class="hf-display text-2xl font-semibold">Bem-vindo ao HomeFinance</h1>
      <p class="mt-1.5 text-sm text-base-content/55">
        Seus dados ficam neste aparelho. Sem conta, sem cadastro, sem internet.
      </p>

      <div class="mt-6">
        <StepIndicator steps={STEPS} current={step} maxReachable={maxReachable} onGo={goTo} />
      </div>

      {/* Mesma troca de etapa do lançamento — ver o comentário em `transaction-wizard.tsx`. */}
      <div
        key={step}
        class="mt-6 transition-[opacity,translate] duration-[140ms] ease-out-soft
          starting:translate-x-1.5 starting:opacity-0"
      >
        {step === 0 && (
          <div>
            <label class={LABEL} for="onboarding-name">
              Seu nome
            </label>
            <input
              id="onboarding-name"
              name="name"
              type="text"
              autocomplete="off"
              placeholder="Como te chamamos?"
              class={FIELD}
              value={name}
              onInput={(event) => setName(event.currentTarget.value)}
            />
          </div>
        )}

        {step === 1 && (
          <fieldset>
            <legend class={LABEL}>Sua cor</legend>
            <p class="mt-1.5 text-xs text-base-content/45">
              Marca os lançamentos que você criar. Serve para diferenciar quem lançou quando o app
              for compartilhado.
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
        )}

        {step === 2 && (
          <div>
            <span class={LABEL}>Sua foto</span>
            <p class="mt-1.5 text-xs text-base-content/45">
              Opcional. Sem foto, usamos suas iniciais sobre a cor escolhida.
            </p>

            <div class="mt-4 flex items-center gap-4">
              <Avatar name={trimmed} color={color} avatar={avatar} size={72} />

              <div class="flex min-w-0 flex-col gap-2">
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
          </div>
        )}
      </div>

      {problem !== null && (
        <p role="alert" class="mt-4 text-sm text-error">
          {problem}
        </p>
      )}

      <div class="mt-6 flex gap-2">
        {step > 0 && (
          <button
            type="button"
            onClick={() => goTo(step - 1)}
            class={`${ACTION} bg-base-200 text-base-content/70`}
          >
            Voltar
          </button>
        )}

        {/*
          As `key` distintas não são decoração — ver o comentário gêmeo em
          `registry-wizard.tsx`. Sem elas, ir da cor para a foto concluía o
          cadastro na hora: a etapa da foto nunca chegava a aparecer.
        */}
        {isLast ? (
          <button
            key="enviar"
            type="submit"
            disabled={saving}
            class={`${ACTION} flex-1 bg-primary text-primary-content disabled:opacity-60`}
          >
            {saving ? "Salvando..." : "Começar"}
          </button>
        ) : (
          <button
            key="avancar"
            type="button"
            onClick={() => goTo(step + 1)}
            class={`${ACTION} flex-1 bg-primary text-primary-content`}
          >
            Continuar
          </button>
        )}
      </div>
    </form>
  );
}
